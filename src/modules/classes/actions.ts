import { showAlert } from '../../lib/dialogs';
import { toast } from '../../lib/toast';
import { isStudentInClass } from '../../lib/studentClasses';
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
    if (!canManageAcademic(currentUser, 'classes', 'add')) {
      toast.error('Bạn chưa được cấp quyền thêm lớp học.');
      return;
    }
    const error = validateCourse(c);
    if (error) {
      showAlert(error);
      return;
    }
    if (c.studentIds.length && !hasStaffPermission(currentUser, 'student', 'edit')) {
      showAlert('Cần quyền sửa học viên để xếp học viên vào lớp mới.'); return;
    }
    if (c.studentIds.some(id => !students.some(student => student.id === id))) {
      showAlert('Học viên được chọn không còn tồn tại.'); return;
    }
    if (c.capacity > 0 && students.filter(student => student.status === 'active' && c.studentIds.includes(student.id)).length > c.capacity) {
      showAlert('Số học viên được chọn vượt sĩ số tối đa của lớp.'); return;
    }
    if (c.courseStatus === 'completed')
      c = { ...c, completedDate: c.completedDate || centerDate() };
    setClasses((prev) => [...prev, c]);
    if (c.studentIds.length) {
      const updated = students.filter(student => c.studentIds.includes(student.id)).map(student => ({
        ...student, classId: student.classId || c.id,
        programId: student.classId ? student.programId : c.programId,
        additionalClassIds: student.classId ? [...new Set([...(student.additionalClassIds || []), c.id])] : [],
      }));
      setStudents(previous => previous.map(student => updated.find(item => item.id === student.id) || student));
      setEnrollments(previous => updated.reduce((history, student) => updateEnrollmentHistory(history, students.find(item => item.id === student.id), student, centerDate()), previous));
    }
    addLog('THÊM', 'Lớp học', `Tạo lớp học mới ${c.name} (${c.code})`);
    toast.success(`Tạo lớp học mới ${c.name} (${c.code}) thành công!`);
  };

  const handleUpdateClass = (c: ClassRoom) => {
    if (!canManageAcademic(currentUser, 'classes', 'edit')) return;
    const previous = classes.find(item => item.id === c.id);
    if (students.some(student => isStudentInClass(student, c.id)) &&
        (previous?.programId !== c.programId || previous?.courseStatus !== c.courseStatus) &&
        !hasStaffPermission(currentUser, 'student', 'edit')) {
      showAlert('Cần thêm quyền sửa học viên để đổi chương trình hoặc trạng thái của lớp đang có học viên.');
      return;
    }
    const error = validateCourse(c);
    if (error) {
      showAlert(error);
      return;
    }
    if (
      c.courseStatus === 'completed' &&
      classes.find((item) => item.id === c.id)?.courseStatus !== 'completed'
    ) {
      c = { ...c, completedDate: c.completedDate || centerDate() };
      setEnrollments((prev) => {
        let history = prev;
        for (const student of students.filter((s) => isStudentInClass(s, c.id)))
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
            .filter((s) => isStudentInClass(s, c.id) && ['active', 'reserved'].includes(s.status))
            .reduce(
              (history, student) =>
                updateEnrollmentHistory(history, undefined, { ...student, classId: c.id, additionalClassIds: [] }, centerDate()),
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
    toast.success(`Cập nhật lớp học ${c.name} (${c.code}) thành công!`);
  };

  const handleDeleteClass = (id: string) => {
    if (!canManageAcademic(currentUser, 'classes', 'delete')) return;
    if (grades.some(grade => grade.classId === id) || attendanceSessions.some(session => session.classId === id)) {
      const msg = 'Lớp có lịch sử điểm hoặc điểm danh. Hãy kết thúc đợt học để giữ hồ sơ.';
      showAlert(msg);
      return;
    }
    if (
      enrollments.some((item) => item.classId === id) ||
      scheduleChanges.some((item) => item.classId === id)
    ) {
      const msg = 'Đợt học có lịch sử đăng ký hoặc lịch nghỉ/học bù. Hãy giữ hồ sơ và chuyển trạng thái kết thúc.';
      showAlert(msg);
      return;
    }
    const c = classes.find((item) => item.id === id);
    if (!c) { showAlert('Lớp học không còn tồn tại.'); return; }
    const classStudents = students.filter((student) => isStudentInClass(student, id));
    const classReceipts = receipts.filter((receipt) => receipt.classId === id);
    if (classStudents.length > 0 || classReceipts.length > 0) {
      const dependencies = [
        classStudents.length > 0 ? `${classStudents.length} học sinh` : '',
        classReceipts.length > 0 ? `${classReceipts.length} phiếu thu` : '',
      ]
        .filter(Boolean)
        .join(' và ');
      const msg = `Không thể xóa lớp ${c?.name || ''} vì còn ${dependencies}. Hãy chuyển học sinh và xử lý phiếu thu trước để giữ liên kết dữ liệu.`;
      showAlert(msg);
      return;
    }
    setClasses((prev) => prev.filter((item) => item.id !== id));
    setTimetableSlots((prev) => prev.filter((slot) => slot.classId !== id));
    setGrades((prev) => prev.filter((grade) => grade.classId !== id));
    setAttendanceSessions((prev) => prev.filter((session) => session.classId !== id));
    if (c)
      addLog('XÓA', 'Lớp học', `Xóa lớp học ${c.name} (${c.code}) cùng lịch và điểm không còn liên kết`);
    toast.success(`Đã xóa lớp học ${c?.name || ''} thành công!`);
  };

  const handleReorderClasses = (reorderedClasses: ClassRoom[]) => {
    if (!canManageAcademic(currentUser, 'classes', 'edit')) return;
    setClasses(reorderedClasses);
    addLog('SỬA', 'Lớp học', 'Sắp xếp lại thứ tự các lớp học.');
    toast.success('Đã cập nhật thứ tự lớp học thành công!');
  };

  return { handleAddClass, handleUpdateClass, handleDeleteClass, handleReorderClasses };
}
