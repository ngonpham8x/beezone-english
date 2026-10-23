import { describe, expect, it } from 'vitest';
import { centerDate, isCalendarDate } from '../src/lib/dates';
import { nextReceiptCode, nextStudentCode } from '../src/lib/identifiers';
import { parseCenterData, parseBackupArchive } from '../src/lib/centerData';
import { getReceiptInstallments, getReceiptPaymentEntries, feeStatusForReceipts } from '../src/lib/tuition';
import { mergePermissions } from '../src/lib/auth';
import { parseRequestBody } from '../server/request';
import { readApiJson } from '../src/lib/http';
import { autoFixConsistency } from '../src/services/dataConsistencyService';
import { findScheduleConflict } from '../src/lib/schedule';
import { matchesSearch } from '../src/lib/search';
import * as initial from '../src/mock/initialData';
import type { TuitionReceipt } from '../src/types';

const fixture = () => structuredClone({ settings: initial.initialSettings, programs: initial.initialPrograms, teachers: initial.initialTeachers, rooms: initial.initialRooms, classes: initial.initialClasses, students: initial.initialStudents, timetableSlots: initial.initialTimetableSlots, grades: initial.initialGrades, receipts: initial.initialTuitionReceipts, backups: initial.initialBackups, activityLogs: initial.initialActivityLogs, attendanceSessions: initial.initialAttendanceSessions });
const receipt: TuitionReceipt = { id: 'r1', code: 'PT-2026-0001', studentId: 's1', classId: 'c1', courseFee: 1000, paidAmount: 600, debtAmount: 400, discount: 0, paymentDate: '2026-09-01', paymentMethod: 'Tiền mặt', collectorName: 'Demo', paymentKind: 'course', installments: [{ id: 'i2', date: '2026-10-01', amount: 200 }] };

describe('calendar and identifiers', () => {
  it('finds Vietnamese names regardless of accents, case or surrounding spaces', () => {
    expect(matchesSearch('  NGUYEN ', 'Nguyễn Minh Đăng')).toBe(true);
    expect(matchesSearch('dang', 'Nguyễn Minh Đăng')).toBe(true);
  });
  it('detects schedule conflicts with single-digit hours but allows adjacent periods', () => {
    const slot = { id: 'a', classId: 'a', teacherId: 't', roomId: 'r', dayOfWeek: 'Thứ 2', startTime: '9:00', endTime: '10:00' };
    expect(findScheduleConflict([slot], { ...slot, id: 'b', classId: 'b', startTime: '09:30', endTime: '10:30' })).toBe(slot);
    expect(findScheduleConflict([slot], { ...slot, id: 'b', classId: 'b', startTime: '10:00', endTime: '11:00' })).toBeUndefined();
  });
  it('uses Vietnam dates around UTC midnight and month boundaries', () => {
    expect(centerDate(new Date('2026-09-30T18:00:00Z'))).toBe('2026-10-01');
    expect(centerDate(new Date('2026-10-01T16:59:00Z'))).toBe('2026-10-01');
  });
  it('rejects impossible calendar dates', () => {
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2024-02-29')).toBe(true);
  });
  it('does not reuse receipt codes after deletions or gaps', () => {
    expect(nextReceiptCode([{ code: 'PT-2026-0010' }, { code: 'PT-2026-002' }, { code: 'PT-2025-9999' }], 2026)).toBe('PT-2026-0011');
  });
  it('does not duplicate a student code after deletion and accepts legacy hyphenated codes', () => {
    expect(nextStudentCode([{ code: 'HS001' }, { code: 'HS-010' }, { code: 'HS003' }])).toBe('HS011');
  });
});
describe('backup and cloud validation', () => {
  it('round-trips the complete dataset including attendance', () => {
    const data = fixture();
    const parsed = parseBackupArchive(JSON.parse(JSON.stringify({ app: 'BEEZONE', schemaVersion: 1, data })), data.settings);
    expect(parsed.data.attendanceSessions).toEqual(data.attendanceSessions);
    expect(parsed.data.receipts).toEqual(data.receipts);
  });
  it('starts missing legacy attendance empty', () => {
    const data = fixture(); delete (data as any).attendanceSessions;
    expect(parseCenterData(data, data.settings).attendanceSessions).toEqual([]);
  });
  it('rejects malformed records and duplicate IDs before restore', () => {
    const data = fixture(); data.students = [{ id: 'bad' } as any];
    expect(() => parseCenterData(data, data.settings)).toThrow();
    const duplicate = fixture(); duplicate.students.push(duplicate.students[0]);
    expect(() => parseCenterData(duplicate, duplicate.settings)).toThrow(/trùng ID/);
  });
  it('rejects negative money and contradictory installment totals', () => {
    const data = fixture(); data.receipts = [{ ...receipt, paidAmount: -1 }];
    expect(() => parseCenterData(data, data.settings)).toThrow();
    data.receipts = [{ ...receipt, paidAmount: 100 }];
    expect(() => parseCenterData(data, data.settings)).toThrow(/vượt quá/);
  });
  it('validates class notes correctly', () => {
    const data = fixture();
    data.classes[0].notes = 'Lưu ý kiểm tra bài tập đầu giờ';
    const parsed = parseCenterData(data, data.settings);
    expect(parsed.classes[0].notes).toBe('Lưu ý kiểm tra bài tập đầu giờ');

    const invalid = fixture();
    (invalid.classes[0] as any).notes = 12345;
    expect(() => parseCenterData(invalid, invalid.settings)).toThrow(/Ghi chú lớp học không hợp lệ/);
  });

  it('rejects arbitrary JSON as a backup', () => expect(() => parseBackupArchive({ app: 'BEEZONE', schemaVersion: 1, data: {} }, initial.initialSettings)).toThrow());
});
describe('financial history', () => {
  it('repairs stale rosters without moving a transferred student or deleting receipts', () => {
    const data = fixture();
    const student = data.students[0]; const originalClass = data.classes.find(c => c.id === student.classId)!;
    const nextClass = data.classes.find(c => c.id !== student.classId)!;
    const moved = { ...student, classId: nextClass.id, programId: nextClass.programId };
    const orphan = { ...receipt, studentId: 'missing' };
    const result = autoFixConsistency([moved], [originalClass, nextClass], [orphan], data.programs);
    expect(result.fixedStudents[0].classId).toBe(nextClass.id);
    expect(result.fixedClassrooms[0].studentIds).toEqual([]);
    expect(result.fixedClassrooms[1].studentIds).toEqual([student.id]);
    expect(result.fixedReceipts).toEqual([orphan]);
    expect(result.issues.every(issue => issue.type === 'orphaned_receipt')).toBe(true);
  });
  it('preserves the initial payment missing from legacy installment arrays', () => {
    const installments = getReceiptInstallments(receipt);
    expect(installments.map(i => i.amount)).toEqual([400, 200]);
    const updated = { ...receipt, paidAmount: 900, debtAmount: 100, installments: [...installments, { id: 'i3', date: '2026-10-13', amount: 300 }] };
    const entries = getReceiptPaymentEntries([updated]);
    expect(entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(900);
    expect(entries.filter(entry => entry.monthKey === '2026-09').reduce((sum, entry) => sum + entry.amount, 0)).toBe(400);
    expect(feeStatusForReceipts([updated])).toBe('partial');
  });
});
describe('authorization and API errors', () => {
  it('missing staff permissions deny every action', () => {
    const permissions = mergePermissions(null);
    expect(permissions.student.add).toBe(false); expect(permissions.tuition.collect).toBe(false); expect(permissions.excel.import).toBe(false);
    expect(mergePermissions({ student: { view: 'true' } } as any).student.view).toBe(false);
    expect(Object.values(permissions.academic!).every(value => value === false)).toBe(true);
    expect(mergePermissions({ academic: { programs: 'true', classes: true, rooms: false } } as any).academic).toMatchObject({ programs: false, classes: true, rooms: false, programsAdd: false, classesAdd: true, classesEdit: true, classesDelete: true, roomsDelete: false });
  });
  it.each(['null', '[]', 'true', '1', '{bad', null, [], { text: 'x'.repeat(10_001) }])('rejects invalid request body %j', body => expect(parseRequestBody(body)).toBeNull());
  it('accepts object JSON', () => expect(parseRequestBody('{"action":"setActive"}')).toEqual({ action: 'setActive' }));
  it('rejects HTML fallback and unsuccessful API operations', async () => {
    await expect(readApiJson(new Response('<html/>', { headers: { 'content-type': 'text/html' } }), 'API unavailable')).rejects.toThrow('API unavailable');
    await expect(readApiJson(new Response('{"error":"Không đủ quyền"}', { status: 403, headers: { 'content-type': 'application/json' } }), 'Failed')).rejects.toThrow('Không đủ quyền');
  });
});
