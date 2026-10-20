import type { StaffPermissions, UserAccount } from '../types';

export const STAFF_PERMISSION_ACTIONS = {
  student: ['view', 'add', 'edit', 'delete', 'export'],
  teacher: ['view', 'add', 'edit', 'delete'],
  tuition: ['view', 'collect', 'delete', 'showDebt'],
  grade: ['view', 'edit'],
  excel: ['import', 'export'],
  report: ['view', 'revenue'],
  academic: ['programs', 'classes', 'rooms', 'programsAdd', 'programsEdit', 'programsDelete', 'classesAdd', 'classesEdit', 'classesDelete', 'roomsAdd', 'roomsEdit', 'roomsDelete'],
} as const;

export function createStaffPermissions(enabled = false): StaffPermissions {
  return Object.fromEntries(Object.entries(STAFF_PERMISSION_ACTIONS).map(([module, actions]) => [
    module, Object.fromEntries(actions.map(action => [action, enabled])),
  ])) as unknown as StaffPermissions;
}

export function normalizeStaffPermissions(candidate: unknown): StaffPermissions {
  const input = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate as Record<string, unknown> : {};
  const result = createStaffPermissions();
  for (const [module, actions] of Object.entries(STAFF_PERMISSION_ACTIONS)) {
    const value = input[module];
    const source = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
    const target = result[module as keyof typeof STAFF_PERMISSION_ACTIONS] as Record<string, boolean>;
    for (const action of actions) {
      const fallback = module === 'teacher' && action === 'add' ? source.edit
        : module === 'academic' && /(?:Add|Edit|Delete)$/.test(action) ? source[action.replace(/(?:Add|Edit|Delete)$/, '')] : false;
      target[action] = (Object.prototype.hasOwnProperty.call(source, action) ? source[action] : fallback) === true;
    }
  }
  if (Array.isArray(input.assignedClassIds)) result.assignedClassIds = input.assignedClassIds.filter((id): id is string => typeof id === 'string');
  if (typeof input.teacherId === 'string' && input.teacherId.trim()) result.teacherId = input.teacherId.trim();
  return result;
}

export type AcademicScope = 'programs' | 'classes' | 'rooms';
export type CrudAction = 'add' | 'edit' | 'delete';
export function academicPermission(permissions: StaffPermissions | undefined, scope: AcademicScope, action: CrudAction): boolean {
  const key = `${scope}${action[0].toUpperCase()}${action.slice(1)}` as `${AcademicScope}${'Add' | 'Edit' | 'Delete'}`;
  const grants = permissions?.academic;
  return (grants && Object.prototype.hasOwnProperty.call(grants, key) ? grants[key] : grants?.[scope]) === true;
}
export function canManageAcademic(user: UserAccount | null, scope: AcademicScope, action: CrudAction = 'edit'): boolean {
  return Boolean(user?.active && (user.role === 'owner' || academicPermission(user.permissions, scope, action)));
}

export function hasStaffPermission(user: UserAccount | null, module: 'student' | 'teacher', action: 'add' | 'edit' | 'delete'): boolean {
  if (!user?.active) return false;
  // Legacy profiles inherit teacher creation from edit only when add is absent.
  const permissions = user.permissions[module] as Record<string, boolean>;
  return user.role === 'owner' || (Object.prototype.hasOwnProperty.call(permissions, action) ? permissions[action] : module === 'teacher' && action === 'add' ? permissions.edit : false) === true;
}
