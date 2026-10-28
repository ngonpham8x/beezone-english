import type { CenterBackupData, CenterSettings } from '../types.js';
import { centerDate, isCalendarDate } from './dates.js';
import { timeMinutes } from './schedule.js';
import { validSessionRate, validateSessionReceipt } from './sessionBilling.js';
import type { AttendanceSession, TuitionReceipt } from '../types.js';
import { gradeSemester, isActiveCustomGradeColumn, isGradeSemester, isValidCustomGradeColumn, isValidScore } from './gradebook.js';

export interface CenterDataPayload extends CenterBackupData {
  sessionBillingVersion: 1;
  attendanceSessions: NonNullable<CenterBackupData['attendanceSessions']>;
  enrollments: NonNullable<CenterBackupData['enrollments']>;
  scheduleChanges: NonNullable<CenterBackupData['scheduleChanges']>;
}

export interface WorkBackupSnapshot {
  people: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  reasons: Array<Record<string, unknown>>;
  handoffs: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

export interface BackupArchive {
  app: 'BEEZONE' | 'PHUC_PHUC_THINH';
  schemaVersion: 1 | 2;
  exportedAt: string;
  centerName: string;
  data: CenterDataPayload;
  workData?: WorkBackupSnapshot;
  integrity?: { algorithm: 'SHA-256'; digest: string };
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
const optionalShortText = (value: unknown, maxLength: number) =>
  value === undefined || (typeof value === 'string' && value.length <= maxLength);
const validInvoiceFields = (record: Record<string, unknown>) =>
  optionalShortText(record.invoiceNo, 50) &&
  optionalShortText(record.bookNo, 50) &&
  optionalShortText(record.invoiceBook, 110);

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
      if (key === 'classes' && ((record.notes !== undefined && typeof record.notes !== 'string') || (record.note !== undefined && typeof record.note !== 'string'))) throw new Error('Ghi chú lớp học không hợp lệ.');
      if (key === 'enrollments' && !['active', 'reserved', 'completed', 'transferred', 'dropped'].includes(record.status as string)) throw new Error('Lịch sử đăng ký học không hợp lệ.');
      if (key === 'scheduleChanges') {
        if (!['cancel', 'move', 'extra', 'teacher_off'].includes(record.kind as string) || !isCalendarDate(record.date) || (record.sourceDate !== undefined && !isCalendarDate(record.sourceDate)) || (record.kind !== 'extra' && typeof record.sourceSlotId !== 'string') || (record.kind === 'move' && !isCalendarDate(record.sourceDate)) || (record.substituteTeacherId !== undefined && typeof record.substituteTeacherId !== 'string')) throw new Error('Lịch nghỉ/học bù không hợp lệ.');
        const start = timeMinutes(record.startTime as string), end = timeMinutes(record.endTime as string);
        if (start === null || end === null || start >= end) throw new Error('Giờ học bù không hợp lệ.');
      }
      if (key === 'timetableSlots' && record.note !== undefined && typeof record.note !== 'string') {
        throw new Error('Ghi chú ca học không hợp lệ.');
      }
      if (key === 'teachers' && !stringArray(record.assignedClassIds)) throw new Error('Phân công giáo viên không hợp lệ.');
      if (key === 'students' && !['active', 'reserved', 'dropped', 'lead', 'trial', 'registered'].includes(record.status as string)) throw new Error('Trạng thái học viên không hợp lệ.');
      if (key === 'students' && record.additionalClassIds !== undefined && (!stringArray(record.additionalClassIds) || record.additionalClassIds.some(id => !id.trim() || id === record.classId) || new Set(record.additionalClassIds).size !== record.additionalClassIds.length || (!record.classId && record.additionalClassIds.length))) throw new Error('Danh sách lớp học thêm không hợp lệ.');
      if (key === 'grades' && numbers.grades!.some((field) => (record[field] as number) > 10)) throw new Error('Điểm phải trong khoảng 0–10.');
      if (key === 'grades') {
        if (record.semester !== undefined && !isGradeSemester(record.semester)) throw new Error('Học kỳ của bảng điểm không hợp lệ.');
        if (record.readingWriting !== undefined && !isValidScore(record.readingWriting)) throw new Error('Điểm Đọc & Viết phải trong khoảng 0–10.');
        if (record.comment !== undefined && (typeof record.comment !== 'string' || record.comment.length > 2000)) throw new Error('Nhận xét bảng điểm không hợp lệ.');
        if (record.unitScores !== undefined && (
          !isRecord(record.unitScores) ||
          Object.entries(record.unitScores).some(([unitId, score]) => !unitId.trim() || unitId.length > 100 || !isValidScore(score))
        )) throw new Error('Điểm UNIT phải trong khoảng 0–10.');
      }
      if (key === 'receipts') {
        if (!validInvoiceFields(record)) throw new Error('SHĐ/Quyển của phiếu thu không hợp lệ.');
        if (record.paymentKind !== undefined && !['course','monthly','session'].includes(record.paymentKind as string)) throw new Error('Hình thức học phí không hợp lệ.');
        if (record.paymentKind === 'session' && (!Array.isArray(record.sessionLines) || record.sessionLines.some(line => !isRecord(line) || typeof line.attendanceSessionId !== 'string' || !isCalendarDate(line.date) || !validSessionRate(line.unitPrice)) || !money(record.sessionFee))) throw new Error('Chi tiết phiếu học phí theo buổi không hợp lệ.');
        if (record.dueDate !== undefined && !isCalendarDate(record.dueDate)) throw new Error('Hạn thanh toán không hợp lệ.');
        if (!isCalendarDate(record.paymentDate) || (record.monthlyFee !== undefined && !money(record.monthlyFee))) throw new Error('Ngày thu hoặc học phí tháng không hợp lệ.');
        if (record.installments !== undefined) {
          if (!Array.isArray(record.installments) || record.installments.some((entry) => !isRecord(entry) || typeof entry.id !== 'string' || !money(entry.amount) || !isCalendarDate(entry.date) || !validInvoiceFields(entry))) throw new Error('Lịch sử đóng học phí không hợp lệ.');
          const total = record.installments.reduce((sum, entry) => sum + entry.amount, 0);
          if (total > (record.paidAmount as number)) throw new Error('Tổng các đợt đóng vượt quá số tiền đã thu.');
        }
      }
      if (key === 'attendanceSessions' && (
        !isCalendarDate(record.date) ||
        !optionalShortText(record.lessonTopic, 1000) ||
        !optionalShortText(record.generalNotes, 3000) ||
        !Array.isArray(record.entries) ||
        record.entries.some((entry) =>
          !isRecord(entry) ||
          typeof entry.studentId !== 'string' ||
          !['present', 'absent', 'excused', 'late'].includes(entry.status as string) ||
          !optionalShortText(entry.note, 5000) ||
          !optionalShortText(entry.homeworkAssignment, 3000) ||
          (entry.homeworkCompleted !== undefined && typeof entry.homeworkCompleted !== 'boolean') ||
          (entry.rating !== undefined && (!Number.isInteger(entry.rating) || (entry.rating as number) < 1 || (entry.rating as number) > 5)) ||
          (entry.learningAttitude !== undefined && !['excellent', 'good', 'normal', 'needs_focus', 'needs_support'].includes(entry.learningAttitude as string)) ||
          (entry.sessionScore !== undefined && (typeof entry.sessionScore !== 'number' || !Number.isFinite(entry.sessionScore) || entry.sessionScore < 0 || entry.sessionScore > 10))
        )
      )) throw new Error('Dữ liệu điểm danh không hợp lệ.');
      if (key === 'attendanceSessions' && record.billing !== undefined && (!isRecord(record.billing) || !validSessionRate(record.billing.unitPrice) || !['attended','unexcused','all'].includes(record.billing.absencePolicy as string) || new Set((record.entries as {studentId:string}[]).map(entry => entry.studentId)).size !== (record.entries as unknown[]).length)) throw new Error('Đơn giá hoặc danh sách tính phí buổi học không hợp lệ.');
    }
    result[key] = records;
  }
  const classIds = new Set((result.classes as { id: string }[]).map(c => c.id));
  const programIds = new Set((result.programs as { id: string }[]).map(program => program.id));
  const gradeKeys = new Set<string>();
  for (const grade of result.grades as import('../types.js').Grade[]) {
    const key = `${grade.studentId}\u0000${grade.classId}\u0000${gradeSemester(grade)}`;
    if (gradeKeys.has(key)) throw new Error('Học viên có bảng điểm trùng lớp và học kỳ.');
    gradeKeys.add(key);
  }
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
  if (settings.gradeColumns !== undefined) {
    if (!Array.isArray(settings.gradeColumns) || settings.gradeColumns.some((column) => !isValidCustomGradeColumn(column))) throw new Error('Cấu hình cột điểm không hợp lệ.');
    const columnIds = new Set<string>();
    const columnNames = new Set<string>();
    for (const column of settings.gradeColumns) {
      if (isActiveCustomGradeColumn(column) && column.programId && !programIds.has(column.programId)) throw new Error('Chương trình của cột điểm không tồn tại.');
      const scope = column.programId || (column.classId ? `class:${column.classId}` : 'all');
      const nameKey = `${column.semester}\u0000${scope}\u0000${column.name.trim().toLocaleLowerCase('vi-VN')}`;
      if (columnIds.has(column.id) || (isActiveCustomGradeColumn(column) && columnNames.has(nameKey))) throw new Error('Cấu hình cột điểm bị trùng.');
      columnIds.add(column.id);
      if (isActiveCustomGradeColumn(column)) columnNames.add(nameKey);
    }
  }
  result.settings = { ...fallbackSettings, ...settings, sheetsConfig: { ...fallbackSettings.sheetsConfig, ...(settings.sheetsConfig as object || {}) } };
  return result as unknown as CenterDataPayload;
}

export function parseBackupArchive(value: unknown, fallbackSettings: CenterSettings): BackupArchive {
  if (!isRecord(value) || !['BEEZONE', 'PHUC_PHUC_THINH'].includes(value.app as string) || ![1, 2].includes(value.schemaVersion as number) || !isRecord(value.data) || arrays.filter((key) => !['attendanceSessions', 'enrollments', 'scheduleChanges'].includes(key)).some((key) => !Array.isArray((value.data as Record<string, unknown>)[key]))) throw new Error('Tệp không đúng định dạng sao lưu BeeZone.');
  const workData = value.workData === undefined ? undefined : parseWorkBackupSnapshot(value.workData);
  if (value.schemaVersion === 2 && (!isRecord(value.integrity) || value.integrity.algorithm !== 'SHA-256' || typeof value.integrity.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.integrity.digest))) throw new Error('Tệp sao lưu thiếu mã kiểm tra toàn vẹn.');
  return { ...value, data: parseCenterData(value.data, fallbackSettings), workData } as unknown as BackupArchive;
}

const workArrays = ['people', 'tasks', 'notes', 'reasons', 'handoffs', 'events'] as const;

function parseWorkBackupSnapshot(value: unknown): WorkBackupSnapshot {
  if (!isRecord(value)) throw new Error('Dữ liệu Giao việc trong bản sao lưu không hợp lệ.');
  const result = {} as WorkBackupSnapshot;
  for (const key of workArrays) {
    const rows = value[key];
    if (!Array.isArray(rows) || rows.some((row) => !isRecord(row))) throw new Error(`Danh sách Giao việc ${key} không hợp lệ.`);
    result[key] = rows as Array<Record<string, unknown>>;
  }
  const peopleIds = new Set<string>();
  for (const person of result.people) {
    if (typeof person.user_id !== 'string' || peopleIds.has(person.user_id)) throw new Error('Danh bạ Giao việc thiếu tài khoản hoặc trùng ID.');
    peopleIds.add(person.user_id);
  }
  const taskIds = new Set<string>();
  for (const task of result.tasks) {
    if (
      typeof task.id !== 'string' || taskIds.has(task.id) ||
      !['admin', 'training', 'teacher'].includes(task.branch as string) ||
      typeof task.title !== 'string' || typeof task.assigned_uid !== 'string' ||
      typeof task.created_by !== 'string' || !isCalendarDate(task.work_date)
    ) throw new Error('Công việc trong bản sao lưu thiếu thông tin hoặc trùng ID.');
    taskIds.add(task.id);
  }
  for (const [key, idField] of [['notes', 'id'], ['reasons', 'id'], ['handoffs', 'id'], ['events', 'id']] as const) {
    const ids = new Set<string>();
    for (const row of result[key]) {
      const id = String(row[idField] ?? '');
      if (!id || ids.has(id) || typeof row.task_id !== 'string' || !taskIds.has(row.task_id)) throw new Error(`Lịch sử Giao việc ${key} thiếu liên kết hoặc trùng ID.`);
      ids.add(id);
    }
  }
  return result;
}

const integrityContent = (data: unknown, workData?: unknown) =>
  JSON.stringify({ data, workData: workData || null });

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createBackupArchive(
  data: CenterBackupData,
  centerName: string,
  workData?: WorkBackupSnapshot,
  exportedAt = new Date().toISOString(),
): Promise<BackupArchive> {
  const parsedData = parseCenterData(data, data.settings);
  const parsedWork = workData ? parseWorkBackupSnapshot(workData) : undefined;
  return {
    app: 'BEEZONE',
    schemaVersion: 2,
    centerName,
    exportedAt,
    data: parsedData,
    workData: parsedWork,
    integrity: {
      algorithm: 'SHA-256',
      digest: await sha256(integrityContent(parsedData, parsedWork)),
    },
  };
}

export async function verifyBackupArchive(
  value: unknown,
  fallbackSettings: CenterSettings,
): Promise<BackupArchive> {
  const archive = parseBackupArchive(value, fallbackSettings);
  if (archive.schemaVersion === 2) {
    const raw = value as Record<string, unknown>;
    const actual = await sha256(integrityContent(raw.data, raw.workData));
    if (actual !== archive.integrity?.digest) throw new Error('Tệp sao lưu đã bị thay đổi hoặc hư hỏng; mã toàn vẹn không khớp.');
  }
  return archive;
}

export function backupRecordCounts(archive: BackupArchive): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of arrays) counts[key] = archive.data[key]?.length || 0;
  if (archive.workData) for (const key of workArrays) counts[`work.${key}`] = archive.workData[key].length;
  return counts;
}
