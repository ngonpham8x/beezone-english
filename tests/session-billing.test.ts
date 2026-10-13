import { describe, expect, it } from 'vitest';
import * as initial from '../src/mock/initialData';
import type { AttendanceSession, ClassRoom, TuitionReceipt } from '../src/types';
import {
  sessionCharges,
  snapshotForSession,
  unbilledSessionCharges,
  validateBilledAttendanceEdit,
  validateSessionReceipt,
  withUnbilledSessionReceipts,
} from '../src/lib/sessionBilling';
import { debtBreakdown, feeStatusForReceipts, getReceiptPaymentEntries } from '../src/lib/tuition';
import { parseCenterData, parseBackupArchive } from '../src/lib/centerData';
export const classroom: ClassRoom = {
  ...initial.initialClasses[0],
  id: 'c',
  billingMode: 'session',
  sessionRate: 150000,
  sessionBillingStartDate: '2020-01-01',
  sessionAbsencePolicy: 'attended',
  studentIds: ['s'],
};
export const lesson = (id = 'a', date = '2020-01-02', rate = 150000): AttendanceSession => ({
  id,
  classId: 'c',
  date,
  lessonTopic: 'Speaking',
  billing: { unitPrice: rate, absencePolicy: 'attended' },
  entries: [{ studentId: 's', status: 'present' }],
});
export const invoice = (sessions = [lesson()]): TuitionReceipt => ({
  id: 'r',
  code: 'PT-2026-0001',
  studentId: 's',
  classId: 'c',
  courseFee: 0,
  monthlyFee: 0,
  paymentKind: 'session',
  sessionFee: sessions.reduce((sum, a) => sum + a.billing!.unitPrice, 0),
  sessionLines: sessions.map((a) => ({
    attendanceSessionId: a.id,
    date: a.date,
    unitPrice: a.billing!.unitPrice,
  })),
  discount: 0,
  paidAmount: 50000,
  debtAmount: sessions.reduce((sum, a) => sum + a.billing!.unitPrice, 0) - 50000,
  status: 'partial',
  paymentDate: '2020-01-10',
  paymentMethod: 'Tiền mặt',
  collectorName: 'Owner',
});
describe('per-lesson tuition', () => {
  it('charges present and late only under the chosen center policy', () => {
    const a = lesson();
    a.entries = ['present', 'late', 'absent', 'excused'].map((status, index) => ({
      studentId: String(index),
      status: status as AttendanceSession['entries'][number]['status'],
    }));
    expect(sessionCharges([a]).map((line) => line.studentId)).toEqual(['0', '1']);
    expect(
      sessionCharges([{ ...a, billing: { unitPrice: 150000, absencePolicy: 'unexcused' } }]),
    ).toHaveLength(3);
    expect(
      sessionCharges([{ ...a, billing: { unitPrice: 150000, absencePolicy: 'all' } }]),
    ).toHaveLength(4);
  });
  it('keeps historic pricing and leaves legacy attendance unbilled', () => {
    expect(snapshotForSession(classroom, '2019-12-31')).toBeUndefined();
    expect(
      snapshotForSession({ ...classroom, sessionRate: 200000 }, '2020-01-02', lesson()),
    ).toEqual(lesson().billing);
    expect(
      snapshotForSession(classroom, '2020-01-02', { ...lesson(), billing: undefined }),
    ).toBeUndefined();
    expect(snapshotForSession({ ...classroom, sessionRate: 200000 }, '2020-01-03')).toEqual({
      unitPrice: 200000,
      absencePolicy: 'attended',
    });
  });
  it('combines unbilled debt and partial invoice debt without counting money twice', () => {
    const sessions = [lesson(), lesson('b', '2020-01-03', 200000)];
    const receipt = invoice([sessions[0]]);
    const readModel = withUnbilledSessionReceipts([receipt], sessions);
    expect(unbilledSessionCharges(sessions, [receipt])).toEqual([
      expect.objectContaining({ attendanceSessionId: 'b' }),
    ]);
    expect(debtBreakdown(readModel)).toEqual({
      total: 300000,
      monthly: 0,
      course: 0,
      session: 300000,
    });
    expect(feeStatusForReceipts(readModel)).toBe('partial');
    expect(getReceiptPaymentEntries(readModel)).toEqual([
      expect.objectContaining({ amount: 50000, date: '2020-01-10', paymentKind: 'session' }),
    ]);
    expect(readModel[1].sessionFee).toBe(200000);
  });
  it('rejects duplicate, unrelated, absent and incorrectly priced invoice lines', () => {
    const a = lesson(),
      r = invoice();
    expect(validateSessionReceipt(r, [a], [])).toBeNull();
    expect(validateSessionReceipt({ ...r, id: 'r2' }, [a], [r])).toMatch(/lần thứ hai/);
    expect(
      validateSessionReceipt(
        { ...r, sessionLines: [...r.sessionLines!, ...r.sessionLines!] },
        [a],
        [],
      ),
    ).toMatch(/hai lần/);
    expect(validateSessionReceipt({ ...r, studentId: 'other' }, [a], [])).toMatch(/không thuộc/);
    expect(
      validateSessionReceipt(
        { ...r, sessionLines: [{ ...r.sessionLines![0], unitPrice: 1 }] },
        [a],
        [],
      ),
    ).toMatch(/thay đổi/);
    expect(
      validateSessionReceipt(r, [{ ...a, entries: [{ studentId: 's', status: 'absent' }] }], []),
    ).toMatch(/thay đổi/);
    expect(validateSessionReceipt({ ...r, debtAmount: 0 }, [a], [])).toMatch(/không khớp/);
  });
  it('locks the billed part of attendance but permits teaching notes and late status', () => {
    expect(
      validateBilledAttendanceEdit(
        { ...lesson(), entries: [{ studentId: 's', status: 'excused' }] },
        [invoice()],
      ),
    ).toMatch(/phiếu học phí/);
    expect(
      validateBilledAttendanceEdit(
        {
          ...lesson(),
          lessonTopic: 'Review',
          entries: [{ studentId: 's', status: 'late', note: 'Arrived 5 min late' }],
        },
        [invoice()],
      ),
    ).toBeNull();
  });
  it('separates tuple keys even when IDs contain delimiters', () => {
    const a = {
      ...lesson(),
      classId: 'c:z',
      entries: [{ studentId: 's', status: 'present' as const }],
    };
    const b = {
      ...lesson('b'),
      classId: 'z',
      entries: [{ studentId: 's:c', status: 'present' as const }],
    };
    expect(withUnbilledSessionReceipts([], [a, b])).toHaveLength(2);
  });
  it('round trips source attendance, class rules and receipt details in JSON', () => {
    const data = {
      settings: initial.initialSettings,
      classes: [classroom],
      students: [{ ...initial.initialStudents[0], id: 's', classId: 'c' }],
      attendanceSessions: [lesson()],
      receipts: [invoice()],
      programs: [],
      teachers: [],
      rooms: [],
      timetableSlots: [],
      grades: [],
      backups: [],
      activityLogs: [],
    };
    const parsed = parseBackupArchive(
      JSON.parse(JSON.stringify({ app: 'BEEZONE', schemaVersion: 1, data })),
      initial.initialSettings,
    ).data;
    expect(parsed.sessionBillingVersion).toBe(1);
    expect(parsed.attendanceSessions).toEqual(data.attendanceSessions);
    expect(parsed.receipts).toEqual(data.receipts);
    expect(() =>
      parseCenterData({ ...data, attendanceSessions: [] }, initial.initialSettings),
    ).toThrow(/thay đổi/);
    expect(() =>
      parseCenterData(
        { ...data, attendanceSessions: [lesson(), lesson('duplicate')] },
        initial.initialSettings,
      ),
    ).toThrow(/trùng ngày/);
  });
});
