import type { ClassRoom, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

import { centerDate } from '../../lib/dates';
import { canManageAcademic, hasStaffPermission } from '../../lib/permissions';
import { updateEnrollmentHistory, validateCourse } from '../../lib/operations';

type Context = Pick<
  CenterStore,
  | 'classes'
  | 'setClasses'
  | 'students'
  | 'setStudents'
  | 'setTimetableSlots'
  | 'setGrades'
  | 'grades'
  | 'receipts'
  | 'attendanceSessions'
  | 'setAttendanceSessions'
  | 'enrollments'
  | 'setEnrollments'
  | 'scheduleChanges'
> & { currentUser: UserAccount | null; addLog: ActivityLogger };
export function createClassActions({
  classes,
  setClasses,
  students,
  setStudents,
  setTimetableSlots,
  setGrades,
  grades,
  receipts,
  attendanceSessions,
  setAttendanceSessions,
  enrollments,
  setEnrollments,
  scheduleChanges,
  currentUser,
  addLog,
}: Context) {
  // Class CRUD Handlers
  const handleAddClass = (c: ClassRoom) => {
    if (!canManageAcademic(currentUser, 'classes')) return;
    const error = validateCourse(c);
    if (error) {
      alert(error);
      return;
    }
    if (c.courseStatus === 'completed')
      c = { ...c, completedDate: c.completedDate || centerDate() };
    setClasses((prev) => [...prev, c]);
    addLog('THÊM', 'Lớp học', `Tạo lớp học mới ${c.name} (${c.code})`);
  };

  const handleUpdateClass = (c: ClassRoom) => {
    if (!canManageAcademic(currentUser, 'classes')) return;
    const previous = classes.find(item => item.id === c.id);
    if (students.some(student => student.classId === c.id) &&
        (previous?.programId !== c.programId || previous?.courseStatus !== c.courseStatus) &&
        !hasStaffPermission(currentUser, 'student', 'edit')) {
      alert('Cần thêm quyền sửa học viên để đổi chương trình hoặc trạng thái của lớp đang có học viên.');
      return;
    }
    const error = validateCourse(c);
    if (error) {
      alert(error);
      return;
    }
    if (
      c.courseStatus === 'completed' &&
      classes.find((item) => item.id === c.id)?.courseStatus !== 'completed'
    ) {
      c = { ...c, completedDate: c.completedDate || centerDate() };
      setEnrollments((prev) => {
        let history = prev;
        for (const student of students.filter((s) => s.classId === c.id))
          history = updateEnrollmentHistory(
            history,
            student,
            student,
            student.enrollDate || centerDate(),
          );
        return history.map((item) =>
          item.classId === c.id && ['active', 'reserved'].includes(item.status)
            ? { ...item, status: 'completed', endDate: c.completedDate }
            : item,
        );
      });
    } else if (c.courseStatus !== 'completed' && c.completedDate) {
      c = { ...c, completedDate: undefined };
      if (classes.find((item) => item.id === c.id)?.courseStatus === 'completed')
        setEnrollments((prev) =>
          students
            .filter((s) => s.classId === c.id && ['active', 'reserved'].includes(s.status))
            .reduce(
              (history, student) =>
                updateEnrollmentHistory(history, undefined, student, centerDate()),
              prev,
            ),
        );
    }
    setClasses((prev) => prev.map((item) => (item.id === c.id ? c : item)));
    setStudents((prev) =>
      prev.map((student) =>
        student.classId === c.id && student.programId !== c.programId
          ? { ...student, programId: c.programId }
          : student,
      ),
    );
    addLog('SỬA', 'Lớp học', `Cập nhật lớp học ${c.name} (${c.code})`);
  };

  const handleDeleteClass = (id: string) => {
    if (!canManageAcademic(currentUser, 'classes')) return;
    if (grades.some(grade => grade.classId === id) || attendanceSessions.some(session => session.classId === id)) {
      alert('Lớp có lịch sử điểm hoặc điểm danh. Hãy kết thúc đợt học để giữ hồ sơ.');
      return;
    }
    if (
      enrollments.some((item) => item.classId === id) ||
      scheduleChanges.some((item) => item.classId === id)
    ) {
      alert(
        'Đợt học có lịch sử đăng ký hoặc lịch nghỉ/học bù. Hãy giữ hồ sơ và chuyển trạng thái kết thúc.',
      );
      return;
    }
    const c = classes.find((item) => item.id === id);
    const classStudents = students.filter((student) => student.classId === id);
    const classReceipts = receipts.filter((receipt) => receipt.classId === id);
    if (classStudents.length > 0 || classReceipts.length > 0) {
      const dependencies = [
        classStudents.length > 0 ? `${classStudents.length} học sinh` : '',
        classReceipts.length > 0 ? `${classReceipts.length} phiếu thu` : '',
      ]
        .filter(Boolean)
        .join(' và ');
      alert(
        `Không thể xóa lớp ${c?.name || ''} vì còn ${dependencies}. Hãy chuyển học sinh và xử lý phiếu thu trước để giữ liên kết dữ liệu.`,
      );
      return;
    }
    setClasses((prev) => prev.filter((item) => item.id !== id));
    setTimetableSlots((prev) => prev.filter((slot) => slot.classId !== id));
    setGrades((prev) => prev.filter((grade) => grade.classId !== id));
    setAttendanceSessions((prev) => prev.filter((session) => session.classId !== id));
    if (c)
      addLog(
        'XÓA',
        'Lớp học',
        `Xóa lớp học ${c.name} (${c.code}) cùng lịch và điểm không còn liên kết`,
      );
  };

  return { handleAddClass, handleUpdateClass, handleDeleteClass };
}
