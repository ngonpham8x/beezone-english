import type { AccountRole, UserRole } from '../types';

export const ACCOUNT_ROLE_OPTIONS: ReadonlyArray<{ value: AccountRole; label: string; description: string }> = [
  { value: 'owner', label: 'Chủ trung tâm', description: 'Toàn quyền quản trị' },
  { value: 'admin', label: 'Hành chính', description: 'Phân quyền hành chính' },
  { value: 'trainer', label: 'Đào tạo', description: 'Phân quyền đào tạo' },
  { value: 'teacher', label: 'Giáo viên', description: 'Phân quyền theo lớp phụ trách' },
];

/** Convert the retired `staff` value without granting any additional permissions. */
export function normalizeAccountRole(value: unknown): AccountRole | null {
  if (value === 'staff') return 'teacher';
  return ACCOUNT_ROLE_OPTIONS.some((option) => option.value === value) ? value as AccountRole : null;
}

export function accountRoleLabel(role: UserRole | string | null | undefined): string {
  const normalized = normalizeAccountRole(role);
  return ACCOUNT_ROLE_OPTIONS.find((option) => option.value === normalized)?.label || 'Giáo viên';
}
