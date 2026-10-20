import type ExcelJS from 'exceljs';
import type { Student, TuitionReceipt } from '../../types';

import { centerDate } from '../../lib/dates';
export const normaliseHeader = (value: unknown) =>
  String(value ?? '')
    .replace(/[Đđ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]/g, '');
export const getByAliases = (record: Record<string, unknown>, aliases: string[]) =>
  Object.entries(record)
    .map(([key, value]) => [normaliseHeader(key), value] as const)
    .find(([key]) => aliases.includes(key))?.[1];
export const cellText = (value: unknown) => {
  if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text.trim();
  if (value && typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('').trim();
  // ExcelJS represents calculated cells as { formula, result }.  Reading the
  // cached result prevents valid manual values from disappearing on import.
  if (value && typeof value === 'object' && 'formula' in value)
    return String(('result' in value ? value.result : '') ?? '').trim();
  return String(value ?? '').trim();
};

export const readRecords = (sheet: ExcelJS.Worksheet, requiredHeaders: string[]) => {
  let headers: string[] = [];
  let headerRow = 0;
  for (let rowNumber = 1; rowNumber <= Math.min(20, sheet.rowCount); rowNumber += 1) {
    const values = sheet.getRow(rowNumber).values;
    const candidate = (Array.isArray(values) ? values.slice(1) : []).map(cellText);
    const normalized = candidate.map(normaliseHeader);
    if (requiredHeaders.every((header) => normalized.includes(header))) {
      headers = candidate;
      headerRow = rowNumber;
      break;
    }
  }
  if (!headerRow) return [] as Record<string, unknown>[];
  const records: Record<string, unknown>[] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const values = sheet.getRow(rowNumber).values;
    const cells = Array.isArray(values) ? values.slice(1) : [];
    const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
    const firstValue = cellText(cells[0]);
    if (!Object.values(record).some((value) => cellText(value))) continue;
    if (firstValue.toLocaleUpperCase('vi-VN').includes('TỔNG')) continue;
    records.push(record);
  }
  return records;
};

export const numberValue = (value: unknown) => {
  if (typeof value === 'number') return value;
  const parsed = Number(cellText(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const duplicatedValues = (values: string[]) => {
  const seen = new Set<string>();
  return [
    ...new Set(
      values.filter(Boolean).filter((value) => {
        const key = value.trim().toLocaleUpperCase('vi-VN');
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      }),
    ),
  ];
};

export const isoDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const text = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match
    ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
    : centerDate();
};

export const optionalDate = (value: unknown): string | undefined => {
  if (!cellText(value)) return undefined;
  if (
    value instanceof Date ||
    /^\d{4}-\d{2}-\d{2}$/.test(cellText(value)) ||
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cellText(value))
  )
    return isoDate(value);
  return cellText(value);
};

export const statusFromLabel = (value: unknown): Student['status'] => {
  const label = cellText(value).toLocaleLowerCase('vi-VN');
  if (label.includes('tiềm năng') || label.includes('tư vấn') || label === 'lead') return 'lead';
  if (label.includes('học thử') || label === 'trial') return 'trial';
  if (label.includes('đã đăng ký') || label.includes('chờ xếp lớp') || label === 'registered')
    return 'registered';
  if (label.includes('bảo')) return 'reserved';
  if (label.includes('nghỉ')) return 'dropped';
  return 'active';
};

export const paymentMethodFromCell = (value: unknown): TuitionReceipt['paymentMethod'] => {
  const method = cellText(value);
  return method === 'Tiền mặt' || method === 'Chuyển khoản' || method === 'Thẻ'
    ? method
    : 'Chưa xác định';
};
