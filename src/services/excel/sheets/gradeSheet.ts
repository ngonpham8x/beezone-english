import { studentClassIds } from '../../../lib/studentClasses';
import {
  applyBackLink,
  STUDENT_DATA_START_ROW,
  styleData,
  styleHeader,
  styleTitle,
  writeFooter,
} from '../styles';

import type { ExportContext } from '../exportContext';
import { gradeSemester, readingWritingScore } from '../../../lib/gradebook';
export function writeGradeSheet(context: ExportContext) {
  const { data, workbook, classById } = context;
  const gradesSheet = workbook.addWorksheet('BẢNG ĐIỂM');
  styleTitle(gradesSheet, 'A1:Q2', `${data.centerName.toUpperCase()}\nBẢNG ĐIỂM THEO HỌC KỲ`);
  applyBackLink(gradesSheet, 'Q');
  const gradeHeaders = [
    'STT',
    'Mã học sinh',
    'Họ và tên',
    'Mã lớp',
    'Học kỳ',
    'Điểm UNIT (JSON)',
    'Nghe',
    'Nói',
    'Đọc & Viết',
    'Đọc (cũ)',
    'Viết (cũ)',
    'Giữa kỳ (cũ)',
    'Cuối kỳ (cũ)',
    'Chuyên cần (cũ)',
    'Điểm TB',
    'Nhận xét quá trình học tập',
    'Xếp loại',
  ];
  gradesSheet.getRow(5).values = gradeHeaders;
  styleHeader(gradesSheet.getRow(5));
  const gradeRows = data.students.flatMap((student) => {
    const records = data.grades.filter((grade) => grade.studentId === student.id);
    const ids = [...new Set([...studentClassIds(student), ...records.map(grade => grade.classId)])];
    return (ids.length ? ids : ['']).flatMap((classId) => {
      const classGrades = records.filter((grade) => grade.classId === classId);
      return classGrades.length
        ? classGrades.map((grade) => ({ student, grade, classId }))
        : [{ student, grade: undefined, classId }];
    });
  });
  gradeRows.forEach(({ student, grade, classId }, index) => {
    const rowNumber = STUDENT_DATA_START_ROW + index;
    const row = gradesSheet.getRow(rowNumber);
    const avgFormula = `IF(COUNT(G${rowNumber}:I${rowNumber})=0,"",ROUND(SUM(G${rowNumber}:I${rowNumber})/10,1))`;
    const rankFormula = `IF(O${rowNumber}="","",IF(O${rowNumber}>=2.7,"Xuất sắc",IF(O${rowNumber}>=2.4,"Giỏi",IF(O${rowNumber}>=1.95,"Khá",IF(O${rowNumber}>=1.5,"Đạt","Cần hỗ trợ")))))`;
    row.values = [
      index + 1,
      student.code,
      student.name,
      classById.get(classId)?.code || '',
      grade ? gradeSemester(grade) : '',
      grade && Object.keys(grade.unitScores || {}).length ? JSON.stringify(grade.unitScores) : '',
      grade?.listening ?? '',
      grade?.speaking ?? '',
      grade ? readingWritingScore(grade) : '',
      grade?.reading ?? '',
      grade?.writing ?? '',
      grade?.midterm ?? '',
      grade?.finalExam ?? '',
      grade?.attendance ?? '',
      { formula: avgFormula },
      grade?.comment ?? '',
      { formula: rankFormula },
    ];
    styleData(row, index);
  });
  const gradesFooterRow = STUDENT_DATA_START_ROW + gradeRows.length;
  writeFooter(gradesSheet, gradesFooterRow, gradeHeaders.length, {
    15: `IFERROR(ROUND(AVERAGE(O${STUDENT_DATA_START_ROW}:O${gradesFooterRow - 1}),1),0)`,
  });
  gradesSheet.autoFilter = { from: 'A5', to: `Q${gradesFooterRow - 1}` };
  gradesSheet.views = [{ state: 'frozen', ySplit: 5 }];
  gradesSheet.columns = [
    { width: 8 },
    { width: 16 },
    { width: 28 },
    { width: 18 },
    { width: 12 },
    { width: 28 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 13 },
    { width: 13 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 36 },
    { width: 18 },
  ];
}
