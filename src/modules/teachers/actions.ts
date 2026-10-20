import { showAlert } from '../../lib/dialogs';
import { toast } from '../../lib/toast';
import type { Teacher, UserAccount } from '../../types';
import { hasStaffPermission } from '../../lib/permissions';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

type Context = Pick<
  CenterStore,
  'teachers' | 'setTeachers' | 'classes' | 'timetableSlots' | 'scheduleChanges'
> & { currentUser: UserAccount | null; addLog: ActivityLogger };
export function createTeacherActions({
  teachers,
  setTeachers,
  classes,
  timetableSlots,
  scheduleChanges,
  currentUser,
  addLog,
}: Context) {
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

  return { handleAddTeacher, handleUpdateTeacher, handleDeleteTeacher };
}
