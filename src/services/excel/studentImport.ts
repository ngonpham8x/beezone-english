import ExcelJS from 'exceljs';
import { cellText, getByAliases, normaliseHeader } from './readCells';
import type { ImportedStudentRow, ImportValidationResult } from './types';

export function parseExcelImportData(jsonData: Record<string, unknown>[]): ImportValidationResult {
  const validRows: ImportedStudentRow[] = [];
  const errors: ImportValidationResult['errors'] = [];
  jsonData.forEach((item, index) => {
    const row = index + 2;
    const name = cellText(getByAliases(item, ['hovaten', 'hoten', 'name']));
    const code = cellText(getByAliases(item, ['mahocsinh', 'mahs', 'studentcode']));
    if (!name) {
      errors.push({ row, field: 'Họ và tên', message: 'Họ và tên không được để trống.' });
      return;
    }
    if (!code) {
      errors.push({ row, field: 'Mã học sinh', message: 'Mã học sinh không được để trống.' });
      return;
    }
    const gender = String(getByAliases(item, ['gioitinh', 'gender']) ?? 'Chưa xác định');
    validRows.push({
      code,
      name,
      dob: String(getByAliases(item, ['ngaysinh', 'dob']) ?? ''),
      gender: gender === 'Nam' || gender === 'Nữ' ? gender : 'Chưa xác định',
      school: String(getByAliases(item, ['truong', 'school']) ?? ''),
      gradeLevel: String(getByAliases(item, ['khoi', 'gradelevel']) ?? ''),
      classCode: String(getByAliases(item, ['malop', 'classcode']) ?? ''),
      address: String(getByAliases(item, ['diachi', 'address']) ?? ''),
      email: String(getByAliases(item, ['email']) ?? ''),
      phone: String(getByAliases(item, ['sdthocsinh', 'sdt', 'phone']) ?? ''),
      parentName: String(getByAliases(item, ['tenphuhuynh', 'parentname']) ?? ''),
      parentPhone: String(getByAliases(item, ['sdtphuhuynh', 'parentphone']) ?? ''),
    });
  });
  return { validRows, errors };
}

export async function parseExcelStudentFile(file: File): Promise<ImportValidationResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const rows: Record<string, unknown>[] = [];
  const masterStudentsSheet = workbook.getWorksheet('HỌC SINH');
  const sheets = masterStudentsSheet ? [masterStudentsSheet] : workbook.worksheets;
  sheets.forEach((sheet) => {
    let headerRow = 0;
    let headers: string[] = [];
    for (let rowNumber = 1; rowNumber <= Math.min(20, sheet.rowCount); rowNumber += 1) {
      const rowValues = sheet.getRow(rowNumber).values;
      const candidate = (Array.isArray(rowValues) ? rowValues.slice(1) : []).map(cellText);
      const normalised = candidate.map(normaliseHeader);
      if (
        normalised.includes('mahocsinh') &&
        (normalised.includes('hovaten') || normalised.includes('hoten'))
      ) {
        headerRow = rowNumber;
        headers = candidate;
        break;
      }
    }
    if (!headerRow) return;
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const rowValues = sheet.getRow(rowNumber).values;
      const values = Array.isArray(rowValues) ? rowValues.slice(1) : [];
      const record = Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? '']),
      );
      const code = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
      const name = cellText(getByAliases(record, ['hovaten', 'hoten', 'name']));
      if (!code && !name) continue;
      rows.push(record);
    }
  });
  return rows.length
    ? parseExcelImportData(rows)
    : {
        validRows: [],
        errors: [
          {
            row: 0,
            field: 'Tệp Excel',
            message: 'Không tìm thấy sheet có cột “Mã học sinh” và “Họ và tên”.',
          },
        ],
      };
}
