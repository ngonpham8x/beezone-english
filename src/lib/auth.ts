import type { Session, User } from '@supabase/supabase-js';
import type { StaffPermissions, UserAccount, UserRole } from '../types';

export interface ProfileRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
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

export const DEFAULT_ADMIN_PASSWORD = '11111111';
export const ADMIN_PASSWORDS_STORAGE_KEY = 'BEEZONE_ADMIN_PASSWORDS';

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

export function getAdminPassword(email: string): string {
  try {
    const raw = localStorage.getItem(ADMIN_PASSWORDS_STORAGE_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (typeof map[email.toLowerCase()] === 'string' && map[email.toLowerCase()].length > 0) {
        return map[email.toLowerCase()];
      }
    }
  } catch (e) {
    console.error(e);
  }
  return DEFAULT_ADMIN_PASSWORD;
}

export function setAdminPassword(email: string, newPassword: string): void {
  try {
    const raw = localStorage.getItem(ADMIN_PASSWORDS_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[email.toLowerCase()] = newPassword;
    localStorage.setItem(ADMIN_PASSWORDS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error(e);
  }
}

export function verifyAdminPassword(email: string, passwordAttempt: string): boolean {
  const currentPass = getAdminPassword(email);
  return currentPass === passwordAttempt;
}

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

export const DEV_MOCK_SESSION: Session = createMockSessionForAccount(DEV_OWNER_ACCOUNT);

function mergePermissions(candidate: Partial<StaffPermissions> | null): StaffPermissions {
  return {
    student: { ...DEFAULT_STAFF_PERMISSIONS.student, ...candidate?.student },
    teacher: { ...DEFAULT_STAFF_PERMISSIONS.teacher, ...candidate?.teacher },
    tuition: { ...DEFAULT_STAFF_PERMISSIONS.tuition, ...candidate?.tuition },
    grade: { ...DEFAULT_STAFF_PERMISSIONS.grade, ...candidate?.grade },
    excel: { ...DEFAULT_STAFF_PERMISSIONS.excel, ...candidate?.excel },
    report: { ...DEFAULT_STAFF_PERMISSIONS.report, ...candidate?.report },
    assignedClassIds: Array.isArray(candidate?.assignedClassIds) ? candidate.assignedClassIds : [],
    teacherId: typeof candidate?.teacherId === 'string' ? candidate.teacherId : undefined,
  };
}

export function profileToAccount(profile: ProfileRow, authUser: User): UserAccount {
  const fallbackName = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Người dùng';
  const fallbackAvatar = authUser.user_metadata?.avatar_url || '';

  return {
    id: profile.id,
    name: profile.full_name || fallbackName,
    email: authUser.email || '',
    avatar: profile.avatar_url || fallbackAvatar,
    role: profile.role,
    active: profile.is_active,
    permissions: profile.role === 'owner' ? OWNER_PERMISSIONS : mergePermissions(profile.permissions),
  };
}
