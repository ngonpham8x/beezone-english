import { describe, expect, it } from 'vitest';
import { centerDate, isCalendarDate } from '../src/lib/dates';
import { nextReceiptCode, nextStudentCode } from '../src/lib/identifiers';
import {
  backupRecordCounts,
  createBackupArchive,
  parseCenterData,
  parseBackupArchive,
  verifyBackupArchive,
} from '../src/lib/centerData';
import { getReceiptInstallments, getReceiptPaymentEntries, feeStatusForReceipts } from '../src/lib/tuition';
import { mergePermissions } from '../src/lib/auth';
import { parseRequestBody } from '../server/request';
import { readApiJson } from '../src/lib/http';
import { autoFixConsistency } from '../src/services/dataConsistencyService';
import { findScheduleConflict } from '../src/lib/schedule';
import { matchesSearch } from '../src/lib/search';
import { calculateGradeYearSummary, calculateSemesterAverage } from '../src/lib/gradebook';
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
describe('yearly grade summary', () => {
  it('links only active configured UNIT/assessment scores into the semester average', () => {
    const grade = { ...initial.initialGrades[0], unitScores: { unit1: 10, archived: 1 } };
    expect(calculateSemesterAverage(grade, ['unit1'])).toBe(8.9);
    expect(calculateSemesterAverage(grade, [])).toBe(8.6);
  });
  it('links all four semesters into one final ability assessment', () => {
    const baseGrade = initial.initialGrades[0];
    const summary = calculateGradeYearSummary([
      { ...baseGrade, id: 'g1', semester: 'GKI', average: 7 },
      { ...baseGrade, id: 'g2', semester: 'CKI', average: 7.5 },
      { ...baseGrade, id: 'g3', semester: 'GKII', average: 8 },
      { ...baseGrade, id: 'g4', semester: 'CKII', average: 8.5 },
    ]);
    expect(summary).toMatchObject({ average: 7.8, completedSemesters: 4, complete: true, ability: 'Khá', trend: 'Tiến bộ rõ' });
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
  it('creates a complete schema-v2 archive, verifies integrity and detects tampering', async () => {
    const data = { ...fixture(), enrollments: [], scheduleChanges: [] };
    const workData = {
      people: [{ user_id: '00000000-0000-4000-8000-000000000001' }],
      tasks: [{ id: '10000000-0000-4000-8000-000000000001', branch: 'teacher', title: 'Theo dõi lớp', assigned_uid: '00000000-0000-4000-8000-000000000001', created_by: '00000000-0000-4000-8000-000000000001', work_date: '2026-10-26' }],
      notes: [{ id: '20000000-0000-4000-8000-000000000001', task_id: '10000000-0000-4000-8000-000000000001' }],
      reasons: [], handoffs: [], events: [],
    };
    const archive = await createBackupArchive(data, data.settings.name, workData);
    const parsed = await verifyBackupArchive(JSON.parse(JSON.stringify(archive)), data.settings);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.workData?.tasks).toHaveLength(1);
    expect(parsed.workData?.tasks[0].branch).toBe('teacher');
    expect(backupRecordCounts(parsed)['work.tasks']).toBe(1);

    const changed = JSON.parse(JSON.stringify(archive));
    changed.data.students[0].name = 'Dữ liệu đã bị sửa';
    await expect(verifyBackupArchive(changed, data.settings)).rejects.toThrow(/toàn vẹn/);
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
  it('preserves and validates SHĐ/Quyển for receipts and installments', () => {
    const data = fixture();
    data.receipts = [{
      ...receipt,
      invoiceNo: '00125',
      bookNo: '03',
      invoiceBook: '00125 / 03',
      installments: [{
        id: 'i1',
        date: '2026-09-01',
        amount: 600,
        invoiceNo: '00125',
        bookNo: '03',
        invoiceBook: '00125 / 03',
      }],
    }];
    expect(parseCenterData(data, data.settings).receipts[0]).toMatchObject({
      invoiceNo: '00125',
      bookNo: '03',
      installments: [expect.objectContaining({ invoiceBook: '00125 / 03' })],
    });

    const invalidReceipt = fixture();
    invalidReceipt.receipts = [{ ...receipt, invoiceNo: 125 } as any];
    expect(() => parseCenterData(invalidReceipt, invalidReceipt.settings)).toThrow(/SHĐ\/Quyển/);

    const invalidInstallment = fixture();
    invalidInstallment.receipts = [{
      ...receipt,
      installments: [{ id: 'i1', date: '2026-09-01', amount: 600, bookNo: 'x'.repeat(51) }],
    }];
    expect(() => parseCenterData(invalidInstallment, invalidInstallment.settings)).toThrow(/Lịch sử đóng học phí/);
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

  it('validates semester grades and shared custom columns without breaking legacy GKI rows', () => {
    const data = fixture();
    const legacy = data.grades[0];
    data.grades.push({
      ...legacy,
      id: `${legacy.id}-cki`,
      semester: 'CKI',
      readingWriting: 8.5,
      unitScores: { unit4: 9, custom_progress: 8 },
    });
    data.settings.gradeColumns = [{
      id: 'custom_progress',
      name: 'Progress Test',
      semester: 'CKI',
      programId: data.programs[0].id,
      kind: 'assessment',
    }, {
      id: 'custom_progress_archived',
      name: 'Progress Test',
      semester: 'CKI',
      programId: data.programs[0].id,
      kind: 'assessment',
      archivedAt: '2026-10-28T03:00:00.000Z',
    }];
    expect(parseCenterData(data, data.settings).grades).toHaveLength(initial.initialGrades.length + 1);

    const missingProgram = fixture();
    missingProgram.settings.gradeColumns = [{ id: 'orphan', name: 'Orphan', semester: 'GKI', kind: 'unit', programId: 'missing' }];
    expect(() => parseCenterData(missingProgram, missingProgram.settings)).toThrow(/Chương trình của cột điểm/);

    const duplicate = fixture();
    duplicate.grades.push({ ...duplicate.grades[0], id: 'duplicate-gki', semester: 'GKI' });
    expect(() => parseCenterData(duplicate, duplicate.settings)).toThrow(/trùng lớp và học kỳ/);

    const invalid = fixture();
    (invalid.grades[0] as any).semester = 'HK3';
    expect(() => parseCenterData(invalid, invalid.settings)).toThrow(/Học kỳ/);
    (invalid.grades[0] as any).semester = 'GKI';
    (invalid.grades[0] as any).unitScores = { unit1: 11 };
    expect(() => parseCenterData(invalid, invalid.settings)).toThrow(/UNIT/);
  });

  it('accepts a partially entered grade while still rejecting malformed optional scores', () => {
    const data = fixture();
    data.grades = [{
      id: 'partial-grade',
      studentId: data.students[0].id,
      classId: data.classes[0].id,
      semester: 'GKI',
      listening: 7.5,
      average: 7.5,
    }];
    expect(parseCenterData(data, data.settings).grades[0]).toEqual(expect.objectContaining({
      listening: 7.5,
      average: 7.5,
    }));

    (data.grades[0] as any).speaking = '8';
    expect(() => parseCenterData(data, data.settings)).toThrow(/Điểm phải/);
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
