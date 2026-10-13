import type {
  AttendanceSession,
  AttendanceStatus,
  ClassRoom,
  SessionAbsencePolicy,
  SessionBillingSnapshot,
  SessionChargeLine,
  TuitionReceipt,
} from '../types';
import { isCalendarDate } from './dates';

export const absencePolicyLabels: Record<SessionAbsencePolicy, string> = {
  attended: 'Có mặt / đi trễ mới tính phí',
  unexcused: 'Vắng không phép vẫn tính phí',
  all: 'Mọi buổi đã tổ chức đều tính phí',
};
export const validSessionRate = (rate: unknown): rate is number =>
  typeof rate === 'number' && Number.isSafeInteger(rate) && rate > 0 && rate <= 1_000_000_000;
export function chargeableStatus(status: AttendanceStatus, policy: SessionAbsencePolicy): boolean {
  return (
    status === 'present' ||
    status === 'late' ||
    (policy === 'unexcused' && status === 'absent') ||
    policy === 'all'
  );
}
export function snapshotForSession(
  classroom: ClassRoom,
  date: string,
  previous?: AttendanceSession,
): SessionBillingSnapshot | undefined {
  if (previous) return previous.billing;
  if (
    classroom.billingMode !== 'session' ||
    !validSessionRate(classroom.sessionRate) ||
    !classroom.sessionBillingStartDate ||
    date < classroom.sessionBillingStartDate
  )
    return undefined;
  return {
    unitPrice: classroom.sessionRate,
    absencePolicy: classroom.sessionAbsencePolicy || 'attended',
  };
}
export interface SessionCharge extends SessionChargeLine {
  studentId: string;
  classId: string;
  status: AttendanceStatus;
}
export function sessionCharges(sessions: AttendanceSession[]): SessionCharge[] {
  const result: SessionCharge[] = [];
  for (const session of sessions) {
    if (!session.billing || !validSessionRate(session.billing.unitPrice)) continue;
    for (const entry of session.entries)
      if (chargeableStatus(entry.status, session.billing.absencePolicy))
        result.push({
          attendanceSessionId: session.id,
          date: session.date,
          unitPrice: session.billing.unitPrice,
          studentId: entry.studentId,
          classId: session.classId,
          status: entry.status,
        });
  }
  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.attendanceSessionId.localeCompare(b.attendanceSessionId),
  );
}
export function unbilledSessionCharges(
  sessions: AttendanceSession[],
  receipts: TuitionReceipt[],
): SessionCharge[] {
  const covered = new Set(
    receipts
      .filter((r) => r.paymentKind === 'session')
      .flatMap((r) =>
        (r.sessionLines || []).map((line) =>
          JSON.stringify([line.attendanceSessionId, r.studentId]),
        ),
      ),
  );
  return sessionCharges(sessions).filter(
    (line) => !covered.has(JSON.stringify([line.attendanceSessionId, line.studentId])),
  );
}
export function withUnbilledSessionReceipts(
  receipts: TuitionReceipt[],
  sessions: AttendanceSession[],
): TuitionReceipt[] {
  const groups = new Map<string, SessionCharge[]>();
  for (const line of unbilledSessionCharges(sessions, receipts)) {
    const key = JSON.stringify([line.studentId, line.classId]);
    groups.set(key, [...(groups.get(key) || []), line]);
  }
  const pending: TuitionReceipt[] = [...groups].map(([key, lines]) => {
    const total = lines.reduce((sum, line) => sum + line.unitPrice, 0);
    return {
      id: `pending-session:${encodeURIComponent(key)}`,
      code: 'Chưa lập phiếu theo buổi',
      studentId: lines[0].studentId,
      classId: lines[0].classId,
      courseFee: 0,
      monthlyFee: 0,
      paymentKind: 'session',
      billingPeriod: `${lines.length} buổi chưa lập phiếu`,
      sessionFee: total,
      sessionLines: lines.map(({ attendanceSessionId, date, unitPrice }) => ({
        attendanceSessionId,
        date,
        unitPrice,
      })),
      discount: 0,
      paidAmount: 0,
      debtAmount: total,
      status: 'unpaid',
      paymentDate: lines[0].date,
      dueDate: lines[0].date,
      collectorName: '',
      paymentMethod: 'Chưa xác định',
    };
  });
  return [...receipts, ...pending];
}
export function validateSessionReceipt(
  receipt: TuitionReceipt,
  sessions: AttendanceSession[],
  receipts: TuitionReceipt[],
): string | null {
  if (receipt.paymentKind !== 'session') return null;
  if (!receipt.sessionLines?.length) return 'Chọn ít nhất một buổi phải thu.';
  const eligible = sessionCharges(sessions);
  const ids = new Set<string>();
  for (const line of receipt.sessionLines) {
    if (ids.has(line.attendanceSessionId)) return 'Một buổi bị tính phí hai lần trong cùng phiếu.';
    ids.add(line.attendanceSessionId);
    if (
      !eligible.some(
        (source) =>
          source.attendanceSessionId === line.attendanceSessionId &&
          source.studentId === receipt.studentId &&
          source.classId === receipt.classId &&
          source.date === line.date &&
          source.unitPrice === line.unitPrice,
      )
    )
      return 'Buổi học đã thay đổi hoặc không thuộc học viên/lớp này. Hãy tải lại danh sách.';
    if (
      receipts.some(
        (r) =>
          r.id !== receipt.id &&
          r.paymentKind === 'session' &&
          r.studentId === receipt.studentId &&
          r.sessionLines?.some((item) => item.attendanceSessionId === line.attendanceSessionId),
      )
    )
      return 'Buổi này đã có phiếu học phí; không lập phiếu lần thứ hai.';
  }
  const total = receipt.sessionLines.reduce((sum, line) => sum + line.unitPrice, 0);
  if (
    receipt.sessionFee !== total ||
    receipt.courseFee !== 0 ||
    (receipt.monthlyFee || 0) !== 0 ||
    !Number.isSafeInteger(receipt.discount) ||
    receipt.discount < 0 ||
    receipt.discount > total ||
    !Number.isSafeInteger(receipt.paidAmount) ||
    receipt.paidAmount < 0 ||
    receipt.paidAmount > total - receipt.discount ||
    receipt.debtAmount !== total - receipt.discount - receipt.paidAmount ||
    !isCalendarDate(receipt.paymentDate)
  )
    return 'Số tiền học phí theo buổi không khớp với các buổi đã chọn.';
  return null;
}
export function validateBilledAttendanceEdit(
  next: AttendanceSession,
  receipts: TuitionReceipt[],
): string | null {
  const charges = sessionCharges([next]);
  for (const receipt of receipts.filter((r) => r.paymentKind === 'session')) {
    for (const line of receipt.sessionLines || [])
      if (
        line.attendanceSessionId === next.id &&
        !charges.some(
          (c) =>
            c.studentId === receipt.studentId &&
            c.classId === receipt.classId &&
            c.date === line.date &&
            c.unitPrice === line.unitPrice,
        )
      )
        return 'Buổi này đã có phiếu học phí. Điều chỉnh phiếu liên quan trước khi thay đổi phần tính phí của điểm danh.';
  }
  return null;
}
