import { nextClassStudentCode } from '../../lib/identifiers';
import { reconcileClassStudentIds } from '../center/model';
import type { ClassRoom, CourseProgram, Student } from '../../types';
import type { StudentRosterImportData, StudentRosterImportSummary } from '../../services/excelService';

type CurrentRoster = {
  programs: CourseProgram[];
  classes: ClassRoom[];
  students: Student[];
};

export type StudentRosterMergeResult = CurrentRoster & { summary: StudentRosterImportSummary };

interface StudentRosterMergeOptions {
  replaceMemberships?: boolean;
}

const key = (value: string) =>
  value
    .trim()
    .replace(/[Đđ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]/g, '');

const identityKey = (student: Pick<Student, 'name' | 'dob' | 'parentName'>) =>
  `${key(student.name)}|${student.dob}|${key(student.parentName)}`;

const uniqueIds = (values: (string | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))];

/** Build one validated additive roster without touching tuition, grades or attendance. */
export function mergeStudentRoster(
  current: CurrentRoster,
  source: StudentRosterImportData,
  options: StudentRosterMergeOptions = {},
): StudentRosterMergeResult {
  const programs = [...current.programs];
  const programIds = new Map<string, string>();
  let addedPrograms = 0;
  for (const sourceProgram of source.programs) {
    const existing = programs.find((program) => key(program.name) === key(sourceProgram.name));
    if (existing) {
      programIds.set(sourceProgram.id, existing.id);
      continue;
    }
    const created: CourseProgram = {
      ...sourceProgram,
      id: `PROG_ROSTER_${crypto.randomUUID()}`,
      code: `EXCEL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    };
    programs.push(created);
    programIds.set(sourceProgram.id, created.id);
    addedPrograms += 1;
  }

  const classes = [...current.classes];
  const classIds = new Map<string, string>();
  let addedClasses = 0;
  for (const sourceClass of source.classes) {
    // The full class name keeps the cohort (for example "K27 - BEE 2"),
    // while the class code follows the workbook sheet name ("BEE 2").
    // Matching by the full name first prevents a K27 sheet from being merged
    // into an older/demo class whose code only differs by punctuation.
    const existingIndex = classes.findIndex((classroom) => key(classroom.name) === key(sourceClass.name));
    const existing = existingIndex >= 0 ? classes[existingIndex] : undefined;
    if (existing) {
      classes[existingIndex] = { ...existing, code: sourceClass.code, name: sourceClass.name };
      classIds.set(sourceClass.id, existing.id);
      continue;
    }
    const created: ClassRoom = {
      ...sourceClass,
      id: `CLASS_ROSTER_${crypto.randomUUID()}`,
      programId: programIds.get(sourceClass.programId) || '',
      studentIds: [],
    };
    classes.push(created);
    classIds.set(sourceClass.id, created.id);
    addedClasses += 1;
  }

  const students = [...current.students];
  const studentByIdentity = new Map(students.map((student) => [identityKey(student), student]));
  let addedStudents = 0;
  let updatedStudents = 0;
  for (const sourceStudent of source.students) {
    const mappedClassIds = uniqueIds(
      [sourceStudent.classId, ...(sourceStudent.additionalClassIds || [])].map((id) => classIds.get(id)),
    );
    if (!mappedClassIds.length) continue;
    const mappedProgramIds = uniqueIds(
      [sourceStudent.programId, ...(sourceStudent.additionalProgramIds || [])].map((id) => programIds.get(id)),
    );
    const identity = identityKey(sourceStudent);
    const existing = studentByIdentity.get(identity);
    if (existing) {
      const index = students.findIndex((student) => student.id === existing.id);
      const allClassIds = options.replaceMemberships
        ? mappedClassIds
        : uniqueIds([existing.classId, ...(existing.additionalClassIds || []), ...mappedClassIds]);
      const allProgramIds = options.replaceMemberships
        ? mappedProgramIds
        : uniqueIds([existing.programId, ...(existing.additionalProgramIds || []), ...mappedProgramIds]);
      const primaryClassId = options.replaceMemberships ? mappedClassIds[0] : existing.classId || allClassIds[0];
      const primaryClassCode = classes.find((item) => item.id === primaryClassId)?.code || '';
      const primaryProgramId = options.replaceMemberships
        ? classes.find((item) => item.id === primaryClassId)?.programId || allProgramIds[0] || ''
        : existing.programId || classes.find((item) => item.id === primaryClassId)?.programId || allProgramIds[0] || '';
      const expectedPrefix = `${primaryClassCode.trim()}-`;
      const code = primaryClassCode && existing.code.startsWith(expectedPrefix)
        ? existing.code
        : nextClassStudentCode(primaryClassCode, students.filter((student) => student.id !== existing.id));
      const merged: Student = {
        ...existing,
        code,
        name: sourceStudent.name || existing.name,
        nickname: sourceStudent.nickname || existing.nickname,
        accountStatus: sourceStudent.accountStatus || existing.accountStatus,
        dob: sourceStudent.dob || existing.dob,
        gender: sourceStudent.gender === 'Chưa xác định' ? existing.gender : sourceStudent.gender,
        school: sourceStudent.school || existing.school,
        gradeLevel: sourceStudent.gradeLevel || existing.gradeLevel,
        address: sourceStudent.address || existing.address,
        parentName: sourceStudent.parentName || existing.parentName,
        status: sourceStudent.status,
        classId: primaryClassId,
        additionalClassIds: allClassIds.filter((id) => id !== primaryClassId),
        programId: primaryProgramId,
        additionalProgramIds: allProgramIds.filter((id) => id !== primaryProgramId),
      };
      students[index] = merged;
      studentByIdentity.set(identity, merged);
      updatedStudents += 1;
      continue;
    }

    const primaryClassId = mappedClassIds[0];
    const primaryClassCode = classes.find((item) => item.id === primaryClassId)?.code || '';
    const code = nextClassStudentCode(primaryClassCode, students);
    const primaryProgramId = classes.find((item) => item.id === primaryClassId)?.programId || mappedProgramIds[0] || '';
    const created: Student = {
      ...sourceStudent,
      id: `STU_ROSTER_${crypto.randomUUID()}`,
      code,
      classId: primaryClassId,
      additionalClassIds: mappedClassIds.slice(1),
      programId: primaryProgramId,
      additionalProgramIds: mappedProgramIds.filter((id) => id !== primaryProgramId),
    };
    students.push(created);
    studentByIdentity.set(identity, created);
    addedStudents += 1;
  }

  return {
    programs,
    classes: reconcileClassStudentIds(classes, students),
    students,
    summary: { addedPrograms, addedClasses, addedStudents, updatedStudents },
  };
}
