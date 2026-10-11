import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { ClassRoom, CourseProgram, Grade, Room, Student, Teacher, TimetableSlot, TuitionReceipt } from '../types';
import { paymentMethodLabel } from '../lib/tuition';
import { isStudentInClass } from '../lib/student';

export interface ExcelExportData {
  centerName: string;
  programs: CourseProgram[];
  students: Student[];
  classes: ClassRoom[];
  teachers: Teacher[];
  rooms: Room[];
  receipts: TuitionReceipt[];
  grades: Grade[];
}

export interface ImportedStudentRow extends Partial<Student> {
  classCode?: string;
}

export interface ImportValidationResult {
  validRows: ImportedStudentRow[];
  errors: { row: number; field: string; message: string }[];
}

export interface CenterWorkbookData {
  programs: CourseProgram[];
  teachers: Teacher[];
  rooms: Room[];
  classes: ClassRoom[];
  students: Student[];
  timetableSlots: TimetableSlot[];
  grades: Grade[];
  receipts: TuitionReceipt[];
}

export interface CenterWorkbookImportResult {
  data?: CenterWorkbookData;
  errors: { row: number; field: string; message: string }[];
}

const COLOR = { primary: '8E0032', accent: 'C62828', light: 'FEF2F2', border: 'CBD5E1', link: '1D4ED8' };
const moneyFormat = '#,##0 "đ"';
// Keep dynamic formulas bounded: this supports thousands of future students
// without slowing Excel down with whole-column array calculations.
const STUDENT_DATA_START_ROW = 6;
const STUDENT_DYNAMIC_LAST_ROW = 1000;
const CLASS_DETAIL_MAX_ROWS = 300;
const border: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLOR.border } }, left: { style: 'thin', color: { argb: COLOR.border } },
  bottom: { style: 'thin', color: { argb: COLOR.border } }, right: { style: 'thin', color: { argb: COLOR.border } }
};

const dateFromIso = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
};
const monthKey = (value: string) => value.slice(0, 7);
const receiptMonth = (receipt: TuitionReceipt) => monthKey(receipt.paymentDate);
const columnLetter = (column: number) => {
  let remaining = column;
  let result = '';
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
};

const styleHeader = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.accent } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  row.height = 30;
};
const styleData = (row: ExcelJS.Row, zebraIndex: number) => {
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10 };
    cell.border = border;
    cell.alignment = { vertical: 'middle', wrapText: true };
    if (zebraIndex % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.light } };
  });
};
const styleTitle = (sheet: ExcelJS.Worksheet, range: string, value: string) => {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.value = value;
  cell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(1).height = 42;
  sheet.getRow(2).height = 22;
};
const applyBackLink = (sheet: ExcelJS.Worksheet, endColumn: string) => {
  sheet.mergeCells(`A3:${endColumn}3`);
  const cell = sheet.getCell('A3');
  cell.value = { text: '← Quay về TỔNG QUAN', hyperlink: "#'TỔNG QUAN'!A1" };
  cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.link }, underline: true };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
};
const writeFooter = (sheet: ExcelJS.Worksheet, rowNumber: number, columns: number, formulas: Record<number, string> = {}) => {
  const row = sheet.getRow(rowNumber);
  row.getCell(1).value = 'TỔNG CỘNG';
  Object.entries(formulas).forEach(([column, formula]) => { row.getCell(Number(column)).value = { formula }; });
  for (let column = 1; column <= columns; column += 1) {
    const cell = row.getCell(column);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
    cell.border = border;
  }
};
const studentStatusLabel = (status: Student['status']) => status === 'reserved' ? 'Bảo lưu' : (status === 'dropped' ? 'Nghỉ học' : 'Đang học');
const classSheetName = (classroom: ClassRoom) => `Lớp ${classroom.code}`.slice(0, 31);
// Keep calculation cells as plain formulas.  Embedding HYPERLINK around
// dynamic-array / SUMIFS formulas can make Excel repair an otherwise valid
// workbook on open.  Dedicated text-link cells still provide sheet navigation.
const withWorksheetLink = (_target: string | undefined, formula: string) => formula;
const styleFormulaLink = (cell: ExcelJS.Cell) => {
  cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.link }, underline: true };
};
const formulaText = (value: string) => value.replace(/"/g, '""');
const receiptSumByClassFormula = (amountColumn: 'L' | 'M', classCriterion: string, dateCriteria = '') => (
  `SUMIFS('HỌC PHÍ'!$${amountColumn}$${STUDENT_DATA_START_ROW}:$${amountColumn}$${STUDENT_DYNAMIC_LAST_ROW},'HỌC PHÍ'!$F$${STUDENT_DATA_START_ROW}:$F$${STUDENT_DYNAMIC_LAST_ROW},${classCriterion}${dateCriteria})`
);
const directSumByClassFormula = (amountColumn: 'M' | 'N', classCriterion: string, dateCriteria = '') => (
  `SUMIFS('HỌC SINH'!$${amountColumn}$${STUDENT_DATA_START_ROW}:$${amountColumn}$${STUDENT_DYNAMIC_LAST_ROW},'HỌC SINH'!$G$${STUDENT_DATA_START_ROW}:$G$${STUDENT_DYNAMIC_LAST_ROW},"*"&${classCriterion}&"*"${dateCriteria})`
);
const masterStudentRange = (column: string) => `'HỌC SINH'!$${column}$${STUDENT_DATA_START_ROW}:$${column}$${STUDENT_DYNAMIC_LAST_ROW}`;
const masterStudentPositionFormula = (classCriterion: string, targetRow: number, firstDetailRow: number) => (
  `MATCH(${classCriterion}&"|"&ROWS($A$${firstDetailRow}:A${targetRow}),${masterStudentRange('X')},0)`
);
const masterStudentFieldAtClassPositionFormula = (column: string, classCriterion: string, targetRow: number, firstDetailRow: number) => (
  `IFERROR(INDEX(${masterStudentRange(column)},${masterStudentPositionFormula(classCriterion, targetRow, firstDetailRow)}),"")`
);
const masterStudentNumberAtClassPositionFormula = (column: string, classCriterion: string, targetRow: number, firstDetailRow: number) => (
  `IFERROR(INDEX(${masterStudentRange(column)},${masterStudentPositionFormula(classCriterion, targetRow, firstDetailRow)}),0)`
);
const receiptSumByStudentIdFormula = (amountColumn: 'L' | 'M', studentIdCriterion: string, kind?: 'monthly' | 'course') => (
  `SUMIFS('HỌC PHÍ'!$${amountColumn}$${STUDENT_DATA_START_ROW}:$${amountColumn}$${STUDENT_DYNAMIC_LAST_ROW},'HỌC PHÍ'!$C$${STUDENT_DATA_START_ROW}:$C$${STUDENT_DYNAMIC_LAST_ROW},${studentIdCriterion}${kind ? `,'HỌC PHÍ'!$I$${STUDENT_DATA_START_ROW}:$I$${STUDENT_DYNAMIC_LAST_ROW},"${kind === 'monthly' ? 'Học phí tháng' : 'Học phí khóa'}"` : ''})`
);
const directSumByStudentIdFormula = (amountColumn: 'M' | 'N', studentIdCriterion: string, kind?: 'monthly' | 'course') => (
  `SUMIFS('HỌC SINH'!$${amountColumn}$${STUDENT_DATA_START_ROW}:$${amountColumn}$${STUDENT_DYNAMIC_LAST_ROW},'HỌC SINH'!$W$${STUDENT_DATA_START_ROW}:$W$${STUDENT_DYNAMIC_LAST_ROW},${studentIdCriterion}${kind ? `,'HỌC SINH'!$O$${STUDENT_DATA_START_ROW}:$O$${STUDENT_DYNAMIC_LAST_ROW},"${kind === 'monthly' ? 'Học phí tháng' : 'Học phí khóa'}"` : ''})`
);
const masterStudentPaymentFormulas = (rowNumber: number): ExcelJS.CellValue[] => [
  { formula: `${receiptSumByStudentIdFormula('L', `$W${rowNumber}`)}+$M${rowNumber}` },
  { formula: `${receiptSumByStudentIdFormula('M', `$W${rowNumber}`)}+$N${rowNumber}` },
  { formula: `${receiptSumByStudentIdFormula('M', `$W${rowNumber}`, 'monthly')}+IF($O${rowNumber}="Học phí khóa",0,$N${rowNumber})` },
  { formula: `${receiptSumByStudentIdFormula('M', `$W${rowNumber}`, 'course')}+IF($O${rowNumber}="Học phí khóa",$N${rowNumber},0)` },
];
const masterStudentClassKeyFormula = (rowNumber: number) => `IF(OR($B${rowNumber}="",$G${rowNumber}=""),"",$B${rowNumber}&"|"&$G${rowNumber})`;

const macroTemplateUrl = '/excel/PhucPhucThinhSyncTemplate.xlsm';
const macroEnabledMimeType = 'application/vnd.ms-excel.sheet.macroEnabled.12';
const injectMacroProject = async (workbookBuffer: ExcelJS.Buffer) => {
  const templateResponse = await fetch(macroTemplateUrl);
  if (!templateResponse.ok) throw new Error('Không tải được mẫu macro đồng bộ Excel.');
  const [workbookZip, templateZip] = await Promise.all([
    JSZip.loadAsync(workbookBuffer),
    JSZip.loadAsync(await templateResponse.arrayBuffer())
  ]);
  const vbaProject = await templateZip.file('xl/vbaProject.bin')?.async('uint8array');
  const contentTypesFile = workbookZip.file('[Content_Types].xml');
  const workbookRelationshipsFile = workbookZip.file('xl/_rels/workbook.xml.rels');
  const workbookFile = workbookZip.file('xl/workbook.xml');
  if (!vbaProject || !contentTypesFile || !workbookRelationshipsFile || !workbookFile) throw new Error('Mẫu macro Excel không hợp lệ.');

  let contentTypes = await contentTypesFile.async('string');
  contentTypes = contentTypes.replace(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    'application/vnd.ms-excel.sheet.macroEnabled.main+xml'
  );
  if (!contentTypes.includes('/xl/vbaProject.bin')) {
    contentTypes = contentTypes.replace('</Types>', '<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>');
  }

  let workbookRelationships = await workbookRelationshipsFile.async('string');
  if (!workbookRelationships.includes('/relationships/vbaProject')) {
    workbookRelationships = workbookRelationships.replace(
      '</Relationships>',
      '<Relationship Id="rIdVbaProject" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>'
    );
  }

  // vbaProject.bin binds its workbook module to this code name. Excel otherwise
  // opens the file but cannot resolve ThisWorkbook when a macro accesses sheets.
  let workbookXml = await workbookFile.async('string');
  if (!/\bcodeName="ThisWorkbook"/.test(workbookXml)) {
    if (/<workbookPr\b[^>]*\/>/.test(workbookXml)) {
      workbookXml = workbookXml.replace(/<workbookPr\b([^>]*)\/>/, '<workbookPr$1 codeName="ThisWorkbook"/>');
    } else if (/<workbookPr\b[^>]*>/.test(workbookXml)) {
      workbookXml = workbookXml.replace(/<workbookPr\b([^>]*)>/, '<workbookPr$1 codeName="ThisWorkbook">');
    } else {
      workbookXml = workbookXml.replace(/(<workbook\b[^>]*>)/, '$1<workbookPr codeName="ThisWorkbook"/>');
    }
  }
  workbookZip.file('[Content_Types].xml', contentTypes);
  workbookZip.file('xl/_rels/workbook.xml.rels', workbookRelationships);
  workbookZip.file('xl/workbook.xml', workbookXml);
  workbookZip.file('xl/vbaProject.bin', vbaProject);
  return workbookZip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
};

export async function generateMasterExcelWorkbook(data: ExcelExportData): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.centerName;
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  // Revenue is recognised by the receipt date. Course periods can be free text
  // (for example “Khóa 09/2026–12/2026”), so they must never be used as month keys.
  const months = [...new Set(data.receipts.map(receiptMonth).filter(Boolean))].sort();
  const classSheetNames = new Map(data.classes.map((classroom) => [classroom.id, classSheetName(classroom)]));
  const classById = new Map(data.classes.map((classroom) => [classroom.id, classroom]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const studentById = new Map(data.students.map((student) => [student.id, student]));
  const teacherById = new Map(data.teachers.map((teacher) => [teacher.id, teacher]));
  const roomById = new Map(data.rooms.map((room) => [room.id, room]));
  const orderedReceipts = [...data.receipts].sort((left, right) => {
    const leftClass = classById.get(left.classId)?.code || '';
    const rightClass = classById.get(right.classId)?.code || '';
    const leftStudent = studentById.get(left.studentId)?.code || '';
    const rightStudent = studentById.get(right.studentId)?.code || '';
    return leftClass.localeCompare(rightClass, 'vi') || leftStudent.localeCompare(rightStudent, 'vi') || left.paymentDate.localeCompare(right.paymentDate) || left.code.localeCompare(right.code);
  });
  const firstReceiptRowByStudentId = new Map<string, number>();
  const firstReceiptRowByClassMonth = new Map<string, number>();
  orderedReceipts.forEach((receipt, index) => {
    const rowNumber = 6 + index;
    if (!firstReceiptRowByStudentId.has(receipt.studentId)) firstReceiptRowByStudentId.set(receipt.studentId, rowNumber);
    const classMonthKey = `${receipt.classId}:${receiptMonth(receipt)}`;
    if (!firstReceiptRowByClassMonth.has(classMonthKey)) firstReceiptRowByClassMonth.set(classMonthKey, rowNumber);
  });
  const firstReceiptLink = orderedReceipts.length ? "#'HỌC PHÍ'!A6" : "#'HỌC PHÍ'!A1";

  const summary = workbook.addWorksheet('TỔNG QUAN');
  styleTitle(summary, 'A1:Z2', `${data.centerName.toUpperCase()}\nBÁO CÁO TỔNG QUAN VÀ THU HỌC PHÍ THEO THÁNG`);
  summary.mergeCells('A3:Z3');
  summary.getCell('A3').value = `Xuất lúc ${new Date().toLocaleString('vi-VN')} · Các công thức liên kết trực tiếp tới sheet HỌC PHÍ.`;
  summary.getCell('A3').note = 'Nguồn dữ liệu: PhucPhucThinh_BaoCaoToanHeThong_2026-08-10 (1).xlsx do người dùng cung cấp.';
  summary.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: '475569' } };
  summary.getCell('A3').alignment = { horizontal: 'center' };
  summary.mergeCells('A5:Z5');
  summary.getCell('A5').value = 'I. CHỈ SỐ TỔNG HỢP';
  summary.getCell('A5').font = { name: 'Arial', size: 11, bold: true, color: { argb: COLOR.primary } };
  summary.getRow(6).values = ['Chỉ số', 'Giá trị', 'Đơn vị', 'Nguồn công thức'];
  styleHeader(summary.getRow(6));
  const kpis = [
    ['Tổng học sinh', { formula: "COUNTA('HỌC SINH'!$B$6:$B$1048576)" }, 'Học sinh', 'Sheet HỌC SINH'],
    ['Tổng lớp học', { formula: "COUNTA('LỚP HỌC'!$B$6:$B$1000)" }, 'Lớp', 'Sheet LỚP HỌC'],
    ['Tổng giáo viên', { formula: "COUNTA('GIÁO VIÊN'!$B$6:$B$1000)" }, 'Giáo viên', 'Sheet GIÁO VIÊN'],
    ['Tổng học phí đã thu', { formula: withWorksheetLink("#'HỌC SINH'!A5", "SUMIFS('HỌC PHÍ'!$L:$L,'HỌC PHÍ'!$A:$A,\"<>TỔNG CỘNG\")+SUM('HỌC SINH'!$M:$M)") }, 'VNĐ', 'HỌC PHÍ + thu trực tiếp HỌC SINH'],
    ['Tổng công nợ', { formula: withWorksheetLink("#'HỌC SINH'!A5", "SUMIFS('HỌC PHÍ'!$M:$M,'HỌC PHÍ'!$A:$A,\"<>TỔNG CỘNG\")+SUM('HỌC SINH'!$N:$N)") }, 'VNĐ', 'HỌC PHÍ + nợ trực tiếp HỌC SINH'],
    ['Tỷ lệ thu', { formula: 'IFERROR(B10/(B10+B11),0)' }, '%', 'Đã thu / (đã thu + công nợ)']
  ];
  const kpiSourceLinks = ["#'HỌC SINH'!A1", "#'LỚP HỌC'!A1", "#'GIÁO VIÊN'!A1", "#'HỌC SINH'!A5", "#'HỌC SINH'!A5", undefined];
  kpis.forEach((values, index) => {
    const row = summary.getRow(7 + index);
    row.values = values;
    styleData(row, index);
    row.getCell(2).font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } };
    const sourceLink = kpiSourceLinks[index];
    if (sourceLink) {
      row.getCell(4).value = { text: String(values[3]), hyperlink: sourceLink };
      row.getCell(4).font = { name: 'Arial', size: 10, color: { argb: COLOR.link }, underline: true };
    }
    if (index === 3 || index === 4) styleFormulaLink(row.getCell(2));
  });
  summary.getCell('B10').numFmt = moneyFormat;
  summary.getCell('B11').numFmt = moneyFormat;
  summary.getCell('B12').numFmt = '0.0%';

  const monthlyTitleRow = 15;
  summary.mergeCells(`A${monthlyTitleRow}:Z${monthlyTitleRow}`);
  summary.getCell(`A${monthlyTitleRow}`).value = 'II. TỔNG THU HỌC PHÍ THEO THÁNG VÀ TỪNG LỚP';
  summary.getCell(`A${monthlyTitleRow}`).font = { name: 'Arial', size: 11, bold: true, color: { argb: COLOR.primary } };
  const monthlyHeaderRow = monthlyTitleRow + 1;
  const monthlyHeaders = ['Mã lớp', 'Tên lớp', 'Sĩ số', ...months.map((month) => `Tháng ${month.slice(5)}/${month.slice(0, 4)}`), 'Tổng đã thu', 'Công nợ'];
  summary.getRow(monthlyHeaderRow).values = monthlyHeaders;
  styleHeader(summary.getRow(monthlyHeaderRow));
  months.forEach((month, index) => {
    const cell = summary.getCell(monthlyHeaderRow, 4 + index);
    cell.value = dateFromIso(`${month}-01`);
    cell.numFmt = '"Tháng "mm/yyyy';
  });

  const classStartRow = monthlyHeaderRow + 1;
  data.classes.forEach((classroom, index) => {
    const rowNumber = classStartRow + index;
    const row = summary.getRow(rowNumber);
    row.getCell(1).value = classroom.code;
    row.getCell(2).value = classroom.name;
    row.getCell(3).value = { formula: `COUNTIF('HỌC SINH'!$G:$G,"*"&$A${rowNumber}&"*")` };
    months.forEach((_, monthIndex) => {
      const column = 4 + monthIndex;
      const header = `${columnLetter(column)}$${monthlyHeaderRow}`;
      const monthTarget = `#'${classSheetNames.get(classroom.id)}'!${columnLetter(2 + monthIndex)}6`;
      const receiptDateCriteria = `,'HỌC PHÍ'!$O$${STUDENT_DATA_START_ROW}:$O$${STUDENT_DYNAMIC_LAST_ROW},">="&${header},'HỌC PHÍ'!$O$${STUDENT_DATA_START_ROW}:$O$${STUDENT_DYNAMIC_LAST_ROW},"<"&EDATE(${header},1)`;
      const directDateCriteria = `,'HỌC SINH'!$Q$${STUDENT_DATA_START_ROW}:$Q$${STUDENT_DYNAMIC_LAST_ROW},">="&${header},'HỌC SINH'!$Q$${STUDENT_DATA_START_ROW}:$Q$${STUDENT_DYNAMIC_LAST_ROW},"<"&EDATE(${header},1)`;
      row.getCell(column).value = { formula: withWorksheetLink(monthTarget, `${receiptSumByClassFormula('L', `$A${rowNumber}`, receiptDateCriteria)}+${directSumByClassFormula('M', `$A${rowNumber}`, directDateCriteria)}`) };
      row.getCell(column).numFmt = moneyFormat;
    });
    const totalColumn = 4 + months.length;
    const debtColumn = totalColumn + 1;
    const classTarget = `#'${classSheetNames.get(classroom.id)}'!A6`;
    row.getCell(totalColumn).value = { formula: withWorksheetLink(classTarget, `${receiptSumByClassFormula('L', `$A${rowNumber}`)}+${directSumByClassFormula('M', `$A${rowNumber}`)}`) };
    row.getCell(debtColumn).value = { formula: withWorksheetLink(classTarget, `${receiptSumByClassFormula('M', `$A${rowNumber}`)}+${directSumByClassFormula('N', `$A${rowNumber}`)}`) };
    row.getCell(totalColumn).numFmt = moneyFormat;
    row.getCell(debtColumn).numFmt = moneyFormat;
    styleData(row, index);
    for (let column = 4; column <= debtColumn; column += 1) styleFormulaLink(row.getCell(column));
  });
  const classTotalRow = classStartRow + data.classes.length;
  const lastDataColumn = 5 + months.length;
  const footerFormulas: Record<number, string> = { 3: `SUM(C${classStartRow}:C${classTotalRow - 1})` };
  for (let column = 4; column <= lastDataColumn; column += 1) footerFormulas[column] = `SUM(${columnLetter(column)}${classStartRow}:${columnLetter(column)}${classTotalRow - 1})`;
  writeFooter(summary, classTotalRow, lastDataColumn, footerFormulas);
  for (let column = 4; column <= lastDataColumn; column += 1) summary.getCell(classTotalRow, column).numFmt = moneyFormat;
  summary.autoFilter = { from: `A${monthlyHeaderRow}`, to: `${columnLetter(lastDataColumn)}${classTotalRow - 1}` };
  summary.views = [{ state: 'frozen', ySplit: monthlyHeaderRow }];
  summary.columns = [{ width: 18 }, { width: 32 }, { width: 12 }, ...months.map(() => ({ width: 18 })), { width: 18 }, { width: 18 }];

  const studentsSheet = workbook.addWorksheet('HỌC SINH');
  styleTitle(studentsSheet, 'A1:Y2', `${data.centerName.toUpperCase()}\nDANH SÁCH HỌC SINH`);
  applyBackLink(studentsSheet, 'Y');
  studentsSheet.mergeCells('A4:Y4');
  studentsSheet.getCell('A4').value = 'Nhập học sinh tại các dòng trống ngay trên TỔNG CỘNG; khoản thu trực tiếp ở cột nền vàng M–R. Tổng/Nợ và sheet lớp tự liên kết theo ID hệ thống.';
  studentsSheet.getCell('A4').font = { name: 'Arial', size: 9.5, italic: true, color: { argb: '7C2D12' } };
  studentsSheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBEB' } };
  studentsSheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  studentsSheet.getRow(4).height = 26;
  const studentHeaders = ['STT', 'Mã học sinh', 'Họ và tên', 'Giới tính', 'Ngày sinh', 'Chương trình', 'Mã lớp', 'SĐT học sinh', 'SĐT phụ huynh', 'Địa chỉ', 'Trạng thái', 'Ghi chú', 'Đã thu nhập trực tiếp (VNĐ)', 'Còn nợ nhập trực tiếp (VNĐ)', 'Khoản thu nhập trực tiếp', 'Kỳ học phí / Mốc khóa', 'Ngày thu nhập trực tiếp', 'Hình thức nhập trực tiếp', 'Tổng đã thu (VNĐ)', 'Tổng nợ (VNĐ)', 'Nợ học phí tháng (VNĐ)', 'Nợ học phí khóa (VNĐ)', 'ID hệ thống', 'Khóa lớp tự động', 'Khóa học sinh/lớp tự động'];
  studentsSheet.getRow(5).values = studentHeaders;
  styleHeader(studentsSheet.getRow(5));
  const studentSheetRowById = new Map<string, number>();
  data.students.forEach((student, index) => {
    const rowNumber = 6 + index;
    const classroom = classById.get(student.classId);
    const row = studentsSheet.getRow(rowNumber);
    const classLink = classroom ? `#'${classSheetNames.get(classroom.id)}'!A1` : undefined;
    row.values = [index + 1, student.code, student.name, student.gender, student.dob, programById.get(student.programId)?.name || student.programId, classLink ? { text: classroom?.code || '', hyperlink: classLink } : (classroom?.code || ''), student.phone, student.parentPhone, student.address, studentStatusLabel(student.status), student.notes || '', 0, 0, '', '', '', '', ...masterStudentPaymentFormulas(rowNumber), student.id, { formula: `IF($G${rowNumber}="","",$G${rowNumber}&"|"&COUNTIF($G$${STUDENT_DATA_START_ROW}:$G${rowNumber},$G${rowNumber}))` }, { formula: masterStudentClassKeyFormula(rowNumber) }];
    styleData(row, index);
    [13, 14, 19, 20, 21, 22].forEach((column) => { row.getCell(column).numFmt = moneyFormat; });
    [19, 20, 21, 22].forEach((column) => styleFormulaLink(row.getCell(column)));
    [13, 14, 15, 16, 17, 18].forEach((column) => {
      row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
    });
    row.getCell(17).numFmt = 'dd/mm/yyyy';
    if (classLink) row.getCell(7).font = { name: 'Arial', size: 10, color: { argb: COLOR.link }, underline: true, bold: true };
    studentSheetRowById.set(student.id, rowNumber);
  });
  const studentFooterRow = 6 + data.students.length;
  writeFooter(studentsSheet, studentFooterRow, studentHeaders.length, { 3: `COUNTA(B${STUDENT_DATA_START_ROW}:B${studentFooterRow - 1})`, 19: `SUM(S${STUDENT_DATA_START_ROW}:S${studentFooterRow - 1})`, 20: `SUM(T${STUDENT_DATA_START_ROW}:T${studentFooterRow - 1})`, 21: `SUM(U${STUDENT_DATA_START_ROW}:U${studentFooterRow - 1})`, 22: `SUM(V${STUDENT_DATA_START_ROW}:V${studentFooterRow - 1})` });
  [19, 20, 21, 22].forEach((column) => { studentsSheet.getCell(studentFooterRow, column).numFmt = moneyFormat; });
  studentsSheet.autoFilter = { from: 'A5', to: `Y${studentFooterRow - 1}` };
  studentsSheet.views = [{ state: 'frozen', ySplit: 5 }];
  studentsSheet.columns = [{ width: 8 }, { width: 16 }, { width: 28 }, { width: 18 }, { width: 14 }, { width: 20 }, { width: 18 }, { width: 17 }, { width: 18 }, { width: 35 }, { width: 15 }, { width: 42 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 24 }, { width: 18 }, { width: 22 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 22 }, { width: 18 }, { width: 22 }, { width: 28 }];
  studentsSheet.getColumn(23).hidden = true;
  studentsSheet.getColumn(24).hidden = true;
  studentsSheet.getColumn(25).hidden = true;

  const teachersSheet = workbook.addWorksheet('GIÁO VIÊN');
  styleTitle(teachersSheet, 'A1:I2', `${data.centerName.toUpperCase()}\nDANH SÁCH GIÁO VIÊN`);
  applyBackLink(teachersSheet, 'I');
  const teacherHeaders = ['STT', 'Mã giáo viên', 'Họ và tên', 'Số điện thoại', 'Email', 'Chuyên môn', 'Địa chỉ', 'Lớp phụ trách', 'Ghi chú'];
  teachersSheet.getRow(5).values = teacherHeaders;
  styleHeader(teachersSheet.getRow(5));
  const teacherSheetRowById = new Map<string, number>();
  data.teachers.forEach((teacher, index) => {
    const rowNumber = 6 + index;
    const teacherClasses = data.classes.filter((c) => c.teacherId === teacher.id);
    const assignedClassCodes = teacherClasses.map((c) => c.code).join(', ') || 'Chưa phân công';
    const row = teachersSheet.getRow(rowNumber);
    row.values = [
      index + 1,
      teacher.id,
      teacher.name,
      teacher.phone || '',
      teacher.email || '',
      teacher.specialty || '',
      teacher.address || '',
      assignedClassCodes,
      teacher.notes || ''
    ];
    styleData(row, index);
    teacherSheetRowById.set(teacher.id, rowNumber);
  });
  const teacherFooterRow = 6 + data.teachers.length;
  writeFooter(teachersSheet, teacherFooterRow, teacherHeaders.length, { 3: `COUNTA(B6:B${teacherFooterRow - 1})` });
  teachersSheet.autoFilter = { from: 'A5', to: `I${teacherFooterRow - 1}` };
  teachersSheet.views = [{ state: 'frozen', ySplit: 5 }];
  teachersSheet.columns = [{ width: 8 }, { width: 16 }, { width: 28 }, { width: 18 }, { width: 26 }, { width: 22 }, { width: 35 }, { width: 28 }, { width: 35 }];

  const classSheet = workbook.addWorksheet('LỚP HỌC');
  styleTitle(classSheet, 'A1:J2', `${data.centerName.toUpperCase()}\nDANH SÁCH LỚP HỌC`);
  applyBackLink(classSheet, 'J');
  const classHeaders = ['STT', 'Mã lớp', 'Tên lớp', 'Chương trình', 'Giáo viên', 'Lịch học', 'Phòng', 'Sức chứa', 'Sĩ số', 'Sheet chi tiết'];
  classSheet.getRow(5).values = classHeaders;
  styleHeader(classSheet.getRow(5));
  data.classes.forEach((classroom, index) => {
    const rowNumber = 6 + index;
    const row = classSheet.getRow(rowNumber);
    const teacher = teacherById.get(classroom.teacherId);
    const teacherRow = teacher ? teacherSheetRowById.get(teacher.id) : undefined;
    const teacherLink = teacherRow ? { text: teacher!.name, hyperlink: `#'GIÁO VIÊN'!B${teacherRow}` } : (teacher?.name || 'Chưa cập nhật');
    row.values = [index + 1, classroom.code, classroom.name, programById.get(classroom.programId)?.name || classroom.programId, teacherLink, classroom.scheduleTime || classroom.days.join(', '), roomById.get(classroom.roomId)?.name || classroom.roomId || 'Chưa cập nhật', classroom.capacity || 'Chưa cập nhật', { formula: `COUNTIF('HỌC SINH'!$G:$G,"*"&B${rowNumber}&"*")` }, { text: `→ ${classSheetNames.get(classroom.id)}`, hyperlink: `#'${classSheetNames.get(classroom.id)}'!A1` }];
    styleData(row, index);
    if (teacherRow) row.getCell(5).font = { name: 'Arial', size: 10, color: { argb: COLOR.link }, underline: true, bold: true };
    row.getCell(10).font = { name: 'Arial', size: 10, color: { argb: COLOR.link }, underline: true, bold: true };
  });
  const classFooterRow = 6 + data.classes.length;
  writeFooter(classSheet, classFooterRow, classHeaders.length, { 3: `COUNTA(B6:B${classFooterRow - 1})`, 9: `SUM(I6:I${classFooterRow - 1})` });
  classSheet.autoFilter = { from: 'A5', to: `J${classFooterRow - 1}` };
  classSheet.views = [{ state: 'frozen', ySplit: 5 }];
  classSheet.columns = [{ width: 8 }, { width: 18 }, { width: 32 }, { width: 26 }, { width: 26 }, { width: 32 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 28 }];

  const tuitionSheet = workbook.addWorksheet('HỌC PHÍ');
  styleTitle(tuitionSheet, 'A1:S2', `${data.centerName.toUpperCase()}\nSỔ THU HỌC PHÍ`);
  applyBackLink(tuitionSheet, 'S');
  const tuitionHeaders = ['STT', 'Mã phiếu', 'ID hệ thống', 'Mã học sinh', 'Họ và tên', 'Mã lớp', 'Học phí khóa (VNĐ)', 'Học phí tháng (VNĐ)', 'Khoản thu', 'Kỳ học phí', 'Giảm giá (VNĐ)', 'Đã thu (VNĐ)', 'Công nợ (VNĐ)', 'Tình trạng', 'Ngày thu', 'Hình thức', 'Ghi chú', 'Hồ sơ học sinh', 'Lớp chi tiết'];
  tuitionSheet.getRow(5).values = tuitionHeaders;
  styleHeader(tuitionSheet.getRow(5));
  orderedReceipts.forEach((receipt, index) => {
    const student = studentById.get(receipt.studentId);
    const classroom = classById.get(receipt.classId);
    const row = tuitionSheet.getRow(6 + index);
    const studentRow = studentSheetRowById.get(receipt.studentId);
    const studentLink = studentRow ? { text: '→ Học sinh', hyperlink: `#'HỌC SINH'!A${studentRow}` } : '—';
    const classLink = classroom ? { text: `→ ${classroom.code}`, hyperlink: `#'${classSheetNames.get(classroom.id)}'!A1` } : '—';
    const period = receipt.billingPeriod || receiptMonth(receipt);
    const isMonthlyReceipt = receipt.paymentKind !== 'course';
    const periodValue = isMonthlyReceipt && /^\d{4}-\d{2}$/.test(period) ? dateFromIso(`${period}-01`) : period;
    const status = receipt.status || (receipt.debtAmount <= 0 && receipt.paidAmount > 0 ? 'paid' : (receipt.paidAmount > 0 ? 'partial' : 'unpaid'));
    row.values = [index + 1, receipt.code, receipt.studentId, student?.code || '', student?.name || '', classroom?.code || '', receipt.courseFee, receipt.monthlyFee || 0, receipt.paymentKind === 'monthly' ? 'Học phí tháng' : 'Học phí khóa', periodValue, receipt.discount, receipt.paidAmount, receipt.debtAmount, status === 'paid' ? 'Đã đóng đủ' : ((status === 'partial' || status === 'debt') ? 'Đóng thiếu' : 'Chưa đóng'), dateFromIso(receipt.paymentDate), paymentMethodLabel(receipt.paymentMethod), receipt.notes || '', studentLink, classLink];
    styleData(row, index);
    [7, 8, 11, 12, 13].forEach((column) => { row.getCell(column).numFmt = moneyFormat; });
    row.getCell(10).numFmt = 'mm/yyyy';
    row.getCell(15).numFmt = 'dd/mm/yyyy';
    [18, 19].forEach((column) => { row.getCell(column).font = { name: 'Arial', size: 10, color: { argb: COLOR.link }, underline: true, bold: true }; });
  });
  const tuitionFooterRow = 6 + orderedReceipts.length;
  writeFooter(tuitionSheet, tuitionFooterRow, tuitionHeaders.length, { 12: `SUM(L6:L${tuitionFooterRow - 1})+SUM('HỌC SINH'!$M:$M)`, 13: `SUM(M6:M${tuitionFooterRow - 1})+SUM('HỌC SINH'!$N:$N)` });
  tuitionSheet.getCell(tuitionFooterRow, 12).numFmt = moneyFormat;
  tuitionSheet.getCell(tuitionFooterRow, 13).numFmt = moneyFormat;
  tuitionSheet.mergeCells(`A${tuitionFooterRow + 1}:S${tuitionFooterRow + 1}`);
  tuitionSheet.getCell(`A${tuitionFooterRow + 1}`).value = 'TỔNG CỘNG đã bao gồm các khoản nhập trực tiếp ở sheet HỌC SINH (cột nền vàng M–R).';
  tuitionSheet.getCell(`A${tuitionFooterRow + 1}`).font = { name: 'Arial', size: 9.5, italic: true, color: { argb: '7C2D12' } };
  tuitionSheet.getCell(`A${tuitionFooterRow + 1}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBEB' } };
  tuitionSheet.autoFilter = { from: 'A5', to: `S${tuitionFooterRow - 1}` };
  tuitionSheet.views = [{ state: 'frozen', ySplit: 5 }];
  tuitionSheet.columns = [{ width: 8 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 20 }, { width: 48 }, { width: 18 }, { width: 18 }];
  tuitionSheet.getColumn(3).hidden = true;

  const gradesSheet = workbook.addWorksheet('BẢNG ĐIỂM');
  styleTitle(gradesSheet, 'A1:M2', `${data.centerName.toUpperCase()}\nBẢNG ĐIỂM`);
  applyBackLink(gradesSheet, 'M');
  // Keep every score used by the web gradebook in the workbook.  The prior
  // 4-skill-only layout silently discarded midterm/final/attendance when a
  // report was imported back into the app.
  const gradeHeaders = ['STT', 'Mã học sinh', 'Họ và tên', 'Mã lớp', 'Nghe', 'Nói', 'Đọc', 'Viết', 'Giữa kỳ', 'Cuối kỳ', 'Chuyên cần', 'Điểm TB', 'Xếp loại'];
  gradesSheet.getRow(5).values = gradeHeaders;
  styleHeader(gradesSheet.getRow(5));
  const gradeEntries: { student: Student; classroom: ClassRoom | undefined; grade: Grade | undefined }[] = [];
  data.students.forEach((student) => {
    const enrolledClasses = data.classes.filter((cls) => isStudentInClass(student, cls.id, cls));
    if (!enrolledClasses.length) {
      const cls = classById.get(student.classId);
      const grade = data.grades.find((g) => g.studentId === student.id && (g.classId ? g.classId === student.classId : true)) || data.grades.find((g) => g.studentId === student.id);
      gradeEntries.push({ student, classroom: cls, grade });
    } else {
      enrolledClasses.forEach((cls) => {
        const grade = data.grades.find((g) => g.studentId === student.id && g.classId === cls.id)
          || (cls.id === student.classId ? data.grades.find((g) => g.studentId === student.id && (!g.classId || g.classId === cls.id)) : undefined);
        gradeEntries.push({ student, classroom: cls, grade });
      });
    }
  });

  gradeEntries.forEach(({ student, classroom, grade }, index) => {
    const rowNumber = STUDENT_DATA_START_ROW + index;
    const row = gradesSheet.getRow(rowNumber);
    const skillsAverage = grade ? (grade.listening + grade.speaking + grade.reading + grade.writing) / 4 : 0;
    const calculatedAverage = grade ? Math.round(((skillsAverage * 0.4) + (grade.midterm * 0.2) + (grade.finalExam * 0.3) + (grade.attendance * 0.1)) * 10) / 10 : null;
    const average = grade ? (Number.isFinite(grade.average) ? grade.average : calculatedAverage) : null;
    const classification = average === null ? '' : (average >= 8 ? 'Giỏi' : (average >= 6.5 ? 'Khá' : (average >= 5 ? 'Trung bình' : 'Cần hỗ trợ')));
    const classCode = classroom?.code || '';
    const classLink = classroom ? `#'${classSheetNames.get(classroom.id)}'!A1` : undefined;
    row.values = [
      index + 1,
      student.code,
      student.name,
      classLink ? { text: classCode, hyperlink: classLink } : classCode,
      grade?.listening ?? '',
      grade?.speaking ?? '',
      grade?.reading ?? '',
      grade?.writing ?? '',
      grade?.midterm ?? '',
      grade?.finalExam ?? '',
      grade?.attendance ?? '',
      average ?? '',
      classification
    ];
    styleData(row, index);
    if (classLink) row.getCell(4).font = { name: 'Arial', size: 10, color: { argb: COLOR.link }, underline: true, bold: true };
  });
  const gradesFooterRow = STUDENT_DATA_START_ROW + gradeEntries.length;
  writeFooter(gradesSheet, gradesFooterRow, gradeHeaders.length, { 12: `IFERROR(AVERAGE(L${STUDENT_DATA_START_ROW}:L${gradesFooterRow - 1}),0)` });
  gradesSheet.autoFilter = { from: 'A5', to: `M${gradesFooterRow - 1}` };
  gradesSheet.views = [{ state: 'frozen', ySplit: 5 }];
  gradesSheet.columns = [{ width: 8 }, { width: 16 }, { width: 28 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 18 }];

  data.classes.forEach((classroom) => {
    const sheet = workbook.addWorksheet(classSheetNames.get(classroom.id)!);
    const classEndColumn = columnLetter(Math.max(13, months.length + 1));
    styleTitle(sheet, `A1:${classEndColumn}2`, `${data.centerName.toUpperCase()}\nDANH SÁCH HỌC SINH - ${classroom.name.toUpperCase()}`);
    applyBackLink(sheet, classEndColumn);
    const teacher = teacherById.get(classroom.teacherId);
    sheet.mergeCells(`A4:${classEndColumn}4`);
    sheet.getCell('A4').value = `Giáo viên: ${teacher?.name || 'Chưa cập nhật'} · Lịch: ${classroom.scheduleTime || classroom.days.join(', ')} · Phòng: ${roomById.get(classroom.roomId)?.name || classroom.roomId || 'Chưa cập nhật'}`;
    sheet.getCell('A4').font = { name: 'Arial', size: 9.5, italic: true, color: { argb: '475569' } };
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getRow(6).values = ['Kỳ thu', ...months.map((month) => dateFromIso(`${month}-01`))];
    styleHeader(sheet.getRow(6));
    months.forEach((_, index) => sheet.getCell(6, 2 + index).numFmt = '"Tháng "mm/yyyy');
    const monthlyPaidRow = sheet.getRow(7);
    const monthlyDebtRow = sheet.getRow(8);
    monthlyPaidRow.getCell(1).value = 'Đã thu (VNĐ)';
    monthlyDebtRow.getCell(1).value = 'Công nợ (VNĐ)';
    months.forEach((month, index) => {
      const column = 2 + index;
      const header = `${columnLetter(column)}$6`;
      const receiptRow = firstReceiptRowByClassMonth.get(`${classroom.id}:${month}`);
      const receiptLink = receiptRow ? `#'HỌC PHÍ'!A${receiptRow}` : undefined;
      const classCriterion = `"${formulaText(classroom.code)}"`;
      const receiptDateCriteria = `,'HỌC PHÍ'!$O$${STUDENT_DATA_START_ROW}:$O$${STUDENT_DYNAMIC_LAST_ROW},">="&${header},'HỌC PHÍ'!$O$${STUDENT_DATA_START_ROW}:$O$${STUDENT_DYNAMIC_LAST_ROW},"<"&EDATE(${header},1)`;
      const directDateCriteria = `,'HỌC SINH'!$Q$${STUDENT_DATA_START_ROW}:$Q$${STUDENT_DYNAMIC_LAST_ROW},">="&${header},'HỌC SINH'!$Q$${STUDENT_DATA_START_ROW}:$Q$${STUDENT_DYNAMIC_LAST_ROW},"<"&EDATE(${header},1)`;
      monthlyPaidRow.getCell(column).value = { formula: withWorksheetLink(receiptLink, `${receiptSumByClassFormula('L', classCriterion, receiptDateCriteria)}+${directSumByClassFormula('M', classCriterion, directDateCriteria)}`) };
      monthlyDebtRow.getCell(column).value = { formula: withWorksheetLink(receiptLink, `${receiptSumByClassFormula('M', classCriterion, receiptDateCriteria)}+${directSumByClassFormula('N', classCriterion, directDateCriteria)}`) };
      monthlyPaidRow.getCell(column).numFmt = moneyFormat;
      monthlyDebtRow.getCell(column).numFmt = moneyFormat;
    });
    [monthlyPaidRow, monthlyDebtRow].forEach((row, index) => {
      styleData(row, index);
      row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } };
    });
    months.forEach((month, index) => {
      if (firstReceiptRowByClassMonth.has(`${classroom.id}:${month}`)) {
        styleFormulaLink(monthlyPaidRow.getCell(2 + index));
        styleFormulaLink(monthlyDebtRow.getCell(2 + index));
      }
    });
    sheet.getCell('A9').value = 'TỔNG TỰ ĐỘNG';
    const classCriterion = `"${formulaText(classroom.code)}"`;
    sheet.getCell('B9').value = { formula: `${receiptSumByClassFormula('L', classCriterion)}+${directSumByClassFormula('M', classCriterion)}` };
    sheet.getCell('C9').value = { formula: `${receiptSumByClassFormula('M', classCriterion)}+${directSumByClassFormula('N', classCriterion)}` };
    sheet.getCell('D9').value = { formula: `${receiptSumByClassFormula('M', classCriterion, `,'HỌC PHÍ'!$I$${STUDENT_DATA_START_ROW}:$I$${STUDENT_DYNAMIC_LAST_ROW},"Học phí tháng"`)}+SUMIFS('HỌC SINH'!$N:$N,'HỌC SINH'!$G:$G,${classCriterion},'HỌC SINH'!$O:$O,"<>Học phí khóa")` };
    sheet.getCell('E9').value = { formula: `${receiptSumByClassFormula('M', classCriterion, `,'HỌC PHÍ'!$I$${STUDENT_DATA_START_ROW}:$I$${STUDENT_DYNAMIC_LAST_ROW},"Học phí khóa"`)}+SUMIFS('HỌC SINH'!$N:$N,'HỌC SINH'!$G:$G,${classCriterion},'HỌC SINH'!$O:$O,"Học phí khóa")` };
    styleData(sheet.getRow(9), 0);
    ['Tổng đã thu', 'Tổng nợ', 'Nợ tháng', 'Nợ khóa'].forEach((label, index) => {
      sheet.getCell(9, index + 2).note = label;
      sheet.getCell(9, index + 2).numFmt = moneyFormat;
      styleFormulaLink(sheet.getCell(9, index + 2));
    });
    sheet.getRow(9).getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } };
    sheet.mergeCells(`A10:${classEndColumn}10`);
    sheet.getCell('A10').value = 'CHI TIẾT HỌC SINH VÀ PHIẾU THU';
    sheet.getCell('A10').font = { name: 'Arial', size: 11, bold: true, color: { argb: COLOR.primary } };
    const headers = ['STT', 'Mã học sinh', 'Họ và tên', 'SĐT học sinh', 'SĐT phụ huynh', 'Địa chỉ', 'Tổng đã thu (VNĐ)', 'Tổng nợ (VNĐ)', 'Nợ học phí tháng (VNĐ)', 'Nợ học phí khóa (VNĐ)', 'Xem phiếu', 'Trạng thái', 'ID hệ thống'];
    sheet.getRow(11).values = headers;
    styleHeader(sheet.getRow(11));
    const firstDetailRow = 12;
    const classStudents = data.students.filter((student) => isStudentInClass(student, classroom.id, classroom));
    const writeFinancialFormulas = (rowNumber: number, directPaid: string, directDebt: string, directMonthlyDebt: string, directCourseDebt: string) => {
      const studentId = `$M${rowNumber}`;
      sheet.getCell(rowNumber, 7).value = { formula: `IF($B${rowNumber}="","",${receiptSumByStudentIdFormula('L', studentId)}+${directPaid})` };
      sheet.getCell(rowNumber, 8).value = { formula: `IF($B${rowNumber}="","",${receiptSumByStudentIdFormula('M', studentId)}+${directDebt})` };
      sheet.getCell(rowNumber, 9).value = { formula: `IF($B${rowNumber}="","",${receiptSumByStudentIdFormula('M', studentId, 'monthly')}+${directMonthlyDebt})` };
      sheet.getCell(rowNumber, 10).value = { formula: `IF($B${rowNumber}="","",${receiptSumByStudentIdFormula('M', studentId, 'course')}+${directCourseDebt})` };
      [7, 8, 9, 10].forEach((column) => { sheet.getCell(rowNumber, column).numFmt = moneyFormat; styleFormulaLink(sheet.getCell(rowNumber, column)); });
    };
    classStudents.forEach((student, index) => {
      const rowNumber = firstDetailRow + index;
      const receiptRow = firstReceiptRowByStudentId.get(student.id);
      sheet.getRow(rowNumber).values = [index + 1, student.code, student.name, student.phone, student.parentPhone, student.address, '', '', '', '', { text: '→ Học phí', hyperlink: receiptRow ? `#'HỌC PHÍ'!A${receiptRow}` : "#'HỌC PHÍ'!A1" }, studentStatusLabel(student.status), student.id];
      styleData(sheet.getRow(rowNumber), index);
      writeFinancialFormulas(
        rowNumber,
        directSumByStudentIdFormula('M', `$M${rowNumber}`),
        directSumByStudentIdFormula('N', `$M${rowNumber}`),
        directSumByStudentIdFormula('N', `$M${rowNumber}`, 'monthly'),
        directSumByStudentIdFormula('N', `$M${rowNumber}`, 'course')
      );
      sheet.getCell(rowNumber, 11).font = { name: 'Arial', size: 10, color: { argb: COLOR.link }, underline: true, bold: true };
    });
    const classDetailFooterRow = firstDetailRow + classStudents.length;
    if (classStudents.length > 0) {
      writeFooter(sheet, classDetailFooterRow, headers.length, {
        3: `COUNTA(B${firstDetailRow}:B${classDetailFooterRow - 1})`,
        7: `SUM(G${firstDetailRow}:G${classDetailFooterRow - 1})`,
        8: `SUM(H${firstDetailRow}:H${classDetailFooterRow - 1})`,
        9: `SUM(I${firstDetailRow}:I${classDetailFooterRow - 1})`,
        10: `SUM(J${firstDetailRow}:J${classDetailFooterRow - 1})`,
      });
      [7, 8, 9, 10].forEach((column) => { sheet.getCell(classDetailFooterRow, column).numFmt = moneyFormat; });
      sheet.autoFilter = { from: 'A11', to: `L${classDetailFooterRow - 1}` };
    }
    sheet.views = [{ state: 'frozen', ySplit: 11 }];
    sheet.columns = [{ width: 14 }, ...months.map(() => ({ width: 18 })), ...Array.from({ length: Math.max(0, 11 - (months.length + 1)) }, () => ({ width: 18 }))];
    const detailColumns = [{ width: 8 }, { width: 16 }, { width: 28 }, { width: 17 }, { width: 18 }, { width: 36 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 22 }, { width: 16 }, { width: 15 }, { width: 18 }];
    detailColumns.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width; });
    sheet.getColumn(13).hidden = true;
  });

  // A single selector-based view also covers classes added later in LỚP HỌC.
  // Excel formulas cannot create a new worksheet tab, but this view stays live
  // for every current or future class code without duplicating student rows.
  const classLookup = workbook.addWorksheet('TRA CỨU LỚP');
  styleTitle(classLookup, 'A1:M2', `${data.centerName.toUpperCase()}\nTRA CỨU LỚP TỰ ĐỘNG`);
  applyBackLink(classLookup, 'M');
  classLookup.getCell('A4').value = 'Mã lớp cần xem';
  classLookup.getCell('A4').font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } };
  classLookup.getCell('B4').value = data.classes[0]?.code || '';
  classLookup.getCell('B4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
  classLookup.getCell('B4').font = { name: 'Arial', size: 10, bold: true, color: { argb: '7C2D12' } };
  classLookup.getCell('B4').border = border;
  classLookup.getCell('B4').note = 'Gõ chính xác mã lớp từ sheet LỚP HỌC để xem danh sách và học phí. Không sửa vùng danh sách bên dưới.';
  classLookup.mergeCells('D4:M4');
  classLookup.getCell('D4').value = 'Gõ mã lớp ở ô B4. Dữ liệu học sinh, phiếu thu và công nợ sẽ tự lọc từ các sheet nguồn.';
  classLookup.getCell('D4').font = { name: 'Arial', size: 9.5, italic: true, color: { argb: '475569' } };
  classLookup.getCell('D4').alignment = { vertical: 'middle', wrapText: true };
  classLookup.getCell('A6').value = 'Tên lớp';
  classLookup.getCell('B6').value = { formula: `IFERROR(INDEX('LỚP HỌC'!$C$${STUDENT_DATA_START_ROW}:$C$${STUDENT_DYNAMIC_LAST_ROW},MATCH($B$4,'LỚP HỌC'!$B$${STUDENT_DATA_START_ROW}:$B$${STUDENT_DYNAMIC_LAST_ROW},0)),"")` };
  classLookup.getCell('D6').value = 'Giáo viên';
  classLookup.getCell('E6').value = { formula: `IFERROR(INDEX('LỚP HỌC'!$E$${STUDENT_DATA_START_ROW}:$E$${STUDENT_DYNAMIC_LAST_ROW},MATCH($B$4,'LỚP HỌC'!$B$${STUDENT_DATA_START_ROW}:$B$${STUDENT_DYNAMIC_LAST_ROW},0)),"")` };
  classLookup.getCell('G6').value = 'Phòng';
  classLookup.getCell('H6').value = { formula: `IFERROR(INDEX('LỚP HỌC'!$G$${STUDENT_DATA_START_ROW}:$G$${STUDENT_DYNAMIC_LAST_ROW},MATCH($B$4,'LỚP HỌC'!$B$${STUDENT_DATA_START_ROW}:$B$${STUDENT_DYNAMIC_LAST_ROW},0)),"")` };
  ['A6', 'D6', 'G6'].forEach((address) => { classLookup.getCell(address).font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } }; });
  classLookup.getCell('A8').value = 'Tổng đã thu';
  classLookup.getCell('B8').value = { formula: `${receiptSumByClassFormula('L', '$B$4')}+${directSumByClassFormula('M', '$B$4')}` };
  classLookup.getCell('D8').value = 'Tổng nợ';
  classLookup.getCell('E8').value = { formula: `${receiptSumByClassFormula('M', '$B$4')}+${directSumByClassFormula('N', '$B$4')}` };
  ['A8', 'D8'].forEach((address) => { classLookup.getCell(address).font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } }; });
  ['B8', 'E8'].forEach((address) => { classLookup.getCell(address).numFmt = moneyFormat; styleFormulaLink(classLookup.getCell(address)); });
  const lookupHeaders = ['STT', 'Mã học sinh', 'Họ và tên', 'SĐT học sinh', 'SĐT phụ huynh', 'Địa chỉ', 'Tổng đã thu (VNĐ)', 'Tổng nợ (VNĐ)', 'Nợ tháng (VNĐ)', 'Nợ khóa (VNĐ)', 'Xem phiếu', 'Trạng thái', 'ID hệ thống'];
  classLookup.getRow(10).values = lookupHeaders;
  styleHeader(classLookup.getRow(10));
  const lookupFirstDetailRow = 11;
  for (let rowNumber = lookupFirstDetailRow; rowNumber < lookupFirstDetailRow + CLASS_DETAIL_MAX_ROWS; rowNumber += 1) {
    const directPaid = masterStudentNumberAtClassPositionFormula('M', '$B$4', rowNumber, lookupFirstDetailRow);
    const directDebt = masterStudentNumberAtClassPositionFormula('N', '$B$4', rowNumber, lookupFirstDetailRow);
    const directKind = masterStudentFieldAtClassPositionFormula('O', '$B$4', rowNumber, lookupFirstDetailRow);
    classLookup.getCell(rowNumber, 1).value = { formula: `IF($B${rowNumber}="","",ROWS($A$${lookupFirstDetailRow}:A${rowNumber}))` };
    [2, 3, 4, 5, 6, 12, 13].forEach((column) => {
      const masterColumn = ({ 2: 'B', 3: 'C', 4: 'H', 5: 'I', 6: 'J', 12: 'K', 13: 'W' } as Record<number, string>)[column];
      classLookup.getCell(rowNumber, column).value = { formula: masterStudentFieldAtClassPositionFormula(masterColumn, '$B$4', rowNumber, lookupFirstDetailRow) };
    });
    const studentId = `$M${rowNumber}`;
    classLookup.getCell(rowNumber, 7).value = { formula: `IF($B${rowNumber}="","",${receiptSumByStudentIdFormula('L', studentId)}+${directPaid})` };
    classLookup.getCell(rowNumber, 8).value = { formula: `IF($B${rowNumber}="","",${receiptSumByStudentIdFormula('M', studentId)}+${directDebt})` };
    classLookup.getCell(rowNumber, 9).value = { formula: `IF($B${rowNumber}="","",${receiptSumByStudentIdFormula('M', studentId, 'monthly')}+IF(${directKind}="Học phí khóa",0,${directDebt}))` };
    classLookup.getCell(rowNumber, 10).value = { formula: `IF($B${rowNumber}="","",${receiptSumByStudentIdFormula('M', studentId, 'course')}+IF(${directKind}="Học phí khóa",${directDebt},0))` };
    classLookup.getCell(rowNumber, 11).value = { formula: `IF($B${rowNumber}="","","→ Học phí")` };
    [7, 8, 9, 10].forEach((column) => { classLookup.getCell(rowNumber, column).numFmt = moneyFormat; styleFormulaLink(classLookup.getCell(rowNumber, column)); });
    classLookup.getCell(rowNumber, 11).font = { name: 'Arial', size: 10, color: { argb: COLOR.link }, underline: true, bold: true };
  }
  classLookup.views = [{ state: 'frozen', ySplit: 10 }];
  const lookupDetailColumns = [{ width: 8 }, { width: 16 }, { width: 28 }, { width: 17 }, { width: 18 }, { width: 36 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 22 }, { width: 16 }, { width: 15 }, { width: 18 }];
  lookupDetailColumns.forEach((column, index) => { classLookup.getColumn(index + 1).width = column.width; });
  classLookup.getColumn(13).hidden = true;

  const guide = workbook.addWorksheet('HƯỚNG DẪN');
  styleTitle(guide, 'A1:H2', `${data.centerName.toUpperCase()}\nHƯỚNG DẪN NHẬP VÀ CÔNG THỨC EXCEL`);
  const guideRows = [
    ['1. Nhập học sinh', 'Chèn một dòng ngay phía trên “TỔNG CỘNG” ở sheet HỌC SINH, rồi nhập tối thiểu Mã học sinh, Họ và tên, Mã lớp. Macro tự tạo ID, cập nhật lớp, bảng điểm và mọi hàng tổng; không có giới hạn dòng.'],
    ['2. Thu trực tiếp cùng học sinh', 'Nếu thu ngay khi thêm học sinh, nhập số tiền ở cột “Đã thu nhập trực tiếp”; có thể điền thêm Còn nợ, Khoản thu, Kỳ/Mốc khóa, Ngày thu và Hình thức. Các sheet lớp, TỔNG QUAN và tổng HỌC PHÍ tự cập nhật.'],
    ['3. Nhập phiếu thu chi tiết', 'Chèn một dòng ngay phía trên “TỔNG CỘNG” ở sheet HỌC PHÍ. Nhập Mã phiếu, Mã học sinh, Mã lớp, khoản thu, kỳ học phí, đã thu và công nợ; macro tự tìm ID/Họ tên và cập nhật học sinh, lớp cùng các tổng. Hai cột Học phí tháng/khóa được giữ lại khi đổi khoản thu để còn đối chiếu lịch sử.'],
    ['4. Nhập bảng điểm', 'Ở sheet BẢNG ĐIỂM chỉ nhập/sửa 7 cột: Nghe, Nói, Đọc, Viết, Giữa kỳ, Cuối kỳ, Chuyên cần. Không sửa Mã HS, Họ tên, Mã lớp, Điểm TB hoặc Xếp loại; macro tự tạo danh sách, giữ điểm đã nhập và tính ĐTB/Xếp loại.'],
    ['5. Công thức tổng thu tháng/lớp', "=SUMIFS('HỌC PHÍ'!$L:$L,'HỌC PHÍ'!$F:$F,$A15,'HỌC PHÍ'!$O:$O,\">=\"&D$14,'HỌC PHÍ'!$O:$O,\"<\"&EDATE(D$14,1))+SUMIFS('HỌC SINH'!$M:$M,'HỌC SINH'!$G:$G,$A15,'HỌC SINH'!$Q:$Q,\">=\"&D$14,'HỌC SINH'!$Q:$Q,\"<\"&EDATE(D$14,1))"],
    ['6. Liên kết khi bấm', 'Các ô màu xanh gạch chân và cột “Nguồn công thức” là liên kết: bấm để mở sheet nguồn, tháng/lớp hoặc phiếu thu. Nếu Excel đang bật bảo vệ liên kết, hãy giữ Ctrl rồi bấm.'],
    ['7. Đồng bộ tự động', 'Đây là file .XLSM. Khi mở file, bấm Enable Macros. Sau khoảng 2 giây kể từ khi thêm/sửa/xóa ở HỌC SINH hoặc HỌC PHÍ, hệ thống tự xây lại sheet Lớp, BẢNG ĐIỂM, công nợ và hàng tổng. Không nhập tay lại học sinh ở sheet lớp.'],
    ['8. Đồng bộ về web', 'Khi nhập lại tệp vào website, các khoản “nhập trực tiếp” tại HỌC SINH được tạo thành phiếu thu tự động; các khoản đã có trong HỌC PHÍ vẫn được giữ nguyên. Tệp có mã HS, mã lớp hoặc mã phiếu thu trùng/sai sẽ bị chặn để tránh liên kết nhầm.'],
    ['9. Không làm đứt liên kết', 'Không xóa hay sửa các cột ẩn ID hệ thống/Khóa tự động. Muốn xóa học sinh hoặc phiếu thu, xóa nguyên dòng dữ liệu và chờ macro chạy; hàng TỔNG CỘNG luôn được đặt lại tự động ở cuối danh sách.']
  ];
  guideRows.forEach((values, index) => {
    const row = guide.getRow(4 + index);
    row.values = values;
    styleData(row, index);
    row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } };
  });
  guide.columns = [{ width: 28 }, { width: 120 }];
  guide.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  try {
    const macroBuffer = await injectMacroProject(await workbook.xlsx.writeBuffer());
    return new Blob([macroBuffer], { type: macroEnabledMimeType });
  } catch (macroError) {
    console.warn('Không thể nạp macro XLSM, tự động xuất file XLSX chuẩn:', macroError);
    const standardBuffer = await workbook.xlsx.writeBuffer();
    return new Blob([standardBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
}

const normaliseHeader = (value: unknown) => String(value ?? '').replace(/[Đđ]/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi-VN').replace(/[^a-z0-9]/g, '');
const getByAliases = (record: Record<string, unknown>, aliases: string[]) => Object.entries(record).map(([key, value]) => [normaliseHeader(key), value] as const).find(([key]) => aliases.includes(key))?.[1];
const cellText = (value: unknown) => {
  // ExcelJS represents calculated cells as { formula, result }.  Reading the
  // cached result prevents valid manual values from disappearing on import.
  if (value && typeof value === 'object' && 'formula' in value) return String(('result' in value ? value.result : '') ?? '').trim();
  return String(value ?? '').trim();
};

export function parseExcelImportData(jsonData: Record<string, unknown>[]): ImportValidationResult {
  const validRows: ImportedStudentRow[] = [];
  const errors: ImportValidationResult['errors'] = [];
  jsonData.forEach((item, index) => {
    const row = index + 2;
    const name = cellText(getByAliases(item, ['hovaten', 'hoten', 'name']));
    const code = cellText(getByAliases(item, ['mahocsinh', 'mahs', 'studentcode']));
    if (!name) { errors.push({ row, field: 'Họ và tên', message: 'Họ và tên không được để trống.' }); return; }
    if (!code) { errors.push({ row, field: 'Mã học sinh', message: 'Mã học sinh không được để trống.' }); return; }
    const gender = String(getByAliases(item, ['gioitinh', 'gender']) ?? 'Chưa xác định');
    validRows.push({
      code, name, dob: String(getByAliases(item, ['ngaysinh', 'dob']) ?? ''), gender: gender === 'Nam' || gender === 'Nữ' ? gender : 'Chưa xác định',
      school: String(getByAliases(item, ['truong', 'school']) ?? ''), gradeLevel: String(getByAliases(item, ['khoi', 'gradelevel']) ?? ''), classCode: String(getByAliases(item, ['malop', 'classcode']) ?? ''),
      address: String(getByAliases(item, ['diachi', 'address']) ?? ''), email: String(getByAliases(item, ['email']) ?? ''), phone: String(getByAliases(item, ['sdthocsinh', 'sdt', 'phone']) ?? ''),
      parentName: String(getByAliases(item, ['tenphuhuynh', 'parentname']) ?? ''), parentPhone: String(getByAliases(item, ['sdtphuhuynh', 'parentphone']) ?? '')
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
      if (normalised.includes('mahocsinh') && (normalised.includes('hovaten') || normalised.includes('hoten'))) { headerRow = rowNumber; headers = candidate; break; }
    }
    if (!headerRow) return;
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const rowValues = sheet.getRow(rowNumber).values;
      const values = Array.isArray(rowValues) ? rowValues.slice(1) : [];
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
      const code = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
      const name = cellText(getByAliases(record, ['hovaten', 'hoten', 'name']));
      if (!code && !name) continue;
      rows.push(record);
    }
  });
  return rows.length ? parseExcelImportData(rows) : { validRows: [], errors: [{ row: 0, field: 'Tệp Excel', message: 'Không tìm thấy sheet có cột “Mã học sinh” và “Họ và tên”.' }] };
}

const readRecords = (sheet: ExcelJS.Worksheet, requiredHeaders: string[]) => {
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

const numberValue = (value: unknown) => {
  if (typeof value === 'number') return value;
  const parsed = Number(cellText(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const duplicatedValues = (values: string[]) => {
  const seen = new Set<string>();
  return [...new Set(values.filter(Boolean).filter((value) => {
    const key = value.trim().toLocaleUpperCase('vi-VN');
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  }))];
};

const isoDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const text = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : new Date().toISOString().slice(0, 10);
};

const statusFromLabel = (value: unknown): Student['status'] => {
  const label = cellText(value).toLocaleLowerCase('vi-VN');
  if (label.includes('bảo')) return 'reserved';
  if (label.includes('nghỉ')) return 'dropped';
  return 'active';
};

interface MasterDirectPaymentInput {
  paidAmount: number;
  debtAmount: number;
  paymentKind: TuitionReceipt['paymentKind'];
  billingPeriod: string;
  paymentDate: string;
  paymentMethod: TuitionReceipt['paymentMethod'];
}

const paymentMethodFromCell = (value: unknown): TuitionReceipt['paymentMethod'] => {
  const method = cellText(value);
  return method === 'Tiền mặt' || method === 'Chuyển khoản' || method === 'Thẻ' ? method : 'Chưa xác định';
};

export async function parseCenterWorkbookFile(file: File): Promise<CenterWorkbookImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const classMaster = workbook.getWorksheet('LỚP HỌC');
  const tuitionSheet = workbook.getWorksheet('HỌC PHÍ');
  if (!classMaster || !tuitionSheet) {
    return { errors: [{ row: 0, field: 'Tệp Excel', message: 'Đây không phải báo cáo đã chuẩn hoá. Hãy dùng file “...DaChuanHoa.xlsx” được tạo từ hệ thống.' }] };
  }

  const classRecords = readRecords(classMaster, ['malop', 'tenlop']);
  if (!classRecords.length) {
    return { errors: [{ row: 0, field: 'LỚP HỌC', message: 'Không tìm thấy lớp hợp lệ trong báo cáo.' }] };
  }

  const teacherNames = new Set<string>();
  const roomNames = new Set<string>();
  const importedClasses = classRecords.map((record, index) => {
    const code = cellText(getByAliases(record, ['malop', 'classcode']));
    const name = cellText(getByAliases(record, ['tenlop', 'classname']));
    const programName = cellText(getByAliases(record, ['chuongtrinh', 'program', 'programname']));
    const teacherName = cellText(getByAliases(record, ['giaovien', 'teacher']));
    const roomName = cellText(getByAliases(record, ['phong', 'room']));
    const schedule = cellText(getByAliases(record, ['lichhoc', 'schedule']));
    const timeMatch = schedule.match(/\(([^)]+)\)\s*$/);
    const individualSlots = [...schedule.matchAll(/(Thứ [2-7]|Chủ Nhật)\s*:\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g)];
    const days = individualSlots.length
      ? individualSlots.map((match) => match[1])
      : (timeMatch ? schedule.slice(0, timeMatch.index).trim() : schedule).split(',').map((item) => item.trim()).filter(Boolean);
    if (teacherName && !teacherName.toLocaleLowerCase('vi-VN').includes('chưa')) teacherNames.add(teacherName);
    if (roomName && !roomName.toLocaleLowerCase('vi-VN').includes('chưa')) roomNames.add(roomName);
    return { id: `CLASS-IMP-${String(index + 1).padStart(2, '0')}`, code, name, programName, teacherName, roomName, days, scheduleTime: individualSlots.length ? schedule : (timeMatch?.[1] || ''), capacity: numberValue(getByAliases(record, ['succhua', 'capacity'])), studentIds: [] as string[] };
  }).filter((item) => item.code && item.name);

  const teacherMaster = workbook.getWorksheet('GIÁO VIÊN');
  const teacherRecords = teacherMaster ? readRecords(teacherMaster, ['magiaovien', 'hovaten']) : [];
  const teachers: Teacher[] = [];
  if (teacherRecords.length > 0) {
    teacherRecords.forEach((record, index) => {
      const name = cellText(getByAliases(record, ['hovaten', 'hoten', 'name']));
      if (!name) return;
      teachers.push({
        id: cellText(getByAliases(record, ['magiaovien', 'magv', 'teacherid'])) || `TEACHER-IMP-${String(index + 1).padStart(2, '0')}`,
        name,
        phone: cellText(getByAliases(record, ['sdt', 'phone', 'sodienthoai'])),
        email: cellText(getByAliases(record, ['email'])),
        address: cellText(getByAliases(record, ['diachi', 'address'])),
        specialty: cellText(getByAliases(record, ['chuyenmon', 'specialty'])),
        assignedClassIds: [],
        notes: cellText(getByAliases(record, ['ghichu', 'notes'])) || 'Nhập từ sheet GIÁO VIÊN.'
      });
    });
  }
  teacherNames.forEach((name) => {
    if (!teachers.some((t) => t.name.toLocaleLowerCase('vi-VN') === name.toLocaleLowerCase('vi-VN'))) {
      teachers.push({
        id: `TEACHER-IMP-${String(teachers.length + 1).padStart(2, '0')}`,
        name,
        phone: '',
        email: '',
        address: '',
        specialty: '',
        assignedClassIds: [],
        notes: 'Nhập từ báo cáo Excel.'
      });
    }
  });
  const rooms: Room[] = [...roomNames].map((name, index) => ({
    id: `ROOM-IMP-${String(index + 1).padStart(2, '0')}`,
    name, capacity: 0, status: 'available', notes: 'Sức chứa chưa được nhập từ báo cáo.'
  }));
  const programs: CourseProgram[] = [];
  const ensureProgram = (rawName: string) => {
    const name = rawName.trim() || 'Chương trình nhập từ Excel';
    const existing = programs.find((program) => program.name.toLocaleLowerCase('vi-VN') === name.toLocaleLowerCase('vi-VN'));
    if (existing) return existing;
    const program: CourseProgram = {
      id: `PROG-IMP-${String(programs.length + 1).padStart(3, '0')}`,
      code: `IMP-${String(programs.length + 1).padStart(3, '0')}`,
      name,
      category: 'Khác',
      tuitionFee: 0,
      description: 'Nhập từ báo cáo Excel.',
    };
    programs.push(program);
    return program;
  };
  const classes: ClassRoom[] = importedClasses.map(({ teacherName, roomName, programName, ...classroom }) => ({
    ...classroom,
    programId: ensureProgram(programName).id,
    teacherId: teachers.find((teacher) => teacher.name === teacherName)?.id || '',
    roomId: rooms.find((room) => room.name === roomName)?.id || ''
  }));
  const duplicateClassCodes = duplicatedValues(classes.map((classroom) => classroom.code));
  if (duplicateClassCodes.length > 0) {
    return { errors: [{ row: 0, field: 'Mã lớp', message: `Trùng mã lớp: ${duplicateClassCodes.join(', ')}. Mỗi lớp phải có một mã duy nhất trước khi nhập.` }] };
  }
  teachers.forEach((teacher) => { teacher.assignedClassIds = classes.filter((classroom) => classroom.teacherId === teacher.id).map((classroom) => classroom.id); });

  const students: Student[] = [];
  const masterDirectPayments = new Map<string, MasterDirectPaymentInput>();
  const masterStudentsSheet = workbook.getWorksheet('HỌC SINH');
  if (masterStudentsSheet) {
    const masterRecords = readRecords(masterStudentsSheet, ['mahocsinh', 'hovaten']);
    masterRecords.forEach((record, index) => {
      const code = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
      const name = cellText(getByAliases(record, ['hovaten', 'hoten', 'name']));
      const rawClassCode = cellText(getByAliases(record, ['malop', 'classcode']));
      if (!code || !name) return;

      const classCodes = rawClassCode.split(/[,;/|]+/).map((s) => s.trim()).filter(Boolean);
      const matchedClasses = classCodes
        .map((cCode) => classes.find((item) => item.code.toLocaleLowerCase('vi-VN') === cCode.toLocaleLowerCase('vi-VN') || item.name.toLocaleLowerCase('vi-VN') === cCode.toLocaleLowerCase('vi-VN')))
        .filter((item): item is ClassRoom => Boolean(item));
      const classroom = matchedClasses[0];
      if (!classroom) return;

      const programName = cellText(getByAliases(record, ['chuongtrinh', 'program', 'programname']));
      const program = programName ? ensureProgram(programName) : null;
      if (program) classroom.programId = program.id;
      const id = cellText(getByAliases(record, ['idhethong', 'systemid'])) || `STU-IMP-MASTER-${String(index + 1).padStart(3, '0')}`;

      // Nếu học sinh đã tồn tại (ví dụ danh sách có dòng cho lớp 1 và dòng cho lớp 2)
      const existingStudent = students.find((s) => s.id === id || s.code === code);
      if (existingStudent) {
        matchedClasses.forEach((cls) => {
          if (cls.id !== existingStudent.classId) {
            existingStudent.extraClassIds = Array.from(new Set([...(existingStudent.extraClassIds || []), cls.id]));
          }
          if (!cls.studentIds.includes(existingStudent.id)) {
            cls.studentIds.push(existingStudent.id);
          }
        });
        return;
      }

      const extraClassIds = matchedClasses.slice(1).map((cls) => cls.id);
      students.push({
        id, code, name,
        dob: cellText(getByAliases(record, ['ngaysinh', 'dob'])),
        gender: cellText(getByAliases(record, ['gioitinh', 'gender'])) === 'Nam' ? 'Nam' : (cellText(getByAliases(record, ['gioitinh', 'gender'])) === 'Nữ' ? 'Nữ' : 'Chưa xác định'),
        school: '', gradeLevel: '', programId: program?.id || classroom.programId, classId: classroom.id,
        extraClassIds,
        address: cellText(getByAliases(record, ['diachi', 'address'])), email: '',
        phone: cellText(getByAliases(record, ['sdthocsinh', 'phone'])), parentName: '',
        parentPhone: cellText(getByAliases(record, ['sdtphuhuynh', 'parentphone'])), enrollDate: '', notes: cellText(getByAliases(record, ['ghichu', 'notes'])),
        status: statusFromLabel(getByAliases(record, ['trangthai', 'status'])), feeStatus: 'unpaid',
      });
      const directPaidAmount = numberValue(getByAliases(record, ['dathunhaptructiepvnd', 'dathunhaptructiep', 'quickpaid']));
      const directDebtAmount = numberValue(getByAliases(record, ['connonhaptructiepvnd', 'connonhaptructiep', 'quickdebt']));
      if (directPaidAmount > 0 || directDebtAmount > 0) {
        const directKindLabel = cellText(getByAliases(record, ['khoanthunhaptructiep', 'khoanthu', 'quickpaymentkind'])).toLocaleLowerCase('vi-VN');
        const paymentKind: TuitionReceipt['paymentKind'] = directKindLabel.includes('khóa') ? 'course' : 'monthly';
        const paymentDate = isoDate(getByAliases(record, ['ngaythunhaptructiep', 'quickpaymentdate']));
        const suppliedPeriod = cellText(getByAliases(record, ['kyhocphimockhoa', 'quickbillingperiod']));
        masterDirectPayments.set(id, {
          paidAmount: directPaidAmount,
          debtAmount: directDebtAmount,
          paymentKind,
          billingPeriod: suppliedPeriod || (paymentKind === 'course' ? `Khóa ${monthKey(paymentDate)}` : monthKey(paymentDate)),
          paymentDate,
          paymentMethod: paymentMethodFromCell(getByAliases(record, ['hinhthucnhaptructiep', 'quickpaymentmethod']))
        });
      }
      matchedClasses.forEach((cls) => {
        if (!cls.studentIds.includes(id)) {
          cls.studentIds.push(id);
        }
      });
    });
  }

  if (!students.length) for (const classroom of classes) {
    const detailSheet = workbook.getWorksheet(classSheetName(classroom));
    if (!detailSheet) continue;
    const records = readRecords(detailSheet, ['mahocsinh', 'hovaten']);
    records.forEach((record, index) => {
      const id = cellText(getByAliases(record, ['idhethong', 'systemid'])) || `STU-IMP-${classroom.id}-${String(index + 1).padStart(3, '0')}`;
      const code = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
      const name = cellText(getByAliases(record, ['hovaten', 'hoten', 'name']));
      if (!code || !name) return;
      students.push({
        id, code, name,
        dob: '', gender: 'Chưa xác định', school: '', gradeLevel: '', programId: classroom.programId, classId: classroom.id,
        address: cellText(getByAliases(record, ['diachi', 'address'])), email: '',
        phone: cellText(getByAliases(record, ['sdthocsinh', 'phone'])), parentName: '',
        parentPhone: cellText(getByAliases(record, ['sdtphuhuynh', 'parentphone'])), enrollDate: '', notes: 'Nhập từ báo cáo Excel.',
        status: statusFromLabel(getByAliases(record, ['trangthai', 'status'])), feeStatus: 'unpaid'
      });
      classroom.studentIds.push(id);
    });
  }
  if (!students.length) {
    return { errors: [{ row: 0, field: 'Sheet lớp', message: 'Không đọc được danh sách học sinh từ các sheet lớp.' }] };
  }

  const duplicateStudentCodes = duplicatedValues(students.map((student) => student.code));
  const duplicateStudentIds = duplicatedValues(students.map((student) => student.id));
  if (duplicateStudentCodes.length > 0 || duplicateStudentIds.length > 0) {
    const details = [
      duplicateStudentCodes.length > 0 ? `mã học sinh: ${duplicateStudentCodes.join(', ')}` : '',
      duplicateStudentIds.length > 0 ? `ID hệ thống: ${duplicateStudentIds.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    return { errors: [{ row: 0, field: 'HỌC SINH', message: `Phát hiện dữ liệu trùng (${details}). Hãy sửa trùng lặp trước khi nhập để học phí và lớp không liên kết nhầm.` }] };
  }

  const studentIds = new Set(students.map((student) => student.id));
  const tuitionRecords = readRecords(tuitionSheet, ['maphieu']);
  const invalidTuitionReferences = tuitionRecords.filter((record) => {
    const suppliedStudentId = cellText(getByAliases(record, ['idhethong', 'systemid']));
    const suppliedStudentCode = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
    return Boolean(suppliedStudentId || suppliedStudentCode)
      && !students.some((student) => student.id === suppliedStudentId || student.code === suppliedStudentCode);
  });
  if (invalidTuitionReferences.length > 0) {
    return { errors: [{ row: 0, field: 'HỌC PHÍ', message: `${invalidTuitionReferences.length} phiếu thu không khớp Mã HS / ID hệ thống. Đã dừng nhập để không làm mất hoặc gán nhầm học phí.` }] };
  }
  const receipts: TuitionReceipt[] = tuitionRecords.map((record, index) => {
    const suppliedStudentId = cellText(getByAliases(record, ['idhethong', 'systemid']));
    const suppliedStudentCode = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
    // A workbook user only needs to enter the student code. The system ID is
    // an optional technical key, so a new HỌC PHÍ row remains linked on import.
    const student = students.find((item) => item.id === suppliedStudentId || item.code === suppliedStudentCode);
    const studentId = student?.id || suppliedStudentId;
    const paidAmount = numberValue(getByAliases(record, ['dathuvnd', 'dathu', 'paidamount']));
    const debtAmount = numberValue(getByAliases(record, ['congnovnd', 'congno', 'debtamount']));
    const paymentKindLabel = cellText(getByAliases(record, ['khoanthu', 'paymentkind'])).toLocaleLowerCase('vi-VN');
    const paymentKind: TuitionReceipt['paymentKind'] = paymentKindLabel.includes('khóa') ? 'course' : 'monthly';
    const discount = numberValue(getByAliases(record, ['giamgiavnd', 'giamgia', 'discount']));
    const rawCourseFee = numberValue(getByAliases(record, ['hocphikhoavnd', 'hocphikhoa', 'coursefee']));
    const rawMonthlyFee = numberValue(getByAliases(record, ['hocphithangvnd', 'hocphithang', 'monthlyfee']));
    // The inactive price is intentional audit context when a receipt is
    // reclassified. Keep both columns exactly as the workbook provides; the
    // selected payment kind alone controls revenue/debt categorisation.
    const courseFee = paymentKind === 'course'
      ? (rawCourseFee || (paidAmount + debtAmount + discount))
      : rawCourseFee;
    const monthlyFee = paymentKind === 'monthly'
      ? (rawMonthlyFee || (paidAmount + debtAmount + discount))
      : rawMonthlyFee;
    const rawBillingPeriod = cellText(getByAliases(record, ['kyhocphi', 'billingperiod', 'period'])).trim();
    const billingPeriod = paymentKind === 'course'
      ? (rawBillingPeriod || `Khóa ${monthKey(isoDate(getByAliases(record, ['ngaythu', 'paymentdate'])))}`)
      : (/^\d{4}-\d{2}$/.test(rawBillingPeriod)
        ? rawBillingPeriod
        : monthKey(isoDate(rawBillingPeriod || getByAliases(record, ['ngaythu', 'paymentdate']))));
    const receiptStatus: TuitionReceipt['status'] = debtAmount > 0 ? (paidAmount > 0 ? 'partial' : 'debt') : (paidAmount > 0 ? 'paid' : 'unpaid');
    const paymentMethod = cellText(getByAliases(record, ['hinhthuc', 'paymentmethod']));
    const normalizedPaymentMethod: TuitionReceipt['paymentMethod'] = paymentMethod === 'Tiền mặt' || paymentMethod === 'Chuyển khoản' || paymentMethod === 'Thẻ' ? paymentMethod : 'Chưa xác định';
    const receiptClassCode = cellText(getByAliases(record, ['malop', 'classcode'])).toLocaleLowerCase('vi-VN');
    const matchedReceiptClass = classes.find((classroom) => classroom.code.toLocaleLowerCase('vi-VN') === receiptClassCode);
    const targetClassId = matchedReceiptClass?.id || student?.classId || '';
    if (student && targetClassId && targetClassId !== student.classId) {
      student.extraClassIds = Array.from(new Set([...(student.extraClassIds || []), targetClassId]));
      if (matchedReceiptClass && !matchedReceiptClass.studentIds.includes(student.id)) {
        matchedReceiptClass.studentIds.push(student.id);
      }
    }
    return {
      id: `RCPT-IMP-${String(index + 1).padStart(3, '0')}`,
      code: cellText(getByAliases(record, ['maphieu', 'receiptcode'])) || `IMP-${index + 1}`,
      studentId,
      classId: targetClassId,
      courseFee,
      monthlyFee,
      paymentKind,
      billingPeriod,
      discount,
      paidAmount,
      debtAmount,
      status: receiptStatus,
      paymentDate: isoDate(getByAliases(record, ['ngaythu', 'paymentdate'])),
      collectorName: '',
      paymentMethod: normalizedPaymentMethod,
      notes: cellText(getByAliases(record, ['ghichu', 'notes']))
    };
  }).filter((receipt) => studentIds.has(receipt.studentId));
  const duplicateReceiptCodes = duplicatedValues(receipts.map((receipt) => receipt.code));
  if (duplicateReceiptCodes.length > 0) {
    return { errors: [{ row: 0, field: 'Mã phiếu thu', message: `Trùng mã phiếu thu: ${duplicateReceiptCodes.join(', ')}. Mỗi phiếu thu phải có một mã duy nhất.` }] };
  }
  masterDirectPayments.forEach((directPayment, studentId) => {
    const student = students.find((item) => item.id === studentId);
    if (!student) return;
    const totalDue = directPayment.paidAmount + directPayment.debtAmount;
    receipts.push({
      id: `RCPT-IMP-DIRECT-${studentId}`,
      code: `NHAP-HS-${student.code}`,
      studentId,
      classId: student.classId,
      courseFee: directPayment.paymentKind === 'course' ? totalDue : 0,
      monthlyFee: directPayment.paymentKind === 'monthly' ? totalDue : 0,
      paymentKind: directPayment.paymentKind,
      billingPeriod: directPayment.billingPeriod,
      discount: 0,
      paidAmount: directPayment.paidAmount,
      debtAmount: directPayment.debtAmount,
      status: directPayment.debtAmount > 0 ? (directPayment.paidAmount > 0 ? 'partial' : 'debt') : 'paid',
      paymentDate: directPayment.paymentDate,
      collectorName: 'Nhập từ Excel',
      paymentMethod: directPayment.paymentMethod,
      notes: 'Khoản thu nhập trực tiếp tại sheet HỌC SINH.'
    });
  });
  students.forEach((student) => {
    const studentReceipts = receipts.filter((receipt) => receipt.studentId === student.id);
    const debt = studentReceipts.reduce((sum, receipt) => sum + receipt.debtAmount, 0);
    const paid = studentReceipts.reduce((sum, receipt) => sum + receipt.paidAmount, 0);
    student.feeStatus = debt > 0 ? (paid > 0 ? 'partial' : 'debt') : (paid > 0 ? 'paid' : 'unpaid');
  });

  const grades: Grade[] = [];
  const gradesSheet = workbook.getWorksheet('BẢNG ĐIỂM');
  if (gradesSheet) {
    const gradeRecords = readRecords(gradesSheet, ['mahocsinh', 'malop']);
    gradeRecords.forEach((record, index) => {
      const studentCode = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
      const classCode = cellText(getByAliases(record, ['malop', 'classcode']));
      const matchedClass = classCode ? classes.find((c) => c.code.toLocaleLowerCase('vi-VN') === classCode.toLocaleLowerCase('vi-VN')) : null;
      const student = students.find((item) => item.code === studentCode && (!matchedClass || isStudentInClass(item, matchedClass.id, matchedClass)));
      if (!student) return;

      const rawScores = [
        getByAliases(record, ['nghe', 'listening']),
        getByAliases(record, ['noi', 'speaking']),
        getByAliases(record, ['doc', 'reading']),
        getByAliases(record, ['viet', 'writing']),
        getByAliases(record, ['giuaky', 'midterm']),
        getByAliases(record, ['cuoiky', 'finalexam', 'final']),
        getByAliases(record, ['chuyencan', 'attendance']),
      ];
      const rawAverage = getByAliases(record, ['diemtb', 'diemtrungbinh', 'average']);
      // Every student has a row in the generated grade sheet.  Preserve only
      // rows that actually contain a grade, so blank rows do not become fake
      // zero-score records after an import.
      if (![...rawScores, rawAverage].some((value) => cellText(value) !== '')) return;

      const [listening, speaking, reading, writing, midterm, finalExam, attendance] = rawScores.map(numberValue);
      const calculatedAverage = Math.round(((((listening + speaking + reading + writing) / 4) * 0.4) + (midterm * 0.2) + (finalExam * 0.3) + (attendance * 0.1)) * 10) / 10;
      const suppliedAverage = cellText(rawAverage);
      grades.push({
        id: `GRADE-IMP-${student.id}-${matchedClass?.id || student.classId}`,
        studentId: student.id,
        classId: matchedClass?.id || student.classId,
        listening,
        speaking,
        reading,
        writing,
        midterm,
        finalExam,
        attendance,
        average: suppliedAverage === '' ? calculatedAverage : numberValue(rawAverage),
      });
    });
  }
  const timetableSlots = classes.flatMap((classroom) => {
    const individualSlots = [...classroom.scheduleTime.matchAll(/(Thứ [2-7]|Chủ Nhật)\s*:\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g)];
    if (individualSlots.length) return individualSlots.map((match, index) => ({ id: `SLOT-IMP-${classroom.id}-${index + 1}`, classId: classroom.id, teacherId: classroom.teacherId, roomId: classroom.roomId, dayOfWeek: match[1], startTime: match[2], endTime: match[3] }));
    const [startTime = '', endTime = ''] = classroom.scheduleTime.split('-').map((item) => item.trim());
    return classroom.days.map((dayOfWeek, index) => ({ id: `SLOT-IMP-${classroom.id}-${index + 1}`, classId: classroom.id, teacherId: classroom.teacherId, roomId: classroom.roomId, dayOfWeek, startTime, endTime }));
  });
  return { data: { programs, teachers, rooms, classes, students, timetableSlots, grades, receipts }, errors: [] };
}
