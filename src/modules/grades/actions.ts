import { toast } from '../../lib/toast';
import type { Grade, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

type Context = Pick<CenterStore, 'setGrades'> & {
  currentUser: UserAccount | null;
  addLog: ActivityLogger;
};
export function createGradeActions({ setGrades, currentUser, addLog }: Context) {
  // Grade Handler
  const handleUpdateGrade = (updatedGrade: Grade) => {
    setGrades((prev) => {
      const idx = prev.findIndex(
        (g) => g.studentId === updatedGrade.studentId && g.classId === updatedGrade.classId,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedGrade;
        return next;
      }
      return [...prev, updatedGrade];
    });
    addLog('SỬA', 'Điểm', `Cập nhật bảng điểm cho học sinh ID ${updatedGrade.studentId}`);
    toast.success('Cập nhật bảng điểm thành công!');
  };

  return { handleUpdateGrade };
}
