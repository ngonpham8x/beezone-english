import type { Teacher, UserAccount } from '../../types';
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
    setTeachers((prev) => [...prev, t]);
    addLog('THÊM', 'Giáo viên', `Thêm giáo viên mới ${t.name}`);
  };

  const handleUpdateTeacher = (t: Teacher) => {
    setTeachers((prev) => prev.map((item) => (item.id === t.id ? t : item)));
    addLog('SỬA', 'Giáo viên', `Cập nhật thông tin giáo viên ${t.name}`);
  };

  const handleDeleteTeacher = (id: string) => {
    if (scheduleChanges.some((c) => c.teacherId === id)) {
      alert('Giáo viên có lịch sử đổi lịch/học bù. Hãy giữ hồ sơ giáo viên.');
      return;
    }
    const t = teachers.find((item) => item.id === id);
    const managedClasses = classes.filter((classroom) => classroom.teacherId === id);
    if (managedClasses.length > 0 || timetableSlots.some((s) => s.teacherId === id)) {
      alert(
        `Không thể xóa giáo viên ${t?.name || ''} vì đang phụ trách ${managedClasses.length} lớp. Hãy phân công giáo viên khác cho các lớp trước.`,
      );
      return;
    }
    setTeachers((prev) => prev.filter((item) => item.id !== id));
    if (t) addLog('XÓA', 'Giáo viên', `Xóa giáo viên ${t.name}`);
  };

  return { handleAddTeacher, handleUpdateTeacher, handleDeleteTeacher };
}
