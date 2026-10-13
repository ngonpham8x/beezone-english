import type ExcelJS from 'exceljs';
import type { ClassRoom, Grade, Student, TimetableSlot } from '../../types';
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

      const [listening, speaking, reading, writing, midterm, finalExam, attendance] =
        rawScores.map(numberValue);
      const calculatedAverage =
        Math.round(
          (((listening + speaking + reading + writing) / 4) * 0.4 +
            midterm * 0.2 +
            finalExam * 0.3 +
            attendance * 0.1) *
            10,
        ) / 10;
      const suppliedAverage = cellText(rawAverage);
      grades.push({
        id: `GRADE-IMP-${student.id}-${gradeClass.id}`,
        studentId: student.id,
        classId: gradeClass.id,
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
