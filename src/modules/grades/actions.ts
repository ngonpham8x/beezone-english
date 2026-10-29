import { toast } from '../../lib/toast';
import { showAlert } from '../../lib/dialogs';
import { canAccessAccountClass } from '../../lib/accountScope';
import {
  calculateSemesterAverage,
  gradeColumnIdsForClass,
  gradeSemester,
  isActiveCustomGradeColumn,
  isValidCustomGradeColumn,
  isValidScore,
  normalizeCustomGradeColumns,
} from '../../lib/gradebook';
import type { CustomGradeColumn, Grade, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

type Context = Pick<CenterStore, 'classes' | 'programs' | 'teachers' | 'grades' | 'setGrades' | 'settings' | 'setSettings'> & {
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

export function createGradeActions({ classes, programs, teachers, grades, setGrades, settings, setSettings, currentUser, addLog }: Context) {
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
    const scores = [
      updatedGrade.listening,
      updatedGrade.speaking,
      updatedGrade.reading,
      updatedGrade.writing,
      updatedGrade.midterm,
      updatedGrade.finalExam,
      updatedGrade.attendance,
      updatedGrade.readingWriting,
    ];
    if (
      scores.some((score) => score !== undefined && score !== null && !isValidScore(score)) ||
      Object.entries(updatedGrade.unitScores || {}).some(
        ([unitId, score]) =>
          !unitId.trim() ||
          unitId.length > 100 ||
          (score !== undefined && score !== null && !isValidScore(score)),
      )
    ) {
      showAlert('Điểm phải là số trong khoảng 0–10.');
      return false;
    }
    const validatedGrade = {
      ...updatedGrade,
      comment,
      semester: targetSemester,
      average: commentOnly && existing
        ? existing.average
        : calculateSemesterAverage(
            updatedGrade,
            gradeColumnIdsForClass(
              normalizeCustomGradeColumns(settings.gradeColumns),
              targetSemester,
              classroom,
            ),
          ),
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
    const canManage = Boolean(
      currentUser?.active &&
      (currentUser.role === 'owner' ||
        ((currentUser.role === 'admin' || currentUser.role === 'trainer') &&
          currentUser.permissions.grade.edit)),
    );
    if (!canManage) {
      showAlert('Bạn không có quyền thay đổi cấu trúc cột bài và cột điểm.');
      return false;
    }
    const normalized = columns.map((column) => ({
      ...column,
      name: column.name.trim(),
      kind: column.kind === 'assessment' ? 'assessment' as const : 'unit' as const,
    }));
    const activeNames = normalized
      .filter(isActiveCustomGradeColumn)
      .map((column) => `${column.semester}\u0000${column.programId || (column.classId ? `class:${column.classId}` : 'all')}\u0000${column.name.toLocaleLowerCase('vi-VN')}`);
    if (
      normalized.some((column) => !isValidCustomGradeColumn(column)) ||
      new Set(normalized.map((column) => column.id)).size !== normalized.length ||
      new Set(activeNames).size !== activeNames.length ||
      normalized.some((column) => isActiveCustomGradeColumn(column) && column.programId && !programs.some((program) => program.id === column.programId))
    ) {
      showAlert('Cấu hình cột bài/điểm không hợp lệ, bị trùng hoặc không còn chương trình áp dụng.');
      return false;
    }

    const nextGrades = grades.map((grade) => {
      const classroom = classes.find((item) => item.id === grade.classId);
      const semester = gradeSemester(grade);
      return {
        ...grade,
        average: calculateSemesterAverage(
          grade,
          gradeColumnIdsForClass(normalized, semester, classroom),
        ),
      };
    });
    setSettings({ ...settings, gradeColumns: normalized });
    setGrades(nextGrades);
    addLog('SỬA', 'Điểm', `Cập nhật cấu trúc ${normalized.filter(isActiveCustomGradeColumn).length} cột bài/điểm và tính lại ĐTB`);
    toast.success('Đã đồng bộ cấu trúc cột và điểm trung bình.');
    return true;
  };

  return { handleUpdateGrade, handleUpdateGradeColumns };
}
