import { showAlert } from '../../lib/dialogs';
import type { Student, TuitionReceipt, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

import { centerDate, isCalendarDate } from '../../lib/dates';
import { isTeachingRole } from '../../lib/accountScope';
import { hasStaffPermission } from '../../lib/permissions';
import { nextReceiptCode } from '../../lib/identifiers';
import { updateEnrollmentHistory } from '../../lib/operations';
import { isStudentInClass, reconcileStudentClassCodes, validateStudentClasses } from '../../lib/studentClasses';
import { toast } from '../../lib/toast';
import { feeStatusFromReceipts } from '../center/model';

type Context = Pick<
  CenterStore,
  | 'programs'
  | 'classes'
  | 'setClasses'
  | 'students'
  | 'setStudents'
  | 'grades'
  | 'setGrades'
  | 'receipts'
  | 'setReceipts'
  | 'attendanceSessions'
  | 'enrollments'
  | 'setEnrollments'
> & { currentUser: UserAccount | null; addLog: ActivityLogger };

export interface StudentDeletionOptions {
  detachClasses?: boolean;
  archiveHistory?: boolean;
}

export function createStudentActions({
  programs,
  classes,
  setClasses,
  students,
  setStudents,
  grades,
  setGrades,
  receipts,
  setReceipts,
  attendanceSessions,
  enrollments,
  setEnrollments,
  currentUser,
  addLog,
}: Context) {
  const teacherAccount = isTeachingRole(currentUser?.role);
  // Student CRUD Handlers
  const handleAddStudent = (newStudent: Student) => {
    if (teacherAccount || !hasStaffPermission(currentUser, 'student', 'add')) return;
    const error = validateStudentClasses(newStudent, classes, students);
    if (error) { showAlert(error); return; }
    if (newStudent.classId)
      setEnrollments((prev) =>
        updateEnrollmentHistory(prev, undefined, newStudent, newStudent.enrollDate || centerDate()),
      );
    const candidate = {
        ...newStudent,
        feeStatus: feeStatusFromReceipts(newStudent.id, receipts, attendanceSessions),
      };
    const normalizedStudent = reconcileStudentClassCodes([candidate, ...students], classes)[0];
    setStudents((prev) => reconcileStudentClassCodes([candidate, ...prev], classes));
    addLog('THÊM', 'Học sinh', `Thêm mới học sinh ${normalizedStudent.name} (${normalizedStudent.code})`);
    toast.success(`Thêm mới học sinh ${normalizedStudent.name} (${normalizedStudent.code}) thành công!`);
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    if (teacherAccount || !hasStaffPermission(currentUser, 'student', 'edit')) return;
    const previous = students.find(student => student.id === updatedStudent.id);
    if (!previous) return;
    if (previous.classId !== updatedStudent.classId || previous.status !== updatedStudent.status || JSON.stringify(previous.additionalClassIds) !== JSON.stringify(updatedStudent.additionalClassIds)) {
      const error = validateStudentClasses(updatedStudent, classes, students);
      if (error) { showAlert(error); return; }
    }
    setEnrollments((prev) =>
      updateEnrollmentHistory(
        prev,
        students.find((s) => s.id === updatedStudent.id),
        updatedStudent,
        centerDate(),
      ),
    );
    const candidate = {
      ...updatedStudent,
      feeStatus: feeStatusFromReceipts(updatedStudent.id, receipts, attendanceSessions),
    };
    const normalizedStudent = reconcileStudentClassCodes(
      students.map((student) => student.id === candidate.id ? candidate : student),
      classes,
    ).find((student) => student.id === candidate.id)!;
    setStudents((prev) => reconcileStudentClassCodes(
      prev.map((student) => student.id === candidate.id ? candidate : student),
      classes,
    ));
    addLog('SỬA', 'Học sinh', `Cập nhật thông tin học sinh ${updatedStudent.name} (${updatedStudent.code})`);
    toast.success(`Cập nhật thông tin học sinh ${updatedStudent.name} thành công!`);
  };

  const handleDeleteStudent = (id: string, options?: StudentDeletionOptions): string | null => {
    if (teacherAccount || !hasStaffPermission(currentUser, 'student', 'delete')) {
      return 'Bạn chưa được cấp quyền xóa học sinh.';
    }
    const st = students.find((s) => s.id === id);
    if (!st) return 'Học viên không còn tồn tại. Hãy tải lại danh sách.';
    const linkedReceipts = receipts.filter((receipt) => receipt.studentId === id);
    const linkedGrades = grades.filter((grade) => grade.studentId === id);
    const linkedAttendance = attendanceSessions.filter((session) =>
      session.entries.some((entry) => entry.studentId === id),
    );
    const linkedEnrollments = enrollments.filter((item) => item.studentId === id);
    const hasHistory = Boolean(
      linkedReceipts.length || linkedGrades.length || linkedAttendance.length || linkedEnrollments.length,
    );
    const linkedClassIds = new Set([
      st.classId,
      ...(st.additionalClassIds || []),
      ...classes.filter((classroom) => classroom.studentIds.includes(id)).map((classroom) => classroom.id),
    ].filter(Boolean));

    if (linkedClassIds.size > 0 && options && !options.detachClasses)
      return `Hãy tích chọn gỡ học viên khỏi ${linkedClassIds.size} lớp trước khi tiếp tục.`;

    if (hasHistory) {
      if (!options?.archiveHistory) {
        return `Học viên có dữ liệu lịch sử (${linkedReceipts.length} phiếu thu, ${linkedGrades.length} bảng điểm, ${linkedAttendance.length} buổi điểm danh, ${linkedEnrollments.length} đăng ký lớp). Hãy chọn giữ lịch sử và chuyển hồ sơ sang Nghỉ học.`;
      }
      if (!hasStaffPermission(currentUser, 'student', 'edit'))
        return 'Cần thêm quyền sửa học viên để gỡ lớp và chuyển hồ sơ sang Nghỉ học.';

      const archivedStudent: Student = {
        ...st,
        classId: '',
        additionalClassIds: [],
        status: 'dropped',
        notes: `${st.notes || ''}\n[LƯU HỒ SƠ LỊCH SỬ]: Đã gỡ liên kết lớp ngày ${centerDate()}; giữ nguyên học phí, điểm, điểm danh và đăng ký cũ.`.trim(),
      };
      setEnrollments((prev) => updateEnrollmentHistory(prev, st, archivedStudent, centerDate()));
      setStudents((prev) => reconcileStudentClassCodes(
        prev.map((student) => student.id === id ? archivedStudent : student),
        classes,
      ));
      setClasses((prev) => prev.map((classroom) => classroom.studentIds.includes(id)
        ? { ...classroom, studentIds: classroom.studentIds.filter((studentId) => studentId !== id) }
        : classroom));
      addLog(
        'SỬA',
        'Học sinh',
        `Gỡ học sinh ${st.name} (${st.code}) khỏi ${linkedClassIds.size} lớp và chuyển Nghỉ học; giữ nguyên dữ liệu lịch sử.`,
      );
      toast.success(`Đã gỡ liên kết lớp và lưu hồ sơ lịch sử của ${st.name}.`);
      return null;
    }
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setClasses((prev) => prev.map((c) => c.studentIds.includes(id) ? { ...c, studentIds: c.studentIds.filter((sid) => sid !== id) } : c));
    if (st)
      addLog('XÓA', 'Học sinh', `Xóa hồ sơ chưa có lịch sử của học sinh ${st.name} (${st.code})`);
    toast.success(`Đã xóa học sinh ${st ? st.name : ''} thành công!`);
    return null;
  };

  const handleEnrollStudent = (studentId: string, classId: string, enrollDate: string) => {
    if (
      !currentUser ||
      teacherAccount ||
      (currentUser.role !== 'owner' &&
        (!currentUser.permissions.student.edit ||
          (classes.find((c) => c.id === classId)?.billingMode !== 'session' &&
            !currentUser.permissions.tuition.collect)))
    ) {
      showAlert('Cần quyền sửa học viên và thu học phí để xác nhận nhập học.');
      return false;
    }
    const student = students.find((s) => s.id === studentId);
    if (!student || student.status === 'active') return false;
    const targetClass = classes.find((c) => c.id === classId);
    if (!targetClass) {
      showAlert('Lớp nhập học không tồn tại.');
      return false;
    }
    if (targetClass.courseStatus === 'completed' || targetClass.courseStatus === 'paused') {
      showAlert('Chọn một đợt học đang mở.');
      return false;
    }
    if (
      targetClass.capacity > 0 &&
      students.filter((s) => isStudentInClass(s, classId) && s.status === 'active').length >=
        targetClass.capacity
    ) {
      showAlert('Lớp đã đủ sĩ số. Hãy chọn lớp khác.');
      return false;
    }
    const targetProgram = programs.find((p) => p.id === targetClass.programId);
    if (!targetProgram) {
      showAlert('Lớp chưa có chương trình học hợp lệ.');
      return false;
    }
    const tuitionAmount = targetProgram.tuitionFee;
    setEnrollments((prev) =>
      updateEnrollmentHistory(
        prev,
        student,
        { ...student, classId, additionalClassIds: student.additionalClassIds?.filter(id => id !== classId), status: 'active' },
        enrollDate || centerDate(),
      ),
    );

    // 1. Update student
    setStudents((prev) =>
      reconcileStudentClassCodes(prev.map((s) => {
        if (s.id === studentId) {
          return {
            ...s,
            status: 'active' as const,
            classId: classId,
            additionalClassIds: s.additionalClassIds?.filter(id => id !== classId),
            programId: targetClass?.programId || s.programId,
            enrollDate: enrollDate || centerDate(),
          };
        }
        return s;
      }), classes),
    );

    // 2. Add student to target class studentIds
    setClasses((prev) =>
      prev.map((c) => {
        if (c.id === classId && !c.studentIds.includes(studentId)) {
          return { ...c, studentIds: [...c.studentIds, studentId] };
        }
        return c;
      }),
    );

    // 3. Create initial grade record for class
    if (currentUser.role === 'owner')
      setGrades((prev) => {
        if (prev.some((g) => g.studentId === studentId && g.classId === classId)) return prev;
        return [
          ...prev,
          {
            id: `GR_${Date.now()}_${studentId}`,
            studentId,
            classId,
            semester: 'GKI',
            listening: 0,
            speaking: 0,
            readingWriting: 0,
            reading: 0,
            writing: 0,
            midterm: 0,
            finalExam: 0,
            attendance: 0,
            unitScores: {},
            average: 0,
          },
        ];
      });

    // 4. Create initial tuition receipt
    const newReceipt: TuitionReceipt = {
      id: `REC_${crypto.randomUUID()}`,
      code: nextReceiptCode(receipts),
      studentId,
      classId,
      courseFee: targetClass.billingMode === 'monthly' ? 0 : tuitionAmount,
      monthlyFee: targetClass.billingMode === 'monthly' ? tuitionAmount : 0,
      paymentKind: targetClass.billingMode === 'monthly' ? 'monthly' : 'course',
      billingPeriod:
        targetClass.billingMode === 'monthly'
          ? (enrollDate || centerDate()).slice(0, 7)
          : `Nhập học ${enrollDate || centerDate()}`,
      discount: 0,
      paidAmount: 0,
      debtAmount: tuitionAmount,
      status: 'unpaid',
      paymentDate: enrollDate || centerDate(),
      collectorName: currentUser?.name || 'BeeZone English',
      paymentMethod: 'Chưa xác định',
      notes: `Học phí nhập học khóa ${targetProgram?.name || targetClass?.name || ''}`,
    };
    if (
      targetClass.billingMode !== 'session' &&
      tuitionAmount > 0 &&
      !receipts.some(
        (r) => r.studentId === studentId && r.classId === classId && r.paymentKind === 'course',
      )
    )
      setReceipts((prev) => [newReceipt, ...prev]);

    addLog(
      'THÊM',
      'Tuyển sinh',
      `Xác nhận nhập học chính thức học viên ${student.name} (${student.code}) vào lớp ${targetClass?.name || classId}`,
    );
    
    toast.success(`Nhập học thành công cho học viên ${student.name}!`);
    return true;
  };

  const handleReserveStudent = (
    studentId: string,
    reserveDate: string,
    expectedReturnDate: string,
    reason: string,
  ) => {
    if (teacherAccount || !hasStaffPermission(currentUser, 'student', 'edit')) return false;
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    setEnrollments((prev) =>
      updateEnrollmentHistory(prev, student, { ...student, status: 'reserved' }, reserveDate),
    );
    const reserveNote = `\n[BẢO LƯU]: Từ ${reserveDate} đến ${expectedReturnDate || 'chưa định ngày'}. Lý do: ${reason}`;
    setStudents((prev) =>
      reconcileStudentClassCodes(prev.map((s) => {
        if (s.id === studentId) {
          return {
            ...s,
            status: 'reserved' as const,
            notes: (s.notes || '') + reserveNote,
          };
        }
        return s;
      }), classes),
    );
    addLog('SỬA', 'Học sinh', `Bảo lưu học tập học sinh ${student.name} (${student.code}) từ ${reserveDate}`);
    toast.success(`Đã cập nhật bảo lưu cho học sinh ${student.name}!`);
  };

  const handleDropStudent = (studentId: string, dropDate: string, reason: string) => {
    if (teacherAccount || !hasStaffPermission(currentUser, 'student', 'edit')) return false;
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    setEnrollments((prev) =>
      updateEnrollmentHistory(prev, student, { ...student, status: 'dropped' }, dropDate),
    );
    const dropNote = `\n[NGHỈ HỌC NGANG]: Ngày ${dropDate}. Lý do: ${reason}`;
    setStudents((prev) =>
      reconcileStudentClassCodes(prev.map((s) => {
        if (s.id === studentId) {
          return {
            ...s,
            status: 'dropped' as const,
            notes: (s.notes || '') + dropNote,
          };
        }
        return s;
      }), classes),
    );
    addLog('SỬA', 'Học sinh', `Học sinh ${student.name} (${student.code}) nghỉ học từ ngày ${dropDate}`);
    toast.success(`Đã cập nhật trạng thái nghỉ học cho học sinh ${student.name}!`);
  };

  const handleReEnrollStudent = (
    studentId: string,
    targetClassId: string,
    returnDate: string,
    note?: string,
  ) => {
    if (!currentUser || teacherAccount || (currentUser.role !== 'owner' && !currentUser.permissions.student.edit))
      return false;
    if (!isCalendarDate(returnDate)) {
      showAlert('Ngày đăng ký không hợp lệ.');
      return false;
    }
    const student = students.find((s) => s.id === studentId);
    if (!student) return false;
    const targetClass = classes.find((c) => c.id === targetClassId);
    if (!targetClass) {
      showAlert('Lớp quay lại học không tồn tại.');
      return false;
    }
    if (targetClass.courseStatus === 'completed' || targetClass.courseStatus === 'paused') {
      showAlert('Chọn một đợt học đang mở.');
      return false;
    }
    if (
      targetClass.capacity > 0 &&
      students.filter(
        (s) => s.id !== studentId && isStudentInClass(s, targetClassId) && s.status === 'active',
      ).length >= targetClass.capacity
    ) {
      showAlert('Lớp đã đủ sĩ số. Hãy chọn lớp khác.');
      return false;
    }
    const reNote = `\n[QUAY LẠI HỌC]: Ngày ${returnDate} tại lớp ${targetClass?.name || targetClassId}. ${note || ''}`;
    setEnrollments((prev) =>
      updateEnrollmentHistory(
        prev,
        student,
        { ...student, classId: targetClassId, additionalClassIds: student.additionalClassIds?.filter(id => id !== targetClassId), status: 'active' },
        returnDate,
      ),
    );
    setStudents((prev) =>
      reconcileStudentClassCodes(prev.map((s) => {
        if (s.id === studentId) {
          return {
            ...s,
            status: 'active' as const,
            classId: targetClassId,
            additionalClassIds: s.additionalClassIds?.filter(id => id !== targetClassId),
            programId: targetClass.programId,
            notes: (s.notes || '') + reNote,
          };
        }
        return s;
      }), classes),
    );
    setClasses((prev) =>
      prev.map((c) => {
        if (c.id !== targetClassId && c.studentIds.includes(studentId)) {
          return { ...c, studentIds: c.studentIds.filter((id) => id !== studentId) };
        }
        if (c.id === targetClassId && !c.studentIds.includes(studentId)) {
          return { ...c, studentIds: [...c.studentIds, studentId] };
        }
        return c;
      }),
    );
    addLog(
      'SỬA',
      'Học sinh',
      `Học sinh ${student.name} (${student.code}) quay lại học lớp ${targetClass?.name || targetClassId}`,
    );
    
    toast.success(`Học sinh ${student.name} đã quay lại học thành công!`);
    return true;
  };

  return {
    handleAddStudent,
    handleUpdateStudent,
    handleDeleteStudent,
    handleEnrollStudent,
    handleReserveStudent,
    handleDropStudent,
    handleReEnrollStudent,
  };
}
