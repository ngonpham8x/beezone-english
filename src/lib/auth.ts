import type { Session, User } from '@supabase/supabase-js';
import type { StaffPermissions, UserAccount, UserRole } from '../types';
import { PRIVATE_ACCOUNT_LABEL } from './accountPrivacy';

export interface ProfileRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  is_private?: boolean;
  permissions: Partial<StaffPermissions> | null;
}

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
  student: { view: true, add: true, edit: true, delete: false, export: false },
  teacher: { view: true, edit: true, delete: false },
  tuition: { view: true, collect: true, delete: false, showDebt: false },
  grade: { view: true, edit: true },
  excel: { import: true, export: false },
  report: { view: false, revenue: false },
};

export const OWNER_PERMISSIONS: StaffPermissions = {
  student: { view: true, add: true, edit: true, delete: true, export: true },
  teacher: { view: true, edit: true, delete: true },
  tuition: { view: true, collect: true, delete: true, showDebt: true },
  grade: { view: true, edit: true },
  excel: { import: true, export: true },
  report: { view: true, revenue: true },
};

export const DEV_OWNER_ACCOUNT: UserAccount = {
  id: 'dev-owner-beezone-1',
  name: 'Chủ Trung Tâm BeeZone',
  email: 'beezone.englishcenter@gmail.com',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  role: 'owner',
  active: true,
  permissions: OWNER_PERMISSIONS,
};

export const DEV_OWNER_ACCOUNT_2: UserAccount = {
  id: 'dev-owner-beezone-2',
  name: 'Ban Quản Trị BeeZone',
  email: 'chauoaingua679@gmail.com',
  avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
  role: 'owner',
  active: true,
  permissions: OWNER_PERMISSIONS,
};

export const ADMIN_ACCOUNTS: UserAccount[] = [
  DEV_OWNER_ACCOUNT,
  DEV_OWNER_ACCOUNT_2,
];

export function findAdminAccountByEmail(email: string): UserAccount | null {
  const norm = email.trim().toLowerCase();
  return ADMIN_ACCOUNTS.find(acc => acc.email.toLowerCase() === norm) || null;
}

export const DEV_TEACHER_ACCOUNT: UserAccount = {
  id: 'dev-teacher-maianh',
  name: 'Cô Mai Anh (GV BeeZone)',
  email: 'maianh.nguyen@beezone.edu.vn',
  avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
  role: 'staff',
  active: true,
  permissions: {
    ...DEFAULT_STAFF_PERMISSIONS,
    teacherId: 'TEA-002',
    assignedClassIds: ['CLS-KIDDY-1', 'CLS-STARTERS-1'],
  },
};

export function createMockSessionForAccount(account: UserAccount): Session {
  return {
    access_token: `local-preview-token-${account.id}`,
    refresh_token: `local-preview-refresh-${account.id}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: account.id,
      app_metadata: {},
      user_metadata: { full_name: account.name },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: account.email,
    },
  };
}

export function mergePermissions(candidate: Partial<StaffPermissions> | null): StaffPermissions {
  const result = Object.fromEntries(Object.entries(DEFAULT_STAFF_PERMISSIONS).map(([module, actions]) => [
    module, Object.fromEntries(Object.keys(actions).map(action => [action, candidate?.[module]?.[action] === true]))
  ])) as unknown as StaffPermissions;
  result.assignedClassIds = Array.isArray(candidate?.assignedClassIds) ? candidate.assignedClassIds.filter(id => typeof id === 'string') : [];
  result.teacherId = typeof candidate?.teacherId === 'string' ? candidate.teacherId : undefined;
  return result;
}

export function profileToAccount(profile: ProfileRow, authUser: User): UserAccount {
  const fallbackName = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Người dùng';
  const fallbackAvatar = authUser.user_metadata?.avatar_url || '';

  return {
    id: profile.id,
    name: profile.is_private === true ? PRIVATE_ACCOUNT_LABEL : profile.full_name || fallbackName,
    email: authUser.email || '',
    avatar: profile.is_private === true ? '' : profile.avatar_url || fallbackAvatar,
    role: profile.role,
    active: profile.is_active,
    isPrivate: profile.is_private === true,
    permissions: profile.role === 'owner' ? OWNER_PERMISSIONS : mergePermissions(profile.permissions),
  };
}
