import type { SupabaseClient } from '@supabase/supabase-js';
import type { Teacher, UserAccount } from '../../types';
import type {
  Branch,
  CustomFieldDef,
  DetailFilter,
  TaskPriority,
  TaskStatus,
  WorkFormState,
  WorkHandoff,
  WorkNote,
  WorkPerson,
  WorkReason,
  WorkRole,
  WorkSettings,
  WorkTask,
} from './types';

export const WORK_LOCAL_STORAGE_KEY = 'BEEZONE_WORK_DATA_V2';
export const WORK_SETTINGS_KEY = 'BEEZONE_WORK_SETTINGS_V2';

export const localISODate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export const timeVN = (x?: string | null) =>
  x
    ? new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(x))
    : '';

export const dateVN = (x?: string | null) => {
  if (!x) return '';
  const parts = x.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return x;
};

export const statusName: Record<TaskStatus, string> = {
  todo: 'Chưa làm',
  progress: 'Đang làm',
  unfinished: 'Còn dang dở',
  done: 'Hoàn thành',
};

export const validEmail = (email: string | null | undefined) =>
  Boolean(
    email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      !email.endsWith('@example.com') &&
      !email.endsWith('.example'),
  );

export function mapUserToWorkRole(user: UserAccount): WorkRole {
  if (user.role === 'owner') return 'manager';
  if (user.permissions.teacherId || (user.permissions.assignedClassIds && user.permissions.assignedClassIds.length > 0)) {
    return 'teacher';
  }
  if (user.permissions.academic?.programs || user.permissions.academic?.classes) {
    return 'trainer';
  }
  return 'admin';
}

export const HIDDEN_WORK_EMAILS = ['tayninhdoimoi@gmail.com'];

export function isHiddenWorkEmail(email?: string | null): boolean {
  if (!email) return false;
  return HIDDEN_WORK_EMAILS.includes(email.trim().toLowerCase());
}

export const DEFAULT_AUTHORIZED_ACCOUNTS: WorkPerson[] = [
  {
    user_id: 'acc-daotao',
    display_name: 'BeeZone Đào Tạo',
    email: 'phongdaotao.beezone@gmail.com',
    department: 'Nhân viên',
    branch: 'training',
    role: 'trainer',
    active: true,
  },
  {
    user_id: 'acc-chauoaingua',
    display_name: 'Oai Ngua Châu',
    email: 'chauoaingua679@gmail.com',
    department: 'Chủ trung tâm',
    branch: 'admin',
    role: 'manager',
    active: true,
  },
  {
    user_id: 'acc-hanhchinh',
    display_name: 'BeeZone Hành Chính',
    email: 'phonghanhchinh.beezone@gmail.com',
    department: 'Hành chính',
    branch: 'admin',
    role: 'admin',
    active: true,
  },
];

export const WORK_EXTRA_PEOPLE_KEY = 'BEEZONE_WORK_EXTRA_PEOPLE_V2';

export function loadLocalExtraPeople(): WorkPerson[] {
  try {
    const raw = localStorage.getItem(WORK_EXTRA_PEOPLE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((p) => p && !isHiddenWorkEmail(p.email));
      }
    }
  } catch (e) {
    console.warn('Error reading local extra people:', e);
  }
  return [];
}

export function saveLocalExtraPeople(extraPeople: WorkPerson[]) {
  try {
    const clean = extraPeople.filter((p) => p && !isHiddenWorkEmail(p.email));
    localStorage.setItem(WORK_EXTRA_PEOPLE_KEY, JSON.stringify(clean));
  } catch (e) {
    console.warn('Cannot write extra people to localStorage:', e);
  }
}

export function defaultDemoPeople(): WorkPerson[] {
  return [];
}

export function buildWorkPeople(
  currentUser: UserAccount | null | undefined,
  teachers: Teacher[] = [],
  extraPeople: WorkPerson[] = [],
): WorkPerson[] {
  const peopleMap = new Map<string, WorkPerson>();

  // 1. Add current user (excluding hidden emails like tayninhdoimoi@gmail.com)
  if (currentUser && !isHiddenWorkEmail(currentUser.email)) {
    const userRole = mapUserToWorkRole(currentUser);
    peopleMap.set(currentUser.id, {
      user_id: currentUser.id,
      display_name: currentUser.name || currentUser.email || 'Quản lý trung tâm',
      email: currentUser.email || null,
      department: userRole === 'teacher' ? 'Giáo viên' : userRole === 'trainer' ? 'Đào tạo' : 'Hành chính',
      branch: userRole === 'teacher' || userRole === 'trainer' ? 'training' : 'admin',
      role: userRole,
      active: currentUser.active ?? true,
      teacherId: currentUser.permissions?.teacherId,
    });
  }

  // 2. Add default authorized accounts from center management (BeeZone Đào Tạo, Oai Ngua Châu, BeeZone Hành Chính)
  for (const acc of DEFAULT_AUTHORIZED_ACCOUNTS) {
    if (!isHiddenWorkEmail(acc.email)) {
      const existingByEmail = Array.from(peopleMap.values()).find(
        (p) => p.email && p.email.toLowerCase() === acc.email?.toLowerCase(),
      );
      if (existingByEmail) {
        peopleMap.set(existingByEmail.user_id, {
          ...existingByEmail,
          display_name: acc.display_name,
          department: acc.department,
        });
      } else {
        peopleMap.set(acc.user_id, acc);
      }
    }
  }

  // 3. Add all teachers from center store
  for (const t of teachers) {
    if (!t.id || isHiddenWorkEmail(t.email)) continue;
    const existing = peopleMap.get(t.id);
    if (!existing) {
      peopleMap.set(t.id, {
        user_id: t.id,
        display_name: t.name,
        email: t.email || null,
        department: 'Giáo viên',
        branch: 'training',
        phone: t.phone,
        specialty: t.specialty,
        role: 'teacher',
        active: true,
        teacherId: t.id,
      });
    }
  }

  // 4. Merge extraPeople from database/localStorage if available
  for (const p of extraPeople) {
    if (!p.user_id || isHiddenWorkEmail(p.email)) continue;
    const existing = peopleMap.get(p.user_id);
    const isSpecialHanhChinh =
      p.user_id === 'acc-hanhchinh' || p.email === 'phonghanhchinh.beezone@gmail.com';
    if (existing) {
      peopleMap.set(p.user_id, {
        ...existing,
        ...p,
        department: isSpecialHanhChinh ? 'Hành chính' : (p.department || existing.department),
        display_name: p.display_name || existing.display_name,
        email: p.email ?? existing.email,
        role: p.role || existing.role,
      });
    } else {
      peopleMap.set(p.user_id, {
        ...p,
        department: isSpecialHanhChinh ? 'Hành chính' : p.department,
      });
    }
  }

  return Array.from(peopleMap.values()).filter((p) => !isHiddenWorkEmail(p.email));
}

export interface WorkStorageState {
  tasks: WorkTask[];
  notes: WorkNote[];
  reasons: WorkReason[];
  handoffs: WorkHandoff[];
  source: 'supabase' | 'local';
}

export function defaultSettings(): WorkSettings {
  return {
    page: 'Giao việc & Bàn giao',
    admin: 'Việc hôm nay · Hành chính',
    handover: 'Bàn giao cuối ca / cuối buổi',
    training: 'Việc giáo viên theo lớp',
    accent: '#ffc627',
    compact: false,
    customFields: [],
  };
}

export function getEmptyWorkData(): Omit<WorkStorageState, 'source'> {
  return {
    tasks: [],
    notes: [],
    reasons: [],
    handoffs: [],
  };
}

export function getInitialSampleData(today: string, currentUserId: string): Omit<WorkStorageState, 'source'> {
  return getEmptyWorkData();
}

export function saveLocalWorkData(state: Omit<WorkStorageState, 'source'>) {
  try {
    localStorage.setItem(WORK_LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Cannot write to localStorage:', e);
  }
}

export function loadLocalWorkData(today: string, currentUserId: string): Omit<WorkStorageState, 'source'> {
  try {
    const raw = localStorage.getItem(WORK_LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.tasks) && Array.isArray(parsed.notes)) {
        // Strip out any previous demo tasks
        const cleanTasks = (parsed.tasks as WorkTask[]).filter(
          (t) => !['t1', 't2', 't3', 't4', 't5', 't6'].includes(t.id),
        );
        const cleanNotes = (parsed.notes as WorkNote[]).filter(
          (n) => !['n1', 'n2', 'n4', 'n5'].includes(n.id),
        );
        const cleanReasons = ((parsed.reasons || []) as WorkReason[]).filter(
          (r) => !['r1', 'r2', 'r3', 'r4'].includes(r.id),
        );
        const cleanHandoffs = ((parsed.handoffs || []) as WorkHandoff[]).filter(
          (h) => !['h2'].includes(h.id),
        );
        return {
          tasks: cleanTasks,
          notes: cleanNotes,
          reasons: cleanReasons,
          handoffs: cleanHandoffs,
        };
      }
    }
  } catch (e) {
    console.warn('Error reading local work storage:', e);
  }
  const empty = getEmptyWorkData();
  saveLocalWorkData(empty);
  return empty;
}

export async function fetchWorkModuleData(
  supabase: SupabaseClient | null | undefined,
  today: string,
  currentUserId: string,
): Promise<WorkStorageState> {
  if (!supabase) {
    const local = loadLocalWorkData(today, currentUserId);
    return { ...local, source: 'local' };
  }

  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      const local = loadLocalWorkData(today, currentUserId);
      return { ...local, source: 'local' };
    }

    const [tasksRes, notesRes, reasonsRes, handoffsRes] = await Promise.all([
      supabase.from('bz_work_tasks').select('*').order('work_date', { ascending: false }).limit(500),
      supabase.from('bz_work_notes').select('*').order('created_at', { ascending: true }),
      supabase.from('bz_work_reasons').select('*').order('created_at', { ascending: true }),
      supabase.from('bz_work_handoffs').select('*').order('handed_at', { ascending: false }),
    ]);

    if (tasksRes.error || !tasksRes.data) {
      const local = loadLocalWorkData(today, currentUserId);
      return { ...local, source: 'local' };
    }

    return {
      tasks: tasksRes.data as WorkTask[],
      notes: (notesRes.data || []) as WorkNote[],
      reasons: (reasonsRes.data || []) as WorkReason[],
      handoffs: (handoffsRes.data || []) as WorkHandoff[],
      source: 'supabase',
    };
  } catch {
    const local = loadLocalWorkData(today, currentUserId);
    return { ...local, source: 'local' };
  }
}
