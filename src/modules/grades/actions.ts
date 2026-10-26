import { toast } from '../../lib/toast';
import { showAlert } from '../../lib/dialogs';
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
    const comment = (updatedGrade.comment || '').trim();
    if (comment.length > 2000) {
      showAlert('Nhận xét không được vượt quá 2000 ký tự.');
      return false;
    }
    const validatedGrade = { ...updatedGrade, comment };
    setGrades((prev) => {
      const idx = prev.findIndex(
        (g) => g.studentId === validatedGrade.studentId && g.classId === validatedGrade.classId,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = validatedGrade;
        return next;
      }
      return [...prev, validatedGrade];
    });
    addLog('SỬA', 'Điểm', `Cập nhật bảng điểm cho học sinh ID ${validatedGrade.studentId}`);
    toast.success('Cập nhật bảng điểm thành công!');
    return true;
  };

  return { handleUpdateGrade };
}
