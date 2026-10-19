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
    if (!canManageAcademic(currentUser, 'programs')) return;
    setPrograms((prev) => [...prev, program]);
    addLog('THÊM', 'Chương trình học', `Tạo chương trình ${program.name}`);
  };

  // Program Handlers
  const handleAddProgram = (program: CourseProgram) => {
    if (!canManageAcademic(currentUser, 'programs')) return;
    setPrograms((prev) => [...prev, program]);
    addLog('THÊM', 'Chương trình học', `Tạo chương trình ${program.name} (${program.code})`);
  };

  const handleUpdateProgram = (program: CourseProgram) => {
    if (!canManageAcademic(currentUser, 'programs')) return;
    setPrograms((prev) => prev.map((p) => (p.id === program.id ? program : p)));
    addLog('SỬA', 'Chương trình học', `Cập nhật chương trình ${program.name} (${program.code})`);
  };

  const handleDeleteProgram = (id: string) => {
    if (!canManageAcademic(currentUser, 'programs')) return;
    const p = programs.find((item) => item.id === id);
    if (students.some((s) => s.programId === id) || classes.some((c) => c.programId === id)) {
      alert('Không thể xóa chương trình đang có học viên hoặc lớp học.');
      return;
    }
    setPrograms((prev) => prev.filter((item) => item.id !== id));
    if (p) addLog('XÓA', 'Chương trình học', `Xóa chương trình ${p?.name || id}`);
  };

  return { handleCreateProgram, handleAddProgram, handleUpdateProgram, handleDeleteProgram };
}
