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
  'teachers' | 'setTeachers' | 'classes' | 'setClasses' | 'timetableSlots' | 'setTimetableSlots' | 'scheduleChanges' | 'attendanceSessions'
> & { currentUser: UserAccount | null; addLog: ActivityLogger };

export interface TeacherDeletionOptions {
  detachClasses?: boolean;
  removeTimetable?: boolean;
}

export function createTeacherActions({
  teachers,
  setTeachers,
  classes,
  setClasses,
  timetableSlots,
  setTimetableSlots,
  scheduleChanges,
  attendanceSessions,
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

  const handleDeleteTeacher = (id: string, options?: TeacherDeletionOptions): string | null => {
    if (!hasStaffPermission(currentUser, 'teacher', 'delete')) {
      toast.error('Bạn chưa được cấp quyền xóa giáo viên.');
      return 'Bạn chưa được cấp quyền xóa giáo viên.';
    }
    const t = teachers.find((item) => item.id === id);
    if (!t) return 'Giáo viên không còn tồn tại.';
    const managedClasses = classes.filter((classroom) => classroom.teacherId === id);
    const linkedSlots = timetableSlots.filter((slot) => slot.teacherId === id);
    const linkedSlotIds = new Set(linkedSlots.map((slot) => slot.id));
    const linkedChanges = scheduleChanges.filter((change) =>
      change.teacherId === id ||
      change.substituteTeacherId === id ||
      Boolean(change.sourceSlotId && linkedSlotIds.has(change.sourceSlotId)),
    );
    const linkedAttendance = attendanceSessions.filter((session) => session.teacherId === id);
    if (linkedAttendance.length > 0)
      return `Giáo viên có ${linkedAttendance.length} buổi điểm danh đã lưu. Không thể xóa hồ sơ để giữ người dạy và lịch sử lớp.`;
    if (linkedChanges.length > 0)
      return `Giáo viên có ${linkedChanges.length} lịch sử đổi lịch, dạy thay hoặc học bù. Không thể xóa hồ sơ để tránh mất đối chiếu.`;
    if (managedClasses.length > 0 && !options?.detachClasses)
      return `Hãy tích chọn gỡ phân công khỏi ${managedClasses.length} lớp trước khi xóa.`;
    if (linkedSlots.length > 0 && !options?.removeTimetable)
      return `Hãy tích chọn xóa ${linkedSlots.length} ca thời khóa biểu của giáo viên trước khi xóa.`;
    if ((managedClasses.length > 0 || linkedSlots.length > 0) && !canManageAcademic(currentUser, 'classes', 'edit'))
      return 'Cần quyền sửa lớp học để gỡ phân công và thời khóa biểu trước khi xóa giáo viên.';

    const nextSlots = linkedSlots.length > 0
      ? timetableSlots.filter((slot) => slot.teacherId !== id)
      : timetableSlots;
    const affectedClassIds = new Set([
      ...managedClasses.map((classroom) => classroom.id),
      ...linkedSlots.map((slot) => slot.classId),
    ]);
    const nextClasses = affectedClassIds.size > 0
      ? classes.map((classroom) => affectedClassIds.has(classroom.id)
        ? withClassScheduleSummary(
          classroom.teacherId === id ? { ...classroom, teacherId: '' } : classroom,
          nextSlots,
        )
        : classroom)
      : classes;
    setTeachers((prev) => prev.filter((item) => item.id !== id));
    if (affectedClassIds.size > 0) setClasses(nextClasses);
    if (linkedSlots.length > 0) setTimetableSlots(nextSlots);
    addLog(
      'XÓA',
      'Giáo viên',
      `Xóa giáo viên ${t.name}; gỡ ${managedClasses.length} lớp và ${linkedSlots.length} ca thời khóa biểu.`,
    );
    toast.success(`Đã gỡ liên kết và xóa giáo viên ${t.name} thành công!`);
    return null;
  };

  return { handleSaveTeacher, handleAddTeacher, handleUpdateTeacher, handleDeleteTeacher };
}
