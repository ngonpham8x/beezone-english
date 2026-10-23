export type Branch = 'admin' | 'training';
export type TaskStatus = 'todo' | 'progress' | 'unfinished' | 'done';
export type TaskPriority = 'normal' | 'high';
export type WorkRole = 'manager' | 'admin' | 'trainer' | 'teacher';

export interface WorkPerson {
  user_id: string;
  display_name: string;
  email: string | null;
  role: WorkRole;
  active: boolean;
  department?: string;
  branch?: Branch;
  phone?: string;
  specialty?: string;
  teacherId?: string;
}

export interface WorkTask {
  id: string;
  branch: Branch;
  title: string;
  description: string;
  assigned_uid: string;
  work_date: string;
  shift_label: string;
  class_label: string;
  classId?: string;
  priority: TaskPriority;
  status: TaskStatus;
  needs_handover: boolean;
  completed_at: string | null;
  email_sent_at: string | null;
  email_sent_by?: string | null;
  email_sent_to: string | null;
  ack?: string;
  values?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface WorkNote {
  id: string;
  task_id: string;
  author_uid: string;
  author_name?: string;
  body: string;
  created_at: string;
}

export interface WorkReason {
  id: string;
  task_id: string;
  author_uid: string;
  author_name?: string;
  kind: 'progress' | 'done' | 'unfinished' | 'handover';
  body: string;
  created_at: string;
}

export interface WorkHandoff {
  id: string;
  task_id: string;
  from_uid: string;
  to_uid: string;
  note: string;
  handed_at: string;
  acknowledged_at: string | null;
  acknowledged_by?: string | null;
  ack_name?: string;
}

export interface WorkEvent {
  id: string | number;
  task_id: string;
  actor_uid: string;
  action: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface WorkFormState {
  title: string;
  description: string;
  branch: Branch;
  assigned_uid: string;
  work_date: string;
  shift_label: string;
  class_label: string;
  priority: TaskPriority;
  status?: TaskStatus;
  needs_handover?: boolean;
}

export interface CustomFieldDef {
  id: string;
  label: string;
  type: 'text' | 'date' | 'number';
}

export interface WorkSettings {
  page: string;
  admin: string;
  handover: string;
  training: string;
  accent: string;
  compact: boolean;
  customFields: CustomFieldDef[];
}

export type DetailFilter = 'all' | 'progress' | 'done' | 'handover';
