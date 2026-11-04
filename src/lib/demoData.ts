import type { CenterDataPayload } from './centerData';
import type { Student } from '../types';

const DEMO_STUDENT_SIGNATURES = new Set([
  'STU-001|HS-001|Nguyễn Văn Minh Khang',
  'STU-002|HS-002|Trần Lê Bảo Châu',
  'STU-003|HS-003|Phạm Gia Bảo',
  'STU-004|HS-004|Hoàng Vũ Thùy Trang',
  'STU-005|HS-005|Đặng Tuấn Kiệt',
  'STU-006|HS-006|Lê Nguyễn Hoàng Phúc',
  'STU-007|HS-007|Bùi Thị Thanh Hương',
  'STU-008|HS-008|Ngô Quốc Bảo',
  'STU-009|TS-001|Phan Minh Khang',
  'STU-010|TS-002|Võ Ngọc Diệp',
  'STU-011|TS-003|Lâm Hoàng Anh',
  'STU-012|HS-009|Huỳnh Thanh Trúc',
]);

/** Exact signatures prevent a similarly named real learner from being removed. */
export const isInitialDemoStudent = (student: Pick<Student, 'id' | 'code' | 'name'>) =>
  DEMO_STUDENT_SIGNATURES.has(`${student.id}|${student.code}|${student.name}`);

const DEMO_PROGRAM_IDS = new Set(['PROG-KIDDY', 'PROG-STARTERS', 'PROG-BEE-PRI', 'PROG-BEE-JUN', 'PROG-BEE-STAR']);
const DEMO_TEACHER_IDS = new Set(['TEA-001', 'TEA-002', 'TEA-003']);
const DEMO_ROOM_IDS = new Set(['ROOM-101', 'ROOM-102', 'ROOM-201']);
const DEMO_CLASS_IDS = new Set([
  'CLS-KIDDY-1', 'CLS-BEE-1', 'CLS-BEE-2', 'CLS-BEE-3', 'CLS-BEE-4', 'CLS-STARTERS-1', 'CLS-BEE-STAR',
]);
const DEMO_TIMETABLE_IDS = new Set(Array.from({ length: 16 }, (_, index) => `SLOT-${String(index + 1).padStart(2, '0')}`));
const DEMO_GRADE_IDS = new Set(Array.from({ length: 8 }, (_, index) => `G_STU-${String(index + 1).padStart(3, '0')}`));
const DEMO_RECEIPT_IDS = new Set(Array.from({ length: 8 }, (_, index) => `REC-${String(index + 1).padStart(3, '0')}`));
const DEMO_ATTENDANCE_IDS = new Set(['ATT-001', 'ATT-002']);
const DEMO_BACKUP_IDS = new Set(['BAK-001']);
const DEMO_ACTIVITY_IDS = new Set(['LOG-001', 'LOG-002']);
const DEMO_ACCOUNT_AUDIT_IDS = new Set(['AUD-001', 'AUD-002', 'AUD-003']);

const hasId = (ids: Set<string>, record: { id: string }) => ids.has(record.id);

export const isInitialDemoProgram = (record: { id: string }) => hasId(DEMO_PROGRAM_IDS, record);
export const isInitialDemoTeacher = (record: { id: string; name?: string }) =>
  hasId(DEMO_TEACHER_IDS, record) || record.name?.trim().toLocaleLowerCase('vi-VN') === 'cô a';
export const isInitialDemoRoom = (record: { id: string }) => hasId(DEMO_ROOM_IDS, record);
export const isInitialDemoClass = (record: { id: string }) => hasId(DEMO_CLASS_IDS, record);
export const isInitialDemoTimetable = (record: { id: string }) => hasId(DEMO_TIMETABLE_IDS, record);
export const isInitialDemoGrade = (record: { id: string }) => hasId(DEMO_GRADE_IDS, record);
export const isInitialDemoReceipt = (record: { id: string }) => hasId(DEMO_RECEIPT_IDS, record);
export const isInitialDemoAttendance = (record: { id: string }) => hasId(DEMO_ATTENDANCE_IDS, record);
export const isInitialDemoBackup = (record: { id: string }) => hasId(DEMO_BACKUP_IDS, record);
export const isInitialDemoActivity = (record: { id: string }) => hasId(DEMO_ACTIVITY_IDS, record);
export const isInitialDemoAccountAudit = (record: { id: string }) => hasId(DEMO_ACCOUNT_AUDIT_IDS, record);

export interface DemoCleanupResult {
  data: CenterDataPayload;
  removedRecords: number;
  removedStudentIds: Set<string>;
  removedClassIds: Set<string>;
}

/** Remove only the records bundled in the local preview, preserving imported and user-created data. */
export function stripInitialDemoData(data: CenterDataPayload): DemoCleanupResult {
  const removedStudentIds = new Set(data.students.filter(isInitialDemoStudent).map((student) => student.id));
  const removedClassIds = new Set(data.classes.filter(isInitialDemoClass).map((classroom) => classroom.id));
  const programs = data.programs.filter((program) => !isInitialDemoProgram(program));
  const teachers = data.teachers.filter((teacher) => !isInitialDemoTeacher(teacher));
  const rooms = data.rooms.filter((room) => !isInitialDemoRoom(room));
  const classes = data.classes.filter((classroom) => !removedClassIds.has(classroom.id));
  const students = data.students.filter((student) => !removedStudentIds.has(student.id));
  const timetableSlots = data.timetableSlots.filter((slot) => (
    !isInitialDemoTimetable(slot) &&
    !removedClassIds.has(slot.classId) &&
    !DEMO_TEACHER_IDS.has(slot.teacherId) &&
    !DEMO_ROOM_IDS.has(slot.roomId)
  ));
  const grades = data.grades.filter((grade) => (
    !isInitialDemoGrade(grade) && !removedStudentIds.has(grade.studentId) && !removedClassIds.has(grade.classId)
  ));
  const receipts = data.receipts.filter((receipt) => (
    !isInitialDemoReceipt(receipt) && !removedStudentIds.has(receipt.studentId) && !removedClassIds.has(receipt.classId)
  ));
  const attendanceSessions = data.attendanceSessions
    .filter((session) => !isInitialDemoAttendance(session) && !removedClassIds.has(session.classId))
    .map((session) => ({
      ...session,
      entries: session.entries.filter((entry) => !removedStudentIds.has(entry.studentId)),
    }));
  const enrollments = data.enrollments.filter((enrollment) => (
    !removedStudentIds.has(enrollment.studentId) && !removedClassIds.has(enrollment.classId)
  ));
  const scheduleChanges = data.scheduleChanges.filter((change) => !removedClassIds.has(change.classId));
  const backups = data.backups.filter((backup) => !isInitialDemoBackup(backup));
  const activityLogs = data.activityLogs.filter((log) => !isInitialDemoActivity(log));
  const removedRecords = [
    data.programs.length - programs.length,
    data.teachers.length - teachers.length,
    data.rooms.length - rooms.length,
    data.classes.length - classes.length,
    data.students.length - students.length,
    data.timetableSlots.length - timetableSlots.length,
    data.grades.length - grades.length,
    data.receipts.length - receipts.length,
    data.attendanceSessions.length - attendanceSessions.length,
    data.enrollments.length - enrollments.length,
    data.scheduleChanges.length - scheduleChanges.length,
    data.backups.length - backups.length,
    data.activityLogs.length - activityLogs.length,
  ].reduce((total, count) => total + count, 0);

  return {
    data: {
      ...data,
      programs,
      teachers,
      rooms,
      classes,
      students,
      timetableSlots,
      grades,
      receipts,
      attendanceSessions,
      enrollments,
      scheduleChanges,
      backups,
      activityLogs,
    },
    removedRecords,
    removedStudentIds,
    removedClassIds,
  };
}
