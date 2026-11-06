import {
  masterStudentClassKeyFormula,
  masterStudentPaymentFormulas,
  receiptSumByStudentCodeAndIdFormula,
} from '../formulas';
import {
  applyBackLink,
  COLOR,
  moneyFormat,
  STUDENT_DATA_START_ROW,
  studentStatusLabel,
  styleData,
  styleFormulaLink,
  styleHeader,
  styleTitle,
  writeFooter,
} from '../styles';

import type { ExportContext } from '../exportContext';
export function writeStudentSheet(context: ExportContext) {
  const { data, workbook, classSheetNames, classById, programById, studentSheetRowById } = context;
  const studentsSheet = workbook.addWorksheet('HỌC SINH');
  styleTitle(studentsSheet, 'A1:AN2', `${data.centerName.toUpperCase()}\nDANH SÁCH HỌC SINH`);
  applyBackLink(studentsSheet, 'AN');
  studentsSheet.mergeCells('A4:AN4');
  studentsSheet.getCell('A4').value =
    'Nhập học sinh tại các dòng trống ngay trên TỔNG CỘNG; khoản thu trực tiếp ở cột nền vàng M–R. Tổng/Còn lại và sheet lớp tự liên kết theo ID hệ thống.';
  studentsSheet.getCell('A4').font = {
    name: 'Arial',
    size: 9.5,
    italic: true,
    color: { argb: '7C2D12' },
  };
  studentsSheet.getCell('A4').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFBEB' },
  };
  studentsSheet.getCell('A4').alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };
  studentsSheet.getRow(4).height = 26;
  const studentHeaders = [
    'STT',
    'Mã học sinh',
    'Họ và tên',
    'Giới tính',
    'Ngày sinh',
    'Chương trình',
    'Mã lớp',
    'SĐT học sinh',
    'SĐT phụ huynh',
    'Địa chỉ',
    'Trạng thái',
    'Ghi chú',
    'Đã thu nhập trực tiếp (VNĐ)',
    'Còn lại nhập trực tiếp (VNĐ)',
    'Khoản thu nhập trực tiếp',
    'Kỳ học phí / Mốc khóa',
    'Ngày thu nhập trực tiếp',
    'Hình thức nhập trực tiếp',
    'Tổng đã thu (VNĐ)',
    'Tổng còn lại (VNĐ)',
    'Còn lại học phí tháng (VNĐ)',
    'Còn lại học phí khóa (VNĐ)',
    'ID hệ thống',
    'Khóa lớp tự động',
    'Khóa học sinh/lớp tự động',
    'Còn lại học phí buổi (VNĐ)',
    'Mã lớp học thêm',
    'Phụ huynh',
    'Trường học',
    'Khối lớp',
    'Bí danh',
    'Cấp tài khoản',
    'Mã học viên theo lớp',
    'Hồ sơ đồng ý phụ huynh',
    'Ngày ghi nhận đồng ý',
    'Hình thức đồng ý',
    'Người đại diện xác nhận',
    'Mã tham chiếu bằng chứng',
    'Ngày rút lại đồng ý',
    'Ghi chú đồng ý',
  ];
  studentsSheet.getRow(5).values = studentHeaders;
  styleHeader(studentsSheet.getRow(5));
  data.students.forEach((student, index) => {
    const rowNumber = 6 + index;
    const classroom = classById.get(student.classId);
    const row = studentsSheet.getRow(rowNumber);
    const classLink = classroom ? `#'${classSheetNames.get(classroom.id)}'!A1` : undefined;
    row.values = [
      index + 1,
      student.code,
      student.name,
      student.gender,
      student.dob,
      programById.get(student.programId)?.name || student.programId,
      classLink ? { text: classroom?.code || '', hyperlink: classLink } : classroom?.code || '',
      student.phone,
      student.parentPhone,
      student.address,
      studentStatusLabel(student.status),
      student.notes || '',
      0,
      0,
      '',
      '',
      '',
      '',
      ...masterStudentPaymentFormulas(rowNumber),
      student.id,
      {
        formula: `IF($G${rowNumber}="","",$G${rowNumber}&"|"&COUNTIF($G$${STUDENT_DATA_START_ROW}:$G${rowNumber},$G${rowNumber}))`,
      },
      { formula: masterStudentClassKeyFormula(rowNumber) },
      {
        formula: `${receiptSumByStudentCodeAndIdFormula('M', `$B${rowNumber}`, `$W${rowNumber}`, 'session')}+SUMIF('BUỔI CHƯA THU'!$D:$D,$B${rowNumber},'BUỔI CHƯA THU'!$G:$G)`,
      },
      student.additionalClassIds?.length ? JSON.stringify(student.additionalClassIds.map(id => classById.get(id)?.code || id)) : '',
      student.parentName,
      student.school,
      student.gradeLevel,
      student.nickname || '',
      student.accountStatus || '',
      Object.keys(student.classStudentCodes || {}).length
        ? JSON.stringify(Object.fromEntries(Object.entries(student.classStudentCodes || {}).map(([classId, code]) => [classById.get(classId)?.code || classId, code])))
        : '',
      student.guardianConsent?.status === 'confirmed'
        ? 'Đã xác nhận'
        : student.guardianConsent?.status === 'withdrawn'
          ? 'Đã rút lại'
          : '',
      student.guardianConsent?.recordedAt || '',
      student.guardianConsent?.method === 'paper'
        ? 'Văn bản giấy'
        : student.guardianConsent?.method === 'electronic'
          ? 'Xác nhận điện tử'
          : student.guardianConsent?.method === 'other'
            ? 'Hình thức khác'
            : '',
      student.guardianConsent?.representativeName || '',
      student.guardianConsent?.evidenceReference || '',
      student.guardianConsent?.withdrawnAt || '',
      student.guardianConsent?.note || '',
    ];
    styleData(row, index);
    [13, 14, 19, 20, 21, 22].forEach((column) => {
      row.getCell(column).numFmt = moneyFormat;
    });
    [19, 20, 21, 22].forEach((column) => styleFormulaLink(row.getCell(column)));
    [13, 14, 15, 16, 17, 18].forEach((column) => {
      row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
    });
    row.getCell(17).numFmt = 'dd/mm/yyyy';
    if (classLink)
      row.getCell(7).font = {
        name: 'Arial',
        size: 10,
        color: { argb: COLOR.link },
        underline: true,
        bold: true,
      };
    studentSheetRowById.set(student.id, rowNumber);
  });
  const studentFooterRow = 6 + data.students.length;
  writeFooter(studentsSheet, studentFooterRow, studentHeaders.length, {
    3: `COUNTA(B${STUDENT_DATA_START_ROW}:B${studentFooterRow - 1})`,
    19: `SUM(S${STUDENT_DATA_START_ROW}:S${studentFooterRow - 1})`,
    20: `SUM(T${STUDENT_DATA_START_ROW}:T${studentFooterRow - 1})`,
    21: `SUM(U${STUDENT_DATA_START_ROW}:U${studentFooterRow - 1})`,
    22: `SUM(V${STUDENT_DATA_START_ROW}:V${studentFooterRow - 1})`,
  });
  [19, 20, 21, 22].forEach((column) => {
    studentsSheet.getCell(studentFooterRow, column).numFmt = moneyFormat;
  });
  studentsSheet.autoFilter = { from: 'A5', to: `AN${studentFooterRow - 1}` };
  studentsSheet.views = [{ state: 'frozen', ySplit: 5 }];
  studentsSheet.columns = [
    { width: 8 },
    { width: 16 },
    { width: 28 },
    { width: 18 },
    { width: 14 },
    { width: 20 },
    { width: 18 },
    { width: 17 },
    { width: 18 },
    { width: 35 },
    { width: 15 },
    { width: 42 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 24 },
    { width: 18 },
    { width: 22 },
    { width: 20 },
    { width: 20 },
    { width: 22 },
    { width: 22 },
    { width: 18 },
    { width: 22 },
    { width: 28 },
    { width: 24 },
    { width: 36 },
    { width: 24 },
    { width: 24 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 28 },
    { width: 24 },
    { width: 20 },
    { width: 20 },
    { width: 28 },
    { width: 30 },
    { width: 20 },
    { width: 40 },
  ];
  studentsSheet.getColumn(23).hidden = true;
  studentsSheet.getColumn(24).hidden = true;
  studentsSheet.getColumn(25).hidden = true;
  studentsSheet.getColumn(26).width = 24;
  studentsSheet.getColumn(27).width = 36;
  studentsSheet.getColumn(26).numFmt = moneyFormat;
  studentsSheet.getColumn(33).hidden = true;
  studentsSheet.getColumn(35).numFmt = 'dd/mm/yyyy';
  studentsSheet.getColumn(39).numFmt = 'dd/mm/yyyy';
  studentsSheet.getCell(studentFooterRow, 26).value = {
    formula: `SUM(Z${STUDENT_DATA_START_ROW}:Z${studentFooterRow - 1})`,
  };
}
