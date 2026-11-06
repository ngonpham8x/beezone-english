import type { ClassRoom, Student } from '../types';
import { nextClassStudentCode } from './identifiers';

type Membership = Pick<Student, 'classId' | 'additionalClassIds'>;
export function studentClassIds(student: Membership): string[] {
  return [...new Set([student.classId, ...(student.additionalClassIds || [])].filter(Boolean))];
}
export function isStudentInClass(student: Membership, classId: string): boolean {
  return Boolean(classId) && studentClassIds(student).includes(classId);
}

export function studentCodeForClass(student: Pick<Student, 'code' | 'classId' | 'classStudentCodes'>, classId: string): string {
  return student.classStudentCodes?.[classId]?.trim() || student.code;
}

export function nextStudentCodeForClass(
  classroom: Pick<ClassRoom, 'id' | 'code'>,
  students: Array<Pick<Student, 'id' | 'code' | 'classId' | 'classStudentCodes'>>,
  excludeStudentId?: string,
): string {
  const codes = students
    .filter((student) => student.id !== excludeStudentId)
    .map((student) => ({ code: student.classStudentCodes?.[classroom.id] || (student.classId === classroom.id ? student.code : '') }))
    .filter((item) => item.code);
  return nextClassStudentCode(classroom.code, codes);
}

/** Keep one stable, class-prefixed code for every membership and mirror the primary one to legacy `code`. */
export function reconcileStudentClassCodes(centerStudents: Student[], classrooms: ClassRoom[]): Student[] {
  const classById = new Map(classrooms.map((classroom) => [classroom.id, classroom]));
  const next: Student[] = centerStudents.map((student) => ({
    ...student,
    classStudentCodes: Object.fromEntries(
      Object.entries(student.classStudentCodes || {}).filter(([classId, value]) => (
        classById.has(classId) && typeof value === 'string' && value.trim()
      )),
    ),
  }));

  for (const classroom of classrooms) {
    // Keep historical codes reserved after a learner leaves a class, so a later learner
    // cannot receive a code that already appears in grades, attendance or receipts.
    const trackedStudents = next.filter((student) => (
      isStudentInClass(student, classroom.id) || Boolean(student.classStudentCodes?.[classroom.id])
    ));
    const used = new Set<string>();
    const usedCodes: string[] = [];
    const pending: Array<{ student: Student; suffix?: string }> = [];
    const prefix = `${classroom.code.trim()}-`;
    for (const student of trackedStudents) {
      const mapped = student.classStudentCodes?.[classroom.id]?.trim();
      const legacy = student.classId === classroom.id ? student.code.trim() : '';
      const candidate = mapped || legacy;
      const key = candidate.toLocaleUpperCase('vi-VN');
      if (candidate.startsWith(prefix) && /^\d+$/.test(candidate.slice(prefix.length)) && !used.has(key)) {
        student.classStudentCodes![classroom.id] = candidate;
        used.add(key);
        usedCodes.push(candidate);
      } else {
        delete student.classStudentCodes![classroom.id];
        pending.push({ student, suffix: candidate.match(/-(\d+)$/)?.[1] });
      }
    }
    for (const { student, suffix } of pending) {
      const preferredCode = suffix ? `${prefix}${suffix}` : '';
      const code = preferredCode && !used.has(preferredCode.toLocaleUpperCase('vi-VN'))
        ? preferredCode
        : nextClassStudentCode(classroom.code, usedCodes.map((value) => ({ code: value })));
      student.classStudentCodes![classroom.id] = code;
      used.add(code.toLocaleUpperCase('vi-VN'));
      usedCodes.push(code);
    }
  }

  let changed = false;
  const reconciled = next.map((student, index) => {
    const primaryCode = student.classId && classById.has(student.classId)
      ? student.classStudentCodes?.[student.classId]
      : undefined;
    const classStudentCodes = Object.keys(student.classStudentCodes || {}).length ? student.classStudentCodes : undefined;
    const value = { ...student, code: primaryCode || student.code, classStudentCodes };
    if (value.code !== centerStudents[index].code || JSON.stringify(value.classStudentCodes || {}) !== JSON.stringify(centerStudents[index].classStudentCodes || {})) changed = true;
    return value;
  });
  return changed ? reconciled : centerStudents;
}
export function studentClassNames(student: Membership, classes: ClassRoom[]): string {
  return (
    studentClassIds(student)
      .map((id) => classes.find((c) => c.id === id || c.code === id)?.name || id)
      .filter(Boolean)
      .map((name) => {
        if (typeof name === 'string' && /^CLASS_[0-9a-fA-F-]+$/.test(name)) {
          return 'Lớp học';
        }
        return name;
      })
      .join(' · ') || 'Chưa xếp lớp'
  );
}
export function validateStudentClasses(student: Student, classes: ClassRoom[], students: Student[]): string | null {
  const ids = studentClassIds(student);
  if ((student.additionalClassIds || []).some(id => typeof id !== 'string' || !id.trim()) ||
      new Set(student.additionalClassIds || []).size !== (student.additionalClassIds || []).length ||
      student.additionalClassIds?.includes(student.classId)) return 'Danh sách lớp học thêm không hợp lệ.';
  if (!student.classId && ids.length) return 'Chọn lớp chính trước khi đăng ký lớp học thêm.';
  if (student.status === 'active' && !ids.length) return 'Học viên đang học cần được xếp lớp.';
  for (const id of ids) {
    const classroom = classes.find(c => c.id === id);
    if (!classroom) return 'Lớp học không tồn tại.';
    const previous = students.find(s => s.id === student.id);
    if ((!previous || !isStudentInClass(previous, id)) && ['completed', 'paused'].includes(classroom.courseStatus || '')) return `Lớp ${classroom.name} đã kết thúc hoặc tạm dừng.`;
    if (student.status === 'active' && classroom.capacity > 0 && students.filter(s => s.id !== student.id && s.status === 'active' && isStudentInClass(s, id)).length >= classroom.capacity) return `Lớp ${classroom.name} đã đủ sĩ số.`;
  }
  return null;
}

export function classProgramIds(c: Pick<ClassRoom, 'programId' | 'additionalProgramIds'>): string[] {
  return [...new Set([c.programId, ...(c.additionalProgramIds || [])].filter(Boolean))];
}
export function classMatchesProgram(c: Pick<ClassRoom, 'programId' | 'additionalProgramIds'>, programId: string): boolean {
  if (!programId) return false;
  return classProgramIds(c).includes(programId);
}
