import type { CenterBackupData, CenterSettings } from '../types';
import { centerDate, isCalendarDate } from './dates';
import { timeMinutes } from './schedule';
import { validSessionRate, validateSessionReceipt } from './sessionBilling';
import type { AttendanceSession, TuitionReceipt } from '../types';

export interface CenterDataPayload extends CenterBackupData {
  sessionBillingVersion: 1;
  attendanceSessions: NonNullable<CenterBackupData['attendanceSessions']>;
  enrollments: NonNullable<CenterBackupData['enrollments']>;
  scheduleChanges: NonNullable<CenterBackupData['scheduleChanges']>;
}
export interface BackupArchive {
  app: 'BEEZONE' | 'PHUC_PHUC_THINH';
  schemaVersion: number;
  exportedAt: string;
  centerName: string;
  data: CenterDataPayload;
}
export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const arrays = ['programs', 'teachers', 'rooms', 'classes', 'students', 'timetableSlots', 'grades', 'receipts', 'backups', 'activityLogs', 'attendanceSessions', 'enrollments', 'scheduleChanges'] as const;
const strings: Record<typeof arrays[number], string[]> = {
  programs: ['id', 'code', 'name', 'category'], teachers: ['id', 'name', 'phone', 'email', 'address', 'specialty'],
  rooms: ['id', 'name', 'status'], classes: ['id', 'code', 'name', 'programId', 'teacherId', 'roomId', 'scheduleTime'],
  students: ['id', 'code', 'name', 'dob', 'gender', 'school', 'gradeLevel', 'programId', 'classId', 'address', 'email', 'phone', 'parentName', 'parentPhone', 'enrollDate', 'status', 'feeStatus'],
  timetableSlots: ['id', 'classId', 'teacherId', 'roomId', 'dayOfWeek', 'startTime', 'endTime'],
  grades: ['id', 'studentId', 'classId'], receipts: ['id', 'code', 'studentId', 'classId', 'paymentDate', 'collectorName', 'paymentMethod'],
  backups: ['id', 'filename', 'timestamp', 'type', 'status'], activityLogs: ['id', 'timestamp', 'userName', 'userEmail', 'action', 'module', 'details'],
  attendanceSessions: ['id', 'classId', 'date', 'lessonTopic'],
  enrollments: ['id', 'studentId', 'classId', 'status'],
  scheduleChanges: ['id', 'classId', 'kind', 'date', 'startTime', 'endTime', 'teacherId', 'roomId', 'reason'],
};
const numbers: Partial<Record<typeof arrays[number], string[]>> = {
  programs: ['tuitionFee'], rooms: ['capacity'], classes: ['capacity'],
  grades: ['listening', 'speaking', 'reading', 'writing', 'midterm', 'finalExam', 'attendance', 'average'],
  receipts: ['courseFee', 'discount', 'paidAmount', 'debtAmount'], backups: ['sizeKb'],
};
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const stringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Validate imported/cloud data before any live state is replaced. Missing legacy arrays start empty. */
export function parseCenterData(value: unknown, fallbackSettings: CenterSettings): CenterDataPayload {
  if (!isRecord(value)) throw new Error('Dữ liệu trung tâm không đúng định dạng.');
  if (value.sessionBillingVersion !== undefined && value.sessionBillingVersion !== 1) throw new Error('Phiên bản dữ liệu học phí theo buổi không được hỗ trợ.');
  const result: Record<string, unknown> = { sessionBillingVersion: 1 };
  for (const key of arrays) {
    const records = value[key] ?? [];
    if (!Array.isArray(records)) throw new Error(`Danh sách ${key} không hợp lệ.`);
    const ids = new Set<string>();
    for (const record of records) {
      if (!isRecord(record) || strings[key].some((field) => typeof record[field] !== 'string') || !record.id || ids.has(record.id as string)) throw new Error(`Bản ghi ${key} thiếu thông tin hoặc trùng ID.`);
      ids.add(record.id as string);
      if (numbers[key]?.some((field) => !money(record[field]))) throw new Error(`Giá trị số trong ${key} không hợp lệ.`);
      if (key === 'classes' && (!stringArray(record.days) || !stringArray(record.studentIds))) throw new Error('Danh sách học viên hoặc ngày học không hợp lệ.');
      if (key === 'classes' || key === 'enrollments') {
        if (['startDate', 'endDate', 'completedDate'].some(field => record[field] !== undefined && !isCalendarDate(record[field]))) throw new Error('Ngày của khóa học không hợp lệ.');
        if (record.startDate && record.endDate && (record.startDate as string) > (record.endDate as string)) throw new Error('Ngày kết thúc trước ngày bắt đầu.');
      }
      if (key === 'classes' && ((record.totalSessions !== undefined && (!Number.isInteger(record.totalSessions) || (record.totalSessions as number) < 1)) || (record.courseStatus !== undefined && !['planned', 'active', 'paused', 'completed'].includes(record.courseStatus as string)))) throw new Error('Thông tin đợt học không hợp lệ.');
      if (key === 'classes' && ((record.billingMode !== undefined && !['course','monthly','session'].includes(record.billingMode as string)) || (record.sessionRate !== undefined && !validSessionRate(record.sessionRate)) || (record.sessionBillingStartDate !== undefined && !isCalendarDate(record.sessionBillingStartDate)) || (record.sessionAbsencePolicy !== undefined && !['attended','unexcused','all'].includes(record.sessionAbsencePolicy as string)) || (record.billingMode === 'session' && (!validSessionRate(record.sessionRate) || !isCalendarDate(record.sessionBillingStartDate))))) throw new Error('Cấu hình học phí theo buổi không hợp lệ.');
      if (key === 'enrollments' && !['active', 'reserved', 'completed', 'transferred', 'dropped'].includes(record.status as string)) throw new Error('Lịch sử đăng ký học không hợp lệ.');
      if (key === 'scheduleChanges') {
        if (!['cancel', 'move', 'extra'].includes(record.kind as string) || !isCalendarDate(record.date) || (record.sourceDate !== undefined && !isCalendarDate(record.sourceDate)) || (record.kind !== 'extra' && typeof record.sourceSlotId !== 'string') || (record.kind === 'move' && !isCalendarDate(record.sourceDate))) throw new Error('Lịch nghỉ/học bù không hợp lệ.');
        const start = timeMinutes(record.startTime as string), end = timeMinutes(record.endTime as string);
        if (start === null || end === null || start >= end) throw new Error('Giờ học bù không hợp lệ.');
      }
      if (key === 'teachers' && !stringArray(record.assignedClassIds)) throw new Error('Phân công giáo viên không hợp lệ.');
      if (key === 'students' && !['active', 'reserved', 'dropped', 'lead', 'trial', 'registered'].includes(record.status as string)) throw new Error('Trạng thái học viên không hợp lệ.');
      if (key === 'students' && record.additionalClassIds !== undefined && (!stringArray(record.additionalClassIds) || record.additionalClassIds.some(id => !id.trim() || id === record.classId) || new Set(record.additionalClassIds).size !== record.additionalClassIds.length || (!record.classId && record.additionalClassIds.length))) throw new Error('Danh sách lớp học thêm không hợp lệ.');
      if (key === 'grades' && numbers.grades!.some((field) => (record[field] as number) > 10)) throw new Error('Điểm phải trong khoảng 0–10.');
      if (key === 'receipts') {
        if (record.paymentKind !== undefined && !['course','monthly','session'].includes(record.paymentKind as string)) throw new Error('Hình thức học phí không hợp lệ.');
        if (record.paymentKind === 'session' && (!Array.isArray(record.sessionLines) || record.sessionLines.some(line => !isRecord(line) || typeof line.attendanceSessionId !== 'string' || !isCalendarDate(line.date) || !validSessionRate(line.unitPrice)) || !money(record.sessionFee))) throw new Error('Chi tiết phiếu học phí theo buổi không hợp lệ.');
        if (record.dueDate !== undefined && !isCalendarDate(record.dueDate)) throw new Error('Hạn thanh toán không hợp lệ.');
        if (!isCalendarDate(record.paymentDate) || (record.monthlyFee !== undefined && !money(record.monthlyFee))) throw new Error('Ngày thu hoặc học phí tháng không hợp lệ.');
        if (record.installments !== undefined) {
          if (!Array.isArray(record.installments) || record.installments.some((entry) => !isRecord(entry) || typeof entry.id !== 'string' || !money(entry.amount) || !isCalendarDate(entry.date))) throw new Error('Lịch sử đóng học phí không hợp lệ.');
          const total = record.installments.reduce((sum, entry) => sum + entry.amount, 0);
          if (total > (record.paidAmount as number)) throw new Error('Tổng các đợt đóng vượt quá số tiền đã thu.');
        }
      }
      if (key === 'attendanceSessions' && (!isCalendarDate(record.date) || !Array.isArray(record.entries) || record.entries.some((entry) => !isRecord(entry) || typeof entry.studentId !== 'string' || !['present', 'absent', 'excused', 'late'].includes(entry.status as string)))) throw new Error('Dữ liệu điểm danh không hợp lệ.');
      if (key === 'attendanceSessions' && record.billing !== undefined && (!isRecord(record.billing) || !validSessionRate(record.billing.unitPrice) || !['attended','unexcused','all'].includes(record.billing.absencePolicy as string) || new Set((record.entries as {studentId:string}[]).map(entry => entry.studentId)).size !== (record.entries as unknown[]).length)) throw new Error('Đơn giá hoặc danh sách tính phí buổi học không hợp lệ.');
    }
    result[key] = records;
  }
  const classIds = new Set((result.classes as { id: string }[]).map(c => c.id));
  if ((result.students as { additionalClassIds?: string[] }[]).some(student => student.additionalClassIds?.some(id => !classIds.has(id)))) throw new Error('Lớp học thêm không tồn tại.');
  for (const session of result.attendanceSessions as AttendanceSession[]) {
    if (!session.billing) continue;
    if (session.date > centerDate() || !(result.classes as {id:string}[]).some(c => c.id === session.classId) || session.entries.some(entry => !(result.students as {id:string}[]).some(s => s.id === entry.studentId))) throw new Error('Buổi tính phí ở tương lai hoặc thiếu hồ sơ lớp/học viên.');
    if ((result.attendanceSessions as AttendanceSession[]).filter(item => item.classId === session.classId && item.date === session.date).length > 1) throw new Error('Lớp có buổi tính phí trùng ngày.');
  }
  for (const receipt of result.receipts as TuitionReceipt[]) {
    const message = validateSessionReceipt(receipt, result.attendanceSessions as AttendanceSession[], result.receipts as TuitionReceipt[]);
    if (message) throw new Error(message);
  }
  const settings = value.settings ?? fallbackSettings;
  if (!isRecord(settings) || ['name', 'slogan', 'address', 'phone', 'email', 'adminReportEmail'].some((key) => typeof settings[key] !== 'string') || ['autoEmailReport', 'autoBackup'].some((key) => typeof settings[key] !== 'boolean')) throw new Error('Cài đặt trung tâm không hợp lệ.');
  if (settings.sheetsConfig !== undefined && !isRecord(settings.sheetsConfig)) throw new Error('Cấu hình bảng tính không hợp lệ.');
  result.settings = { ...fallbackSettings, ...settings, sheetsConfig: { ...fallbackSettings.sheetsConfig, ...(settings.sheetsConfig as object || {}) } };
  return result as unknown as CenterDataPayload;
}

export function parseBackupArchive(value: unknown, fallbackSettings: CenterSettings): BackupArchive {
  if (!isRecord(value) || !['BEEZONE', 'PHUC_PHUC_THINH'].includes(value.app as string) || value.schemaVersion !== 1 || !isRecord(value.data) || arrays.filter((key) => !['attendanceSessions', 'enrollments', 'scheduleChanges'].includes(key)).some((key) => !Array.isArray((value.data as Record<string, unknown>)[key]))) throw new Error('Tệp không đúng định dạng sao lưu BeeZone.');
  return { ...value, data: parseCenterData(value.data, fallbackSettings) } as unknown as BackupArchive;
}
