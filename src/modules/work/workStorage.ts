import type { SupabaseClient } from '@supabase/supabase-js';
import { accountRoleLabel, normalizeAccountRole } from '../../lib/accountRoles';
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

export function newWorkId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
  if (user.role === 'admin') return 'admin';
  if (user.role === 'trainer') return 'trainer';
  if (user.role === 'teacher') return 'teacher';
  // Legacy `staff` sessions did not carry a department, so retain the old inference.
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

export function getAssignableWorkPeople(
  people: WorkPerson[],
  branch: Branch,
): WorkPerson[] {
  if (branch === 'admin') {
    return people.filter((person) => person.role === 'manager' || person.role === 'admin');
  }
  return people;
}

export const DEFAULT_AUTHORIZED_ACCOUNTS: WorkPerson[] = [
  {
    user_id: 'acc-daotao',
    display_name: 'BeeZone Đào Tạo',
    email: 'phongdaotao.beezone@gmail.com',
    department: 'Đào tạo',
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
  {
    user_id: 'acc-bichnhu',
    display_name: 'Nguyễn Bích Như',
    email: 'nhu.beezone@gmail.com',
    department: 'Hành chính',
    branch: 'admin',
    role: 'admin',
    active: true,
  },
  {
    user_id: 'acc-bichtuyen',
    display_name: 'Cao Dương Bích Tuyền',
    email: 'vgen8642@gmail.com',
    department: 'Hành chính',
    branch: 'admin',
    role: 'admin',
    active: true,
  },
];

export const MANAGED_USERS_CACHE_KEY = 'BEEZONE_MANAGED_USERS_CACHE';

export function loadCachedManagedUsers(): WorkPerson[] {
  try {
    const raw = localStorage.getItem(MANAGED_USERS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((u) => u && typeof u.email === 'string' && u.email && !isHiddenWorkEmail(u.email) && u.is_active !== false)
          .map((u) => {
            const accountRole = normalizeAccountRole(u.role) || 'teacher';
            const workRole: WorkRole = accountRole === 'owner' ? 'manager' : accountRole;
            return {
              user_id: u.id || `acc-${u.email}`,
              display_name: u.full_name || u.name || u.email || 'Nhân sự BeeZone',
              email: u.email,
              department: accountRoleLabel(accountRole),
              branch: (workRole === 'trainer' || workRole === 'teacher' ? 'training' : 'admin') as Branch,
              role: workRole,
              active: u.is_active ?? true,
              teacherId: u.permissions?.teacherId,
            };
          });
      }
    }
  } catch (e) {
    console.warn('Cannot load cached managed users:', e);
  }
  return [];
}

export function saveCachedManagedUsers(users: unknown[]) {
  try {
    localStorage.setItem(MANAGED_USERS_CACHE_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('Cannot save cached managed users:', e);
  }
}

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
  if (currentUser && !currentUser.isPrivate && !isHiddenWorkEmail(currentUser.email)) {
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

  // 2. Add default authorized accounts from center management (BeeZone Đào Tạo, Oai Ngua Châu, BeeZone Hành Chính, Nguyễn Bích Như, Cao Dương Bích Tuyền)
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
          role: acc.role,
          branch: acc.branch,
        });
      } else {
        peopleMap.set(acc.user_id, acc);
      }
    }
  }

  // 2b. Add cached managed accounts from system permissions directory
  const cachedAccounts = loadCachedManagedUsers();
  for (const acc of cachedAccounts) {
    if (!isHiddenWorkEmail(acc.email)) {
      const existingByEmail = Array.from(peopleMap.values()).find(
        (p) => p.email && p.email.toLowerCase() === acc.email?.toLowerCase(),
      );
      if (existingByEmail) {
        peopleMap.set(existingByEmail.user_id, {
          ...existingByEmail,
          display_name: acc.display_name || existingByEmail.display_name,
          department: acc.department || existingByEmail.department,
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
    const existingByEmail = p.email
      ? Array.from(peopleMap.entries()).find(
          ([, item]) => item.email && item.email.toLowerCase() === p.email!.toLowerCase(),
        )
      : undefined;

    const isSpecialHanhChinh =
      p.user_id === 'acc-hanhchinh' || p.email === 'phonghanhchinh.beezone@gmail.com';

    if (existingByEmail) {
      const [existingKey, existing] = existingByEmail;
      // If server provides a real UUID while we had dummy 'acc-xxx', replace the key
      if (existingKey !== p.user_id && existingKey.startsWith('acc-')) {
        peopleMap.delete(existingKey);
      }
      peopleMap.set(p.user_id, {
        ...existing,
        ...p,
        department: isSpecialHanhChinh ? 'Hành chính' : (p.department || existing.department),
        display_name: isSpecialHanhChinh ? 'BeeZone Hành Chính' : (p.display_name || existing.display_name),
        email: p.email ?? existing.email,
        role: isSpecialHanhChinh ? 'admin' : (p.role || existing.role),
        branch: isSpecialHanhChinh ? 'admin' : (p.branch || existing.branch),
      });
    } else {
      const existing = peopleMap.get(p.user_id);
      if (existing) {
        peopleMap.set(p.user_id, {
          ...existing,
          ...p,
          department: isSpecialHanhChinh ? 'Hành chính' : (p.department || existing.department),
          display_name: isSpecialHanhChinh ? 'BeeZone Hành Chính' : (p.display_name || existing.display_name),
          email: p.email ?? existing.email,
          role: isSpecialHanhChinh ? 'admin' : (p.role || existing.role),
          branch: isSpecialHanhChinh ? 'admin' : (p.branch || existing.branch),
        });
      } else {
        peopleMap.set(p.user_id, {
          ...p,
          department: isSpecialHanhChinh ? 'Hành chính' : p.department,
          display_name: isSpecialHanhChinh ? 'BeeZone Hành Chính' : p.display_name,
          role: isSpecialHanhChinh ? 'admin' : p.role,
          branch: isSpecialHanhChinh ? 'admin' : p.branch,
        });
      }
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
  people?: WorkPerson[];
}

function mapServerWorkPeople(rows: Array<Record<string, unknown>>): WorkPerson[] {
  return rows
    .filter((person) => typeof person.user_id === 'string' && person.user_id.length > 0)
    .map((person) => ({
      user_id: String(person.user_id),
      display_name: String(person.display_name || 'Nhân sự BeeZone'),
      email: typeof person.email === 'string' ? person.email : null,
      role: person.role as WorkRole,
      active: Boolean(person.active),
      department: String(person.department || ''),
      branch: (person.branch === 'training' ? 'training' : 'admin') as Branch,
      teacherId: typeof person.teacher_id === 'string' ? person.teacher_id : undefined,
    }));
}

export async function fetchWorkPeople(
  supabase: SupabaseClient,
): Promise<WorkPerson[]> {
  const { data, error } = await supabase.rpc('bz_work_sync_people');
  if (error) throw error;
  return mapServerWorkPeople((data || []) as Array<Record<string, unknown>>);
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
  if (supabase) {
    const [peopleResult, tasksResult, notesResult, reasonsResult, handoffsResult] = await Promise.all([
      supabase.rpc('bz_work_sync_people'),
      supabase.from('bz_work_tasks').select('*').order('work_date', { ascending: false }),
      supabase.from('bz_work_notes').select('*').order('created_at', { ascending: true }),
      supabase.from('bz_work_reasons').select('*').order('created_at', { ascending: true }),
      supabase.from('bz_work_handoffs').select('*').order('handed_at', { ascending: false }),
    ]);
    const error = peopleResult.error || tasksResult.error || notesResult.error || reasonsResult.error || handoffsResult.error;
    if (error) throw error;
    const serverPeople = mapServerWorkPeople((peopleResult.data || []) as Array<Record<string, unknown>>);
    const mapTask = (row: Record<string, unknown>): WorkTask => ({
      ...(row as unknown as WorkTask),
      id: String(row.id), assigned_uid: String(row.assigned_uid),
      email_sent_to: typeof row.email_sent_to === 'string'
        ? (serverPeople.find((person) => person.user_id === row.email_sent_to)?.email || row.email_sent_to)
        : null,
      classId: typeof row.class_id === 'string' ? row.class_id : undefined,
      is_teacher_off: Boolean(row.is_teacher_off),
      substitute_teacher_id: typeof row.substitute_teacher_id === 'string' ? row.substitute_teacher_id : undefined,
      schedule_change_id: typeof row.schedule_change_id === 'string' ? row.schedule_change_id : undefined,
      values: (row.values && typeof row.values === 'object' ? row.values : undefined) as Record<string, string> | undefined,
    });
    const remote = {
      tasks: ((tasksResult.data || []) as Array<Record<string, unknown>>).map(mapTask),
      notes: ((notesResult.data || []) as WorkNote[]).map((note) => ({
        ...note,
        author_name: serverPeople.find((person) => person.user_id === note.author_uid)?.display_name || note.author_name,
      })),
      reasons: ((reasonsResult.data || []) as WorkReason[]).map((reason) => ({
        ...reason,
        author_name: serverPeople.find((person) => person.user_id === reason.author_uid)?.display_name || reason.author_name,
      })),
      handoffs: ((handoffsResult.data || []) as WorkHandoff[]),
    };
    return { ...remote, source: 'supabase', people: serverPeople };
  }
  const local = loadLocalWorkData(today, currentUserId);
  return { ...local, source: 'local' };
}

export async function syncWorkModuleData(
  supabase: SupabaseClient,
  state: Omit<WorkStorageState, 'source'>,
  expectedTasks: WorkTask[],
): Promise<void> {
  const pendingIds = new Set(state.tasks.filter((task) => task.sync_pending).map((task) => task.id));
  const { error } = await supabase.rpc('bz_work_sync_snapshot', {
    p_tasks: state.tasks.filter((task) => !task.sync_pending),
    p_expected_tasks: expectedTasks,
    p_notes: state.notes.filter((item) => !pendingIds.has(item.task_id)),
    p_reasons: state.reasons.filter((item) => !pendingIds.has(item.task_id)),
    p_handoffs: state.handoffs.filter((item) => !pendingIds.has(item.task_id)),
  });
  if (error) throw error;
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function prepareLocalWorkSync(
  remote: Omit<WorkStorageState, 'source' | 'people'>,
  local: Omit<WorkStorageState, 'source' | 'people'>,
  localPeople: WorkPerson[],
  serverPeople: WorkPerson[],
  currentUserId: string,
): Omit<WorkStorageState, 'source' | 'people'> {
  const serverIds = new Set(remote.tasks.map((task) => task.id));
  const remoteById = new Map(remote.tasks.map((task) => [task.id, task]));
  const serverByEmail = new Map(serverPeople.filter((person) => person.email).map((person) => [person.email!.toLowerCase(), person]));
  const serverByTeacher = new Map(serverPeople.filter((person) => person.teacherId).map((person) => [person.teacherId!, person]));
  const localById = new Map(localPeople.map((person) => [person.user_id, person]));
  const actor = serverPeople.find((person) => person.user_id === currentUserId);
  const personId = (id: string): string | null => {
    if (serverPeople.some((person) => person.user_id === id)) return id;
    const localPerson = localById.get(id);
    if (!localPerson) return null;
    const match = (localPerson.email && serverByEmail.get(localPerson.email.toLowerCase())) ||
      (localPerson.teacherId && serverByTeacher.get(localPerson.teacherId));
    return match?.user_id || null;
  };
  const taskIdMap = new Map<string, string>();
  const imported: WorkTask[] = [];
  const pending: WorkTask[] = [];
  for (const task of local.tasks) {
    const serverTask = remoteById.get(task.id);
    if (serverTask) {
      if (Date.parse(task.updated_at) > Date.parse(serverTask.updated_at)) {
        const assignee = personId(task.assigned_uid);
        const mayEdit = actor && (task.branch === 'admin'
          ? actor.role === 'manager' || actor.role === 'admin'
          : actor.role === 'manager' || actor.role === 'admin' || actor.role === 'trainer' || (actor.role === 'teacher' && assignee === currentUserId));
        if (assignee && mayEdit) {
          taskIdMap.set(task.id, task.id);
          imported.push({ ...task, assigned_uid: assignee, sync_pending: false });
        }
      }
      continue;
    }
    if (serverIds.has(task.id)) continue;
    const assignee = personId(task.assigned_uid);
    const mayImport = Boolean(actor && (task.branch === 'admin'
      ? actor.role === 'manager' || actor.role === 'admin'
      : actor.role === 'manager' || actor.role === 'admin' || actor.role === 'trainer'));
    if (!assignee || !mayImport) {
      pending.push({ ...task, sync_pending: true });
      continue;
    }
    const nextId = isUuid(task.id) ? task.id : newWorkId();
    taskIdMap.set(task.id, nextId);
    imported.push({ ...task, id: nextId, assigned_uid: assignee, updated_at: task.updated_at || new Date().toISOString() });
  }
  const importedTaskIds = new Set(taskIdMap.keys());
  const mapChildren = <T extends { id: string; task_id: string }>(items: T[]): T[] => items
    .filter((item) => importedTaskIds.has(item.task_id))
    .map((item) => ({ ...item, id: isUuid(item.id) ? item.id : newWorkId(), task_id: taskIdMap.get(item.task_id)! }));
  const notes = mapChildren(local.notes).map((note) => ({ ...note, author_uid: personId(note.author_uid) || currentUserId }));
  const reasons = mapChildren(local.reasons).map((reason) => ({ ...reason, author_uid: personId(reason.author_uid) || currentUserId }));
  const handoffs = local.handoffs.filter((handoff) => importedTaskIds.has(handoff.task_id) && !handoff.acknowledged_at && personId(handoff.from_uid) && personId(handoff.to_uid))
    .map((handoff) => ({ ...handoff, id: isUuid(handoff.id) ? handoff.id : newWorkId(), task_id: taskIdMap.get(handoff.task_id)!, from_uid: personId(handoff.from_uid)!, to_uid: personId(handoff.to_uid)! }));
  return {
    tasks: [...imported, ...remote.tasks, ...pending],
    notes: [...remote.notes, ...notes],
    reasons: [...remote.reasons, ...reasons],
    handoffs: [...handoffs, ...remote.handoffs],
  };
}
