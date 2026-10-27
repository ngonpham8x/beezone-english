import { showAlert } from '../../lib/dialogs';
import { toast } from '../../lib/toast';
import type { Teacher, UserAccount } from '../../types';
import { canManageAcademic, hasStaffPermission } from '../../lib/permissions';
import { validateRecurringChanges } from '../../lib/operations';
import { findScheduleConflict, linkedTimetableSlots } from '../../lib/schedule';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';
import { reconcileTeacherAssignments, withClassScheduleSummary } from '../center/model';

type Context = Pick<
  CenterStore,
  'teachers' | 'setTeachers' | 'classes' | 'setClasses' | 'timetableSlots' | 'setTimetableSlots' | 'scheduleChanges'
> & { currentUser: UserAccount | null; addLog: ActivityLogger };
export function createTeacherActions({
  teachers,
  setTeachers,
  classes,
  setClasses,
  timetableSlots,
  setTimetableSlots,
  scheduleChanges,
  currentUser,
  addLog,
}: Context) {
  const handleSaveTeacher = (teacher: Teacher): string | null => {
    const exists = teachers.some(item => item.id === teacher.id);
    if (!hasStaffPermission(currentUser, 'teacher', exists ? 'edit' : 'add')) return 'Bạn chưa có quyền thực hiện thao tác này với giáo viên.';
    if (!teacher.name.trim()) return 'Nhập họ tên giáo viên.';
    const selected = new Set(teacher.assignedClassIds);
    if ([...selected].some(id => !classes.some(item => item.id === id))) return 'Lớp được chọn không còn tồn tại.';
    const changed = classes.some(item => selected.has(item.id) !== (item.teacherId === teacher.id));
    if (changed && !canManageAcademic(currentUser, 'classes', 'edit')) return 'Cần quyền sửa lớp học để thay đổi phân công giáo viên.';
    const removedClassIds = new Set(
      classes.filter((item) => item.teacherId === teacher.id && !selected.has(item.id)).map((item) => item.id),
    );
    const removedSlotIds = new Set(
      timetableSlots.filter((slot) => removedClassIds.has(slot.classId)).map((slot) => slot.id),
    );
    if (scheduleChanges.some((change) => change.sourceSlotId && removedSlotIds.has(change.sourceSlotId)))
      return 'Lớp đang có lịch nghỉ, dạy thay hoặc học bù liên quan. Hãy hủy điều chỉnh trước khi bỏ phân công giáo viên.';

    const nextSlots = timetableSlots
      .filter((slot) => !removedClassIds.has(slot.classId))
      .map((slot) => selected.has(slot.classId) ? { ...slot, teacherId: teacher.id } : slot);
    const nextClasses = classes.map((item) => {
      const next = selected.has(item.id)
        ? { ...item, teacherId: teacher.id }
        : item.teacherId === teacher.id
          ? { ...item, teacherId: '' }
          : item;
      return selected.has(item.id) || removedClassIds.has(item.id)
        ? withClassScheduleSummary(next, nextSlots)
        : next;
    });
    const activeNextSlots = linkedTimetableSlots(nextClasses, nextSlots);
    if (activeNextSlots.some((slot) => findScheduleConflict(activeNextSlots, slot)))
      return 'Đổi phân công sẽ làm giáo viên bị trùng ca. Hãy điều chỉnh thời khóa biểu trước.';
    const scheduleIssue = validateRecurringChanges(nextClasses, nextSlots, scheduleChanges);
    if (scheduleIssue) return scheduleIssue;

    const normalized = { ...teacher, name: teacher.name.trim(), assignedClassIds: [...selected] };
    const nextTeachers = exists
      ? teachers.map((item) => item.id === teacher.id ? normalized : item)
      : [...teachers, normalized];
    setTeachers(reconcileTeacherAssignments(nextTeachers, nextClasses));
    if (changed) {
      setClasses(nextClasses);
      setTimetableSlots(nextSlots);
    }
    addLog(exists ? 'SỬA' : 'THÊM', 'Giáo viên', `${exists ? 'Cập nhật' : 'Thêm'} giáo viên ${normalized.name}`);
    toast.success(`${exists ? 'Cập nhật' : 'Thêm'} giáo viên ${normalized.name} thành công!`);
    return null;
  };
  // Teacher CRUD Handlers
  const handleAddTeacher = (t: Teacher) => {
    if (!hasStaffPermission(currentUser, 'teacher', 'add')) return;
    setTeachers((prev) => [...prev, t]);
    addLog('THÊM', 'Giáo viên', `Thêm giáo viên mới ${t.name}`);
    toast.success(`Thêm giáo viên mới ${t.name} thành công!`);
  };

  const handleUpdateTeacher = (t: Teacher) => {
    if (!hasStaffPermission(currentUser, 'teacher', 'edit')) return;
    setTeachers((prev) => prev.map((item) => (item.id === t.id ? t : item)));
    addLog('SỬA', 'Giáo viên', `Cập nhật thông tin giáo viên ${t.name}`);
    toast.success(`Cập nhật thông tin giáo viên ${t.name} thành công!`);
  };

  const handleDeleteTeacher = (id: string) => {
    if (!hasStaffPermission(currentUser, 'teacher', 'delete')) {
      toast.error('Bạn chưa được cấp quyền xóa giáo viên.');
      return;
    }
    if (scheduleChanges.some((c) => c.teacherId === id)) {
      const msg = 'Giáo viên có lịch sử đổi lịch/học bù. Hãy giữ hồ sơ giáo viên.';
      showAlert(msg);
      return;
    }
    const t = teachers.find((item) => item.id === id);
    if (!t) { showAlert('Giáo viên không còn tồn tại.'); return; }
    const managedClasses = classes.filter((classroom) => classroom.teacherId === id);
    if (managedClasses.length > 0 || timetableSlots.some((s) => s.teacherId === id)) {
      const msg = `Không thể xóa giáo viên ${t?.name || ''} vì đang phụ trách ${managedClasses.length} lớp. Hãy phân công giáo viên khác cho các lớp trước.`;
      showAlert(msg);
      return;
    }
    setTeachers((prev) => prev.filter((item) => item.id !== id));
    if (t) addLog('XÓA', 'Giáo viên', `Xóa giáo viên ${t.name}`);
    toast.success(`Đã xóa giáo viên ${t?.name || ''} thành công!`);
  };

  return { handleSaveTeacher, handleAddTeacher, handleUpdateTeacher, handleDeleteTeacher };
}
