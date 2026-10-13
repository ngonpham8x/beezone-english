import { directSumByClassFormula, receiptSumByClassFormula } from '../formulas';
import {
  COLOR,
  columnLetter,
  dateFromIso,
  moneyFormat,
  STUDENT_DATA_START_ROW,
  STUDENT_DYNAMIC_LAST_ROW,
  styleData,
  styleFormulaLink,
  styleHeader,
  styleTitle,
  withWorksheetLink,
  writeFooter,
} from '../styles';

import type { ExportContext } from '../exportContext';
export function writeSummarySheet(context: ExportContext) {
  const { data, workbook, months, classSheetNames } = context;
  const summary = workbook.addWorksheet('TỔNG QUAN');
  styleTitle(
    summary,
    'A1:Z2',
    `${data.centerName.toUpperCase()}\nBÁO CÁO TỔNG QUAN VÀ THU HỌC PHÍ THEO THÁNG`,
  );
  summary.mergeCells('A3:Z3');
  summary.getCell('A3').value =
    `Xuất lúc ${new Date().toLocaleString('vi-VN')} · Các công thức liên kết trực tiếp tới sheet HỌC PHÍ.`;
  summary.getCell('A3').note = 'Nguồn dữ liệu: Hệ thống Quản lý Trung tâm Ngoại ngữ BeeZone.';
  summary.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: '475569' } };
  summary.getCell('A3').alignment = { horizontal: 'center' };
  summary.mergeCells('A5:Z5');
  summary.getCell('A5').value = 'I. CHỈ SỐ TỔNG HỢP';
  summary.getCell('A5').font = {
    name: 'Arial',
    size: 11,
    bold: true,
    color: { argb: COLOR.primary },
  };
  summary.getRow(6).values = ['Chỉ số', 'Giá trị', 'Đơn vị', 'Nguồn công thức'];
  styleHeader(summary.getRow(6));
  const kpis = [
    [
      'Tổng học sinh',
      { formula: "COUNTA('HỌC SINH'!$B$6:$B$1048576)" },
      'Học sinh',
      'Sheet HỌC SINH',
    ],
    [
      'Tổng học phí đã thu',
      {
        formula: withWorksheetLink(
          "#'HỌC SINH'!A5",
          "SUMIFS('HỌC PHÍ'!$L:$L,'HỌC PHÍ'!$A:$A,\"<>TỔNG CỘNG\")+SUM('HỌC SINH'!$M:$M)",
        ),
      },
      'VNĐ',
      'HỌC PHÍ + thu trực tiếp HỌC SINH',
    ],
    [
      'Tổng công nợ',
      {
        formula: withWorksheetLink(
          "#'HỌC SINH'!A5",
          "SUMIFS('HỌC PHÍ'!$M:$M,'HỌC PHÍ'!$A:$A,\"<>TỔNG CỘNG\")+SUM('HỌC SINH'!$N:$N)+SUM('BUỔI CHƯA THU'!$G:$G)",
        ),
      },
      'VNĐ',
      'Phiếu thu + buổi chưa lập phiếu + nợ trực tiếp',
    ],
    ['Tỷ lệ thu', { formula: 'IFERROR(B8/(B8+B9),0)' }, '%', 'Đã thu / (đã thu + công nợ)'],
  ];
  const kpiSourceLinks = ["#'HỌC SINH'!A1", "#'HỌC SINH'!A5", "#'HỌC SINH'!A5", undefined];
  kpis.forEach((values, index) => {
    const row = summary.getRow(7 + index);
    row.values = values;
    styleData(row, index);
    row.getCell(2).font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } };
    const sourceLink = kpiSourceLinks[index];
    if (sourceLink) {
      row.getCell(4).value = { text: String(values[3]), hyperlink: sourceLink };
      row.getCell(4).font = {
        name: 'Arial',
        size: 10,
        color: { argb: COLOR.link },
        underline: true,
      };
    }
    if (index === 1 || index === 2) styleFormulaLink(row.getCell(2));
  });
  summary.getCell('B8').numFmt = moneyFormat;
  summary.getCell('B9').numFmt = moneyFormat;
  summary.getCell('B10').numFmt = '0.0%';

  const monthlyTitleRow = 13;
  summary.mergeCells(`A${monthlyTitleRow}:Z${monthlyTitleRow}`);
  summary.getCell(`A${monthlyTitleRow}`).value = 'II. TỔNG THU HỌC PHÍ THEO THÁNG VÀ TỪNG LỚP';
  summary.getCell(`A${monthlyTitleRow}`).font = {
    name: 'Arial',
    size: 11,
    bold: true,
    color: { argb: COLOR.primary },
  };
  const monthlyHeaderRow = monthlyTitleRow + 1;
  const monthlyHeaders = [
    'Mã lớp',
    'Tên lớp',
    'Sĩ số',
    ...months.map((month) => `Tháng ${month.slice(5)}/${month.slice(0, 4)}`),
    'Tổng đã thu',
    'Công nợ',
  ];
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
    row.getCell(3).value = { formula: `COUNTIF('HỌC SINH'!$G:$G,$A${rowNumber})` };
    months.forEach((_, monthIndex) => {
      const column = 4 + monthIndex;
      const header = `${columnLetter(column)}$${monthlyHeaderRow}`;
      const monthTarget = `#'${classSheetNames.get(classroom.id)}'!${columnLetter(2 + monthIndex)}6`;
      const receiptDateCriteria = `,'HỌC PHÍ'!$O$${STUDENT_DATA_START_ROW}:$O$${STUDENT_DYNAMIC_LAST_ROW},">="&${header},'HỌC PHÍ'!$O$${STUDENT_DATA_START_ROW}:$O$${STUDENT_DYNAMIC_LAST_ROW},"<"&EDATE(${header},1)`;
      const directDateCriteria = `,'HỌC SINH'!$Q$${STUDENT_DATA_START_ROW}:$Q$${STUDENT_DYNAMIC_LAST_ROW},">="&${header},'HỌC SINH'!$Q$${STUDENT_DATA_START_ROW}:$Q$${STUDENT_DYNAMIC_LAST_ROW},"<"&EDATE(${header},1)`;
      row.getCell(column).value = {
        formula: withWorksheetLink(
          monthTarget,
          `${receiptSumByClassFormula('L', `$A${rowNumber}`, receiptDateCriteria)}+${directSumByClassFormula('M', `$A${rowNumber}`, directDateCriteria)}`,
        ),
      };
      row.getCell(column).numFmt = moneyFormat;
    });
    const totalColumn = 4 + months.length;
    const debtColumn = totalColumn + 1;
    const classTarget = `#'${classSheetNames.get(classroom.id)}'!A6`;
    row.getCell(totalColumn).value = {
      formula: withWorksheetLink(
        classTarget,
        `${receiptSumByClassFormula('L', `$A${rowNumber}`)}+${directSumByClassFormula('M', `$A${rowNumber}`)}`,
      ),
    };
    row.getCell(debtColumn).value = {
      formula: withWorksheetLink(
        classTarget,
        `${receiptSumByClassFormula('M', `$A${rowNumber}`)}+${directSumByClassFormula('N', `$A${rowNumber}`)}+SUMIF('BUỔI CHƯA THU'!$C:$C,$A${rowNumber},'BUỔI CHƯA THU'!$G:$G)`,
      ),
    };
    row.getCell(totalColumn).numFmt = moneyFormat;
    row.getCell(debtColumn).numFmt = moneyFormat;
    styleData(row, index);
    for (let column = 4; column <= debtColumn; column += 1) styleFormulaLink(row.getCell(column));
  });
  const classTotalRow = classStartRow + data.classes.length;
  const lastDataColumn = 5 + months.length;
  const footerFormulas: Record<number, string> = {
    3: `SUM(C${classStartRow}:C${classTotalRow - 1})`,
  };
  for (let column = 4; column <= lastDataColumn; column += 1)
    footerFormulas[column] =
      `SUM(${columnLetter(column)}${classStartRow}:${columnLetter(column)}${classTotalRow - 1})`;
  writeFooter(summary, classTotalRow, lastDataColumn, footerFormulas);
  for (let column = 4; column <= lastDataColumn; column += 1)
    summary.getCell(classTotalRow, column).numFmt = moneyFormat;
  summary.autoFilter = {
    from: `A${monthlyHeaderRow}`,
    to: `${columnLetter(lastDataColumn)}${classTotalRow - 1}`,
  };
  summary.views = [{ state: 'frozen', ySplit: monthlyHeaderRow }];
  summary.columns = [
    { width: 18 },
    { width: 32 },
    { width: 12 },
    ...months.map(() => ({ width: 18 })),
    { width: 18 },
    { width: 18 },
  ];
}
