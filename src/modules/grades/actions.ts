import { toast } from '../../lib/toast';
import { showAlert } from '../../lib/dialogs';
import { canAccessAccountClass } from '../../lib/accountScope';
import { calculateSemesterAverage, gradeSemester, isValidCustomGradeColumn, isValidScore } from '../../lib/gradebook';
import type { CustomGradeColumn, Grade, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

type Context = Pick<CenterStore, 'classes' | 'teachers' | 'grades' | 'setGrades' | 'settings' | 'setSettings'> & {
  currentUser: UserAccount | null;
  addLog: ActivityLogger;
};
const sameGradeValues = (left: Grade, right: Grade) =>
  left.id === right.id &&
  left.studentId === right.studentId &&
  left.classId === right.classId &&
  (left.semester || 'GKI') === (right.semester || 'GKI') &&
  left.listening === right.listening &&
  left.speaking === right.speaking &&
  (left.readingWriting ?? 0) === (right.readingWriting ?? 0) &&
  left.reading === right.reading &&
  left.writing === right.writing &&
  left.midterm === right.midterm &&
  left.finalExam === right.finalExam &&
  left.attendance === right.attendance &&
  left.average === right.average &&
  JSON.stringify(left.unitScores || {}) === JSON.stringify(right.unitScores || {});

export function createGradeActions({ classes, teachers, grades, setGrades, settings, setSettings, currentUser, addLog }: Context) {
  // Grade Handler
  const handleUpdateGrade = (updatedGrade: Grade) => {
    const classroom = classes.find((item) => item.id === updatedGrade.classId);
    const targetSemester = gradeSemester(updatedGrade);
    const existing = grades.find(
      (item) => item.id === updatedGrade.id ||
        (item.studentId === updatedGrade.studentId &&
         item.classId === updatedGrade.classId &&
         (item.semester || 'GKI') === targetSemester),
    );
    const commentOnly = Boolean(existing && sameGradeValues(existing, updatedGrade));
    const hasPermission = Boolean(
      currentUser?.active &&
      canAccessAccountClass(currentUser, classroom, classes, teachers) &&
      (currentUser.role === 'owner' || currentUser.permissions.grade.edit ||
        (commentOnly && currentUser.permissions.student.view)),
    );
    if (!hasPermission) {
      showAlert('Bạn không có quyền cập nhật điểm hoặc nhận xét của lớp này.');
      return false;
    }
    const comment = (updatedGrade.comment || '').trim();
    if (comment.length > 2000) {
      showAlert('Nhận xét không được vượt quá 2000 ký tự.');
      return false;
    }
    const scores = [updatedGrade.listening, updatedGrade.speaking, updatedGrade.reading, updatedGrade.writing,
      updatedGrade.midterm, updatedGrade.finalExam, updatedGrade.attendance];
    if (scores.some((score) => !isValidScore(score)) ||
        (updatedGrade.readingWriting !== undefined && !isValidScore(updatedGrade.readingWriting)) ||
        Object.entries(updatedGrade.unitScores || {}).some(([unitId, score]) =>
          !unitId.trim() || unitId.length > 100 || !isValidScore(score))) {
      showAlert('Điểm phải là số trong khoảng 0–10.');
      return false;
    }
    const validatedGrade = {
      ...updatedGrade,
      comment,
      semester: targetSemester,
      average: commentOnly && existing ? existing.average : calculateSemesterAverage(updatedGrade),
    };
    setGrades((prev) => {
      const idx = prev.findIndex(
        (g) => g.id === validatedGrade.id ||
          (g.studentId === validatedGrade.studentId &&
           g.classId === validatedGrade.classId &&
           (g.semester || 'GKI') === targetSemester),
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = validatedGrade;
        return next;
      }
      return [...prev, validatedGrade];
    });
    addLog('SỬA', 'Điểm', `Cập nhật bảng điểm cho học sinh ID ${validatedGrade.studentId} (${targetSemester})`);
    toast.success('Cập nhật bảng điểm thành công!');
    return true;
  };

  const handleUpdateGradeColumns = (columns: CustomGradeColumn[]) => {
    if (!currentUser?.active || currentUser.role !== 'owner') {
      showAlert('Chỉ Chủ trung tâm được thay đổi cấu trúc cột điểm dùng chung.');
      return false;
    }
    const normalized = columns.map((column) => ({ ...column, name: column.name.trim() }));
    const names = normalized.map((column) =>
      `${column.semester}\u0000${column.programId || (column.classId ? `class:${column.classId}` : 'all')}\u0000${column.name.toLocaleLowerCase('vi-VN')}`,
    );
    if (normalized.some((column) => !isValidCustomGradeColumn(column)) ||
        new Set(normalized.map((column) => column.id)).size !== normalized.length ||
        new Set(names).size !== names.length) {
      showAlert('Cấu hình cột điểm không hợp lệ hoặc bị trùng.');
      return false;
    }
    setSettings({ ...settings, gradeColumns: normalized });
    addLog('SỬA', 'Điểm', `Cập nhật ${normalized.length} cột điểm theo chương trình`);
    toast.success('Đã lưu cấu trúc cột điểm dùng chung.');
    return true;
  };

  return { handleUpdateGrade, handleUpdateGradeColumns };
}
