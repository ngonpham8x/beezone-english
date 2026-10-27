import type { CenterDataPayload } from '../../lib/centerData';
import { withUnbilledSessionReceipts } from '../../lib/sessionBilling';
import { feeStatusForReceipts } from '../../lib/tuition';
import { studentClassIds } from '../../lib/studentClasses';
import type {
  ActivityLog,
  AttendanceSession,
  CenterBackupData,
  ClassRoom,
  Student,
  Teacher,
  TimetableSlot,
  TuitionReceipt,
} from '../../types';
export const MAX_ACTIVITY_LOGS = 500;
export const mergeActivityLogs = (...lists: ActivityLog[][]) => {
  const seen = new Set<string>();
  const merged: ActivityLog[] = [];
  for (const list of lists) {
    for (const log of list) {
      if (!log?.id || seen.has(log.id)) continue;
      seen.add(log.id);
      merged.push(log);
      if (merged.length >= MAX_ACTIVITY_LOGS) return merged;
    }
  }
  return merged;
};

export const weekDayOrder = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

export const withClassScheduleSummary = (
  classroom: ClassRoom,
  slots: TimetableSlot[],
): ClassRoom => {
  const classSlots = slots
    .filter((slot) =>
      slot.classId === classroom.id &&
      Boolean(classroom.teacherId) &&
      slot.teacherId === classroom.teacherId)
    .sort(
      (left, right) =>
        weekDayOrder.indexOf(left.dayOfWeek) - weekDayOrder.indexOf(right.dayOfWeek) ||
        left.startTime.localeCompare(right.startTime),
    );

  return {
    ...classroom,
    days: [...new Set(classSlots.map((slot) => slot.dayOfWeek))],
    scheduleTime: classSlots
      .map((slot) => `${slot.dayOfWeek}: ${slot.startTime}-${slot.endTime}`)
      .join(' · '),
  };
};

export const feeStatusFromReceipts = (
  studentId: string,
  receipts: TuitionReceipt[],
  sessions: AttendanceSession[] = [],
): Student['feeStatus'] => {
  return feeStatusForReceipts(
    withUnbilledSessionReceipts(receipts, sessions).filter(
      (receipt) => receipt.studentId === studentId,
    ),
  );
};

export const normaliseReceipt = (receipt: TuitionReceipt): TuitionReceipt => {
  const paymentKind =
    receipt.paymentKind === 'course'
      ? 'course'
      : receipt.paymentKind === 'session'
        ? 'session'
        : 'monthly';
  const recordedAmount = Math.max(receipt.paidAmount + receipt.debtAmount + receipt.discount, 0);
  const status: NonNullable<TuitionReceipt['status']> =
    receipt.debtAmount > 0
      ? receipt.paidAmount > 0
        ? 'partial'
        : 'debt'
      : receipt.paidAmount > 0
        ? 'paid'
        : 'unpaid';
  return {
    ...receipt,
    // Keep both price fields. When staff reclassify an existing receipt, the
    // former monthly/course price stays as audit context instead of being
    // silently erased. Only paymentKind decides which bucket receives the
    // paid/debt amount in reports.
    courseFee:
      paymentKind === 'course'
        ? Math.max(receipt.courseFee ?? 0, recordedAmount)
        : Math.max(receipt.courseFee ?? 0, 0),
    monthlyFee:
      paymentKind === 'monthly'
        ? Math.max(receipt.monthlyFee ?? 0, recordedAmount)
        : Math.max(receipt.monthlyFee ?? 0, 0),
    paymentKind,
    billingPeriod: receipt.billingPeriod || receipt.paymentDate.slice(0, 7),
    // Status is derived from amounts so stale imported/manual labels cannot
    // disagree with the outstanding balance shown elsewhere.
    status,
  };
};

export const normaliseReceipts = (receipts: TuitionReceipt[]) => receipts.map(normaliseReceipt);

export const sanitizeClassName = (name: string): string => {
  if (!name) return '';
  return name
    .replace(
      /^(Tiếng Anh\s+(Mầm Non|Tiểu Học|THCS|THPT)|Chương Trình\s+[A-Za-z]+)\s*[-–—:]\s*/gi,
      '',
    )
    .replace(/\s*\([^)]*(tuổi|Lớp|Kids|Nhảy|Độ tuổi|Cấp|KIDDY|BEE|STARTER)[^)]*\)/gi, '')
    .trim();
};

export const normaliseClasses = (classrooms: ClassRoom[]) =>
  classrooms.map((c) => ({
    ...c,
    name: sanitizeClassName(c.name) || c.name,
  }));

export const sameIdList = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

// studentIds and assignedClassIds are denormalized fields used by some cards
// and reports. Keep them derived from the primary student/class references so
// one CRUD action can never leave a stale roster or teacher workload behind.
export const reconcileClassStudentIds = (classrooms: ClassRoom[], centerStudents: Student[]) => {
  const classIds = new Set(classrooms.map((classroom) => classroom.id));
  const studentIdsByClass = new Map<string, string[]>();
  centerStudents.forEach((student) => {
    for (const classId of studentClassIds(student)) {
      if (!classIds.has(classId)) continue;
      const ids = studentIdsByClass.get(classId) || [];
      ids.push(student.id);
      studentIdsByClass.set(classId, ids);
    }
  });

  let changed = false;
  const nextClasses = classrooms.map((classroom) => {
    const studentIds = studentIdsByClass.get(classroom.id) || [];
    if (sameIdList(classroom.studentIds || [], studentIds)) return classroom;
    changed = true;
    return { ...classroom, studentIds };
  });

  return changed ? nextClasses : classrooms;
};

export const reconcileTeacherAssignments = (centerTeachers: Teacher[], classrooms: ClassRoom[]) => {
  const classesByTeacher = new Map<string, string[]>();
  classrooms.forEach((classroom) => {
    const ids = classesByTeacher.get(classroom.teacherId) || [];
    ids.push(classroom.id);
    classesByTeacher.set(classroom.teacherId, ids);
  });
  let changed = false;
  const nextTeachers = centerTeachers.map((teacher) => {
    const assignedClassIds = classesByTeacher.get(teacher.id) || [];
    if (sameIdList(teacher.assignedClassIds || [], assignedClassIds)) return teacher;
    changed = true;
    return { ...teacher, assignedClassIds };
  });

  return changed ? nextTeachers : centerTeachers;
};

/** Compute session debt once per dataset, then keep unchanged student references. */
export function reconcileStudentFees(
  students: Student[],
  receipts: TuitionReceipt[],
  sessions: AttendanceSession[] = [],
): Student[] {
  const receiptsByStudent = new Map<string, TuitionReceipt[]>();
  withUnbilledSessionReceipts(receipts, sessions).forEach((receipt) => {
    const list = receiptsByStudent.get(receipt.studentId) || [];
    list.push(receipt);
    receiptsByStudent.set(receipt.studentId, list);
  });
  let changed = false;
  const next = students.map((student) => {
    const feeStatus = feeStatusForReceipts(receiptsByStudent.get(student.id) || []);
    if (feeStatus === student.feeStatus) return student;
    changed = true;
    return { ...student, feeStatus };
  });
  return changed ? next : students;
}

/** Used by cloud hydration, Excel import and JSON restore; financial history is preserved. */
export function normalizeCenterData(data: CenterBackupData): CenterDataPayload {
  const attendanceSessions = data.attendanceSessions || [];
  const receipts = normaliseReceipts(data.receipts);
  const students = reconcileStudentFees(data.students, receipts, attendanceSessions);
  const rosterClasses = reconcileClassStudentIds(data.classes, students);
  const classes = rosterClasses.map((classroom) =>
    withClassScheduleSummary(classroom, data.timetableSlots),
  );
  return {
    ...data,
    sessionBillingVersion: 1,
    attendanceSessions,
    enrollments: data.enrollments || [],
    scheduleChanges: data.scheduleChanges || [],
    receipts,
    students,
    classes,
    teachers: reconcileTeacherAssignments(data.teachers, classes),
  };
}
