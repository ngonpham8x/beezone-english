import type { ClassRoom, Student } from '../types';

type Membership = Pick<Student, 'classId' | 'additionalClassIds'>;
export function studentClassIds(student: Membership): string[] {
  return [...new Set([student.classId, ...(student.additionalClassIds || [])].filter(Boolean))];
}
export function isStudentInClass(student: Membership, classId: string): boolean {
  return Boolean(classId) && studentClassIds(student).includes(classId);
}
export function studentClassNames(student: Membership, classes: ClassRoom[]): string {
  return studentClassIds(student).map(id => classes.find(c => c.id === id)?.name || id).join(' · ') || 'Chưa xếp lớp';
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
