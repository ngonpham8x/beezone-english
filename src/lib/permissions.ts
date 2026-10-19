import type { StaffPermissions, UserAccount } from '../types';

export const STAFF_PERMISSION_ACTIONS = {
  student: ['view', 'add', 'edit', 'delete', 'export'],
  teacher: ['view', 'edit', 'delete'],
  tuition: ['view', 'collect', 'delete', 'showDebt'],
  grade: ['view', 'edit'],
  excel: ['import', 'export'],
  report: ['view', 'revenue'],
  academic: ['programs', 'classes', 'rooms'],
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
    for (const action of actions) target[action] = source[action] === true;
  }
  if (Array.isArray(input.assignedClassIds)) result.assignedClassIds = input.assignedClassIds.filter((id): id is string => typeof id === 'string');
  if (typeof input.teacherId === 'string' && input.teacherId.trim()) result.teacherId = input.teacherId.trim();
  return result;
}

export function canManageAcademic(user: UserAccount | null, scope: keyof NonNullable<StaffPermissions['academic']>): boolean {
  return Boolean(user?.active && (user.role === 'owner' || user.permissions.academic?.[scope] === true));
}

export function hasStaffPermission(user: UserAccount | null, module: 'student' | 'teacher', action: 'add' | 'edit' | 'delete'): boolean {
  if (!user?.active) return false;
  // The existing teacher.edit grant covers both creating and editing teachers.
  const key = module === 'teacher' && action === 'add' ? 'edit' : action;
  return user.role === 'owner' || (user.permissions[module] as Record<string, boolean>)[key] === true;
}
