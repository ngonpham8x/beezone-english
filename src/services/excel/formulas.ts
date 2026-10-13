import type ExcelJS from 'exceljs';
import { STUDENT_DATA_START_ROW, STUDENT_DYNAMIC_LAST_ROW } from './styles';
export const formulaText = (value: string) => value.replace(/"/g, '""');
export const receiptSumByClassFormula = (
  amountColumn: 'L' | 'M',
  classCriterion: string,
  dateCriteria = '',
) =>
  `SUMIFS('HỌC PHÍ'!$${amountColumn}$${STUDENT_DATA_START_ROW}:$${amountColumn}$${STUDENT_DYNAMIC_LAST_ROW},'HỌC PHÍ'!$F$${STUDENT_DATA_START_ROW}:$F$${STUDENT_DYNAMIC_LAST_ROW},${classCriterion}${dateCriteria})`;
export const directSumByClassFormula = (
  amountColumn: 'M' | 'N',
  classCriterion: string,
  dateCriteria = '',
) =>
  `SUMIFS('HỌC SINH'!$${amountColumn}$${STUDENT_DATA_START_ROW}:$${amountColumn}$${STUDENT_DYNAMIC_LAST_ROW},'HỌC SINH'!$G$${STUDENT_DATA_START_ROW}:$G$${STUDENT_DYNAMIC_LAST_ROW},${classCriterion}${dateCriteria})`;
export const masterStudentRange = (column: string) =>
  `'HỌC SINH'!$${column}$${STUDENT_DATA_START_ROW}:$${column}$${STUDENT_DYNAMIC_LAST_ROW}`;
export const masterStudentPositionFormula = (
  classCriterion: string,
  targetRow: number,
  firstDetailRow: number,
) =>
  `MATCH(${classCriterion}&"|"&ROWS($A$${firstDetailRow}:A${targetRow}),${masterStudentRange('X')},0)`;
export const masterStudentFieldAtClassPositionFormula = (
  column: string,
  classCriterion: string,
  targetRow: number,
  firstDetailRow: number,
) =>
  `IFERROR(INDEX(${masterStudentRange(column)},${masterStudentPositionFormula(classCriterion, targetRow, firstDetailRow)}),"")`;
export const masterStudentNumberAtClassPositionFormula = (
  column: string,
  classCriterion: string,
  targetRow: number,
  firstDetailRow: number,
) =>
  `IFERROR(INDEX(${masterStudentRange(column)},${masterStudentPositionFormula(classCriterion, targetRow, firstDetailRow)}),0)`;
export const receiptSumByStudentCodeAndIdFormula = (
  amountColumn: 'L' | 'M',
  studentCodeRef: string,
  studentIdRef: string,
  kind?: 'monthly' | 'course' | 'session',
) => {
  const kindCriteria = kind
    ? `,'HỌC PHÍ'!$I$${STUDENT_DATA_START_ROW}:$I$${STUDENT_DYNAMIC_LAST_ROW},"${kind === 'monthly' ? 'Học phí tháng' : kind === 'session' ? 'Học phí buổi' : 'Học phí khóa'}"`
    : '';
  return `(SUMIFS('HỌC PHÍ'!$${amountColumn}$${STUDENT_DATA_START_ROW}:$${amountColumn}$${STUDENT_DYNAMIC_LAST_ROW},'HỌC PHÍ'!$D$${STUDENT_DATA_START_ROW}:$D$${STUDENT_DYNAMIC_LAST_ROW},${studentCodeRef}${kindCriteria})+SUMIFS('HỌC PHÍ'!$${amountColumn}$${STUDENT_DATA_START_ROW}:$${amountColumn}$${STUDENT_DYNAMIC_LAST_ROW},'HỌC PHÍ'!$C$${STUDENT_DATA_START_ROW}:$C$${STUDENT_DYNAMIC_LAST_ROW},${studentIdRef},'HỌC PHÍ'!$D$${STUDENT_DATA_START_ROW}:$D$${STUDENT_DYNAMIC_LAST_ROW},"="&""${kindCriteria}))`;
};

export const directSumByStudentIdFormula = (
  amountColumn: 'M' | 'N',
  studentIdCriterion: string,
  kind?: 'monthly' | 'course',
) =>
  `SUMIFS('HỌC SINH'!$${amountColumn}$${STUDENT_DATA_START_ROW}:$${amountColumn}$${STUDENT_DYNAMIC_LAST_ROW},'HỌC SINH'!$W$${STUDENT_DATA_START_ROW}:$W$${STUDENT_DYNAMIC_LAST_ROW},${studentIdCriterion}${kind ? `,'HỌC SINH'!$O$${STUDENT_DATA_START_ROW}:$O$${STUDENT_DYNAMIC_LAST_ROW},"${kind === 'monthly' ? 'Học phí tháng' : 'Học phí khóa'}"` : ''})`;
export const masterStudentPaymentFormulas = (rowNumber: number): ExcelJS.CellValue[] => [
  {
    formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('L', `$B${rowNumber}`, `$W${rowNumber}`)}+$M${rowNumber})`,
  },
  {
    formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('M', `$B${rowNumber}`, `$W${rowNumber}`)}+$N${rowNumber}+SUMIF('BUỔI CHƯA THU'!$D:$D,$B${rowNumber},'BUỔI CHƯA THU'!$G:$G))`,
  },
  {
    formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('M', `$B${rowNumber}`, `$W${rowNumber}`, 'monthly')}+IF($O${rowNumber}="Học phí khóa",0,$N${rowNumber}))`,
  },
  {
    formula: `IF($B${rowNumber}="","",${receiptSumByStudentCodeAndIdFormula('M', `$B${rowNumber}`, `$W${rowNumber}`, 'course')}+IF($O${rowNumber}="Học phí khóa",$N${rowNumber},0))`,
  },
];
export const masterStudentClassKeyFormula = (rowNumber: number) =>
  `IF(OR($B${rowNumber}="",$G${rowNumber}=""),"",$B${rowNumber}&"|"&$G${rowNumber})`;
