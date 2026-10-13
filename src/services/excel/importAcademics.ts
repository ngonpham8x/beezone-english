import type ExcelJS from 'exceljs';
import { courseStatusLabels } from '../../lib/operations';
import type { ClassRoom, CourseProgram, Room, Teacher } from '../../types';
import {
  cellText,
  duplicatedValues,
  getByAliases,
  numberValue,
  optionalDate,
  readRecords,
} from './readCells';
import type { ImportStageResult } from './types';

interface Academics {
  programs: CourseProgram[];
  teachers: Teacher[];
  rooms: Room[];
  classes: ClassRoom[];
  ensureProgram: (name: string) => CourseProgram;
}
export function importAcademics(classMaster: ExcelJS.Worksheet): ImportStageResult<Academics> {
  const classRecords = readRecords(classMaster, ['malop', 'tenlop']);
  if (!classRecords.length) {
    return {
      errors: [{ row: 0, field: 'LỚP HỌC', message: 'Không tìm thấy lớp hợp lệ trong báo cáo.' }],
    };
  }

  const teacherNames = new Set<string>();
  const roomNames = new Set<string>();
  const importedClasses = classRecords
    .map((record, index) => {
      const code = cellText(getByAliases(record, ['malop', 'classcode']));
      const name = cellText(getByAliases(record, ['tenlop', 'classname']));
      const programName = cellText(getByAliases(record, ['chuongtrinh', 'program', 'programname']));
      const teacherName = cellText(getByAliases(record, ['giaovien', 'teacher']));
      const roomName = cellText(getByAliases(record, ['phong', 'room']));
      const schedule = cellText(getByAliases(record, ['lichhoc', 'schedule']));
      const timeMatch = schedule.match(/\(([^)]+)\)\s*$/);
      const individualSlots = [
        ...schedule.matchAll(
          /(Thứ [2-7]|Chủ Nhật)\s*:\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g,
        ),
      ];
      const days = individualSlots.length
        ? individualSlots.map((match) => match[1])
        : (timeMatch ? schedule.slice(0, timeMatch.index).trim() : schedule)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
      if (teacherName && !teacherName.toLocaleLowerCase('vi-VN').includes('chưa'))
        teacherNames.add(teacherName);
      if (roomName && !roomName.toLocaleLowerCase('vi-VN').includes('chưa'))
        roomNames.add(roomName);
      const startDate = optionalDate(getByAliases(record, ['ngaykhaigiang']));
      const endDate = optionalDate(getByAliases(record, ['ngayketthuc']));
      const completedDate = optionalDate(getByAliases(record, ['ngaychotdot']));
      const rawCount = getByAliases(record, ['sobuoidukien']);
      const rawStatus = cellText(getByAliases(record, ['trangthaidothoc']));
      const courseStatus = (Object.entries(courseStatusLabels).find(
        ([, label]) => label === rawStatus,
      )?.[0] ||
        rawStatus ||
        undefined) as ClassRoom['courseStatus'];
      return {
        billingMode: (cellText(getByAliases(record, ['hinhthuchocphi'])) ||
          undefined) as ClassRoom['billingMode'],
        sessionRate: cellText(getByAliases(record, ['dongiabuoi']))
          ? numberValue(getByAliases(record, ['dongiabuoi']))
          : undefined,
        sessionBillingStartDate: optionalDate(getByAliases(record, ['ngayapdungphibuoi'])),
        sessionAbsencePolicy: (cellText(getByAliases(record, ['quytacvang'])) ||
          undefined) as ClassRoom['sessionAbsencePolicy'],
        startDate,
        endDate,
        completedDate,
        courseStatus,
        totalSessions: rawCount ? numberValue(rawCount) : undefined,
        id: `CLASS-IMP-${String(index + 1).padStart(2, '0')}`,
        code,
        name,
        programName,
        teacherName,
        roomName,
        days,
        scheduleTime: individualSlots.length ? schedule : timeMatch?.[1] || '',
        capacity: numberValue(getByAliases(record, ['succhua', 'capacity'])),
        studentIds: [] as string[],
      };
    })
    .filter((item) => item.code && item.name);

  const teachers: Teacher[] = [...teacherNames].map((name, index) => ({
    id: `TEACHER-IMP-${String(index + 1).padStart(2, '0')}`,
    name,
    phone: '',
    email: '',
    address: '',
    specialty: '',
    assignedClassIds: [],
    notes: 'Nhập từ báo cáo Excel.',
  }));
  const rooms: Room[] = [...roomNames].map((name, index) => ({
    id: `ROOM-IMP-${String(index + 1).padStart(2, '0')}`,
    name,
    capacity: 0,
    status: 'available',
    notes: 'Sức chứa chưa được nhập từ báo cáo.',
  }));
  const programs: CourseProgram[] = [];
  const ensureProgram = (rawName: string) => {
    const name = rawName.trim() || 'Chương trình nhập từ Excel';
    const existing = programs.find(
      (program) => program.name.toLocaleLowerCase('vi-VN') === name.toLocaleLowerCase('vi-VN'),
    );
    if (existing) return existing;
    const program: CourseProgram = {
      id: `PROG-IMP-${String(programs.length + 1).padStart(3, '0')}`,
      code: `IMP-${String(programs.length + 1).padStart(3, '0')}`,
      name,
      category: 'Khác',
      tuitionFee: 0,
      description: 'Nhập từ báo cáo Excel.',
    };
    programs.push(program);
    return program;
  };
  const classes: ClassRoom[] = importedClasses.map(
    ({ teacherName, roomName, programName, ...classroom }) => ({
      ...classroom,
      programId: ensureProgram(programName).id,
      teacherId: teachers.find((teacher) => teacher.name === teacherName)?.id || '',
      roomId: rooms.find((room) => room.name === roomName)?.id || '',
    }),
  );
  const duplicateClassCodes = duplicatedValues(classes.map((classroom) => classroom.code));
  if (duplicateClassCodes.length > 0) {
    return {
      errors: [
        {
          row: 0,
          field: 'Mã lớp',
          message: `Trùng mã lớp: ${duplicateClassCodes.join(', ')}. Mỗi lớp phải có một mã duy nhất trước khi nhập.`,
        },
      ],
    };
  }
  teachers.forEach((teacher) => {
    teacher.assignedClassIds = classes
      .filter((classroom) => classroom.teacherId === teacher.id)
      .map((classroom) => classroom.id);
  });

  return { data: { programs, teachers, rooms, classes, ensureProgram } };
}
