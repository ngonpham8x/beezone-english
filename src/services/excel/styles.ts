import type ExcelJS from 'exceljs';
import type { ClassRoom, Student, TuitionReceipt } from '../../types';

export const COLOR = {
  primary: 'B45309',
  accent: 'D97706',
  light: 'FFFBEB',
  border: 'FDE68A',
  footer: 'FEF3C7',
  link: 'B45309',
};
export const moneyFormat = '#,##0 "đ"';
// Keep dynamic formulas bounded: this supports thousands of future students
// without slowing Excel down with whole-column array calculations.
export const STUDENT_DATA_START_ROW = 6;
export const STUDENT_DYNAMIC_LAST_ROW = 1000;
export const CLASS_DETAIL_MAX_ROWS = 300;
export const border: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLOR.border } },
  left: { style: 'thin', color: { argb: COLOR.border } },
  bottom: { style: 'thin', color: { argb: COLOR.border } },
  right: { style: 'thin', color: { argb: COLOR.border } },
};

export const dateFromIso = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
};
export const monthKey = (value: string) => value.slice(0, 7);
export const receiptMonth = (receipt: TuitionReceipt) => monthKey(receipt.paymentDate);
export const columnLetter = (column: number) => {
  let remaining = column;
  let result = '';
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
};

export const styleHeader = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.accent } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  row.height = 30;
};
export const styleData = (row: ExcelJS.Row, zebraIndex: number) => {
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10 };
    cell.border = border;
    cell.alignment = { vertical: 'middle', wrapText: true };
    if (zebraIndex % 2 === 1)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.light } };
  });
};
export const styleTitle = (sheet: ExcelJS.Worksheet, range: string, value: string) => {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.value = value;
  cell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(1).height = 42;
  sheet.getRow(2).height = 22;
};
export const applyBackLink = (sheet: ExcelJS.Worksheet, endColumn: string) => {
  sheet.mergeCells(`A3:${endColumn}3`);
  const cell = sheet.getCell('A3');
  cell.value = { text: '← Quay về TỔNG QUAN', hyperlink: "#'TỔNG QUAN'!A1" };
  cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.link }, underline: true };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
};
export const writeFooter = (
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  columns: number,
  formulas: Record<number, string> = {},
) => {
  const row = sheet.getRow(rowNumber);
  row.getCell(1).value = 'TỔNG CỘNG';
  Object.entries(formulas).forEach(([column, formula]) => {
    row.getCell(Number(column)).value = { formula };
  });
  for (let column = 1; column <= columns; column += 1) {
    const cell = row.getCell(column);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.footer } };
    cell.border = border;
  }
};
export const studentStatusLabel = (status: Student['status']) =>
  status === 'reserved' ? 'Bảo lưu' : status === 'dropped' ? 'Nghỉ học' : 'Đang học';
export const classSheetName = (classroom: ClassRoom) => `Lớp ${classroom.code}`.slice(0, 31);
// Keep calculation cells as plain formulas.  Embedding HYPERLINK around
// dynamic-array / SUMIFS formulas can make Excel repair an otherwise valid
// workbook on open.  Dedicated text-link cells still provide sheet navigation.
export const withWorksheetLink = (_target: string | undefined, formula: string) => formula;
export const styleFormulaLink = (cell: ExcelJS.Cell) => {
  cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.link }, underline: true };
};
