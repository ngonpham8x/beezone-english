import type { SupabaseClient } from '@supabase/supabase-js';
import type { Teacher, UserAccount } from '../../types';
import type {
  Branch,
  DetailFilter,
  TaskPriority,
  TaskStatus,
  WorkFormState,
  WorkHandoff,
  WorkNote,
  WorkPerson,
  WorkReason,
  WorkRole,
  WorkTask,
} from './types';

export const WORK_LOCAL_STORAGE_KEY = 'BEEZONE_WORK_DATA_V1';

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

export function buildWorkPeople(
  currentUser: UserAccount | null | undefined,
  teachers: Teacher[] = [],
  extraPeople: WorkPerson[] = [],
): WorkPerson[] {
  const peopleMap = new Map<string, WorkPerson>();

  // 1. Add current user
  if (currentUser) {
    const userRole = mapUserToWorkRole(currentUser);
    peopleMap.set(currentUser.id, {
      user_id: currentUser.id,
      display_name: currentUser.name || currentUser.email || 'Quản lý trung tâm',
      email: currentUser.email || null,
      role: userRole,
      active: currentUser.active ?? true,
      teacherId: currentUser.permissions?.teacherId,
    });
  }

  // 2. Add all teachers from center store
  for (const t of teachers) {
    if (!t.id) continue;
    // Don't overwrite current user if IDs match, but attach details
    const existing = peopleMap.get(t.id);
    if (!existing) {
      peopleMap.set(t.id, {
        user_id: t.id,
        display_name: t.name,
        email: t.email || null,
        phone: t.phone,
        specialty: t.specialty,
        role: 'teacher',
        active: true,
        teacherId: t.id,
      });
    }
  }

  // 3. Merge extraPeople from database if available
  for (const p of extraPeople) {
    if (!p.user_id) continue;
    const existing = peopleMap.get(p.user_id);
    if (existing) {
      peopleMap.set(p.user_id, {
        ...existing,
        ...p,
        display_name: p.display_name || existing.display_name,
        email: p.email ?? existing.email,
        role: p.role || existing.role,
      });
    } else {
      peopleMap.set(p.user_id, p);
    }
  }

  return Array.from(peopleMap.values());
}

export interface WorkStorageState {
  tasks: WorkTask[];
  notes: WorkNote[];
  reasons: WorkReason[];
  handoffs: WorkHandoff[];
  source: 'supabase' | 'local';
}

function getInitialSampleData(today: string, currentUserId: string): Omit<WorkStorageState, 'source'> {
  const sampleTaskId1 = 'task-sample-1';
  const sampleTaskId2 = 'task-sample-2';
  const sampleTaskId3 = 'task-sample-3';

  return {
    tasks: [
      {
        id: sampleTaskId1,
        branch: 'admin',
        title: 'Điểm danh và liên hệ phụ huynh học viên vắng buổi sáng',
        description: 'Kiểm tra sĩ số các lớp học sáng nay, ghi chú lý do nghỉ và thông báo lịch học bù.',
        assigned_uid: currentUserId,
        work_date: today,
        shift_label: 'Ca sáng',
        class_label: 'Khối Mầm Non & Tiểu Học',
        priority: 'high',
        status: 'progress',
        needs_handover: false,
        completed_at: null,
        email_sent_at: null,
        email_sent_to: null,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        id: sampleTaskId2,
        branch: 'training',
        title: 'Chuẩn bị học liệu và bài kiểm tra tuần Unit 4',
        description: 'In ấn đề kiểm tra và chuẩn bị flashcard, file nghe cho các lớp chiều.',
        assigned_uid: currentUserId,
        work_date: today,
        shift_label: 'Ca chiều',
        class_label: 'Lớp Flyers & Movers',
        priority: 'normal',
        status: 'todo',
        needs_handover: false,
        completed_at: null,
        email_sent_at: null,
        email_sent_to: null,
        created_at: new Date(Date.now() - 7200000).toISOString(),
        updated_at: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: sampleTaskId3,
        branch: 'admin',
        title: 'Bàn giao sổ thu học phí và chìa khóa phòng cuối ca',
        description: 'Đối soát phiếu thu trong ngày, kiểm tra thiết bị phòng học trước khi đóng ca.',
        assigned_uid: currentUserId,
        work_date: today,
        shift_label: 'Cuối buổi',
        class_label: 'Quầy Lễ Tân',
        priority: 'high',
        status: 'progress',
        needs_handover: true,
        completed_at: null,
        email_sent_at: null,
        email_sent_to: null,
        created_at: new Date(Date.now() - 10800000).toISOString(),
        updated_at: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
    notes: [
      {
        id: 'note-sample-1',
        task_id: sampleTaskId1,
        author_uid: currentUserId,
        body: 'Đã gọi cho phụ huynh 2 bạn xin nghỉ ốm, ghi nhận học bù sang thứ 7.',
        created_at: new Date(Date.now() - 1800000).toISOString(),
      },
    ],
    reasons: [
      {
        id: 'reason-sample-1',
        task_id: sampleTaskId1,
        author_uid: currentUserId,
        kind: 'progress',
        body: 'Đang hoàn tất danh sách liên hệ trước 11:30.',
        created_at: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        id: 'reason-sample-2',
        task_id: sampleTaskId3,
        author_uid: currentUserId,
        kind: 'handover',
        body: 'Cần bàn giao cho nhân sự ca sau nhận sổ quỹ và thiết bị phòng P02.',
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
    handoffs: [],
  };
}

export function loadLocalWorkData(today: string, currentUserId: string): Omit<WorkStorageState, 'source'> {
  try {
    const raw = localStorage.getItem(WORK_LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.tasks)) {
        return {
          tasks: parsed.tasks,
          notes: Array.isArray(parsed.notes) ? parsed.notes : [],
          reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
          handoffs: Array.isArray(parsed.handoffs) ? parsed.handoffs : [],
        };
      }
    }
  } catch {
    // Local storage unavailable or corrupt
  }
  const sample = getInitialSampleData(today, currentUserId);
  saveLocalWorkData(sample);
  return sample;
}

export function saveLocalWorkData(data: Omit<WorkStorageState, 'source'>): void {
  try {
    localStorage.setItem(WORK_LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Local storage full or quota exceeded
  }
}

export async function fetchWorkModuleData(
  supabase: SupabaseClient | null | undefined,
  today: string,
  currentUserId: string,
): Promise<{ state: WorkStorageState; dbPeople: WorkPerson[]; dbRole: WorkRole | null }> {
  // If no Supabase client or not connected, use local storage immediately
  if (!supabase) {
    const local = loadLocalWorkData(today, currentUserId);
    return { state: { ...local, source: 'local' }, dbPeople: [], dbRole: null };
  }

  try {
    // Attempt to load from Supabase tables
    const [tasksRes, peopleRes] = await Promise.all([
      supabase.from('bz_work_tasks').select('*').order('work_date', { ascending: false }).limit(500),
      supabase.from('bz_work_people').select('user_id,display_name,email,role,active').eq('active', true),
    ]);

    // Check if table does not exist (e.g. 42P01 error)
    if (tasksRes.error) {
      // Gracefully fall back to local store
      const local = loadLocalWorkData(today, currentUserId);
      return { state: { ...local, source: 'local' }, dbPeople: [], dbRole: null };
    }

    const tasks = (tasksRes.data || []) as WorkTask[];
    const dbPeople = (peopleRes.data || []) as WorkPerson[];

    const taskIds = tasks.map((t) => t.id);
    let notes: WorkNote[] = [];
    let reasons: WorkReason[] = [];
    let handoffs: WorkHandoff[] = [];

    if (taskIds.length > 0) {
      const [nRes, rRes, hRes] = await Promise.all([
        supabase.from('bz_work_notes').select('*').in('task_id', taskIds).order('created_at', { ascending: true }),
        supabase.from('bz_work_reasons').select('*').in('task_id', taskIds).order('created_at', { ascending: true }),
        supabase.from('bz_work_handoffs').select('*').in('task_id', taskIds).order('handed_at', { ascending: false }),
      ]);
      if (!nRes.error && nRes.data) notes = nRes.data as WorkNote[];
      if (!rRes.error && rRes.data) reasons = rRes.data as WorkReason[];
      if (!hRes.error && hRes.data) handoffs = hRes.data as WorkHandoff[];
    }

    const myDbPerson = dbPeople.find((p) => p.user_id === currentUserId);
    const dbRole = myDbPerson ? myDbPerson.role : null;

    // Cache to local storage as well for seamless offline resilience
    saveLocalWorkData({ tasks, notes, reasons, handoffs });

    return {
      state: { tasks, notes, reasons, handoffs, source: 'supabase' },
      dbPeople,
      dbRole,
    };
  } catch {
    // Fall back to local
    const local = loadLocalWorkData(today, currentUserId);
    return { state: { ...local, source: 'local' }, dbPeople: [], dbRole: null };
  }
}

