import {
  applyBackLink,
  STUDENT_DATA_START_ROW,
  styleData,
  styleHeader,
  styleTitle,
  writeFooter,
} from '../styles';

import type { ExportContext } from '../exportContext';
export function writeGradeSheet(context: ExportContext) {
  const { data, workbook, classById } = context;
  const gradesSheet = workbook.addWorksheet('BẢNG ĐIỂM');
  styleTitle(gradesSheet, 'A1:M2', `${data.centerName.toUpperCase()}\nBẢNG ĐIỂM`);
  applyBackLink(gradesSheet, 'M');
  // Keep every score used by the web gradebook in the workbook.  The prior
  // 4-skill-only layout silently discarded midterm/final/attendance when a
  // report was imported back into the app.
  const gradeHeaders = [
    'STT',
    'Mã học sinh',
    'Họ và tên',
    'Mã lớp',
    'Nghe',
    'Nói',
    'Đọc',
    'Viết',
    'Giữa kỳ',
    'Cuối kỳ',
    'Chuyên cần',
    'Điểm TB',
    'Xếp loại',
  ];
  gradesSheet.getRow(5).values = gradeHeaders;
  styleHeader(gradesSheet.getRow(5));
  const gradeRows = data.students.flatMap((student) => {
    const records = data.grades.filter((grade) => grade.studentId === student.id);
    return records.length
      ? records.map((grade) => ({ student, grade }))
      : [{ student, grade: undefined }];
  });
  gradeRows.forEach(({ student, grade }, index) => {
    const rowNumber = STUDENT_DATA_START_ROW + index;
    const row = gradesSheet.getRow(rowNumber);
    const avgFormula = `IF(COUNT(E${rowNumber}:K${rowNumber})=0,"",ROUND((AVERAGE(E${rowNumber}:H${rowNumber})*0.4 + I${rowNumber}*0.2 + J${rowNumber}*0.3 + K${rowNumber}*0.1), 1))`;
    const rankFormula = `IF(L${rowNumber}="","",IF(L${rowNumber}>=8,"Giỏi",IF(L${rowNumber}>=6.5,"Khá",IF(L${rowNumber}>=5,"Trung bình","Cần hỗ trợ"))))`;
    row.values = [
      index + 1,
      student.code,
      student.name,
      classById.get(grade?.classId || student.classId)?.code || '',
      grade?.listening ?? '',
      grade?.speaking ?? '',
      grade?.reading ?? '',
      grade?.writing ?? '',
      grade?.midterm ?? '',
      grade?.finalExam ?? '',
      grade?.attendance ?? '',
      { formula: avgFormula },
      { formula: rankFormula },
    ];
    styleData(row, index);
  });
  const gradesFooterRow = STUDENT_DATA_START_ROW + gradeRows.length;
  writeFooter(gradesSheet, gradesFooterRow, gradeHeaders.length, {
    12: `IFERROR(ROUND(AVERAGE(L${STUDENT_DATA_START_ROW}:L${gradesFooterRow - 1}),1),0)`,
  });
  gradesSheet.autoFilter = { from: 'A5', to: `M${gradesFooterRow - 1}` };
  gradesSheet.views = [{ state: 'frozen', ySplit: 5 }];
  gradesSheet.columns = [
    { width: 8 },
    { width: 16 },
    { width: 28 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 13 },
    { width: 13 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
  ];
}
