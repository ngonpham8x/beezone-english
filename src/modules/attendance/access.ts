import type { ClassRoom, ScheduleChange, Teacher, UserAccount } from '../../types';
import { isTeachingRole, linkedTeacherId } from '../../lib/accountScope';

export interface AttendanceAccessContext {
  date?: string;
  scheduleChanges?: readonly ScheduleChange[];
  teachers?: readonly Pick<Teacher, 'id' | 'email'>[];
}

export const isAttendanceManagementRole = (user: UserAccount | null | undefined) =>
  Boolean(user?.active && ['owner', 'admin', 'trainer'].includes(user.role));

export function attendanceTeacherId(
  user: UserAccount | null | undefined,
  teachers: AttendanceAccessContext['teachers'] = [],
): string | undefined {
  return linkedTeacherId(user, teachers || []);
}

export function isSubstituteTeacherForClassOnDate(
  user: UserAccount | null | undefined,
  classroom: Pick<ClassRoom, 'id'> | undefined,
  context: AttendanceAccessContext = {},
): boolean {
  if (!user?.active || !classroom || !context.date || isAttendanceManagementRole(user)) return false;
  const teacherId = attendanceTeacherId(user, context.teachers);
  if (!teacherId) return false;
  return Boolean(context.scheduleChanges?.some((change) =>
    change.kind === 'teacher_off' &&
    change.classId === classroom.id &&
    change.date === context.date &&
    change.substituteTeacherId === teacherId,
  ));
}

export function hasRegularAttendanceClassAccess(
  user: UserAccount | null | undefined,
  classroom: Pick<ClassRoom, 'id' | 'teacherId'> | undefined,
): boolean {
  if (!user?.active || !classroom) return false;
  if (isAttendanceManagementRole(user)) return true;
  return Boolean(
    user.permissions.assignedClassIds?.includes(classroom.id) ||
      (user.permissions.teacherId && user.permissions.teacherId === classroom.teacherId),
  );
}

export function canViewAttendanceClass(
  user: UserAccount | null | undefined,
  classroom: Pick<ClassRoom, 'id' | 'teacherId'> | undefined,
  context: AttendanceAccessContext = {},
): boolean {
  if (!user?.active || !classroom) return false;
  if (!user.permissions.student.view && !user.permissions.teacher.view) return false;
  return hasRegularAttendanceClassAccess(user, classroom) ||
    isSubstituteTeacherForClassOnDate(user, classroom, context);
}

export function canEditAttendanceClass(
  user: UserAccount | null | undefined,
  classroom: Pick<ClassRoom, 'id' | 'teacherId'> | undefined,
  context: AttendanceAccessContext = {},
): boolean {
  if (!canViewAttendanceClass(user, classroom, context)) return false;
  return Boolean(
    isAttendanceManagementRole(user) ||
      isTeachingRole(user?.role) ||
      user?.permissions.student.edit ||
      user?.permissions.teacher.edit,
  );
}

export function canShareSessionReview(
  user: UserAccount | null | undefined,
  classroom: Pick<ClassRoom, 'id' | 'teacherId'> | undefined,
  isOwner?: boolean,
  context: AttendanceAccessContext = {},
): boolean {
  if (isOwner) return true;
  if (!user?.active) return false;
  if (isAttendanceManagementRole(user)) return true;
  return canViewAttendanceClass(user, classroom, context);
}
