import type { ClassRoom, Student, Teacher, UserAccount, UserRole } from '../types';
import { isStudentInClass } from './studentClasses';

export const isTeachingRole = (role: UserRole | string | null | undefined): boolean =>
  role === 'teacher' || role === 'staff';

export const hasCenterWideClassScope = (user: UserAccount | null | undefined): boolean =>
  Boolean(user?.active && ['owner', 'admin', 'trainer'].includes(user.role));

export function linkedTeacherId(
  user: UserAccount | null | undefined,
  teachers: readonly Pick<Teacher, 'id' | 'email'>[],
): string | undefined {
  const explicit = user?.permissions.teacherId?.trim();
  if (explicit) return explicit;
  const email = user?.email?.trim().toLowerCase();
  if (!email) return undefined;
  return teachers.find((teacher) => teacher.email?.trim().toLowerCase() === email)?.id;
}

export function assignedClassIdsForAccount(
  user: UserAccount | null | undefined,
  classes: readonly Pick<ClassRoom, 'id' | 'teacherId'>[],
  teachers: readonly Pick<Teacher, 'id' | 'email' | 'assignedClassIds'>[],
): Set<string> {
  if (!user?.active) return new Set();
  if (hasCenterWideClassScope(user)) return new Set(classes.map((classroom) => classroom.id));
  if (!isTeachingRole(user.role)) return new Set(user.permissions.assignedClassIds || []);

  const result = new Set(user.permissions.assignedClassIds || []);
  const teacherId = linkedTeacherId(user, teachers);
  if (!teacherId) return result;
  const teacher = teachers.find((item) => item.id === teacherId);
  teacher?.assignedClassIds?.forEach((classId) => result.add(classId));
  classes.forEach((classroom) => {
    if (classroom.teacherId === teacherId) result.add(classroom.id);
  });
  return result;
}

export function canAccessAccountClass(
  user: UserAccount | null | undefined,
  classroom: Pick<ClassRoom, 'id' | 'teacherId'> | undefined,
  classes: readonly Pick<ClassRoom, 'id' | 'teacherId'>[],
  teachers: readonly Pick<Teacher, 'id' | 'email' | 'assignedClassIds'>[],
): boolean {
  if (!user?.active || !classroom) return false;
  return assignedClassIdsForAccount(user, classes, teachers).has(classroom.id);
}

export function classesVisibleToAccount(
  user: UserAccount | null | undefined,
  classes: readonly ClassRoom[],
  teachers: readonly Teacher[],
): ClassRoom[] {
  const allowed = assignedClassIdsForAccount(user, classes, teachers);
  return classes.filter((classroom) => allowed.has(classroom.id));
}

export function studentsVisibleToAccount(
  user: UserAccount | null | undefined,
  students: readonly Student[],
  classes: readonly ClassRoom[],
  teachers: readonly Teacher[],
): Student[] {
  if (!user?.active) return [];
  if (hasCenterWideClassScope(user)) return [...students];
  const allowed = assignedClassIdsForAccount(user, classes, teachers);
  return students.filter((student) => [...allowed].some((classId) => isStudentInClass(student, classId)));
}
