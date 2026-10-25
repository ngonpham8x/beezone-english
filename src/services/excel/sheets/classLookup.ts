import {
  directSumByClassFormula,
  masterStudentFieldAtClassPositionFormula,
  masterStudentNumberAtClassPositionFormula,
  receiptSumByClassFormula,
  receiptSumByStudentCodeAndIdFormula,
} from '../formulas';
import {
  applyBackLink,
  border,
  CLASS_DETAIL_MAX_ROWS,
  COLOR,
  moneyFormat,
  STUDENT_DATA_START_ROW,
  STUDENT_DYNAMIC_LAST_ROW,
  styleFormulaLink,
  styleHeader,
  styleTitle,
} from '../styles';

import type { ExportContext } from '../exportContext';
export function writeClassLookup(context: ExportContext) {
  const { data, workbook } = context;
  // A single selector-based view also covers classes added later in LỚP HỌC.
  // Excel formulas cannot create a new worksheet tab, but this view stays live
  // for every current or future class code without duplicating student rows.
  const classLookup = workbook.addWorksheet('TRA CỨU LỚP');
  styleTitle(classLookup, 'A1:M2', `${data.centerName.toUpperCase()}\nTRA CỨU LỚP TỰ ĐỘNG`);
  applyBackLink(classLookup, 'M');
  classLookup.getCell('A4').value = 'Mã lớp cần xem';
  classLookup.getCell('A4').font = {
    name: 'Arial',
    size: 10,
    bold: true,
    color: { argb: COLOR.primary },
  };
  classLookup.getCell('B4').value = data.classes[0]?.code || '';
  classLookup.getCell('B4').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FEF3C7' },
  };
  classLookup.getCell('B4').font = {
    name: 'Arial',
    size: 10,
    bold: true,
    color: { argb: '7C2D12' },
  };
  classLookup.getCell('B4').border = border;
  classLookup.getCell('B4').note =
    'Gõ chính xác mã lớp từ sheet LỚP HỌC để xem danh sách và học phí. Không sửa vùng danh sách bên dưới.';
  classLookup.mergeCells('D4:M4');
  classLookup.getCell('D4').value =
    'Gõ mã lớp ở ô B4. Dữ liệu học sinh, phiếu thu và số tiền còn lại sẽ tự lọc từ các sheet nguồn.';
  classLookup.getCell('D4').font = {
    name: 'Arial',
    size: 9.5,
    italic: true,
    color: { argb: '475569' },
  };
  classLookup.getCell('D4').alignment = { vertical: 'middle', wrapText: true };
  classLookup.getCell('A6').value = 'Tên lớp';
  classLookup.getCell('B6').value = {
    formula: `IFERROR(INDEX('LỚP HỌC'!$C$${STUDENT_DATA_START_ROW}:$C$${STUDENT_DYNAMIC_LAST_ROW},MATCH($B$4,'LỚP HỌC'!$B$${STUDENT_DATA_START_ROW}:$B$${STUDENT_DYNAMIC_LAST_ROW},0)),"")`,
  };
  classLookup.getCell('D6').value = 'Giáo viên';
  classLookup.getCell('E6').value = {
    formula: `IFERROR(INDEX('LỚP HỌC'!$E$${STUDENT_DATA_START_ROW}:$E$${STUDENT_DYNAMIC_LAST_ROW},MATCH($B$4,'LỚP HỌC'!$B$${STUDENT_DATA_START_ROW}:$B$${STUDENT_DYNAMIC_LAST_ROW},0)),"")`,
  };
  classLookup.getCell('G6').value = 'Phòng';
  classLookup.getCell('H6').value = {
    formula: `IFERROR(INDEX('LỚP HỌC'!$G$${STUDENT_DATA_START_ROW}:$G$${STUDENT_DYNAMIC_LAST_ROW},MATCH($B$4,'LỚP HỌC'!$B$${STUDENT_DATA_START_ROW}:$B$${STUDENT_DYNAMIC_LAST_ROW},0)),"")`,
  };
  ['A6', 'D6', 'G6'].forEach((address) => {
    classLookup.getCell(address).font = {
      name: 'Arial',
      size: 10,
      bold: true,
      color: { argb: COLOR.primary },
    };
  });
  classLookup.getCell('A8').value = 'Tổng đã thu';
  classLookup.getCell('B8').value = {
    formula: `${receiptSumByClassFormula('L', '$B$4')}+${directSumByClassFormula('M', '$B$4')}`,
  };
  classLookup.getCell('D8').value = 'Tổng còn lại';
  classLookup.getCell('E8').value = {
    formula: `${receiptSumByClassFormula('M', '$B$4')}+${directSumByClassFormula('N', '$B$4')}+SUMIF('BUỔI CHƯA THU'!$C:$C,$B$4,'BUỔI CHƯA THU'!$G:$G)`,
  };
  ['A8', 'D8'].forEach((address) => {
    classLookup.getCell(address).font = {
      name: 'Arial',
      size: 10,
      bold: true,
      color: { argb: COLOR.primary },
    };
  });
  ['B8', 'E8'].forEach((address) => {
    classLookup.getCell(address).numFmt = moneyFormat;
    styleFormulaLink(classLookup.getCell(address));
  });
  const lookupHeaders = [
    'STT',
    'Mã học sinh',
    'Họ và tên',
    'SĐT học sinh',
    'SĐT phụ huynh',
    'Địa chỉ',
    'Tổng đã thu (VNĐ)',
    'Tổng còn lại (VNĐ)',
    'Còn lại tháng (VNĐ)',
    'Còn lại khóa (VNĐ)',
    'Xem phiếu',
    'Trạng thái',
    'ID hệ thống',
  ];
  classLookup.getRow(10).values = lookupHeaders;
  styleHeader(classLookup.getRow(10));
  const lookupFirstDetailRow = 11;
  for (
    let rowNumber = lookupFirstDetailRow;
    rowNumber < lookupFirstDetailRow + CLASS_DETAIL_MAX_ROWS;
    rowNumber += 1
  ) {
    const directPaid = masterStudentNumberAtClassPositionFormula(
      'M',
      '$B$4',
      rowNumber,
      lookupFirstDetailRow,
    );
    const directDebt = masterStudentNumberAtClassPositionFormula(
      'N',
      '$B$4',
      rowNumber,
      lookupFirstDetailRow,
    );
    const directKind = masterStudentFieldAtClassPositionFormula(
      'O',
      '$B$4',
      rowNumber,
      lookupFirstDetailRow,
    );
    classLookup.getCell(rowNumber, 1).value = {
      formula: `IF($B${rowNumber}="","",ROWS($A$${lookupFirstDetailRow}:A${rowNumber}))`,
    };
    [2, 3, 4, 5, 6, 12, 13].forEach((column) => {
      const masterColumn = (
        { 2: 'B', 3: 'C', 4: 'H', 5: 'I', 6: 'J', 12: 'K', 13: 'W' } as Record<number, string>
      )[column];
      classLookup.getCell(rowNumber, column).value = {
        formula: masterStudentFieldAtClassPositionFormula(
          masterColumn,
          '$B$4',
          rowNumber,
          lookupFirstDetailRow,
        ),
      };
    });
    const studentCode = `$B${rowNumber}`;
    const studentId = `$M${rowNumber}`;
    classLookup.getCell(rowNumber, 7).value = {
      formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('L', studentCode, studentId)}+${directPaid})`,
    };
    classLookup.getCell(rowNumber, 8).value = {
      formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('M', studentCode, studentId)}+${directDebt})`,
    };
    classLookup.getCell(rowNumber, 9).value = {
      formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('M', studentCode, studentId, 'monthly')}+IF(${directKind}="Học phí khóa",0,${directDebt}))`,
    };
    classLookup.getCell(rowNumber, 10).value = {
      formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('M', studentCode, studentId, 'course')}+IF(${directKind}="Học phí khóa",${directDebt},0))`,
    };
    classLookup.getCell(rowNumber, 11).value = { formula: `IF($B${rowNumber}="","","→ Học phí")` };
    [7, 8, 9, 10].forEach((column) => {
      classLookup.getCell(rowNumber, column).numFmt = moneyFormat;
      styleFormulaLink(classLookup.getCell(rowNumber, column));
    });
    classLookup.getCell(rowNumber, 11).font = {
      name: 'Arial',
      size: 10,
      color: { argb: COLOR.link },
      underline: true,
      bold: true,
    };
  }
  classLookup.views = [{ state: 'frozen', ySplit: 10 }];
  const lookupDetailColumns = [
    { width: 8 },
    { width: 16 },
    { width: 28 },
    { width: 17 },
    { width: 18 },
    { width: 36 },
    { width: 20 },
    { width: 20 },
    { width: 22 },
    { width: 22 },
    { width: 16 },
    { width: 15 },
    { width: 18 },
  ];
  lookupDetailColumns.forEach((column, index) => {
    classLookup.getColumn(index + 1).width = column.width;
  });
  classLookup.getColumn(13).hidden = true;
}
