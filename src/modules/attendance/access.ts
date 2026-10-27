import type { ClassRoom, UserAccount } from '../../types';

export const isAttendanceManagementRole = (user: UserAccount | null | undefined) =>
  Boolean(user?.active && ['owner', 'admin', 'trainer'].includes(user.role));

export function canViewAttendanceClass(
  user: UserAccount | null | undefined,
  classroom: Pick<ClassRoom, 'id' | 'teacherId'> | undefined,
): boolean {
  if (!user?.active || !classroom) return false;
  if (!user.permissions.student.view && !user.permissions.teacher.view) return false;
  if (isAttendanceManagementRole(user)) return true;
  return Boolean(
    user.permissions.assignedClassIds?.includes(classroom.id) ||
      (user.permissions.teacherId && user.permissions.teacherId === classroom.teacherId),
  );
}

export function canEditAttendanceClass(
  user: UserAccount | null | undefined,
  classroom: Pick<ClassRoom, 'id' | 'teacherId'> | undefined,
): boolean {
  if (!canViewAttendanceClass(user, classroom)) return false;
  return Boolean(
    isAttendanceManagementRole(user) ||
      user?.permissions.student.edit ||
      user?.permissions.teacher.edit,
  );
}

export function canShareSessionReview(
  user: UserAccount | null | undefined,
  classroom: Pick<ClassRoom, 'id' | 'teacherId'> | undefined,
  isOwner?: boolean,
): boolean {
  if (isOwner) return true;
  if (!user?.active) return false;
  if (isAttendanceManagementRole(user)) return true;
  return canViewAttendanceClass(user, classroom);
}
