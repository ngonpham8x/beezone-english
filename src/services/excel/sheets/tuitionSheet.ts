import { formulaText } from '../formulas';
import {
  applyBackLink,
  COLOR,
  dateFromIso,
  moneyFormat,
  receiptMonth,
  STUDENT_DATA_START_ROW,
  STUDENT_DYNAMIC_LAST_ROW,
  styleData,
  styleHeader,
  styleTitle,
  writeFooter,
} from '../styles';

import { paymentKindLabel, paymentMethodLabel } from '../../../lib/tuition';
import type { ExportContext } from '../exportContext';
export function writeTuitionSheet(context: ExportContext) {
  const {
    data,
    workbook,
    classSheetNames,
    classById,
    studentById,
    orderedReceipts,
    studentSheetRowById,
  } = context;
  const tuitionSheet = workbook.addWorksheet('HỌC PHÍ');
  styleTitle(tuitionSheet, 'A1:U2', `${data.centerName.toUpperCase()}\nSỔ THU HỌC PHÍ`);
  applyBackLink(tuitionSheet, 'U');
  const tuitionHeaders = [
    'STT',
    'Mã phiếu',
    'ID hệ thống',
    'Mã học sinh',
    'Họ và tên',
    'Mã lớp',
    'Học phí khóa (VNĐ)',
    'Học phí tháng (VNĐ)',
    'Khoản thu',
    'Kỳ học phí',
    'Giảm giá (VNĐ)',
    'Đã thu (VNĐ)',
    'Công nợ (VNĐ)',
    'Tình trạng',
    'Ngày thu',
    'Hình thức',
    'Ghi chú',
    'Hồ sơ học sinh',
    'Lớp chi tiết',
    'Người thu',
    'Hạn thanh toán',
    'Học phí buổi (VNĐ)',
    'Chi tiết buổi JSON',
  ];
  tuitionSheet.getRow(5).values = tuitionHeaders;
  styleHeader(tuitionSheet.getRow(5));
  orderedReceipts.forEach((receipt, index) => {
    const student = studentById.get(receipt.studentId);
    const classroom = classById.get(receipt.classId);
    const rowNumber = 6 + index;
    const row = tuitionSheet.getRow(rowNumber);
    const studentRow = studentSheetRowById.get(receipt.studentId);
    const studentLink = studentRow
      ? { text: '→ Học sinh', hyperlink: `#'HỌC SINH'!A${studentRow}` }
      : '—';
    const classLink = classroom
      ? { text: `→ ${classroom.code}`, hyperlink: `#'${classSheetNames.get(classroom.id)}'!A1` }
      : '—';
    const period = receipt.billingPeriod || receiptMonth(receipt);
    const isMonthlyReceipt = receipt.paymentKind !== 'course' && receipt.paymentKind !== 'session';
    const periodValue =
      isMonthlyReceipt && /^\d{4}-\d{2}$/.test(period) ? dateFromIso(`${period}-01`) : period;
    const systemIdFormula = `IF($D${rowNumber}="","",IFERROR(INDEX('HỌC SINH'!$W$${STUDENT_DATA_START_ROW}:$W$${STUDENT_DYNAMIC_LAST_ROW},MATCH($D${rowNumber},'HỌC SINH'!$B$${STUDENT_DATA_START_ROW}:$B$${STUDENT_DYNAMIC_LAST_ROW},0)),"${receipt.studentId}"))`;
    const studentNameFormula = `IF($D${rowNumber}="","",IFERROR(INDEX('HỌC SINH'!$C$${STUDENT_DATA_START_ROW}:$C$${STUDENT_DYNAMIC_LAST_ROW},MATCH($D${rowNumber},'HỌC SINH'!$B$${STUDENT_DATA_START_ROW}:$B$${STUDENT_DYNAMIC_LAST_ROW},0)),"${formulaText(student?.name || '')}"))`;
    const classCodeFormula = `IF($D${rowNumber}="","",IFERROR(INDEX('HỌC SINH'!$G$${STUDENT_DATA_START_ROW}:$G$${STUDENT_DYNAMIC_LAST_ROW},MATCH($D${rowNumber},'HỌC SINH'!$B$${STUDENT_DATA_START_ROW}:$B$${STUDENT_DYNAMIC_LAST_ROW},0)),"${formulaText(classroom?.code || '')}"))`;
    const statusFormula = `IF($M${rowNumber}<=0,IF($L${rowNumber}>0,"Đã đóng đủ","Chưa đóng"),IF($L${rowNumber}>0,"Đóng thiếu","Chưa đóng"))`;
    row.values = [
      index + 1,
      receipt.code,
      { formula: systemIdFormula, result: receipt.studentId },
      student?.code || '',
      { formula: studentNameFormula, result: student?.name || '' },
      classroom?.code || '',
      receipt.courseFee,
      receipt.monthlyFee || 0,
      paymentKindLabel(receipt),
      periodValue,
      receipt.discount,
      receipt.paidAmount,
      receipt.debtAmount,
      { formula: statusFormula },
      dateFromIso(receipt.paymentDate),
      paymentMethodLabel(receipt.paymentMethod),
      receipt.notes || '',
      studentLink,
      classLink,
      receipt.collectorName,
      receipt.dueDate || '',
      receipt.sessionFee || 0,
      receipt.sessionLines?.length ? JSON.stringify(receipt.sessionLines) : '',
    ];
    styleData(row, index);
    [7, 8, 11, 12, 13, 22].forEach((column) => {
      row.getCell(column).numFmt = moneyFormat;
    });
    row.getCell(10).numFmt = 'mm/yyyy';
    row.getCell(15).numFmt = 'dd/mm/yyyy';
    [18, 19].forEach((column) => {
      row.getCell(column).font = {
        name: 'Arial',
        size: 10,
        color: { argb: COLOR.link },
        underline: true,
        bold: true,
      };
    });
  });
  const tuitionFooterRow = 6 + orderedReceipts.length;
  writeFooter(tuitionSheet, tuitionFooterRow, tuitionHeaders.length, {
    7: `SUM(G6:G${tuitionFooterRow - 1})`,
    8: `SUM(H6:H${tuitionFooterRow - 1})`,
    11: `SUM(K6:K${tuitionFooterRow - 1})`,
    12: `SUM(L6:L${tuitionFooterRow - 1})+SUM('HỌC SINH'!$M:$M)`,
    13: `SUM(M6:M${tuitionFooterRow - 1})+SUM('HỌC SINH'!$N:$N)`,
    22: `SUM(V6:V${tuitionFooterRow - 1})`,
  });
  [7, 8, 11, 12, 13].forEach((column) => {
    tuitionSheet.getCell(tuitionFooterRow, column).numFmt = moneyFormat;
  });
  tuitionSheet.mergeCells(`A${tuitionFooterRow + 1}:S${tuitionFooterRow + 1}`);
  tuitionSheet.getCell(`A${tuitionFooterRow + 1}`).value =
    'TỔNG CỘNG đã bao gồm các khoản nhập trực tiếp ở sheet HỌC SINH (cột nền vàng M–R).';
  tuitionSheet.getCell(`A${tuitionFooterRow + 1}`).font = {
    name: 'Arial',
    size: 9.5,
    italic: true,
    color: { argb: '7C2D12' },
  };
  tuitionSheet.getCell(`A${tuitionFooterRow + 1}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFBEB' },
  };
  tuitionSheet.autoFilter = { from: 'A5', to: `W${tuitionFooterRow - 1}` };
  tuitionSheet.views = [{ state: 'frozen', ySplit: 5 }];
  tuitionSheet.columns = [
    { width: 8 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 28 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 14 },
    { width: 20 },
    { width: 48 },
    { width: 18 },
    { width: 18 },
    { width: 24 },
    { width: 18 },
    { width: 20 },
    { width: 30 },
  ];
  tuitionSheet.getColumn(3).hidden = true;
}
