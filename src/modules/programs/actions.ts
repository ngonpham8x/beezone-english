import { showAlert } from '../../lib/dialogs';
import { toast } from '../../lib/toast';
import type { CourseProgram, UserAccount } from '../../types';
import { canManageAcademic } from '../../lib/permissions';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

type Context = Pick<CenterStore, 'programs' | 'setPrograms' | 'classes' | 'students'> & {
  currentUser: UserAccount | null;
  addLog: ActivityLogger;
};
export function createProgramActions({
  programs,
  setPrograms,
  classes,
  students,
  currentUser,
  addLog,
}: Context) {
  const handleCreateProgram = (program: CourseProgram) => {
    if (!canManageAcademic(currentUser, 'programs', 'add')) {
      toast.error('Bạn chưa được cấp quyền thêm chương trình học.');
      return;
    }
    setPrograms((prev) => [...prev, program]);
    addLog('THÊM', 'Chương trình học', `Tạo chương trình ${program.name}`);
    toast.success(`Tạo chương trình ${program.name} thành công!`);
  };

  // Program Handlers
  const handleAddProgram = (program: CourseProgram) => {
    if (!canManageAcademic(currentUser, 'programs', 'add')) return;
    setPrograms((prev) => [...prev, program]);
    addLog('THÊM', 'Chương trình học', `Tạo chương trình ${program.name} (${program.code})`);
    toast.success(`Tạo chương trình ${program.name} thành công!`);
  };

  const handleUpdateProgram = (program: CourseProgram) => {
    if (!canManageAcademic(currentUser, 'programs', 'edit')) return;
    setPrograms((prev) => prev.map((p) => (p.id === program.id ? program : p)));
    addLog('SỬA', 'Chương trình học', `Cập nhật chương trình ${program.name} (${program.code})`);
    toast.success(`Cập nhật chương trình ${program.name} thành công!`);
  };

  const handleDeleteProgram = (id: string) => {
    if (!canManageAcademic(currentUser, 'programs', 'delete')) return;
    const p = programs.find((item) => item.id === id);
    if (!p) { showAlert('Chương trình học không còn tồn tại.'); return; }
    if (students.some((s) => s.programId === id) || classes.some((c) => c.programId === id)) {
      const msg = 'Không thể xóa chương trình đang có học viên hoặc lớp học.';
      showAlert(msg);
      return;
    }
    setPrograms((prev) => prev.filter((item) => item.id !== id));
    if (p) addLog('XÓA', 'Chương trình học', `Xóa chương trình ${p?.name || id}`);
    toast.success(`Đã xóa chương trình ${p?.name || id} thành công!`);
  };

  return { handleCreateProgram, handleAddProgram, handleUpdateProgram, handleDeleteProgram };
}
