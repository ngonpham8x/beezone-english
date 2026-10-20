import { isStudentInClass } from '../../../lib/studentClasses';
import {
  directSumByClassFormula,
  directSumByStudentIdFormula,
  formulaText,
  receiptSumByClassFormula,
  receiptSumByStudentCodeAndIdFormula,
} from '../formulas';
import {
  applyBackLink,
  COLOR,
  columnLetter,
  dateFromIso,
  moneyFormat,
  STUDENT_DATA_START_ROW,
  STUDENT_DYNAMIC_LAST_ROW,
  studentStatusLabel,
  styleData,
  styleFormulaLink,
  styleHeader,
  styleTitle,
  withWorksheetLink,
} from '../styles';

import type { ExportContext } from '../exportContext';
export function writeClassDetails(context: ExportContext) {
  const {
    data,
    workbook,
    months,
    classSheetNames,
    teacherById,
    roomById,
    firstReceiptRowByStudentId,
    firstReceiptRowByClassMonth,
  } = context;
  data.classes.forEach((classroom) => {
    const sheet = workbook.addWorksheet(classSheetNames.get(classroom.id)!);
    const classEndColumn = columnLetter(Math.max(13, months.length + 1));
    styleTitle(
      sheet,
      `A1:${classEndColumn}2`,
      `${data.centerName.toUpperCase()}\nDANH SÁCH HỌC SINH - ${classroom.name.toUpperCase()}`,
    );
    applyBackLink(sheet, classEndColumn);
    const teacher = teacherById.get(classroom.teacherId);
    sheet.mergeCells(`A4:${classEndColumn}4`);
    sheet.getCell('A4').value =
      `Giáo viên: ${teacher?.name || 'Chưa cập nhật'} · Lịch: ${classroom.scheduleTime || classroom.days.join(', ')} · Phòng: ${roomById.get(classroom.roomId)?.name || classroom.roomId || 'Chưa cập nhật'}`;
    sheet.getCell('A4').font = {
      name: 'Arial',
      size: 9.5,
      italic: true,
      color: { argb: '475569' },
    };
    sheet.getCell('A4').alignment = { horizontal: 'center' };
    sheet.getRow(6).values = ['Kỳ thu', ...months.map((month) => dateFromIso(`${month}-01`))];
    styleHeader(sheet.getRow(6));
    months.forEach((_, index) => (sheet.getCell(6, 2 + index).numFmt = '"Tháng "mm/yyyy'));
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
      monthlyPaidRow.getCell(column).value = {
        formula: withWorksheetLink(
          receiptLink,
          `${receiptSumByClassFormula('L', classCriterion, receiptDateCriteria)}+${directSumByClassFormula('M', classCriterion, directDateCriteria)}`,
        ),
      };
      monthlyDebtRow.getCell(column).value = {
        formula: withWorksheetLink(
          receiptLink,
          `${receiptSumByClassFormula('M', classCriterion, receiptDateCriteria)}+${directSumByClassFormula('N', classCriterion, directDateCriteria)}`,
        ),
      };
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
    sheet.getCell('B9').value = {
      formula: `${receiptSumByClassFormula('L', classCriterion)}+${directSumByClassFormula('M', classCriterion)}`,
    };
    sheet.getCell('C9').value = {
      formula: `${receiptSumByClassFormula('M', classCriterion)}+${directSumByClassFormula('N', classCriterion)}+SUMIF('BUỔI CHƯA THU'!$C:$C,${classCriterion},'BUỔI CHƯA THU'!$G:$G)`,
    };
    sheet.getCell('D9').value = {
      formula: `${receiptSumByClassFormula('M', classCriterion, `,'HỌC PHÍ'!$I$${STUDENT_DATA_START_ROW}:$I$${STUDENT_DYNAMIC_LAST_ROW},"Học phí tháng"`)}+SUMIFS('HỌC SINH'!$N:$N,'HỌC SINH'!$G:$G,${classCriterion},'HỌC SINH'!$O:$O,"<>Học phí khóa")`,
    };
    sheet.getCell('E9').value = {
      formula: `${receiptSumByClassFormula('M', classCriterion, `,'HỌC PHÍ'!$I$${STUDENT_DATA_START_ROW}:$I$${STUDENT_DYNAMIC_LAST_ROW},"Học phí khóa"`)}+SUMIFS('HỌC SINH'!$N:$N,'HỌC SINH'!$G:$G,${classCriterion},'HỌC SINH'!$O:$O,"Học phí khóa")`,
    };
    styleData(sheet.getRow(9), 0);
    ['Tổng đã thu', 'Tổng nợ', 'Nợ tháng', 'Nợ khóa'].forEach((label, index) => {
      sheet.getCell(9, index + 2).note = label;
      sheet.getCell(9, index + 2).numFmt = moneyFormat;
      styleFormulaLink(sheet.getCell(9, index + 2));
    });
    sheet.getRow(9).getCell(1).font = {
      name: 'Arial',
      size: 10,
      bold: true,
      color: { argb: COLOR.primary },
    };
    sheet.mergeCells(`A10:${classEndColumn}10`);
    sheet.getCell('A10').value = 'CHI TIẾT HỌC SINH VÀ PHIẾU THU';
    sheet.getCell('A10').font = {
      name: 'Arial',
      size: 11,
      bold: true,
      color: { argb: COLOR.primary },
    };
    const headers = [
      'STT',
      'Mã học sinh',
      'Họ và tên',
      'SĐT học sinh',
      'SĐT phụ huynh',
      'Địa chỉ',
      'Tổng đã thu (VNĐ)',
      'Tổng nợ (VNĐ)',
      'Nợ học phí tháng (VNĐ)',
      'Nợ học phí khóa (VNĐ)',
      'Xem phiếu',
      'Trạng thái',
      'ID hệ thống',
    ];
    sheet.getRow(11).values = headers;
    styleHeader(sheet.getRow(11));
    const firstDetailRow = 12;
    const classStudents = data.students.filter((student) => isStudentInClass(student, classroom.id));
    const writeFinancialFormulas = (
      rowNumber: number,
      directPaid: string,
      directDebt: string,
      directMonthlyDebt: string,
      directCourseDebt: string,
    ) => {
      const classCriterion = `"${formulaText(classroom.code)}"`;
      const studentCode = `$B${rowNumber}`;
      const studentId = `$M${rowNumber}`;
      sheet.getCell(rowNumber, 7).value = {
        formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('L', studentCode, studentId, undefined, classCriterion)}+${directPaid})`,
      };
      sheet.getCell(rowNumber, 8).value = {
        formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('M', studentCode, studentId, undefined, classCriterion)}+${directDebt}+SUMIFS('BUỔI CHƯA THU'!$G:$G,'BUỔI CHƯA THU'!$D:$D,${studentCode},'BUỔI CHƯA THU'!$C:$C,${classCriterion}))`,
      };
      sheet.getCell(rowNumber, 9).value = {
        formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('M', studentCode, studentId, 'monthly', classCriterion)}+${directMonthlyDebt})`,
      };
      sheet.getCell(rowNumber, 10).value = {
        formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('M', studentCode, studentId, 'course', classCriterion)}+${directCourseDebt})`,
      };
      [7, 8, 9, 10].forEach((column) => {
        sheet.getCell(rowNumber, column).numFmt = moneyFormat;
        styleFormulaLink(sheet.getCell(rowNumber, column));
      });
    };
    classStudents.forEach((student, index) => {
      const rowNumber = firstDetailRow + index;
      const receiptRow = firstReceiptRowByStudentId.get(student.id);
      sheet.getRow(rowNumber).values = [
        index + 1,
        student.code,
        student.name,
        student.phone,
        student.parentPhone,
        student.address,
        '',
        '',
        '',
        '',
        {
          text: '→ Học phí',
          hyperlink: receiptRow ? `#'HỌC PHÍ'!A${receiptRow}` : "#'HỌC PHÍ'!A1",
        },
        studentStatusLabel(student.status),
        student.id,
      ];
      styleData(sheet.getRow(rowNumber), index);
      writeFinancialFormulas(
        rowNumber,
        directSumByStudentIdFormula('M', `$M${rowNumber}`, undefined, `"${formulaText(classroom.code)}"`),
        directSumByStudentIdFormula('N', `$M${rowNumber}`, undefined, `"${formulaText(classroom.code)}"`),
        directSumByStudentIdFormula('N', `$M${rowNumber}`, 'monthly', `"${formulaText(classroom.code)}"`),
        directSumByStudentIdFormula('N', `$M${rowNumber}`, 'course', `"${formulaText(classroom.code)}"`),
      );
      sheet.getCell(rowNumber, 11).font = {
        name: 'Arial',
        size: 10,
        color: { argb: COLOR.link },
        underline: true,
        bold: true,
      };
    });
    sheet.views = [{ state: 'frozen', ySplit: 11 }];
    sheet.columns = [
      { width: 14 },
      ...months.map(() => ({ width: 18 })),
      ...Array.from({ length: Math.max(0, 11 - (months.length + 1)) }, () => ({ width: 18 })),
    ];
    const detailColumns = [
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
    detailColumns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.width;
    });
    sheet.getColumn(13).hidden = true;
  });
}
