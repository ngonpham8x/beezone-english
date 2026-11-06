import type { GuardianConsentRecord } from '../types.js';
import { centerDate, isCalendarDate } from './dates.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateGuardianConsentRecord(
  value: unknown,
  today = centerDate(),
): string | null {
  if (value === undefined) return null;
  if (!isRecord(value)) return 'Hồ sơ đồng ý của phụ huynh không đúng định dạng.';
  if (!['confirmed', 'withdrawn'].includes(String(value.status))) {
    return 'Trạng thái đồng ý của phụ huynh không hợp lệ.';
  }
  if (!['paper', 'electronic', 'other'].includes(String(value.method))) {
    return 'Hình thức ghi nhận đồng ý của phụ huynh không hợp lệ.';
  }
  if (typeof value.representativeName !== 'string' || !value.representativeName.trim() || value.representativeName.length > 120) {
    return 'Vui lòng ghi đúng họ tên phụ huynh/người đại diện (tối đa 120 ký tự).';
  }
  if (typeof value.recordedAt !== 'string' || !isCalendarDate(value.recordedAt) || value.recordedAt > today) {
    return 'Ngày ghi nhận đồng ý của phụ huynh không hợp lệ.';
  }
  if (value.evidenceReference !== undefined && (typeof value.evidenceReference !== 'string' || value.evidenceReference.length > 200)) {
    return 'Mã tham chiếu bằng chứng đồng ý tối đa 200 ký tự.';
  }
  if (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 1000)) {
    return 'Ghi chú hồ sơ đồng ý tối đa 1.000 ký tự.';
  }
  if (value.status === 'withdrawn') {
    if (typeof value.withdrawnAt !== 'string' || !isCalendarDate(value.withdrawnAt) || value.withdrawnAt > today || value.withdrawnAt < value.recordedAt) {
      return 'Ngày rút lại đồng ý phải hợp lệ và không trước ngày đã ghi nhận.';
    }
  } else if (value.withdrawnAt !== undefined && value.withdrawnAt !== '') {
    return 'Hồ sơ đang xác nhận không được có ngày rút lại đồng ý.';
  }
  return null;
}

export function normalizedGuardianConsentRecord(
  value: GuardianConsentRecord | undefined,
): GuardianConsentRecord | undefined {
  if (!value) return undefined;
  return {
    status: value.status,
    representativeName: value.representativeName.trim(),
    recordedAt: value.recordedAt,
    method: value.method,
    ...(value.evidenceReference?.trim() ? { evidenceReference: value.evidenceReference.trim() } : {}),
    ...(value.status === 'withdrawn' && value.withdrawnAt ? { withdrawnAt: value.withdrawnAt } : {}),
    ...(value.note?.trim() ? { note: value.note.trim() } : {}),
  };
}
