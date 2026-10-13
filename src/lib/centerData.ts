import type { CenterBackupData, CenterSettings } from '../types';
import { isCalendarDate } from './dates';

export interface CenterDataPayload extends CenterBackupData { attendanceSessions: NonNullable<CenterBackupData['attendanceSessions']> }
export interface BackupArchive {
  app: 'BEEZONE' | 'PHUC_PHUC_THINH';
  schemaVersion: number;
  exportedAt: string;
  centerName: string;
  data: CenterDataPayload;
}
export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const arrays = ['programs', 'teachers', 'rooms', 'classes', 'students', 'timetableSlots', 'grades', 'receipts', 'backups', 'activityLogs', 'attendanceSessions'] as const;
const strings: Record<typeof arrays[number], string[]> = {
  programs: ['id', 'code', 'name', 'category'], teachers: ['id', 'name', 'phone', 'email', 'address', 'specialty'],
  rooms: ['id', 'name', 'status'], classes: ['id', 'code', 'name', 'programId', 'teacherId', 'roomId', 'scheduleTime'],
  students: ['id', 'code', 'name', 'dob', 'gender', 'school', 'gradeLevel', 'programId', 'classId', 'address', 'email', 'phone', 'parentName', 'parentPhone', 'enrollDate', 'status', 'feeStatus'],
  timetableSlots: ['id', 'classId', 'teacherId', 'roomId', 'dayOfWeek', 'startTime', 'endTime'],
  grades: ['id', 'studentId', 'classId'], receipts: ['id', 'code', 'studentId', 'classId', 'paymentDate', 'collectorName', 'paymentMethod'],
  backups: ['id', 'filename', 'timestamp', 'type', 'status'], activityLogs: ['id', 'timestamp', 'userName', 'userEmail', 'action', 'module', 'details'],
  attendanceSessions: ['id', 'classId', 'date', 'lessonTopic'],
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
  const result: Record<string, unknown> = {};
  for (const key of arrays) {
    const records = value[key] ?? [];
    if (!Array.isArray(records)) throw new Error(`Danh sách ${key} không hợp lệ.`);
    const ids = new Set<string>();
    for (const record of records) {
      if (!isRecord(record) || strings[key].some((field) => typeof record[field] !== 'string') || !record.id || ids.has(record.id as string)) throw new Error(`Bản ghi ${key} thiếu thông tin hoặc trùng ID.`);
      ids.add(record.id as string);
      if (numbers[key]?.some((field) => !money(record[field]))) throw new Error(`Giá trị số trong ${key} không hợp lệ.`);
      if (key === 'classes' && (!stringArray(record.days) || !stringArray(record.studentIds))) throw new Error('Danh sách học viên hoặc ngày học không hợp lệ.');
      if (key === 'teachers' && !stringArray(record.assignedClassIds)) throw new Error('Phân công giáo viên không hợp lệ.');
      if (key === 'students' && !['active', 'reserved', 'dropped', 'lead', 'trial', 'registered'].includes(record.status as string)) throw new Error('Trạng thái học viên không hợp lệ.');
      if (key === 'grades' && numbers.grades!.some((field) => (record[field] as number) > 10)) throw new Error('Điểm phải trong khoảng 0–10.');
      if (key === 'receipts') {
        if (!isCalendarDate(record.paymentDate) || (record.monthlyFee !== undefined && !money(record.monthlyFee))) throw new Error('Ngày thu hoặc học phí tháng không hợp lệ.');
        if (record.installments !== undefined) {
          if (!Array.isArray(record.installments) || record.installments.some((entry) => !isRecord(entry) || typeof entry.id !== 'string' || !money(entry.amount) || !isCalendarDate(entry.date))) throw new Error('Lịch sử đóng học phí không hợp lệ.');
          const total = record.installments.reduce((sum, entry) => sum + entry.amount, 0);
          if (total > (record.paidAmount as number)) throw new Error('Tổng các đợt đóng vượt quá số tiền đã thu.');
        }
      }
      if (key === 'attendanceSessions' && (!isCalendarDate(record.date) || !Array.isArray(record.entries) || record.entries.some((entry) => !isRecord(entry) || typeof entry.studentId !== 'string' || !['present', 'absent', 'excused', 'late'].includes(entry.status as string)))) throw new Error('Dữ liệu điểm danh không hợp lệ.');
    }
    result[key] = records;
  }
  const settings = value.settings ?? fallbackSettings;
  if (!isRecord(settings) || ['name', 'slogan', 'address', 'phone', 'email', 'adminReportEmail'].some((key) => typeof settings[key] !== 'string') || ['autoEmailReport', 'autoBackup'].some((key) => typeof settings[key] !== 'boolean')) throw new Error('Cài đặt trung tâm không hợp lệ.');
  if (settings.sheetsConfig !== undefined && !isRecord(settings.sheetsConfig)) throw new Error('Cấu hình bảng tính không hợp lệ.');
  result.settings = { ...fallbackSettings, ...settings, sheetsConfig: { ...fallbackSettings.sheetsConfig, ...(settings.sheetsConfig as object || {}) } };
  return result as unknown as CenterDataPayload;
}

export function parseBackupArchive(value: unknown, fallbackSettings: CenterSettings): BackupArchive {
  if (!isRecord(value) || !['BEEZONE', 'PHUC_PHUC_THINH'].includes(value.app as string) || value.schemaVersion !== 1 || !isRecord(value.data) || arrays.filter((key) => key !== 'attendanceSessions').some((key) => !Array.isArray((value.data as Record<string, unknown>)[key]))) throw new Error('Tệp không đúng định dạng sao lưu BeeZone.');
  return { ...value, data: parseCenterData(value.data, fallbackSettings) } as unknown as BackupArchive;
}
