import type ExcelJS from 'exceljs';
import { isGradeSemester } from '../../lib/gradebook';
import type { ClassRoom, Grade, GradeSemester, Student, TimetableSlot } from '../../types';
import { cellText, getByAliases, numberValue, readRecords } from './readCells';

export function importGrades(
  workbook: ExcelJS.Workbook,
  students: Student[],
  classes: ClassRoom[],
): Grade[] {
  const grades: Grade[] = [];
  const gradesSheet = workbook.getWorksheet('BẢNG ĐIỂM');
  if (gradesSheet) {
    const gradeRecords = readRecords(gradesSheet, ['mahocsinh', 'malop']);
    gradeRecords.forEach((record, index) => {
      const studentCode = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
      const classCode = cellText(getByAliases(record, ['malop', 'classcode']));
      const student = students.find((item) => item.code === studentCode);
      const gradeClass =
        classes.find((classroom) => classroom.code === classCode) ||
        classes.find((classroom) => classroom.id === student?.classId);
      if (!student || !gradeClass) return;

      const rawScores = [
        getByAliases(record, ['nghe', 'listening']),
        getByAliases(record, ['noi', 'speaking']),
        getByAliases(record, ['docviet', 'readingwriting']),
        getByAliases(record, ['doc', 'doccu', 'reading']),
        getByAliases(record, ['viet', 'vietcu', 'writing']),
        getByAliases(record, ['giuaky', 'giuakycu', 'midterm']),
        getByAliases(record, ['cuoiky', 'cuoikycu', 'finalexam', 'final']),
        getByAliases(record, ['chuyencan', 'chuyencancu', 'attendance']),
      ];
      const rawAverage = getByAliases(record, ['diemtb', 'diemtrungbinh', 'average']);
      const rawUnits = getByAliases(record, ['diemunitjson', 'unitscoresjson', 'unitscores']);
      const rawComment = getByAliases(record, ['nhanxetquatrinhhoctap', 'nhanxet', 'comment']);
      const semesterText = cellText(getByAliases(record, ['hocky', 'semester'])).toUpperCase();
      const semester: GradeSemester = isGradeSemester(semesterText) ? semesterText : 'GKI';
      // Every student has a row in the generated grade sheet.  Preserve only
      // rows that actually contain a grade, so blank rows do not become fake
      // zero-score records after an import.
      if (![...rawScores, rawAverage].some((value) => cellText(value) !== '')) return;

      const [listening, speaking, combined, reading, writing, midterm, finalExam, attendance] =
        rawScores.map(numberValue);
      const readingWriting = cellText(rawScores[2]) === '' ? (reading + writing) / 2 : combined;
      const calculatedAverage = Math.round(((listening + speaking + readingWriting) / 3) * 10) / 10;
      const suppliedAverage = cellText(rawAverage);
      let unitScores: Record<string, number> | undefined;
      try {
        const parsed = JSON.parse(cellText(rawUnits) || '{}') as Record<string, unknown>;
        const entries = Object.entries(parsed).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10);
        if (entries.length) unitScores = Object.fromEntries(entries) as Record<string, number>;
      } catch {
        unitScores = undefined;
      }
      grades.push({
        id: `GRADE-IMP-${student.id}-${gradeClass.id}-${semester}`,
        studentId: student.id,
        classId: gradeClass.id,
        semester,
        listening,
        speaking,
        readingWriting,
        reading,
        writing,
        midterm,
        finalExam,
        attendance,
        unitScores,
        average: suppliedAverage === '' ? calculatedAverage : numberValue(rawAverage),
        comment: cellText(rawComment),
      });
    });
  }

  return grades;
}
export function importTimetable(classes: ClassRoom[]): TimetableSlot[] {
  const timetableSlots = classes.flatMap((classroom) => {
    const individualSlots = [
      ...classroom.scheduleTime.matchAll(
        /(Thứ [2-7]|Chủ Nhật)\s*:\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g,
      ),
    ];
    if (individualSlots.length)
      return individualSlots.map((match, index) => ({
        id: `SLOT-IMP-${classroom.id}-${index + 1}`,
        classId: classroom.id,
        teacherId: classroom.teacherId,
        roomId: classroom.roomId,
        dayOfWeek: match[1],
        startTime: match[2],
        endTime: match[3],
      }));
    const [startTime = '', endTime = ''] = classroom.scheduleTime
      .split('-')
      .map((item) => item.trim());
    return classroom.days.map((dayOfWeek, index) => ({
      id: `SLOT-IMP-${classroom.id}-${index + 1}`,
      classId: classroom.id,
      teacherId: classroom.teacherId,
      roomId: classroom.roomId,
      dayOfWeek,
      startTime,
      endTime,
    }));
  });

  return timetableSlots;
}
