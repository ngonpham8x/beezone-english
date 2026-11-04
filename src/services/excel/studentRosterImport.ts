import ExcelJS from 'exceljs';
import { centerDate, isCalendarDate, localCalendarDate, parseDateInput } from '../../lib/dates';
import type { ClassRoom, CourseProgram, Student } from '../../types';
import { cellText, getByAliases, normaliseHeader, statusFromLabel } from './readCells';
import type { ImportError, StudentRosterImportResult } from './types';

type SourceRow = {
  row: number;
  sheetName: string;
  sheetClassName: string;
  classNames: string[];
  programName: string;
  name: string;
  nickname: string;
  dob: string;
  gender: Student['gender'];
  parentName: string;
  school: string;
  address: string;
  gradeLevel: string;
  accountStatus: string;
  status: Student['status'];
};

const key = (value: unknown) => normaliseHeader(cellText(value));

const classTokens = (value: unknown) =>
  cellText(value)
    // A comma inside "STARTERS 1,2" is part of the class name. A comma
    // immediately followed by K26/K27 starts another class membership.
    .split(/\s*,\s*(?=K\d+\s*[-–—])/i)
    .map((item) => item.trim())
    .filter(Boolean);

const classBaseName = (className: string) => className.replace(/^\s*K\d+\s*[-–—]\s*/i, '').trim();

const strictBirthDate = (value: unknown): string | null => {
  if (!cellText(value)) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return localCalendarDate(value);
  const parsed = parseDateInput(cellText(value));
  return isCalendarDate(parsed) && parsed <= centerDate() ? parsed : null;
};

const programCategory = (name: string) =>
  /cambridge|starters|movers|flyers|pet|speaking/i.test(name) ? 'Cambridge' : 'Khác';

const inferredProgramName = (className: string, fallback: string, available: string[]) => {
  const isCambridge = /starters?|movers?|flyers?|\bpet\b|speaking|cambridge/i.test(className);
  const matching = available.find((name) =>
    isCambridge ? /cambridge/i.test(name) : !/cambridge/i.test(name),
  );
  return matching || fallback || 'Chưa phân loại';
};

const sourceStatus = (record: Record<string, unknown>): Student['status'] => {
  const label = cellText(getByAliases(record, ['trangthai', 'status']));
  const active = key(getByAliases(record, ['active', 'hoatdong']));
  if (/khonghoatdong|ngunghoatdong|inactive/.test(active)) return 'dropped';
  return statusFromLabel(label || active);
};

const mergeText = (current: string, incoming: string) => current || incoming;

/**
 * Reads the multi-sheet class roster used by BeeZone. Each recognised sheet is
 * exactly one current class. The "Tên lớp" column is only used to recover that
 * sheet's full cohort name; another class mentioned in the cell is imported
 * only when it also has its own sheet.
 */
export async function parseStudentRosterWorkbookFile(file: File): Promise<StudentRosterImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const warnings: ImportError[] = [];
  const rows: SourceRow[] = [];
  const sheetClassPrograms = new Map<string, string>();
  const sheetClassCodes = new Map<string, string>();
  let sheetCount = 0;
  let sourceRowCount = 0;

  for (const sheet of workbook.worksheets) {
    let headerRow = 0;
    let headers: string[] = [];
    for (let rowNumber = 1; rowNumber <= Math.min(20, sheet.rowCount); rowNumber += 1) {
      const values = sheet.getRow(rowNumber).values;
      const candidate = (Array.isArray(values) ? values.slice(1) : []).map(cellText);
      const normalized = candidate.map(normaliseHeader);
      if (normalized.includes('hocvien') && normalized.includes('tenlop')) {
        headerRow = rowNumber;
        headers = candidate;
        break;
      }
    }
    if (!headerRow) continue;

    const records: { row: number; record: Record<string, unknown>; tokens: string[] }[] = [];
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const values = sheet.getRow(rowNumber).values;
      const cells = Array.isArray(values) ? values.slice(1) : [];
      const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
      const name = cellText(getByAliases(record, ['hocvien', 'hovaten', 'hoten', 'name']));
      if (!name) continue;
      sourceRowCount += 1;
      records.push({
        row: rowNumber,
        record,
        tokens: classTokens(getByAliases(record, ['tenlop', 'lop', 'class', 'classname'])),
      });
    }
    if (!records.length) continue;

    const sheetNameKey = key(sheet.name);
    const sheetClassName =
      records
        .flatMap((item) => item.tokens)
        .find((name) => key(classBaseName(name)) === sheetNameKey) || records[0].tokens[0];
    if (!sheetClassName) {
      warnings.push({ row: headerRow, field: sheet.name, message: 'Không xác định được tên lớp của sheet.' });
      continue;
    }

    sheetCount += 1;
    sheetClassCodes.set(key(sheetClassName), sheet.name.trim());
    for (const { row, record } of records) {
      const name = cellText(getByAliases(record, ['hocvien', 'hovaten', 'hoten', 'name']));
      const dob = strictBirthDate(getByAliases(record, ['ngaysinh', 'dob']));
      if (dob === null) {
        warnings.push({ row, field: `${sheet.name} / Ngày sinh`, message: `Bỏ qua “${name}” vì ngày sinh không hợp lệ.` });
        continue;
      }
      const programName = cellText(getByAliases(record, ['hedaotao', 'chuongtrinh', 'program']));
      if (!programName) {
        warnings.push({ row, field: `${sheet.name} / Hệ đào tạo`, message: `Bỏ qua “${name}” vì thiếu hệ đào tạo.` });
        continue;
      }
      const rawGender = cellText(getByAliases(record, ['gioitinh', 'gender']));
      const gender: Student['gender'] = rawGender === 'Nam' || rawGender === 'Nữ' ? rawGender : 'Chưa xác định';
      const classNames = [sheetClassName];
      sheetClassPrograms.set(key(sheetClassName), programName);
      rows.push({
        row,
        sheetName: sheet.name,
        sheetClassName,
        classNames,
        programName,
        name,
        nickname: cellText(getByAliases(record, ['bidanh', 'nickname'])),
        dob,
        gender,
        parentName: cellText(getByAliases(record, ['phuhuynh', 'tenphuhuynh', 'parentname'])),
        school: cellText(getByAliases(record, ['truonghoc', 'truong', 'school'])),
        address: cellText(getByAliases(record, ['diachi', 'address'])),
        gradeLevel: cellText(getByAliases(record, ['khoilop', 'khoi', 'gradelevel'])),
        accountStatus: cellText(getByAliases(record, ['captaikhoan', 'accountstatus'])),
        status: sourceStatus(record),
      });
    }
  }

  if (!rows.length) {
    return {
      errors: [{ row: 0, field: 'Tệp Excel', message: 'Không tìm thấy sheet lớp có cột “Học viên” và “Tên lớp”.' }],
    };
  }

  const programNames = [...new Map(rows.map((row) => [key(row.programName), row.programName])).values()];
  const programs: CourseProgram[] = programNames.map((name, index) => ({
    id: `ROSTER-PROGRAM-${index + 1}`,
    code: `EXCEL-${String(index + 1).padStart(2, '0')}`,
    name,
    category: programCategory(name),
    tuitionFee: 0,
    description: 'Nhập từ danh sách lớp Excel; học phí chờ cập nhật.',
  }));
  const programByName = new Map(programs.map((program) => [key(program.name), program]));

  const classNames = [...new Map(rows.flatMap((row) => row.classNames).map((name) => [key(name), name])).values()];
  const classes: ClassRoom[] = classNames.map((name, index) => {
    const sourceRow = rows.find((row) => row.classNames.some((candidate) => key(candidate) === key(name)));
    const programName =
      sheetClassPrograms.get(key(name)) ||
      inferredProgramName(name, sourceRow?.programName || '', programNames);
    const program = programByName.get(key(programName));
    return {
      id: `ROSTER-CLASS-${index + 1}`,
      code: sheetClassCodes.get(key(name)) || classBaseName(name) || name,
      name,
      programId: program?.id || programs[0].id,
      teacherId: '',
      roomId: '',
      scheduleTime: '',
      days: [],
      capacity: 0,
      studentIds: [],
      courseStatus: 'planned',
      notes: 'Nhập từ danh sách lớp Excel; giáo viên, phòng và lịch học chờ cập nhật.',
    };
  });
  const classByName = new Map(classes.map((classroom) => [key(classroom.name), classroom]));

  const studentsByIdentity = new Map<string, Student>();
  for (const row of rows) {
    // Parent is included because the real workbook contains two different
    // learners who share the same name and birth date.
    const identity = `${key(row.name)}|${row.dob}|${key(row.parentName)}`;
    const membershipIds = row.classNames
      .map((name) => classByName.get(key(name))?.id)
      .filter((id): id is string => Boolean(id));
    const primaryClass = classByName.get(key(row.sheetClassName)) || classes.find((item) => membershipIds.includes(item.id));
    if (!primaryClass) continue;
    const classIds = [primaryClass.id, ...membershipIds.filter((id) => id !== primaryClass.id)];
    const programIds = [...new Set(classIds.map((id) => classes.find((item) => item.id === id)?.programId).filter((id): id is string => Boolean(id)))];
    const current = studentsByIdentity.get(identity);
    if (current) {
      const allClassIds = [...new Set([current.classId, ...(current.additionalClassIds || []), ...classIds])];
      const allProgramIds = [...new Set([current.programId, ...(current.additionalProgramIds || []), ...programIds])];
      studentsByIdentity.set(identity, {
        ...current,
        nickname: mergeText(current.nickname || '', row.nickname),
        school: mergeText(current.school, row.school),
        gradeLevel: mergeText(current.gradeLevel, row.gradeLevel),
        address: mergeText(current.address, row.address),
        parentName: mergeText(current.parentName, row.parentName),
        accountStatus: mergeText(current.accountStatus || '', row.accountStatus),
        additionalClassIds: allClassIds.filter((id) => id !== current.classId),
        additionalProgramIds: allProgramIds.filter((id) => id !== current.programId),
      });
      continue;
    }
    studentsByIdentity.set(identity, {
      id: `ROSTER-STUDENT-${studentsByIdentity.size + 1}`,
      code: '',
      name: row.name,
      nickname: row.nickname || undefined,
      accountStatus: row.accountStatus || undefined,
      dob: row.dob,
      gender: row.gender,
      school: row.school,
      gradeLevel: row.gradeLevel,
      programId: primaryClass.programId,
      additionalProgramIds: programIds.filter((id) => id !== primaryClass.programId),
      classId: primaryClass.id,
      additionalClassIds: classIds.filter((id) => id !== primaryClass.id),
      address: row.address,
      email: '',
      phone: '',
      parentName: row.parentName,
      parentPhone: '',
      enrollDate: centerDate(),
      notes: `Nhập từ Excel: ${row.sheetName}`,
      status: row.status,
      feeStatus: 'unpaid',
    });
  }

  const students = [...studentsByIdentity.values()];
  for (const classroom of classes) {
    classroom.studentIds = students
      .filter((student) => student.classId === classroom.id || student.additionalClassIds?.includes(classroom.id))
      .map((student) => student.id);
  }

  return {
    data: { programs, classes, students, sheetCount, sourceRowCount, warnings },
    errors: [],
  };
}
