import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../../lib/supabase';
import type {
  ClassRoom,
  CourseProgram,
  Room,
  ScheduleChange,
  Teacher,
  TimetableSlot,
  UserAccount,
} from '../../types';
import { weekdayForDate } from '../../lib/operations';
import { ACCOUNT_DIRECTORY_CHANGED_EVENT } from '../../lib/appEvents';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import './beezone-work.css';
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
import {
  buildWorkPeople,
  dateVN,
  defaultSettings,
  fetchWorkPeople,
  fetchWorkModuleData,
  getAssignableWorkPeople,
  loadLocalWorkData,
  localISODate,
  mapUserToWorkRole,
  newWorkId,
  saveLocalWorkData,
  syncWorkModuleData,
  statusName,
  timeVN,
  validEmail,
  DEFAULT_AUTHORIZED_ACCOUNTS,
  isHiddenWorkEmail,
  loadLocalExtraPeople,
  prepareLocalWorkSync,
  saveLocalExtraPeople,
  WORK_SETTINGS_KEY,
} from './workStorage';

export interface BeeZoneWorkProps {
  currentUser?: UserAccount | null;
  teachers?: Teacher[];
  classes?: ClassRoom[];
  programs?: CourseProgram[];
  rooms?: Room[];
  timetableSlots?: TimetableSlot[];
  scheduleChanges?: ScheduleChange[];
  onSaveScheduleChange?: (change: ScheduleChange) => string | null;
  onDeleteScheduleChange?: (id: string) => string | null;
  supabaseClient?: SupabaseClient | null;
}

interface BzwModalOverlayProps {
  children: React.ReactNode;
  onClick?: () => void;
  role?: string;
  'aria-modal'?: boolean | 'true' | 'false';
  'aria-label'?: string;
}

function BzwModalOverlay({
  children,
  onClick,
  role = 'dialog',
  'aria-modal': ariaModal = true,
  'aria-label': ariaLabel,
}: BzwModalOverlayProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClick) {
        onClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClick]);

  const content = (
    <div
      className="bzw-overlay bzw-root"
      onClick={onClick}
      role={role}
      aria-modal={ariaModal}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );

  if (typeof document === 'undefined') {
    return content;
  }

  return createPortal(content, document.body);
}

export function BeeZoneWork({
  currentUser,
  teachers = [],
  classes = [],
  programs = [],
  rooms = [],
  timetableSlots = [],
  scheduleChanges = [],
  onSaveScheduleChange,
  onDeleteScheduleChange,
  supabaseClient,
}: BeeZoneWorkProps) {
  const supabase = supabaseClient !== undefined ? supabaseClient : defaultSupabase;

  const uid = currentUser?.id || '';
  const role: WorkRole = currentUser?.active
    ? mapUserToWorkRole(currentUser)
    : 'teacher';
  const [people, setPeople] = useState<WorkPerson[]>(() =>
    buildWorkPeople(currentUser, teachers, loadLocalExtraPeople()),
  );
  const workPeopleRequest = useRef(0);
  const [peopleRefreshing, setPeopleRefreshing] = useState(false);

  const refreshAuthorizedPeople = useCallback(async () => {
    if (!supabase) return;
    const requestId = ++workPeopleRequest.current;
    setPeopleRefreshing(true);
    try {
      const latestPeople = await fetchWorkPeople(supabase);
      if (requestId === workPeopleRequest.current) {
        setPeople(buildWorkPeople(currentUser, teachers, [...loadLocalExtraPeople(), ...latestPeople]));
      }
    } catch (error) {
      console.error(
        'Error refreshing authorized work assignees:',
        error instanceof Error ? error.message : 'unknown error',
      );
    } finally {
      if (requestId === workPeopleRequest.current) setPeopleRefreshing(false);
    }
  }, [supabase, currentUser, teachers]);

  useEffect(() => {
    setPeople(buildWorkPeople(currentUser, teachers, loadLocalExtraPeople()));
  }, [currentUser, teachers]);

  useEffect(() => {
    if (!supabase) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshAuthorizedPeople();
    };
    window.addEventListener(ACCOUNT_DIRECTORY_CHANGED_EVENT, refreshAuthorizedPeople);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const refreshTimer = window.setInterval(refreshWhenVisible, 30_000);
    return () => {
      window.removeEventListener(ACCOUNT_DIRECTORY_CHANGED_EVENT, refreshAuthorizedPeople);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.clearInterval(refreshTimer);
    };
  }, [refreshAuthorizedPeople, supabase]);

  const selectablePeople = useMemo(() => {
    return people.filter((p) => p.active && !isHiddenWorkEmail(p.email));
  }, [people]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [notes, setNotes] = useState<WorkNote[]>([]);
  const [reasons, setReasons] = useState<WorkReason[]>([]);
  const [handoffs, setHandoffs] = useState<WorkHandoff[]>([]);
  const [dataSource, setDataSource] = useState<'supabase' | 'local'>('local');

  const [day, setDay] = useState(localISODate());
  const [historyMode, setHistoryMode] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus | 'handover'>('all');
  const [branchFilter, setBranchFilter] = useState<'all' | Branch>('all');
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Modals
  const [statModal, setStatModal] = useState<DetailFilter | null>(null);
  const [editorTask, setEditorTask] = useState<WorkTask | null | undefined>(undefined);
  const [noteTask, setNoteTask] = useState<WorkTask | null>(null);
  const [reasonViewTask, setReasonViewTask] = useState<WorkTask | null>(null);
  const [reasonAddTask, setReasonAddTask] = useState<{ task: WorkTask; defaultKind?: TaskStatus | 'handover' } | null>(null);
  const [emailTask, setEmailTask] = useState<WorkTask | null>(null);
  const [handoverTask, setHandoverTask] = useState<WorkTask | null>(null);
  const [ackTask, setAckTask] = useState<WorkTask | null>(null);
  const handoverCandidates = useMemo(
    () => handoverTask
      ? getAssignableWorkPeople(selectablePeople, handoverTask.branch).filter(
          (person) => person.user_id !== handoverTask.assigned_uid && person.user_id !== uid,
        )
      : [],
    [handoverTask, selectablePeople, uid],
  );
  const [directoryModal, setDirectoryModal] = useState(false);
  const [staffEditor, setStaffEditor] = useState<WorkPerson | null | undefined>(undefined);
  const [customizeModal, setCustomizeModal] = useState(false);

  // Settings
  const [settings, setSettings] = useState<WorkSettings>(() => {
    try {
      const raw = localStorage.getItem(WORK_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.admin === 'Việc hôm nay · Hành chính / Lễ tân') {
          parsed.admin = 'Việc hôm nay · Hành chính';
        }
        if (parsed.training === 'Việc giáo viên theo lớp' && !parsed.teacher) {
          parsed.training = 'Việc chuyên môn · Đào tạo';
          parsed.teacher = 'Việc giảng dạy · Giáo viên';
        }
        return { ...defaultSettings(), ...parsed };
      }
    } catch {}
    return defaultSettings();
  });

  // History controls
  const [historyRange, setHistoryRange] = useState<'today' | 'yesterday' | 'seven' | 'thirty' | 'all'>('seven');
  const [historyBranch, setHistoryBranch] = useState<'all' | Branch>('all');
  const [historySearch, setHistorySearch] = useState('');

  // Email state
  const [emailTab, setEmailTab] = useState<'gmail' | 'copy'>('gmail');
  const [emailRecipientUid, setEmailRecipientUid] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBodyContent, setEmailBodyContent] = useState('');
  const [emailMarkChecked, setEmailMarkChecked] = useState(false);

  // Handover state
  const [handoverToUid, setHandoverToUid] = useState('');
  const [handoverNoteContent, setHandoverNoteContent] = useState('');
  const [ackName, setAckName] = useState(currentUser?.name || 'Người nhận ca');
  const [ackNote, setAckNote] = useState('');

  // Note draft
  const [noteDraft, setNoteDraft] = useState('');

  // Reason draft
  const [reasonKind, setReasonKind] = useState<'progress' | 'unfinished' | 'done' | 'handover'>('progress');
  const [reasonText, setReasonText] = useState('');

  // Task form
  const initialForm: WorkFormState = {
    title: '',
    description: '',
    branch: 'admin',
    assigned_uid:
      selectablePeople.find((p) => p.email === 'phonghanhchinh.beezone@gmail.com')?.user_id ||
      selectablePeople[0]?.user_id ||
      '',
    work_date: localISODate(),
    shift_label: 'Ca sáng',
    class_label: '',
    classId: '',
    is_teacher_off: false,
    substitute_teacher_id: '',
    schedule_change_id: '',
    priority: 'normal',
    status: 'todo',
    needs_handover: false,
  };
  const [form, setForm] = useState<WorkFormState>(initialForm);
  const assignablePeople = useMemo(
    () => getAssignableWorkPeople(selectablePeople, form.branch),
    [selectablePeople, form.branch],
  );

  // Quick-add person form state (inside Task Editor modal)
  const [showQuickAddPerson, setShowQuickAddPerson] = useState(false);
  const [quickPersonName, setQuickPersonName] = useState('');
  const [quickPersonEmail, setQuickPersonEmail] = useState('');
  const [quickPersonDept, setQuickPersonDept] = useState<string>('Giáo viên');
  const [quickPersonPhone, setQuickPersonPhone] = useState('');

  // Custom shift form state (inside Task Editor modal)
  const [isCustomShift, setIsCustomShift] = useState(false);
  const [customShiftStart, setCustomShiftStart] = useState('08:00');
  const [customShiftEnd, setCustomShiftEnd] = useState('11:30');
  const [customShiftNote, setCustomShiftNote] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSyncCountRef = useRef(0);
  const deferredToastRef = useRef('');
  const syncErrorRef = useRef('');

  const showToast = (msg: string) => {
    if (pendingSyncCountRef.current > 0) {
      deferredToastRef.current = msg;
      return;
    }
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Helper getters
  const getPerson = (userId: string): WorkPerson => {
    const found = people.find((p) => p.user_id === userId);
    if (found) {
      if (found.email && isHiddenWorkEmail(found.email)) {
        return { ...found, email: null };
      }
      return found;
    }
    return {
      user_id: userId,
      display_name: 'Nhân sự chưa xác định',
      email: '',
      role: 'admin',
      active: true,
      department: 'Chưa phân công',
    };
  };

  const getInitials = (name?: string): string => {
    const clean = String(name || '?').trim();
    if (!clean) return '?';
    const parts = clean.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Load data
  const loadData = async () => {
    const peopleRequestId = ++workPeopleRequest.current;
    try {
      const data = await fetchWorkModuleData(supabase, day, uid);
      if (data.source === 'supabase' && data.people) {
        const local = loadLocalWorkData(day, uid);
        const localPeople = buildWorkPeople(currentUser, teachers, loadLocalExtraPeople());
        const merged = prepareLocalWorkSync(data, local, localPeople, data.people, uid);
        const migratedCount = merged.tasks.filter((task) => !task.sync_pending && data.tasks.find((remoteTask) => remoteTask.id === task.id)?.updated_at !== task.updated_at).length;
        if (migratedCount) {
          try {
            await syncWorkModuleData(supabase!, merged, data.tasks);
          } catch (error) {
            console.warn('Legacy work migration skipped:', error instanceof Error ? error.message : 'unknown error');
          }
        }
        setTasks(merged.tasks);
        setNotes(merged.notes);
        setReasons(merged.reasons);
        setHandoffs(merged.handoffs);
        if (peopleRequestId === workPeopleRequest.current) setPeople(data.people);
        setDataSource(supabase ? 'supabase' : 'local');
        saveLocalWorkData(merged);
      } else {
        setTasks(data.tasks);
        setNotes(data.notes);
        setReasons(data.reasons);
        setHandoffs(data.handoffs);
        setDataSource(supabase ? 'supabase' : data.source);
      }
    } catch (e) {
      console.warn('Notice loading work module data:', e);
      const local = loadLocalWorkData(day, uid);
      setTasks(local.tasks);
      setNotes(local.notes);
      setReasons(local.reasons);
      setHandoffs(local.handoffs);
      setDataSource(supabase ? 'supabase' : 'local');
    }
  };

  useEffect(() => {
    loadData();
  }, [day, uid]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('beezone-work-cross-device')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bz_work_tasks' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bz_work_notes' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bz_work_reasons' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bz_work_handoffs' }, () => void loadData())
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') setDataSource('supabase');
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, day, uid]);

  // Persist locally & sync
  const syncStorage = async (
    nextTasks: WorkTask[],
    nextNotes: WorkNote[],
    nextReasons: WorkReason[],
    nextHandoffs: WorkHandoff[],
  ) => {
    const previousState = { tasks, notes, reasons, handoffs };
    const nextState = {
      tasks: nextTasks,
      notes: nextNotes,
      reasons: nextReasons,
      handoffs: nextHandoffs,
    };
    // Always update local state immediately for zero-delay UI response
    setTasks(nextTasks);
    setNotes(nextNotes);
    setReasons(nextReasons);
    setHandoffs(nextHandoffs);
    saveLocalWorkData(nextState);

    if (supabase) {
      pendingSyncCountRef.current += 1;
      setBusy(true);
      try {
        await syncWorkModuleData(supabase, nextState, tasks);
        setDataSource('supabase');
      } catch (error) {
        console.warn('Work module DB sync failed:', error instanceof Error ? error.message : 'unknown error');
        syncErrorRef.current = 'Không thể lưu công việc do quyền hoặc dữ liệu máy chủ không hợp lệ. Danh sách đã được tải lại.';
        setTasks(previousState.tasks);
        setNotes(previousState.notes);
        setReasons(previousState.reasons);
        setHandoffs(previousState.handoffs);
        saveLocalWorkData(previousState);
        await loadData();
        setDataSource('supabase');
      } finally {
        pendingSyncCountRef.current = Math.max(0, pendingSyncCountRef.current - 1);
        if (pendingSyncCountRef.current === 0) {
          setBusy(false);
          const finalToast = deferredToastRef.current;
          const syncError = syncErrorRef.current;
          deferredToastRef.current = '';
          syncErrorRef.current = '';
          if (syncError || finalToast) {
            setToastMsg(syncError || finalToast);
            setTimeout(() => setToastMsg(''), 3000);
          }
        }
      }
      return;
    }
  };

  // Phân quyền theo 3 nhóm việc (Hành chính - Đào tạo - Giáo viên):
  // - Chủ trung tâm (manager) & Hành chính (admin): xem đầy đủ cả 3 nhóm (Hành chính, Đào tạo, Giáo viên) + Bàn giao
  // - Đào tạo (trainer): xem nhóm Đào tạo, Giáo viên + Bàn giao (không thấy việc Hành chính)
  // - Giáo viên (teacher): xem nhóm Giáo viên, Bàn giao + việc được phân công cho mình
  const canSeeAdminBranch = role === 'manager' || role === 'admin';
  const canSeeTrainingBranch = role === 'manager' || role === 'admin' || role === 'trainer';
  const canManageBranch = (branch: Branch) =>
    canSeeAdminBranch || (role === 'trainer' && (branch === 'training' || branch === 'teacher'));
  const isAssignedToCurrentUser = (task: WorkTask) =>
    task.assigned_uid === uid || Boolean(currentUser?.permissions?.teacherId && task.assigned_uid === currentUser.permissions.teacherId);
  const isPendingHandoffRecipient = (task: WorkTask) => handoffs.some(
    (handoff) => handoff.task_id === task.id && handoff.to_uid === uid && !handoff.acknowledged_at,
  );
  const canUpdateTaskStatus = (task: WorkTask) =>
    canManageBranch(task.branch) || (role === 'teacher' && isAssignedToCurrentUser(task));
  const canCreateWork = role !== 'teacher';

  const accessibleTasks = useMemo(() => {
    if (canSeeAdminBranch) return tasks;
    if (role === 'trainer') {
      return tasks.filter((t) => t.branch === 'training' || t.branch === 'teacher');
    }
    // Giáo viên chỉ thấy việc được giao cho mình hoặc đang chờ chính mình nhận bàn giao.
    return tasks.filter((task) => isAssignedToCurrentUser(task) || isPendingHandoffRecipient(task));
  }, [tasks, canSeeAdminBranch, role, uid, currentUser?.permissions?.teacherId, handoffs]);

  // Filtered tasks for Daily view
  const dailyTasks = useMemo(() => {
    return accessibleTasks.filter((t) => {
      // Date filter
      if (day && t.work_date !== day) return false;
      // Branch filter (Hành chính / Đào tạo / Giáo viên)
      if (branchFilter !== 'all' && t.branch !== branchFilter) return false;
      // Search
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const p = getPerson(t.assigned_uid);
        const match = [
          t.title,
          t.description,
          t.class_label,
          t.shift_label,
          p.display_name,
          p.email,
        ]
          .join(' ')
          .toLowerCase();
        if (!match.includes(q)) return false;
      }
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'handover') {
          if (!t.needs_handover || t.status === 'done') return false;
        } else if (t.status !== statusFilter) {
          return false;
        }
      }
      return true;
    });
  }, [accessibleTasks, day, branchFilter, search, statusFilter, people]);

  // Stats
  const stats = useMemo(() => {
    const list = accessibleTasks.filter((t) => (!day || t.work_date === day));
    return {
      all: list.length,
      progress: list.filter((t) => t.status === 'progress').length,
      done: list.filter((t) => t.status === 'done').length,
      handover: list.filter((t) => t.needs_handover && t.status !== 'done').length,
    };
  }, [accessibleTasks, day]);

  // Phân chia 3 nhóm công việc rạch ròi: Hành chính - Đào tạo - Giáo viên + Bàn giao
  const adminTasks = useMemo(
    () => dailyTasks.filter((t) => t.branch === 'admin'),
    [dailyTasks],
  );
  const trainingTasks = useMemo(
    () => dailyTasks.filter((t) => t.branch === 'training'),
    [dailyTasks],
  );
  const teacherTasks = useMemo(
    () => dailyTasks.filter((t) => t.branch === 'teacher'),
    [dailyTasks],
  );
  const handoverTasks = useMemo(
    () => dailyTasks.filter((t) => t.needs_handover && t.status !== 'done'),
    [dailyTasks],
  );

  // Completed tasks for History view
  const historyCompletedTasks = useMemo(() => {
    return accessibleTasks
      .filter((t) => {
        if (t.status !== 'done') return false;
        if (historyBranch !== 'all' && t.branch !== historyBranch) return false;
        if (historySearch.trim()) {
          const q = historySearch.trim().toLowerCase();
          const p = getPerson(t.assigned_uid);
          const match = [t.title, t.description, t.class_label, p.display_name, p.email]
            .join(' ')
            .toLowerCase();
          if (!match.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.completed_at || b.updated_at).localeCompare(String(a.completed_at || a.updated_at)));
  }, [accessibleTasks, historyBranch, historySearch, people]);

  // Quick Action Handlers
  const handleToggleDone = (t: WorkTask) => {
    const isDone = t.status === 'done';
    const nextStatus: TaskStatus = isDone ? 'todo' : 'done';
    const now = new Date().toISOString();
    const updated: WorkTask = {
      ...t,
      status: nextStatus,
      completed_at: nextStatus === 'done' ? now : null,
      updated_at: now,
      needs_handover: nextStatus === 'done' ? false : t.needs_handover,
    };
    const nextTasks = tasks.map((x) => (x.id === t.id ? updated : x));
    syncStorage(nextTasks, notes, reasons, handoffs);
    showToast(isDone ? 'Đã mở lại công việc.' : '✓ Đã đánh dấu hoàn thành công việc.');
  };

  const handleToggleProgress = (t: WorkTask) => {
    const nextStatus: TaskStatus = t.status === 'progress' ? 'todo' : 'progress';
    const now = new Date().toISOString();
    const updated: WorkTask = {
      ...t,
      status: nextStatus,
      completed_at: null,
      updated_at: now,
    };
    const nextTasks = tasks.map((x) => (x.id === t.id ? updated : x));
    syncStorage(nextTasks, notes, reasons, handoffs);
    showToast(nextStatus === 'progress' ? 'Đã chuyển sang Đang làm.' : 'Đã chuyển về Chưa làm.');
  };

  const handleToggleEmailSent = (t: WorkTask) => {
    const sent = !t.email_sent_at;
    const now = new Date().toISOString();
    const p = getPerson(t.assigned_uid);
    const updated: WorkTask = {
      ...t,
      email_sent_at: sent ? now : null,
      email_sent_to: sent ? p.email : null,
      updated_at: now,
    };
    const nextTasks = tasks.map((x) => (x.id === t.id ? updated : x));
    syncStorage(nextTasks, notes, reasons, handoffs);
    showToast(sent ? 'Đã đánh dấu đã gửi email.' : 'Đã bỏ đánh dấu gửi email.');
  };

  // Open Task Editor
  const handleOpenEditor = (t?: WorkTask) => {
    if (t ? !canManageBranch(t.branch) : !canCreateWork) {
      showToast('Cấp bậc hiện tại không được phép tạo hoặc sửa nội dung công việc này.');
      return;
    }
    setShowQuickAddPerson(false);
    if (t) {
      setEditorTask(t);
      const isStd = ['Ca sáng', 'Ca chiều', 'Ca tối', 'Cuối buổi', 'Cả ngày'].includes(t.shift_label);
      setIsCustomShift(!isStd && Boolean(t.shift_label));
      setCustomShiftNote(t.shift_label || '');
      setForm({
        title: t.title,
        description: t.description || '',
        branch: t.branch,
        assigned_uid: t.assigned_uid,
        work_date: t.work_date,
        shift_label: t.shift_label,
        class_label: t.class_label || '',
        classId: t.classId || classes.find((c) => c.name === t.class_label)?.id || '',
        is_teacher_off: Boolean(t.is_teacher_off),
        substitute_teacher_id: t.substitute_teacher_id || '',
        schedule_change_id: t.schedule_change_id || '',
        priority: t.priority,
        status: t.status,
        needs_handover: t.needs_handover,
      });
    } else {
      setEditorTask(null);
      setIsCustomShift(false);
      setCustomShiftNote('');
      const targetBranch: Branch = canSeeAdminBranch ? 'admin' : (role === 'trainer' ? 'training' : 'teacher');
      const targetAssignee =
        targetBranch === 'admin'
          ? selectablePeople.find((p) => p.email === 'phonghanhchinh.beezone@gmail.com')?.user_id ||
            selectablePeople.find((p) => p.branch === 'admin')?.user_id ||
            selectablePeople[0]?.user_id ||
            ''
          : targetBranch === 'training'
            ? selectablePeople.find((p) => p.email === 'phongdaotao.beezone@gmail.com')?.user_id ||
              selectablePeople.find((p) => p.branch === 'training')?.user_id ||
              selectablePeople[0]?.user_id ||
              ''
            : selectablePeople.find((p) => p.branch === 'teacher' || p.role === 'teacher')?.user_id ||
              selectablePeople[0]?.user_id ||
              '';
      setForm({
        ...initialForm,
        branch: targetBranch,
        work_date: day || localISODate(),
        assigned_uid: targetAssignee,
      });
    }
  };

  const handleSaveQuickPerson = () => {
    const trimmedName = quickPersonName.trim();
    if (!trimmedName) {
      showToast('Vui lòng nhập họ và tên nhân sự / giáo viên.');
      return;
    }
    const trimmedEmail = quickPersonEmail.trim().toLowerCase();
    if (trimmedEmail && isHiddenWorkEmail(trimmedEmail)) {
      showToast('Email này không được phép sử dụng.');
      return;
    }
    const branch: Branch =
      quickPersonDept === 'Giáo viên'
        ? 'teacher'
        : quickPersonDept === 'Đào tạo'
          ? 'training'
          : 'admin';
    const role: WorkRole =
      quickPersonDept === 'Giáo viên'
        ? 'teacher'
        : quickPersonDept === 'Đào tạo'
          ? 'trainer'
          : quickPersonDept === 'Chủ trung tâm'
            ? 'manager'
            : 'admin';
    const newPerson: WorkPerson = {
      user_id: `person-${Date.now()}`,
      display_name: trimmedName,
      email: trimmedEmail || null,
      department: quickPersonDept,
      branch,
      role,
      phone: quickPersonPhone.trim() || undefined,
      active: true,
    };

    const nextPeople = [...people, newPerson];
    setPeople(nextPeople);
    const extra = loadLocalExtraPeople().concat(newPerson);
    saveLocalExtraPeople(extra);

    setForm((prev) => ({
      ...prev,
      assigned_uid: newPerson.user_id,
      branch: getAssignableWorkPeople(nextPeople, prev.branch).some(
        (person) => person.user_id === newPerson.user_id,
      ) ? prev.branch : branch,
    }));

    setQuickPersonName('');
    setQuickPersonEmail('');
    setQuickPersonPhone('');
    setShowQuickAddPerson(false);
    showToast(`Đã thêm mới "${newPerson.display_name}" và chọn làm người thực hiện.`);
  };

  const handleSaveTask = () => {
    const savedBranch: Branch = form.is_teacher_off ? 'teacher' : form.branch;
    if (!canManageBranch(savedBranch)) {
      showToast('Cấp bậc hiện tại không được phép lưu công việc trong nhóm này.');
      return;
    }
    if (!form.title.trim()) {
      showToast('Vui lòng nhập tên công việc.');
      return;
    }
    if (!form.assigned_uid) {
      showToast('Vui lòng chọn người thực hiện.');
      return;
    }

    let scheduleChangeId = form.schedule_change_id;

    // Synchronize teacher leave / substitute if toggled
    if (form.is_teacher_off) {
      if (!form.classId && !form.class_label) {
        showToast('⚠️ Vui lòng chọn lớp học để đăng ký cô nghỉ & xếp dạy thay.');
        return;
      }
      if (!form.substitute_teacher_id) {
        showToast('⚠️ Vui lòng chọn giáo viên dạy thay / dạy bù.');
        return;
      }

      const selectedClass = classes.find(
        (c) => c.id === form.classId || c.name === form.class_label,
      );
      if (!selectedClass) {
        showToast('⚠️ Lớp học không tồn tại trong danh mục trung tâm.');
        return;
      }

      const dayName = weekdayForDate(form.work_date);
      const matchingSlot = timetableSlots.find(
        (s) => s.classId === selectedClass.id && s.dayOfWeek === dayName,
      );
      const targetSlot =
        matchingSlot || timetableSlots.find((s) => s.classId === selectedClass.id);

      const timeMatch = form.shift_label.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
      const startTime = timeMatch ? timeMatch[1] : targetSlot?.startTime || '18:00';
      const endTime = timeMatch ? timeMatch[2] : targetSlot?.endTime || '19:30';

      const targetRoom =
        (targetSlot && rooms.find((r) => r.id === targetSlot.roomId)) ||
        rooms.find((r) => r.id === selectedClass.roomId) ||
        rooms[0];

      const primaryTeacherId =
        targetSlot?.teacherId || selectedClass.teacherId || teachers[0]?.id;

      if (form.substitute_teacher_id === primaryTeacherId) {
        showToast('⚠️ Giáo viên dạy thay phải khác giáo viên chính của buổi học.');
        return;
      }

      if (onSaveScheduleChange && targetSlot) {
        const changeId = scheduleChangeId || `SC_WORK_${Date.now()}`;
        const changePayload: ScheduleChange = {
          id: changeId,
          classId: selectedClass.id,
          kind: 'teacher_off',
          date: form.work_date,
          sourceSlotId: targetSlot.id,
          startTime: targetSlot.startTime,
          endTime: targetSlot.endTime,
          teacherId: primaryTeacherId,
          roomId: targetRoom?.id || rooms[0]?.id || '',
          reason: `${form.title.trim()}${
            form.description ? ` (${form.description.trim()})` : ''
          }`,
          substituteTeacherId: form.substitute_teacher_id,
        };

        const error = onSaveScheduleChange(changePayload);
        if (error) {
          showToast(`⚠️ Không thể đồng bộ lịch dạy: ${error}`);
          return;
        }
        scheduleChangeId = changeId;
      }
    }

    const now = new Date().toISOString();
    const finalClassLabel =
      classes.find((c) => c.id === form.classId)?.name || form.class_label.trim();

    if (editorTask) {
      // Edit
      const updated: WorkTask = {
        ...editorTask,
        title: form.title.trim(),
        description: form.description.trim(),
        branch: savedBranch,
        assigned_uid: form.assigned_uid,
        work_date: form.work_date,
        shift_label: form.shift_label,
        class_label: finalClassLabel,
        classId: form.classId || undefined,
        is_teacher_off: Boolean(form.is_teacher_off),
        substitute_teacher_id: form.substitute_teacher_id || undefined,
        schedule_change_id: scheduleChangeId || undefined,
        priority: form.is_teacher_off ? 'high' : form.priority,
        status: form.status || editorTask.status,
        needs_handover: form.is_teacher_off ? true : Boolean(form.needs_handover),
        updated_at: now,
      };
      const nextTasks = tasks.map((x) => (x.id === editorTask.id ? updated : x));
      syncStorage(nextTasks, notes, reasons, handoffs);
      showToast(
        form.is_teacher_off
          ? '✨ Đã cập nhật công việc và đồng bộ sang Thời khóa biểu & Lịch giáo viên!'
          : 'Đã cập nhật công việc.',
      );
    } else {
      // Create
      const newTask: WorkTask = {
        id: newWorkId(),
        title: form.title.trim(),
        description: form.description.trim(),
        branch: savedBranch,
        assigned_uid: form.assigned_uid,
        work_date: form.work_date,
        shift_label: form.shift_label,
        class_label: finalClassLabel,
        classId: form.classId || undefined,
        is_teacher_off: Boolean(form.is_teacher_off),
        substitute_teacher_id: form.substitute_teacher_id || undefined,
        schedule_change_id: scheduleChangeId || undefined,
        priority: form.is_teacher_off ? 'high' : form.priority,
        status: form.status || 'todo',
        needs_handover: form.is_teacher_off ? true : Boolean(form.needs_handover),
        completed_at: null,
        email_sent_at: null,
        email_sent_to: null,
        created_at: now,
        updated_at: now,
      };
      syncStorage([newTask, ...tasks], notes, reasons, handoffs);
      showToast(
        form.is_teacher_off
          ? '✨ Đã tạo công việc và đồng bộ sang Thời khóa biểu & Lịch giáo viên!'
          : 'Đã tạo công việc mới.',
      );
    }
    setEditorTask(undefined);
  };

  // Note Modal
  const handleOpenNoteModal = (t: WorkTask) => {
    setNoteTask(t);
    setNoteDraft('');
  };

  const handleSaveNote = () => {
    if (!noteTask || !noteDraft.trim()) return;
    const authorName = currentUser?.name || 'Nhân sự';
    const newNote: WorkNote = {
      id: newWorkId(),
      task_id: noteTask.id,
      author_uid: uid,
      author_name: authorName,
      body: noteDraft.trim(),
      created_at: new Date().toISOString(),
    };
    const nextNotes = [...notes, newNote];
    const nextTasks = tasks.map((x) =>
      x.id === noteTask.id ? { ...x, updated_at: new Date().toISOString() } : x,
    );
    syncStorage(nextTasks, nextNotes, reasons, handoffs);
    setNoteDraft('');
    showToast('Đã lưu ghi chú.');
  };

  // Reason Modal
  const handleOpenReasonAdd = (t: WorkTask, defaultKind?: TaskStatus | 'handover') => {
    setReasonAddTask({ task: t, defaultKind });
    setReasonKind((defaultKind as any) || (t.needs_handover ? 'handover' : t.status === 'todo' ? 'progress' : t.status));
    setReasonText('');
  };

  const handleSaveReason = () => {
    if (!reasonAddTask || !reasonText.trim()) {
      showToast('Vui lòng nhập lý do hoặc nội dung cập nhật.');
      return;
    }
    const t = reasonAddTask.task;
    const now = new Date().toISOString();
    const authorName = currentUser?.name || getPerson(t.assigned_uid).display_name || 'Nhân sự';
    const newReason: WorkReason = {
      id: newWorkId(),
      task_id: t.id,
      author_uid: uid,
      author_name: authorName,
      kind: reasonKind,
      body: reasonText.trim(),
      created_at: now,
    };
    const nextReasons = [...reasons, newReason];

    // Status / handover updates
    let updatedTask: WorkTask = { ...t, updated_at: now };
    if (reasonKind === 'handover') {
      updatedTask.needs_handover = true;
      if (updatedTask.status === 'done') {
        updatedTask.status = 'unfinished';
        updatedTask.completed_at = null;
      }
    } else {
      updatedTask.status = reasonKind;
      if (reasonKind === 'done') {
        updatedTask.completed_at = now;
        updatedTask.needs_handover = false;
      } else {
        updatedTask.completed_at = null;
      }
    }

    const nextTasks = tasks.map((x) => (x.id === t.id ? updatedTask : x));
    syncStorage(nextTasks, notes, nextReasons, handoffs);
    setReasonAddTask(null);
    showToast('Đã lưu lý do và cập nhật trạng thái.');
  };

  // Email Modal
  const handleOpenEmailModal = (t: WorkTask) => {
    setEmailTask(t);
    const p = getPerson(t.assigned_uid);
    setEmailRecipientUid(t.assigned_uid);
    setEmailSubject(`[BeeZone] Giao việc: ${t.title}`);
    setEmailBodyContent(
      `Xin chào ${p.display_name},\n\n` +
        `Trung tâm Anh ngữ BeeZone gửi đến anh/chị công việc sau:\n\n` +
        `• Công việc: ${t.title}\n` +
        `• Người thực hiện: ${p.display_name} (${p.email || 'Chưa có email'})\n` +
        `• Bộ phận: ${t.branch === 'admin' ? 'Hành chính' : t.branch === 'training' ? 'Đào tạo' : 'Giáo viên'}\n` +
        (t.class_label ? `• Lớp: ${t.class_label}\n` : '') +
        `• Ngày thực hiện: ${dateVN(t.work_date)} — ${t.shift_label}\n` +
        `• Trạng thái: ${statusName[t.status]}\n` +
        `• Yêu cầu: ${t.description || 'Theo nội dung đã phân công.'}\n\n` +
        `Anh/chị vui lòng cập nhật tiến độ và phản hồi nếu cần hỗ trợ.\n\n` +
        `Trân trọng,\nTrung tâm Anh ngữ BeeZone`,
    );
    setEmailMarkChecked(Boolean(t.email_sent_at));
    setEmailTab('gmail');
  };

  const handleOpenGmail = () => {
    if (!emailTask) return;
    const p = getPerson(emailRecipientUid);
    if (!validEmail(p.email)) {
      showToast('Email người nhận không hợp lệ hoặc đang là @example.com.');
      return;
    }
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      p.email || '',
    )}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBodyContent)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    if (emailMarkChecked) {
      const now = new Date().toISOString();
      const updated: WorkTask = {
        ...emailTask,
        email_sent_at: now,
        email_sent_to: p.email,
        updated_at: now,
      };
      const nextTasks = tasks.map((x) => (x.id === emailTask.id ? updated : x));
      syncStorage(nextTasks, notes, reasons, handoffs);
    }
    showToast('Đã mở Gmail compose.');
  };

  const handleSaveEmailMark = () => {
    if (!emailTask) return;
    const p = getPerson(emailRecipientUid);
    const now = new Date().toISOString();
    const updated: WorkTask = {
      ...emailTask,
      email_sent_at: emailMarkChecked ? now : null,
      email_sent_to: emailMarkChecked ? p.email : null,
      updated_at: now,
    };
    const nextTasks = tasks.map((x) => (x.id === emailTask.id ? updated : x));
    syncStorage(nextTasks, notes, reasons, handoffs);
    showToast(emailMarkChecked ? 'Đã lưu dấu tích đã gửi email.' : 'Đã bỏ dấu tích đã gửi email.');
  };

  // Handover flow
  const handleOpenHandoverModal = (t: WorkTask) => {
    if (t.status === 'done') {
      showToast('Công việc đã hoàn thành không cần bàn giao.');
      return;
    }
    if (handoffs.some((handoff) => handoff.task_id === t.id && !handoff.acknowledged_at)) {
      showToast('Công việc này đang chờ người nhận xác nhận bàn giao.');
      return;
    }
    const candidates = getAssignableWorkPeople(selectablePeople, t.branch).filter(
      (person) => person.user_id !== t.assigned_uid && person.user_id !== uid,
    );
    const preferred = t.substitute_teacher_id
      ? candidates.find((person) =>
          person.teacherId === t.substitute_teacher_id || person.user_id === t.substitute_teacher_id,
        )
      : undefined;
    setHandoverTask(t);
    setHandoverToUid(preferred?.user_id || candidates[0]?.user_id || '');
    setHandoverNoteContent('');
  };

  const handleSaveHandover = () => {
    if (!handoverTask || !handoverToUid) {
      showToast('Vui lòng chọn người nhận ca.');
      return;
    }
    if (handoverNoteContent.trim().length < 2) {
      showToast('Vui lòng nhập ghi chú bàn giao (ít nhất 2 ký tự).');
      return;
    }
    if (handoffs.some((handoff) => handoff.task_id === handoverTask.id && !handoff.acknowledged_at)) {
      showToast('Công việc này đã có một bàn giao đang chờ xác nhận.');
      setHandoverTask(null);
      return;
    }
    const now = new Date().toISOString();
    const newHandoff: WorkHandoff = {
      id: newWorkId(),
      task_id: handoverTask.id,
      from_uid: uid,
      to_uid: handoverToUid,
      note: handoverNoteContent.trim(),
      handed_at: now,
      acknowledged_at: null,
    };
    const updatedTask: WorkTask = {
      ...handoverTask,
      needs_handover: true,
      updated_at: now,
    };
    const nextHandoffs = [newHandoff, ...handoffs];
    const nextTasks = tasks.map((x) => (x.id === handoverTask.id ? updatedTask : x));
    syncStorage(nextTasks, notes, reasons, nextHandoffs);
    setHandoverTask(null);
    showToast('Đã bàn giao công việc.');
  };

  const handleAckHandover = () => {
    if (!ackTask) return;
    const now = new Date().toISOString();
    const nextHandoffs = handoffs.map((h) =>
      h.task_id === ackTask.id && !h.acknowledged_at
        ? {
            ...h,
            acknowledged_at: now,
            acknowledged_by: uid,
            ack_name: ackName.trim() || 'Người nhận ca',
            ack_note: ackNote.trim(),
          }
        : h,
    );
    const updatedTask: WorkTask = {
      ...ackTask,
      assigned_uid: handoffs.find((h) => h.task_id === ackTask.id && !h.acknowledged_at)?.to_uid || ackTask.assigned_uid,
      needs_handover: false,
      ack: `${ackName.trim() || 'Người nhận ca'} lúc ${timeVN(now)}`,
      updated_at: now,
    };
    const nextTasks = tasks.map((x) => (x.id === ackTask.id ? updatedTask : x));
    syncStorage(nextTasks, notes, reasons, nextHandoffs);
    setAckTask(null);
    showToast('✓ Đã xác nhận nhận bàn giao.');
  };

  const handleCopyHandover = () => {
    if (!handoverTasks.length) {
      showToast('Hiện không có công việc nào cần bàn giao.');
      return;
    }
    const text =
      `BEEZONE – BÀN GIAO CÔNG VIỆC (${dateVN(day)})\n\n` +
      handoverTasks
        .map((t, idx) => {
          const p = getPerson(t.assigned_uid);
          const lastN = notes.filter((n) => n.task_id === t.id).at(-1);
          return (
            `${idx + 1}. ${t.title}\n` +
            `• Người phụ trách: ${p.display_name} (${p.department || 'Nhân sự'})\n` +
            `• Trạng thái: ${statusName[t.status]}\n` +
            `• Ghi chú: ${lastN ? lastN.body : 'Chưa có ghi chú'}\n` +
            `• Yêu cầu: ${t.description || 'Không có mô tả'}\n`
          );
        })
        .join('\n');
    navigator.clipboard.writeText(text);
    showToast('📋 Đã sao chép nội dung bàn giao vào clipboard.');
  };

  // Backup & Restore
  const handleDownloadBackup = () => {
    const data = { tasks, notes, reasons, handoffs, settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BeeZone-sao-luu-giao-viec-${localISODate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải file sao lưu JSON.');
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (Array.isArray(parsed.tasks) && Array.isArray(parsed.notes)) {
          syncStorage(
            parsed.tasks,
            parsed.notes,
            parsed.reasons || [],
            parsed.handoffs || [],
          );
          if (parsed.settings) {
            setSettings(parsed.settings);
            localStorage.setItem(WORK_SETTINGS_KEY, JSON.stringify(parsed.settings));
          }
          showToast('Đã khôi phục dữ liệu thành công.');
        } else {
          showToast('File JSON không đúng định dạng dữ liệu BeeZone.');
        }
      } catch (err) {
        showToast('Không thể đọc file JSON: ' + String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Staff management
  const handleSaveStaff = () => {
    if (supabase) {
      showToast('Danh sách đồng bộ lấy từ tài khoản đang hoạt động trong mục Phân quyền giáo viên.');
      return;
    }
    if (!staffEditor?.display_name.trim()) {
      showToast('Vui lòng nhập họ tên nhân sự.');
      return;
    }
    if (staffEditor.email && isHiddenWorkEmail(staffEditor.email)) {
      showToast('Email này không được phép sử dụng.');
      return;
    }
    const exists = people.some(
      (p) => p.user_id === staffEditor.user_id,
    );
    let nextPeople: WorkPerson[];
    if (exists) {
      nextPeople = people.map((p) => (p.user_id === staffEditor.user_id ? staffEditor : p));
    } else {
      nextPeople = [...people, staffEditor];
    }
    setPeople(nextPeople);
    saveLocalExtraPeople(
      nextPeople.filter(
        (p) =>
          !DEFAULT_AUTHORIZED_ACCOUNTS.some((a) => a.user_id === p.user_id) &&
          !teachers.some((t) => t.id === p.user_id),
      ),
    );
    setStaffEditor(undefined);
    showToast('Đã cập nhật danh bạ nhân sự.');
  };

  // Task Card Component
  const renderTaskCard = (t: WorkTask, inHandover = false) => {
    const p = getPerson(t.assigned_uid);
    const taskNotes = notes.filter((n) => n.task_id === t.id);
    const lastNote = taskNotes.at(-1);
    const taskReasons = reasons.filter((r) => r.task_id === t.id);
    const latestReason = taskReasons.at(-1);
    const pendingHandoff = handoffs.find((h) => h.task_id === t.id && !h.acknowledged_at);
    const canManageTask = canManageBranch(t.branch);
    const canUpdateStatus = canUpdateTaskStatus(t);
    const canAcknowledge = pendingHandoff?.to_uid === uid;

    return (
      <article
        key={t.id}
        className={`bzw-task ${t.status === 'done' ? 'completed' : ''} ${
          inHandover ? 'handover-card' : ''
        }`}
      >
        <div className="bzw-task-top">
          <input
            type="checkbox"
            className="bzw-check"
            style={{ width: 18, height: 18, minWidth: 18, minHeight: 18, flexShrink: 0, margin: '2px 0 0' }}
            checked={t.status === 'done'}
            disabled={!canUpdateStatus}
            onChange={() => handleToggleDone(t)}
            aria-label={`Đánh dấu hoàn thành ${t.title}`}
          />
          <div className="bzw-task-main">
            <div className="bzw-task-title">{t.title}</div>
            <div className="bzw-badges">
              <span className={`bzw-chip ${t.status}`}>{statusName[t.status]}</span>
              {t.priority === 'high' && <span className="bzw-chip high">Ưu tiên</span>}
              {t.needs_handover && <span className="bzw-chip handover">Cần bàn giao</span>}
              {t.is_teacher_off && (
                <span className="bzw-chip" style={{ background: '#ede9fe', color: '#5b21b6' }}>
                  🔄 Dạy thay
                </span>
              )}
              {t.class_label && <span className="bzw-chip">Lớp {t.class_label}</span>}
              <span className={`bzw-chip ${t.email_sent_at ? 'done' : ''}`}>
                {t.email_sent_at ? 'Đã gửi email' : 'Chưa gửi email'}
              </span>
            </div>
            <p className="bzw-desc">{t.description || 'Chưa có mô tả.'}</p>
            <div className="bzw-meta">
              <span>☀️ {t.shift_label}</span>
              <span>📅 {dateVN(t.work_date)}</span>
              <span>🕒 {timeVN(t.updated_at)}</span>
              {t.status === 'done' && t.completed_at && (
                <span style={{ color: '#087554' }}>✓ Xong {timeVN(t.completed_at)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Assignee Row */}
        <div className="bzw-assignee">
          <div className="bzw-avatar">{getInitials(p.display_name)}</div>
          <div style={{ minWidth: 0 }}>
            <b>{p.display_name}</b>
            <small>✉ {p.email || 'Chưa có email'}</small>
          </div>
          <span className="bzw-dept">
            {p.department || (t.branch === 'admin' ? 'Hành chính' : t.branch === 'training' ? 'Đào tạo' : 'Giáo viên')}
          </span>
        </div>

        {/* Email Status Line */}
        <div
          className="bzw-small"
          style={{
            marginTop: 7,
            color: t.email_sent_at ? '#087554' : '#7b8797',
          }}
        >
          {t.email_sent_at
            ? `📧 Đã gửi email lúc ${timeVN(t.email_sent_at)} • ${t.email_sent_to || p.email}`
            : '✉ Chưa đánh dấu đã gửi email'}
        </div>

        {/* Last Note Box */}
        {lastNote && (
          <div className="bzw-last-note">
            <strong>🗒 {lastNote.author_name || p.display_name}:</strong> {lastNote.body}
          </div>
        )}

        {/* Reason / Handover Box */}
        {latestReason && (
          <div className="bzw-reason-snapshot">
            <b>
              {latestReason.kind === 'progress'
                ? 'Đang làm'
                : latestReason.kind === 'unfinished'
                ? 'Còn dang dở'
                : latestReason.kind === 'done'
                ? 'Hoàn thành'
                : 'Bàn giao ca'}
              :
            </b>{' '}
            {latestReason.body} <span className="bzw-small">— {latestReason.author_name}</span>
          </div>
        )}

        {/* Handover Ack Info */}
        {t.ack && (
          <div className="bzw-handover-info">
            ✅ Đã nhận bàn giao: {t.ack}
          </div>
        )}

        {/* Teacher Off & Substitute Sync Badge */}
        {t.is_teacher_off && (
          <div className="bzw-teacher-off-badge">
            <div className="bzw-off-line">
              👩‍🏫 <b>Cô đăng ký nghỉ:</b>{' '}
              {teachers.find(
                (x) =>
                  x.id ===
                  (classes.find((c) => c.id === t.classId)?.teacherId ||
                    getPerson(t.assigned_uid).teacherId ||
                    t.assigned_uid),
              )?.name || 'Giáo viên'}
            </div>
            <div className="bzw-sub-line">
              🔄 <b>GV dạy thay / dạy bù:</b>{' '}
              {teachers.find((x) => x.id === t.substitute_teacher_id)?.name || 'Chưa xếp'}
            </div>
            <div className="bzw-sync-status">
              ✓ Đã đồng bộ với Thời khóa biểu & Lịch giáo viên
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="bzw-actions">
          {/* Row 1 */}
          {canManageTask && (
            <button
              type="button"
              className="bzw-btn bzw-sm"
              onClick={() => handleOpenEditor(t)}
            >
              ✎ Sửa
            </button>
          )}
          <button
            type="button"
            className="bzw-btn bzw-sm"
            onClick={() => handleOpenNoteModal(t)}
          >
            ☷ Ghi chú
          </button>
          {canUpdateStatus && (
            <button
              type="button"
              className="bzw-btn bzw-sm bzw-green"
              onClick={() => handleToggleDone(t)}
            >
              {t.status === 'done' ? '↶ Mở lại' : '✓ Hoàn thành'}
            </button>
          )}
          {canUpdateStatus && t.status !== 'done' && (
            <button
              type="button"
              className="bzw-btn bzw-sm"
              onClick={() => handleOpenReasonAdd(t, 'unfinished')}
            >
              ◷ Còn dang dở
            </button>
          )}
          {canUpdateStatus && t.status !== 'done' && (
            <button
              type="button"
              className="bzw-btn bzw-sm"
              onClick={() => handleToggleProgress(t)}
            >
              {t.status === 'progress' ? '↶ Chưa làm' : '▶ Đang làm'}
            </button>
          )}

          {/* Row 2 */}
          {canManageTask && !pendingHandoff ? (
            <button
              type="button"
              className="bzw-btn bzw-sm"
              onClick={() => handleOpenHandoverModal(t)}
            >
              {t.needs_handover ? '↪ Chọn người nhận' : '↪ Bàn giao'}
            </button>
          ) : canManageTask && pendingHandoff ? (
            <span className="bzw-chip handover">
              Đang chờ {getPerson(pendingHandoff.to_uid).display_name} nhận
            </span>
          ) : canAcknowledge && inHandover ? (
            <>
              <button
                type="button"
                className="bzw-btn bzw-sm bzw-green"
                onClick={() => setAckTask(t)}
              >
                ✓ Nhận ca
              </button>
            </>
          ) : null}

          {pendingHandoff && pendingHandoff.to_uid === uid && !inHandover && (
            <button
              type="button"
              className="bzw-btn bzw-sm bzw-green"
              onClick={() => setAckTask(t)}
            >
              ✓ Nhận bàn giao
            </button>
          )}

          <button
            type="button"
            className="bzw-btn bzw-sm"
            onClick={() => setReasonViewTask(t)}
          >
            📝 Lý do ({taskReasons.length})
          </button>
          {canUpdateStatus && (
            <button
              type="button"
              className="bzw-btn bzw-sm"
              onClick={() => handleOpenReasonAdd(t)}
            >
              ＋ Thêm mới
            </button>
          )}
          {canManageTask && (
            <button
              type="button"
              className="bzw-btn bzw-sm"
              onClick={() => handleToggleEmailSent(t)}
            >
              {t.email_sent_at ? '☑ Đã gửi' : '☐ Chưa gửi'}
            </button>
          )}

          {/* Row 3 */}
          {canManageTask && (
            <button
              type="button"
              className="bzw-btn bzw-sm bzw-btn-mail"
              onClick={() => handleOpenEmailModal(t)}
            >
              📧 Gửi email công việc
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className="bzw-root">
      {/* HERO HEADER */}
      <div className="bzw-hero">
        <div className="bzw-hero-left">
          <div className="bzw-hero-icon">📋</div>
          <div>
            <h1>{settings.page}</h1>
            <p>Phân công nhiệm vụ, theo dõi tiến độ thực hiện và bàn giao công việc ca / buổi.</p>
          </div>
        </div>
        <div className="bzw-hero-actions">
          <button
            type="button"
            className={`bzw-btn ${historyMode ? 'active' : ''}`}
            onClick={() => setHistoryMode(!historyMode)}
          >
            {historyMode ? '← Việc trong ngày' : '⏱️ Lịch sử hoàn thành'}
          </button>
          <button
            type="button"
            className="bzw-btn"
            onClick={() => setDirectoryModal(true)}
          >
            👥 Nhân sự
          </button>
          <button
            type="button"
            className="bzw-btn"
            onClick={() => setCustomizeModal(true)}
          >
            🎨 Tùy chỉnh
          </button>
          {canCreateWork && (
            <button
              type="button"
              className="bzw-btn bzw-gold bzw-big"
              onClick={() => handleOpenEditor()}
            >
              ＋ Tạo công việc
            </button>
          )}
          <span
            className={`bzw-sync-badge ${dataSource === 'supabase' ? 'bzw-sync-ok' : 'bzw-sync-local'}`}
            title={
              dataSource === 'supabase'
                ? 'Đã kết nối máy chủ Supabase · Đồng bộ liên thông đa thiết bị'
                : 'Dữ liệu lưu an toàn trên trình duyệt này'
            }
          >
            {dataSource === 'supabase' ? '🟢 Đồng bộ máy chủ' : '💾 Lưu trên thiết bị'}
          </span>
        </div>
      </div>

      {/* STATS BAR */}
      {!historyMode && (
        <div className="bzw-stats">
          <button
            type="button"
            className="bzw-stat"
            onClick={() => setStatModal('all')}
          >
            <div className="bzw-stat-icon">📋</div>
            <div>
              <div className="bzw-stat-label">Việc trong danh sách</div>
              <div className="bzw-stat-value">{stats.all}</div>
              <small>Bấm để xem chi tiết</small>
            </div>
          </button>

          <button
            type="button"
            className="bzw-stat"
            onClick={() => setStatModal('progress')}
          >
            <div className="bzw-stat-icon">🕓</div>
            <div>
              <div className="bzw-stat-label">Đang làm</div>
              <div className="bzw-stat-value">{stats.progress}</div>
              <small>Bấm để xem chi tiết</small>
            </div>
          </button>

          <button
            type="button"
            className="bzw-stat"
            onClick={() => setStatModal('done')}
          >
            <div className="bzw-stat-icon">✓</div>
            <div>
              <div className="bzw-stat-label">Hoàn thành</div>
              <div className="bzw-stat-value">{stats.done}</div>
              <small>Bấm để xem chi tiết</small>
            </div>
          </button>

          <button
            type="button"
            className="bzw-stat"
            onClick={() => setStatModal('handover')}
          >
            <div className="bzw-stat-icon">↪</div>
            <div>
              <div className="bzw-stat-label">Cần bàn giao</div>
              <div className="bzw-stat-value">{stats.handover}</div>
              <small>Bấm để xem chi tiết</small>
            </div>
          </button>
        </div>
      )}

      {/* FILTER TOOLBAR */}
      {!historyMode && (
        <div className="bzw-view-tools">
          <div className="bzw-tools-filter">
            <div className="bzw-search-wrap">
              <input
                type="text"
                className="bzw-search-input"
                placeholder="🔎 Tìm công việc, lớp, nhân sự..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="bzw-search-clear"
                  onClick={() => setSearch('')}
                  title="Xóa tìm kiếm"
                  aria-label="Xóa tìm kiếm"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="bzw-date-wrap">
              <input
                type="date"
                className="bzw-date-input"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div className="bzw-status-wrap">
              <select
                className="bzw-status-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="todo">Chưa làm</option>
                <option value="progress">Đang làm</option>
                <option value="unfinished">Còn dang dở</option>
                <option value="done">Hoàn thành</option>
                <option value="handover">Cần bàn giao</option>
              </select>
            </div>
            <div className="bzw-status-wrap">
              <select
                className="bzw-status-select"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value as 'all' | Branch)}
                aria-label="Lọc theo bộ phận"
              >
                <option value="all">Tất cả nhóm việc</option>
                {canSeeAdminBranch && <option value="admin">Hành chính</option>}
                {canSeeTrainingBranch && <option value="training">Đào tạo</option>}
                <option value="teacher">Giáo viên</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY PANEL */}
      {historyMode && (
        <section className="bzw-history-panel">
          <div className="bzw-history-intro">
            <div>
              <h2>⏱️ Lịch sử công việc đã hoàn thành</h2>
              <p>Xem lại việc đã làm hôm trước, người thực hiện, ghi chú và thời điểm hoàn thành. Không tự xóa việc cũ.</p>
            </div>
            <button
              type="button"
              className="bzw-btn bzw-sm"
              onClick={() => setHistoryMode(false)}
            >
              ← Trở về việc trong ngày
            </button>
          </div>

          <div className="bzw-history-controls">
            <div className="bzw-field" style={{ minWidth: 150, margin: 0 }}>
              <label>Khoảng thời gian</label>
              <select
                value={historyRange}
                onChange={(e) => setHistoryRange(e.target.value as any)}
              >
                <option value="yesterday">Hôm qua</option>
                <option value="today">Hôm nay</option>
                <option value="seven">7 ngày qua</option>
                <option value="thirty">30 ngày qua</option>
                <option value="all">Tất cả</option>
              </select>
            </div>

            <div className="bzw-field" style={{ minWidth: 160, margin: 0 }}>
              <label>Nhóm công việc</label>
              <select
                value={historyBranch}
                onChange={(e) => setHistoryBranch(e.target.value as any)}
              >
                <option value="all">Tất cả được phép xem</option>
                {canSeeAdminBranch && <option value="admin">Hành chính</option>}
                {canSeeTrainingBranch && <option value="training">Đào tạo</option>}
                <option value="teacher">Giáo viên</option>
              </select>
            </div>

            <div className="bzw-field" style={{ flex: 1, minWidth: 220, margin: 0 }}>
              <label>Tìm công việc hoặc người thực hiện</label>
              <input
                type="text"
                placeholder="Tên việc, tên người, lớp, email…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>
          </div>

          <div className="bzw-history-count">
            ✓ Tìm thấy {historyCompletedTasks.length} công việc đã hoàn thành
          </div>

          {historyCompletedTasks.length === 0 ? (
            <div className="bzw-history-empty">
              📂<b> Không thấy việc hoàn thành trong khoảng này</b>
              <p>Hãy thử chọn “7 ngày qua”, “Tất cả” hoặc điều chỉnh ngày.</p>
            </div>
          ) : (
            <div className="bzw-history-grid">
              {historyCompletedTasks.map((t) => (
                <article key={t.id} className="bzw-task completed">
                  <div className="bzw-task-title">✓ {t.title}</div>
                  <div className="bzw-badges">
                    <span className="bzw-chip done">Hoàn thành</span>
                    <span className="bzw-chip">
                      {t.branch === 'admin' ? 'Hành chính' : t.branch === 'training' ? 'Đào tạo' : 'Giáo viên'}
                    </span>
                    {t.class_label && <span className="bzw-chip">Lớp {t.class_label}</span>}
                  </div>
                  <p className="bzw-desc">{t.description || 'Không có mô tả.'}</p>
                  <div className="bzw-history-date-label">
                    ✓ Hoàn thành lúc {timeVN(t.completed_at || t.updated_at)}
                  </div>
                  <div className="bzw-assignee">
                    <div className="bzw-avatar">{getInitials(getPerson(t.assigned_uid).display_name)}</div>
                    <div>
                      <b>{getPerson(t.assigned_uid).display_name}</b>
                      <small>✉ {getPerson(t.assigned_uid).email || 'Chưa có email'}</small>
                    </div>
                  </div>
                  <div className="bzw-actions">
                    <button
                      type="button"
                      className="bzw-btn bzw-sm"
                      onClick={() => setReasonViewTask(t)}
                    >
                      📝 Xem lý do ({reasons.filter((r) => r.task_id === t.id).length})
                    </button>
                    <button
                      type="button"
                      className="bzw-btn bzw-sm"
                      onClick={() => handleOpenNoteModal(t)}
                    >
                      🗒 Xem ghi chú ({notes.filter((n) => n.task_id === t.id).length})
                    </button>
                    <button
                      type="button"
                      className="bzw-btn bzw-sm"
                      onClick={() => handleToggleDone(t)}
                    >
                      ↶ Mở lại việc
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* WORKFLOW COLUMNS */}
      {!historyMode && (
        <div className={`bzw-sections ${canSeeAdminBranch ? 'bzw-sections-four' : (role === 'trainer' ? 'bzw-sections-three' : 'bzw-sections-two')}`}>
          {/* Cột 1: Hành chính (Chỉ hiển thị cho Quản lý & Hành chính) */}
          {canSeeAdminBranch && (
            <section className="bzw-section">
              <div className="bzw-section-head">
                <div>
                  <h2>🔸 {settings.admin}</h2>
                  <small>Người trực cập nhật trước khi kết ca</small>
                </div>
                <span className="bzw-count">{adminTasks.length}</span>
              </div>
              <div className="bzw-stack">
                {adminTasks.length === 0 ? (
                  <div className="bzw-no-data">
                    <span className="bzw-symbol">📭</span>Không có công việc phù hợp.
                  </div>
                ) : (
                  adminTasks.map((t) => renderTaskCard(t, false))
                )}
              </div>
            </section>
          )}

          {/* Cột 2: Đào tạo (Chuyên môn, học vụ, thời khóa biểu) */}
          {canSeeTrainingBranch && (
            <section className="bzw-section">
              <div className="bzw-section-head">
                <div>
                  <h2>📘 {settings.training}</h2>
                  <small>Học vụ, chuyên môn, đề cương, xếp lớp</small>
                </div>
                <span className="bzw-count">{trainingTasks.length}</span>
              </div>
              <div className="bzw-stack">
                {trainingTasks.length === 0 ? (
                  <div className="bzw-no-data">
                    <span className="bzw-symbol">📭</span>Không có công việc phù hợp.
                  </div>
                ) : (
                  trainingTasks.map((t) => renderTaskCard(t, false))
                )}
              </div>
            </section>
          )}

          {/* Cột 3: Giáo viên (Giảng dạy trên lớp, bài tập, nhận xét) */}
          <section className="bzw-section">
            <div className="bzw-section-head">
              <div>
                <h2>🟩 {settings.teacher || 'Việc giảng dạy · Giáo viên'}</h2>
                <small>Giáo viên tích hoàn thành và ghi chú cuối buổi</small>
              </div>
              <span className="bzw-count">{teacherTasks.length}</span>
            </div>
            <div className="bzw-stack">
              {teacherTasks.length === 0 ? (
                <div className="bzw-no-data">
                  <span className="bzw-symbol">📭</span>Không có công việc phù hợp.
                </div>
              ) : (
                teacherTasks.map((t) => renderTaskCard(t, false))
              )}
            </div>
          </section>

          {/* Cột 4: Bàn giao cuối ca / cuối buổi */}
          <section className="bzw-section">
            <div className="bzw-section-head">
              <div>
                <h2>🟦 {settings.handover}</h2>
                <small>Việc dang dở cần người tiếp theo tiếp nhận</small>
              </div>
              <span className="bzw-count">{handoverTasks.length}</span>
            </div>
            <div className="bzw-stack">
              {handoverTasks.length === 0 ? (
                <div className="bzw-no-data">
                  <span className="bzw-symbol">📭</span>Không có công việc phù hợp.
                </div>
              ) : (
                handoverTasks.map((t) => renderTaskCard(t, true))
              )}
            </div>
            <div style={{ padding: '0 11px 12px' }}>
              <button
                type="button"
                className="bzw-btn bzw-sm"
                style={{ width: '100%' }}
                onClick={handleCopyHandover}
              >
                📋 Sao chép nội dung bàn giao
              </button>
            </div>
          </section>
        </div>
      )}

      {/* GUIDE SECTION AT BOTTOM */}
      <div className="bzw-guide">
        <h2>💡 Quy trình thực hiện & bàn giao ca làm việc</h2>
        <div className="bzw-guide-grid">
          <div className="bzw-guide-step">
            <span className="bzw-guide-num">1</span>
            <div>
              <strong>Giao việc đầu ca</strong>
              <p>Chọn người thực hiện, ca hoặc lớp, thời hạn.</p>
            </div>
          </div>
          <div className="bzw-guide-step">
            <span className="bzw-guide-num">2</span>
            <div>
              <strong>Cập nhật trong buổi</strong>
              <p>Tích hoàn thành hoặc ghi chú vướng mắc.</p>
            </div>
          </div>
          <div className="bzw-guide-step">
            <span className="bzw-guide-num">3</span>
            <div>
              <strong>Bàn giao việc dở</strong>
              <p>Đánh dấu cần bàn giao, người sau xác nhận.</p>
            </div>
          </div>
          <div className="bzw-guide-step">
            <span className="bzw-guide-num">4</span>
            <div>
              <strong>Lưu lịch sử</strong>
              <p>Kiểm tra lại ghi chú, công việc, người phụ trách.</p>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: STAT DETAIL */}
      {statModal && (
        <BzwModalOverlay onClick={() => setStatModal(null)} aria-label="Chi tiết thống kê công việc">
          <div className="bzw-modal bzw-wide" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>
                {statModal === 'all'
                  ? '📋 Việc trong danh sách'
                  : statModal === 'progress'
                  ? '🕓 Đang làm'
                  : statModal === 'done'
                  ? '✓ Hoàn thành'
                  : '↪ Cần bàn giao'}{' '}
                (
                {
                  accessibleTasks.filter((t) =>
                    !day || t.work_date === day
                      ? statModal === 'all'
                        ? true
                        : statModal === 'handover'
                        ? t.needs_handover && t.status !== 'done'
                        : t.status === statModal
                      : false,
                  ).length
                }
                )
              </h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setStatModal(null)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-stack" style={{ padding: 0, minHeight: 'auto' }}>
                {accessibleTasks
                  .filter((t) =>
                    !day || t.work_date === day
                      ? statModal === 'all'
                        ? true
                        : statModal === 'handover'
                        ? t.needs_handover && t.status !== 'done'
                        : t.status === statModal
                      : false,
                  )
                  .map((t) => renderTaskCard(t, statModal === 'handover'))}
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn"
                onClick={() => setStatModal(null)}
              >
                Đóng
              </button>
              {statModal !== 'all' && (
                <button
                  type="button"
                  className="bzw-btn bzw-gold"
                  onClick={() => {
                    setStatusFilter(statModal as any);
                    setStatModal(null);
                  }}
                >
                  Lọc ngoài màn hình chính
                </button>
              )}
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: TASK CREATE / EDIT */}
      {editorTask !== undefined && (
        <BzwModalOverlay onClick={() => setEditorTask(undefined)} aria-label={editorTask ? 'Sửa công việc' : 'Tạo công việc mới'}>
          <div className="bzw-modal bzw-wide" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>{editorTask ? 'Sửa công việc' : 'Tạo công việc mới'}</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setEditorTask(undefined)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-formgrid">
                <div className="bzw-field bzw-span2">
                  <label htmlFor="m_title">Tên công việc *</label>
                  <input
                    id="m_title"
                    type="text"
                    required
                    placeholder="Nhập tên nhiệm vụ..."
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>

                <div className="bzw-field bzw-span2">
                  <label htmlFor="m_desc">Nội dung / yêu cầu thực hiện</label>
                  <textarea
                    id="m_desc"
                    placeholder="Mô tả các bước, yêu cầu và tài liệu..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                {/* HÀNG 3: NHÓM CÔNG VIỆC & NGƯỜI THỰC HIỆN */}
                <div className="bzw-field">
                  <label htmlFor="m_branch">Nhóm / Nhánh công việc *</label>
                  <select
                    id="m_branch"
                    value={form.branch}
                    disabled={role === 'teacher'}
                    onChange={(e) => {
                      const newBranch = e.target.value as Branch;
                      let nextAssignee = form.assigned_uid;
                      const curPerson = selectablePeople.find(
                        (p) => p.user_id === form.assigned_uid,
                      );
                      if (newBranch === 'admin' && curPerson?.branch !== 'admin') {
                        nextAssignee =
                          selectablePeople.find(
                            (p) => p.email === 'phonghanhchinh.beezone@gmail.com',
                          )?.user_id ||
                          selectablePeople.find((p) => p.branch === 'admin')?.user_id ||
                          nextAssignee;
                      } else if (newBranch === 'training' && curPerson?.branch !== 'training') {
                        nextAssignee =
                          selectablePeople.find(
                            (p) => p.email === 'phongdaotao.beezone@gmail.com',
                          )?.user_id ||
                          selectablePeople.find((p) => p.branch === 'training')?.user_id ||
                          nextAssignee;
                      } else if (newBranch === 'teacher' && curPerson?.branch !== 'teacher') {
                        nextAssignee =
                          selectablePeople.find((p) => p.branch === 'teacher' || p.role === 'teacher')?.user_id ||
                          nextAssignee;
                      }
                      setForm({
                        ...form,
                        branch: newBranch,
                        assigned_uid: nextAssignee,
                      });
                    }}
                  >
                    {canSeeAdminBranch && <option value="admin">Hành chính</option>}
                    {canSeeTrainingBranch && <option value="training">Đào tạo</option>}
                    <option value="teacher">Giáo viên</option>
                  </select>
                  {role === 'trainer' && (
                    <small style={{ color: '#64748b', fontSize: 11, marginTop: 3, display: 'block' }}>
                      Bộ phận Đào tạo phụ trách việc chuyên môn và phân công cho Giáo viên các lớp.
                    </small>
                  )}
                  {role === 'teacher' && (
                    <small style={{ color: '#64748b', fontSize: 11, marginTop: 3, display: 'block' }}>
                      Tài khoản Giáo viên giao việc trong nhóm giảng dạy.
                    </small>
                  )}
                </div>

                <div className="bzw-field">
                  <label>Người thực hiện *</label>
                  <ResponsiveSelect
                    label="Người thực hiện"
                    value={form.assigned_uid}
                    placeholder="— Chọn nhân sự / giáo viên —"
                    className="bzw-assignee-select"
                    contentClassName="bzw-assignee-select-menu"
                    options={[
                      ...assignablePeople.map((p) => ({
                        value: p.user_id,
                        label: `${p.display_name} (${p.department || (p.role === 'teacher' ? 'Giáo viên' : 'Nhân sự')})${p.email ? ` – ${p.email}` : ''}`,
                      })),
                      { value: '__add_new__', label: '➕ Thêm mới nhân sự / giáo viên...' },
                    ]}
                    onChange={(newUid) => {
                      if (newUid === '__add_new__') {
                        setShowQuickAddPerson(true);
                        return;
                      }
                      const person = people.find((p) => p.user_id === newUid);
                      const teacher = teachers.find(
                        (t) =>
                          t.id === person?.teacherId ||
                          t.id === person?.user_id ||
                          t.name === person?.display_name,
                      );
                      let nextClassId = form.classId;
                      let nextClassLabel = form.class_label;
                      if (!form.classId && teacher) {
                        const tc = classes.find(
                          (c) =>
                            c.teacherId === teacher.id ||
                            teacher.assignedClassIds?.includes(c.id),
                        );
                        if (tc) {
                          nextClassId = tc.id;
                          nextClassLabel = tc.name;
                        }
                      }
                      setForm((prev) => ({
                        ...prev,
                        assigned_uid: newUid,
                        classId: nextClassId,
                        class_label: nextClassLabel,
                      }));
                    }}
                  />

                  {showQuickAddPerson && (
                    <div className="bzw-quick-add-box">
                      <div className="bzw-quick-add-header">
                        <strong>➕ Thêm mới nhân sự / giáo viên</strong>
                        <span style={{ fontSize: 11, color: '#92400e' }}>Bổ sung người thực hiện trực tiếp</span>
                      </div>
                      <div className="bzw-quick-add-grid">
                        <div className="bzw-quick-field">
                          <label htmlFor="qa_name">Họ và tên *</label>
                          <input
                            id="qa_name"
                            type="text"
                            placeholder="Ví dụ: Cô Mai Anh, Thầy Tuấn..."
                            value={quickPersonName}
                            onChange={(e) => setQuickPersonName(e.target.value)}
                          />
                        </div>
                        <div className="bzw-quick-field">
                          <label htmlFor="qa_email">Email liên hệ</label>
                          <input
                            id="qa_email"
                            type="email"
                            placeholder="name@gmail.com"
                            value={quickPersonEmail}
                            onChange={(e) => setQuickPersonEmail(e.target.value)}
                          />
                        </div>
                        <div className="bzw-quick-field">
                          <label htmlFor="qa_dept">Bộ phận / Vai trò</label>
                          <select
                            id="qa_dept"
                            value={quickPersonDept}
                            onChange={(e) => setQuickPersonDept(e.target.value)}
                          >
                            <option value="Giáo viên">Giáo viên</option>
                            <option value="Đào tạo">Đào tạo</option>
                            <option value="Hành chính">Hành chính</option>
                            <option value="Chủ trung tâm">Chủ trung tâm / Quản lý</option>
                          </select>
                        </div>
                        <div className="bzw-quick-field">
                          <label htmlFor="qa_phone">Số điện thoại (tùy chọn)</label>
                          <input
                            id="qa_phone"
                            type="tel"
                            placeholder="0912..."
                            value={quickPersonPhone}
                            onChange={(e) => setQuickPersonPhone(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="bzw-quick-add-actions">
                        <button
                          type="button"
                          className="bzw-btn-quick-save"
                          onClick={handleSaveQuickPerson}
                        >
                          ✓ Lưu & Chọn người này
                        </button>
                        <button
                          type="button"
                          className="bzw-btn-quick-cancel"
                          onClick={() => {
                            setShowQuickAddPerson(false);
                            setQuickPersonName('');
                            setQuickPersonEmail('');
                            setQuickPersonPhone('');
                          }}
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* HÀNG 4: LỚP HỌC & CA / BUỔI */}
                <div className="bzw-field">
                  <label htmlFor="m_class">Lớp (đồng bộ danh mục lớp & giáo viên)</label>
                  <select
                    id="m_class"
                    aria-label="Lớp (nếu là công việc giáo viên)"
                    value={form.classId || (form.class_label ? '__custom__' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__custom__') {
                        setForm((prev) => ({
                          ...prev,
                          classId: '',
                          class_label: prev.class_label || 'Toàn khối',
                        }));
                        return;
                      }
                      if (!val) {
                        setForm((prev) => ({ ...prev, classId: '', class_label: '' }));
                        return;
                      }
                      const cls = classes.find((c) => c.id === val);
                      if (!cls) return;

                      const dayName = weekdayForDate(form.work_date);
                      const slotOnDay = timetableSlots.find(
                        (s) => s.classId === cls.id && s.dayOfWeek === dayName,
                      );
                      const room = slotOnDay
                        ? rooms.find((r) => r.id === slotOnDay.roomId)
                        : rooms.find((r) => r.id === cls.roomId);
                      const shiftTime = slotOnDay
                        ? `${slotOnDay.startTime} - ${slotOnDay.endTime}${
                            room ? ` (${room.name})` : ''
                          }`
                        : cls.scheduleTime || form.shift_label;

                      const classTeacher = teachers.find((t) => t.id === cls.teacherId);
                      let nextAssignee = form.assigned_uid;
                      let nextBranch = form.branch;
                      if (classTeacher) {
                        const matched = people.find(
                          (p) =>
                            p.teacherId === classTeacher.id ||
                            p.user_id === classTeacher.id ||
                            p.display_name === classTeacher.name,
                        );
                        if (matched) {
                          nextAssignee = matched.user_id;
                          if (form.is_teacher_off || form.branch !== 'admin') {
                            nextBranch = 'teacher';
                          }
                        }
                      }

                      setForm((prev) => ({
                        ...prev,
                        branch: nextBranch,
                        classId: cls.id,
                        class_label: cls.name,
                        shift_label: shiftTime || prev.shift_label,
                        assigned_uid: nextAssignee,
                      }));
                    }}
                  >
                    <option value="">-- Không chọn lớp / Áp dụng chung --</option>
                    {(() => {
                      const selPerson = people.find((p) => p.user_id === form.assigned_uid);
                      const selTeacher = teachers.find(
                        (t) =>
                          t.id === selPerson?.teacherId ||
                          t.id === selPerson?.user_id ||
                          t.name === selPerson?.display_name,
                      );
                      const tClasses = selTeacher
                        ? classes.filter(
                            (c) =>
                              c.teacherId === selTeacher.id ||
                              selTeacher.assignedClassIds?.includes(c.id) ||
                              timetableSlots.some(
                                (s) => s.classId === c.id && s.teacherId === selTeacher.id,
                              ),
                          )
                        : [];
                      const otherClasses = classes.filter(
                        (c) => !tClasses.some((tc) => tc.id === c.id),
                      );

                      return (
                        <>
                          {tClasses.length > 0 && (
                            <optgroup label={`⭐ Lớp phụ trách của ${selTeacher?.name}`}>
                              {tClasses.map((c) => (
                                <option key={c.id} value={c.id}>
                                  [{c.code}] {c.name} {c.scheduleTime ? `(${c.scheduleTime})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Tất cả các lớp học trong trung tâm">
                            {otherClasses.map((c) => {
                              const t = teachers.find((x) => x.id === c.teacherId);
                              return (
                                <option key={c.id} value={c.id}>
                                  [{c.code}] {c.name} {t ? `· GV: ${t.name}` : ''}
                                </option>
                              );
                            })}
                          </optgroup>
                          <option value="__custom__">✏️ Nhập tên / mã lớp khác...</option>
                        </>
                      );
                    })()}
                  </select>

                  {/* Input nhập tay nếu cần */}
                  {!form.classId && form.class_label && (
                    <input
                      type="text"
                      style={{ marginTop: 6 }}
                      placeholder="Chọn lớp có sẵn hoặc nhập mã lớp..."
                      value={form.class_label}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, class_label: e.target.value }))
                      }
                    />
                  )}

                  {/* Thông tin đồng bộ lớp học */}
                  {(() => {
                    const cls = classes.find((c) => c.id === form.classId);
                    if (!cls) return null;
                    const dayName = weekdayForDate(form.work_date);
                    const slotsOnDay = timetableSlots.filter(
                      (s) => s.classId === cls.id && s.dayOfWeek === dayName,
                    );
                    const roomName = rooms.find((r) => r.id === cls.roomId)?.name;
                    return (
                      <div className="bzw-sync-info" style={{ marginTop: 6 }}>
                        📅 <b>Lịch học:</b> {cls.scheduleTime || 'Chưa cố định'}
                        {cls.days && cls.days.length > 0 ? ` · ${cls.days.join(', ')}` : ''}
                        {roomName ? ` · Phòng ${roomName}` : ''}
                        {slotsOnDay.length > 0 ? (
                          <span className="bzw-chip done" style={{ marginLeft: 6 }}>
                            ✓ Hôm nay ({dayName}) có ca:{' '}
                            {slotsOnDay
                              .map((s) => `${s.startTime}-${s.endTime}`)
                              .join(', ')}
                          </span>
                        ) : (
                          <span
                            className="bzw-chip"
                            style={{
                              marginLeft: 6,
                              background: '#f1f5f9',
                              color: '#64748b',
                            }}
                          >
                            ℹ️ Lớp không có lịch định kỳ vào {dayName}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="bzw-field">
                  <label htmlFor="m_shift">Ca / Buổi (đồng bộ với thời khóa biểu & lịch dạy)</label>
                  <select
                    id="m_shift"
                    aria-label="Ca / Buổi"
                    value={isCustomShift ? '__custom_shift__' : form.shift_label}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__custom_shift__') {
                        setIsCustomShift(true);
                        const formatted = customShiftNote
                          ? `${customShiftNote} (${customShiftStart} - ${customShiftEnd})`
                          : `${customShiftStart} - ${customShiftEnd}`;
                        setForm((prev) => ({ ...prev, shift_label: formatted }));
                        return;
                      }
                      setIsCustomShift(false);
                      setForm((prev) => ({ ...prev, shift_label: val }));
                    }}
                  >
                    {(() => {
                      const dayName = weekdayForDate(form.work_date);
                      const cls = classes.find((c) => c.id === form.classId);
                      const slotsOnDay = form.classId
                        ? timetableSlots.filter(
                            (s) => s.classId === form.classId && s.dayOfWeek === dayName,
                          )
                        : [];
                      const otherSlots = form.classId
                        ? timetableSlots.filter(
                            (s) => s.classId === form.classId && s.dayOfWeek !== dayName,
                          )
                        : [];

                      return (
                        <>
                          {slotsOnDay.length > 0 && (
                            <optgroup
                              label={`🕒 Ca học của lớp vào ${dayName} (${dateVN(
                                form.work_date,
                              )})`}
                            >
                              {slotsOnDay.map((s) => {
                                const rm = rooms.find((r) => r.id === s.roomId);
                                const val = `${s.startTime} - ${s.endTime}${
                                   rm ? ` (${rm.name})` : ''
                                }`;
                                return (
                                  <option key={s.id} value={val}>
                                    🕒 {s.startTime} - {s.endTime}{' '}
                                    {rm ? `(Phòng ${rm.name})` : ''}
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                          {otherSlots.length > 0 && (
                            <optgroup label="Các ca học khác của lớp trong tuần">
                              {otherSlots.map((s) => {
                                const rm = rooms.find((r) => r.id === s.roomId);
                                const val = `${s.startTime} - ${s.endTime}${
                                   rm ? ` (${rm.name})` : ''
                                }`;
                                return (
                                  <option key={s.id} value={val}>
                                    🕒 {s.dayOfWeek}: {s.startTime} - {s.endTime}{' '}
                                    {rm ? `(Phòng ${rm.name})` : ''}
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                          {cls?.scheduleTime && (
                            <optgroup label="Khung giờ cố định của lớp">
                              <option value={cls.scheduleTime}>
                                🕒 {cls.scheduleTime}
                              </option>
                            </optgroup>
                          )}
                          <optgroup label="Ca làm việc / trực chuẩn">
                            <option value="Ca sáng">☀️ Ca sáng (08:00 - 11:30)</option>
                            <option value="Ca chiều">🌤️ Ca chiều (14:00 - 17:30)</option>
                            <option value="Ca tối">🌙 Ca tối (17:30 - 21:00)</option>
                            <option value="Cuối buổi">📌 Cuối buổi</option>
                            <option value="Cả ngày">⏳ Cả ngày</option>
                          </optgroup>
                          <optgroup label="Tùy chỉnh mốc thời gian">
                            <option value="__custom_shift__">
                              ➕ Thêm mới / Tự nhập mốc thời gian...
                            </option>
                          </optgroup>
                          {!['Ca sáng', 'Ca chiều', 'Ca tối', 'Cuối buổi', 'Cả ngày', cls?.scheduleTime, '__custom_shift__'].includes(
                            form.shift_label,
                          ) &&
                            !slotsOnDay.some(
                              (s) => `${s.startTime} - ${s.endTime}` === form.shift_label,
                            ) && (
                              <option value={form.shift_label}>
                                ✏️ {form.shift_label}
                              </option>
                            )}
                        </>
                      );
                    })()}
                  </select>

                  {isCustomShift && (
                    <div
                      className="bzw-custom-shift-box"
                      style={{
                        marginTop: 8,
                        padding: '10px 12px',
                        background: '#f8fafc',
                        border: '1.5px dashed #cbd5e1',
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 6,
                        }}
                      >
                        <strong style={{ fontSize: 12, color: '#1e293b' }}>
                          🕒 Tự nhập mốc thời gian / ca làm việc:
                        </strong>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          Hành chính & Quản lý tùy chỉnh
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <label
                            htmlFor="cs_start"
                            style={{
                              fontSize: 11,
                              color: '#475569',
                              display: 'block',
                              marginBottom: 2,
                            }}
                          >
                            Từ giờ:
                          </label>
                          <input
                            id="cs_start"
                            type="time"
                            value={customShiftStart}
                            onChange={(e) => {
                              const start = e.target.value;
                              setCustomShiftStart(start);
                              const formatted = customShiftNote
                                ? `${customShiftNote} (${start} - ${customShiftEnd})`
                                : `${start} - ${customShiftEnd}`;
                              setForm((prev) => ({ ...prev, shift_label: formatted }));
                            }}
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="cs_end"
                            style={{
                              fontSize: 11,
                              color: '#475569',
                              display: 'block',
                              marginBottom: 2,
                            }}
                          >
                            Đến giờ:
                          </label>
                          <input
                            id="cs_end"
                            type="time"
                            value={customShiftEnd}
                            onChange={(e) => {
                              const end = e.target.value;
                              setCustomShiftEnd(end);
                              const formatted = customShiftNote
                                ? `${customShiftNote} (${customShiftStart} - ${end})`
                                : `${customShiftStart} - ${end}`;
                              setForm((prev) => ({ ...prev, shift_label: formatted }));
                            }}
                          />
                        </div>

                        <div style={{ gridColumn: 'span 2' }}>
                          <label
                            htmlFor="cs_custom_text"
                            style={{
                              fontSize: 11,
                              color: '#475569',
                              display: 'block',
                              marginBottom: 2,
                            }}
                          >
                            Tên ca / Ghi chú ca tự gõ:
                          </label>
                          <input
                            id="cs_custom_text"
                            type="text"
                            placeholder="VD: Trực trưa, Họp đột xuất, Tiếp phụ huynh..."
                            value={customShiftNote}
                            onChange={(e) => {
                              const note = e.target.value;
                              setCustomShiftNote(note);
                              const formatted = note
                                ? `${note} (${customShiftStart} - ${customShiftEnd})`
                                : `${customShiftStart} - ${customShiftEnd}`;
                              setForm((prev) => ({ ...prev, shift_label: formatted }));
                            }}
                          />
                        </div>

                        <div style={{ gridColumn: 'span 2' }}>
                          <label
                            htmlFor="cs_full_text"
                            style={{
                              fontSize: 11,
                              color: '#475569',
                              display: 'block',
                              marginBottom: 2,
                            }}
                          >
                            Mốc thời gian hiển thị:
                          </label>
                          <input
                            id="cs_full_text"
                            type="text"
                            placeholder="Mốc thời gian sẽ lưu vào công việc..."
                            value={form.shift_label}
                            onChange={(e) =>
                              setForm((prev) => ({ ...prev, shift_label: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ĐĂNG KÝ CÔ NGHỈ (OFF) & DẠY THAY / DẠY BÙ */}
                <div className="bzw-teacher-off-box">
                  <label className="bzw-toggle-label">
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18 }}
                      checked={Boolean(form.is_teacher_off)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const selClass = classes.find((c) => c.id === form.classId);
                        const classTeacher = teachers.find((t) => t.id === selClass?.teacherId);
                        const classTeacherPerson = classTeacher
                          ? people.find((person) =>
                              person.teacherId === classTeacher.id ||
                              person.user_id === classTeacher.id ||
                              person.display_name === classTeacher.name,
                            )
                          : undefined;
                        const teacherName = classTeacher?.name || 'giáo viên';
                        setForm((prev) => ({
                          ...prev,
                          branch: checked ? 'teacher' : prev.branch,
                          assigned_uid: checked && classTeacherPerson
                            ? classTeacherPerson.user_id
                            : prev.assigned_uid,
                          is_teacher_off: checked,
                          needs_handover: checked ? true : prev.needs_handover,
                          priority: checked ? 'high' : prev.priority,
                          title:
                            checked &&
                            (!prev.title || prev.title.startsWith('Công việc'))
                              ? `Cô ${teacherName} đăng ký nghỉ - Xếp dạy thay ${
                                  selClass?.name || ''
                                }`.trim()
                              : prev.title,
                        }));
                      }}
                    />
                    <span>
                      <strong>👩‍🏫 Cô đăng ký nghỉ (off) & phân công giáo viên dạy thay / dạy bù</strong>
                      <small>
                        Tự động đồng bộ sang Thời khóa biểu (hiển thị GV dạy thay) và Lịch giáo viên (đánh dấu nghỉ dạy & xếp buổi dạy bù)
                      </small>
                    </span>
                  </label>

                  {form.is_teacher_off && (
                    <div className="bzw-substitute-panel">
                      <div className="bzw-field">
                        <label htmlFor="m_sub_teacher">Giáo viên dạy thay / dạy bù *</label>
                        <select
                          id="m_sub_teacher"
                          value={form.substitute_teacher_id || ''}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              substitute_teacher_id: e.target.value,
                            }))
                          }
                        >
                          <option value="">-- Chọn giáo viên dạy thay / dạy bù --</option>
                          {(() => {
                            const selPerson = people.find(
                              (p) => p.user_id === form.assigned_uid,
                            );
                            const currentTeacherId =
                              selPerson?.teacherId ||
                              selPerson?.user_id ||
                              classes.find((c) => c.id === form.classId)?.teacherId;
                            return teachers
                              .filter(
                                (t) =>
                                  t.id !== currentTeacherId &&
                                  !isHiddenWorkEmail(t.email),
                              )
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} {t.specialty ? `— ${t.specialty}` : ''}{' '}
                                  {t.phone ? `(${t.phone})` : ''}
                                </option>
                              ));
                          })()}
                        </select>
                      </div>

                      <div className="bzw-off-sync-preview">
                        🔄 <b>Thông tin đồng bộ:</b> Ngày <u>{dateVN(form.work_date)}</u> · Ca{' '}
                        <u>{form.shift_label}</u> · Lớp{' '}
                        <u>
                          {classes.find((c) => c.id === form.classId)?.name ||
                            form.class_label ||
                            'Chưa chọn'}
                        </u>
                        <div style={{ marginTop: 5, fontSize: 11, color: '#334155' }}>
                          • <b>Lịch cô xin nghỉ:</b> Hiển thị nhãn{' '}
                          <span style={{ color: '#dc2626', fontWeight: 700 }}>
                            Nghỉ dạy
                          </span>{' '}
                          trên ma trận lịch giáo viên.<br />
                          • <b>Lịch GV dạy thay (
                            {teachers.find(
                              (t) => t.id === form.substitute_teacher_id,
                            )?.name || 'Chưa chọn'}
                          ):</b> Được xếp thêm buổi dạy thay tương ứng.<br />
                          • <b>Thời khóa biểu:</b> Thẻ lớp cập nhật nhãn{' '}
                          <span style={{ color: '#4338ca', fontWeight: 700 }}>
                            Dạy thay:{' '}
                            {teachers.find(
                              (t) => t.id === form.substitute_teacher_id,
                            )?.name || 'Tên GV'}
                          </span>.<br />
                          • <b>Phân hệ Giao việc:</b> Tự động gắn cờ <b>Cần bàn giao</b> để người trực ca theo dõi.
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bzw-field bzw-span2 bzw-row-3cols">
                  <div>
                    <label htmlFor="m_date">Ngày thực hiện *</label>
                    <input
                      id="m_date"
                      type="date"
                      required
                      value={form.work_date}
                      onChange={(e) => setForm({ ...form, work_date: e.target.value })}
                    />
                  </div>

                  <div>
                    <label htmlFor="m_priority">Mức ưu tiên</label>
                    <select
                      id="m_priority"
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
                    >
                      <option value="normal">Bình thường</option>
                      <option value="high">Ưu tiên cao</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="m_status">Trạng thái</label>
                    <select
                      id="m_status"
                      value={form.status || 'todo'}
                      onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    >
                      <option value="todo">Chưa làm</option>
                      <option value="progress">Đang làm</option>
                      <option value="unfinished">Còn dang dở</option>
                      <option value="done">Hoàn thành</option>
                    </select>
                  </div>
                </div>

                <div className="bzw-field bzw-span2">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                      checked={Boolean(form.needs_handover)}
                      onChange={(e) => setForm({ ...form, needs_handover: e.target.checked })}
                    />
                    <span>🔄 Đánh dấu cần bàn giao cuối ca</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn"
                onClick={() => setEditorTask(undefined)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="bzw-btn bzw-gold"
                onClick={handleSaveTask}
              >
                💾 Lưu công việc
              </button>
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: NOTES */}
      {noteTask && (
        <BzwModalOverlay onClick={() => setNoteTask(null)} aria-label="Ghi chú báo cáo cuối buổi">
          <div className="bzw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>Ghi chú / Báo cáo cuối buổi</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setNoteTask(null)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-hint">
                <b>{noteTask.title}</b>
                <div>Ghi chú giúp người trực ca sau hoặc phụ trách đào tạo nắm việc còn lại.</div>
              </div>

              <div className="bzw-field">
                <label htmlFor="new_note_text">Nội dung ghi chú mới *</label>
                <textarea
                  id="new_note_text"
                  placeholder="Thêm ghi chú bổ sung..."
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                />
              </div>

              <div style={{ marginTop: 15 }}>
                <b>Lịch sử ghi chú ({notes.filter((n) => n.task_id === noteTask.id).length})</b>
                <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 8 }}>
                  {notes.filter((n) => n.task_id === noteTask.id).length === 0 ? (
                    <p className="bzw-small">Chưa có ghi chú nào.</p>
                  ) : (
                    notes
                      .filter((n) => n.task_id === noteTask.id)
                      .slice()
                      .reverse()
                      .map((n) => (
                        <div key={n.id} className="bzw-note-log">
                          <b>{n.author_name || 'Nhân sự'}</b> <small>• {timeVN(n.created_at)}</small>
                          <div>{n.body}</div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn"
                onClick={() => setNoteTask(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="bzw-btn bzw-gold"
                onClick={handleSaveNote}
              >
                ＋ Thêm ghi chú
              </button>
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: REASONS LIST */}
      {reasonViewTask && (
        <BzwModalOverlay onClick={() => setReasonViewTask(null)} aria-label="Lý do kết quả công việc">
          <div className="bzw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>📝 Lý do / Kết quả công việc</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setReasonViewTask(null)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-hint">
                <b>{reasonViewTask.title}</b>
                <div>Người thực hiện: {getPerson(reasonViewTask.assigned_uid).display_name}</div>
              </div>

              <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 10 }}>
                {reasons.filter((r) => r.task_id === reasonViewTask.id).length === 0 ? (
                  <p className="bzw-small">Chưa có lý do cập nhật.</p>
                ) : (
                  reasons
                    .filter((r) => r.task_id === reasonViewTask.id)
                    .map((r) => (
                      <div key={r.id} className="bzw-note-log">
                        <b>
                          {r.kind === 'progress'
                            ? 'Đang làm'
                            : r.kind === 'unfinished'
                            ? 'Còn dang dở'
                            : r.kind === 'done'
                            ? 'Hoàn thành'
                            : 'Bàn giao ca'}
                        </b>{' '}
                        <small>• {r.author_name} • {timeVN(r.created_at)}</small>
                        <p style={{ margin: '4px 0 0' }}>{r.body}</p>
                      </div>
                    ))
                )}
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn"
                onClick={() => setReasonViewTask(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="bzw-btn bzw-gold"
                onClick={() => {
                  const t = reasonViewTask;
                  setReasonViewTask(null);
                  handleOpenReasonAdd(t);
                }}
              >
                ＋ Thêm lý do
              </button>
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: REASON ADD / STATUS UPDATE */}
      {reasonAddTask && (
        <BzwModalOverlay onClick={() => setReasonAddTask(null)} aria-label="Cập nhật trạng thái và lý do">
          <div className="bzw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>Cập nhật trạng thái &amp; Lý do</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setReasonAddTask(null)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-hint">
                <b>{reasonAddTask.task.title}</b>
                <div>Người thực hiện: {getPerson(reasonAddTask.task.assigned_uid).display_name}</div>
                <div>Chọn trạng thái phù hợp và ghi rõ kết quả, phần còn dở hoặc việc cần bàn giao.</div>
              </div>

              <div className="bzw-field">
                <label htmlFor="reason_kind_select">Trạng thái / Nhóm lý do *</label>
                <select
                  id="reason_kind_select"
                  value={reasonKind}
                  onChange={(e) => setReasonKind(e.target.value as any)}
                >
                  <option value="progress">Đang làm</option>
                  <option value="unfinished">Còn dang dở</option>
                  <option value="done">Hoàn thành</option>
                  <option value="handover">Bàn giao ca</option>
                </select>
              </div>

              <div className="bzw-field">
                <label htmlFor="reason_body_text">Lý do / Kết quả / Nội dung bàn giao *</label>
                <textarea
                  id="reason_body_text"
                  required
                  placeholder="Nhập lý do / kết quả thực hiện..."
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                />
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn"
                onClick={() => setReasonAddTask(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="bzw-btn bzw-gold"
                onClick={handleSaveReason}
              >
                Lưu trạng thái
              </button>
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: EMAIL SHARE */}
      {emailTask && (
        <BzwModalOverlay onClick={() => setEmailTask(null)} aria-label="Gửi email công việc">
          <div className="bzw-modal bzw-wide" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>📧 Gửi email công việc</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setEmailTask(null)}
              >
                ×
              </button>
            </div>

            <div className="bzw-share-tabs">
              <button
                type="button"
                className={`bzw-share-tab ${emailTab === 'gmail' ? 'active' : ''}`}
                onClick={() => setEmailTab('gmail')}
              >
                📧 Email công việc
              </button>
              <button
                type="button"
                className={`bzw-share-tab ${emailTab === 'copy' ? 'active' : ''}`}
                onClick={() => setEmailTab('copy')}
              >
                📋 Sao chép nội dung
              </button>
            </div>

            <div className="bzw-modal-content">
              <div className="bzw-field">
                <label htmlFor="mailRecipient">Người nhận / giáo viên nhận thư *</label>
                <select
                  id="mailRecipient"
                  value={emailRecipientUid}
                  onChange={(e) => {
                    setEmailRecipientUid(e.target.value);
                    const p = getPerson(e.target.value);
                    if (emailTask) {
                      setEmailSubject(`[BeeZone] Giao việc: ${emailTask.title}`);
                      setEmailBodyContent(
                        `Xin chào ${p.display_name},\n\n` +
                          `Trung tâm Anh ngữ BeeZone gửi đến anh/chị công việc sau:\n\n` +
                          `• Công việc: ${emailTask.title}\n` +
                          `• Người thực hiện: ${p.display_name} (${p.email || 'Chưa có email'})\n` +
                          `• Bộ phận: ${emailTask.branch === 'admin' ? 'Hành chính' : emailTask.branch === 'training' ? 'Đào tạo' : 'Giáo viên'}\n` +
                          (emailTask.class_label ? `• Lớp: ${emailTask.class_label}\n` : '') +
                          `• Ngày thực hiện: ${dateVN(emailTask.work_date)} — ${emailTask.shift_label}\n` +
                          `• Trạng thái: ${statusName[emailTask.status]}\n` +
                          `• Yêu cầu: ${emailTask.description || 'Theo nội dung đã phân công.'}\n\n` +
                          `Anh/chị vui lòng cập nhật tiến độ và phản hồi nếu cần hỗ trợ.\n\n` +
                          `Trân trọng,\nTrung tâm Anh ngữ BeeZone`,
                      );
                    }
                  }}
                >
                  {selectablePeople.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.display_name} — {p.email || 'Chưa có email'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Recipient preview */}
              <div className="bzw-recipient-card">
                <span className="bzw-avatar">
                  {getInitials(getPerson(emailRecipientUid).display_name)}
                </span>
                <div>
                  <b>{getPerson(emailRecipientUid).display_name} · {getPerson(emailRecipientUid).department || 'Nhân sự'}</b>
                  <small>{getPerson(emailRecipientUid).email || 'Chưa có email'}</small>
                </div>
              </div>

              {emailTab === 'gmail' ? (
                <>
                  <div className="bzw-field">
                    <label htmlFor="mail_subj">Tiêu đề email (có thể sửa)</label>
                    <input
                      id="mail_subj"
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                    />
                  </div>

                  <div className="bzw-field">
                    <label htmlFor="mail_body">Nội dung email (có thể sửa)</label>
                    <textarea
                      id="mail_body"
                      rows={8}
                      value={emailBodyContent}
                      onChange={(e) => setEmailBodyContent(e.target.value)}
                    />
                  </div>

                  <label className="bzw-staffrow" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18 }}
                      checked={emailMarkChecked}
                      onChange={(e) => setEmailMarkChecked(e.target.checked)}
                    />
                    <div className="bzw-text">
                      <b>Đánh dấu là đã gửi email</b>
                      <small>Dùng sau khi anh/chị đã bấm Gửi trong Gmail để tránh gửi trùng hoặc bỏ sót.</small>
                    </div>
                  </label>

                  <div className="bzw-warning">
                    Hệ thống sẽ mở Gmail với nội dung soạn sẵn, anh/chị kiểm tra và bấm <b>Gửi</b> bên Gmail.
                  </div>
                </>
              ) : (
                <div>
                  <strong style={{ fontSize: 12 }}>Xem trước thư</strong>
                  <div className="bzw-email-preview">
                    {`Người nhận: ${getPerson(emailRecipientUid).email}\nTiêu đề: ${emailSubject}\n\n${emailBodyContent}`}
                  </div>
                </div>
              )}
            </div>

            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn"
                onClick={() => setEmailTask(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="bzw-btn"
                onClick={() => {
                  navigator.clipboard.writeText(`${emailSubject}\n\n${emailBodyContent}`);
                  showToast('Đã sao chép nội dung email.');
                }}
              >
                📋 Sao chép
              </button>
              <button
                type="button"
                className="bzw-btn"
                onClick={handleSaveEmailMark}
              >
                ☑ Xác nhận đã gửi email
              </button>
              <button
                type="button"
                className="bzw-btn bzw-blue"
                onClick={handleOpenGmail}
              >
                📧 Mở Gmail để gửi
              </button>
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: CHỌN NGƯỜI NHẬN BÀN GIAO */}
      {handoverTask && (
        <BzwModalOverlay onClick={() => setHandoverTask(null)} aria-label="Bàn giao công việc">
          <div className="bzw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>Bàn giao công việc</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setHandoverTask(null)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-hint">
                <b>{handoverTask.title}</b>
                <div>
                  {handoverTask.class_label ? `Lớp ${handoverTask.class_label} · ` : ''}
                  {dateVN(handoverTask.work_date)} · {handoverTask.shift_label}
                </div>
                {handoverTask.is_teacher_off && (
                  <div>
                    Giáo viên dạy thay đề xuất:{' '}
                    <b>{teachers.find((teacher) => teacher.id === handoverTask.substitute_teacher_id)?.name || 'Chưa xác định'}</b>
                  </div>
                )}
              </div>

              <div className="bzw-field">
                <label htmlFor="handover_recipient">Người nhận bàn giao *</label>
                <select
                  id="handover_recipient"
                  value={handoverToUid}
                  onChange={(event) => setHandoverToUid(event.target.value)}
                >
                  <option value="">-- Chọn người nhận --</option>
                  {handoverCandidates.map((person) => (
                    <option key={person.user_id} value={person.user_id}>
                      {person.display_name} · {person.department || 'Nhân sự'}
                    </option>
                  ))}
                </select>
                {handoverCandidates.length === 0 && (
                  <small>Chưa có tài khoản phù hợp trong nhóm công việc này.</small>
                )}
              </div>

              <div className="bzw-field">
                <label htmlFor="handover_note">Nội dung bàn giao *</label>
                <textarea
                  id="handover_note"
                  rows={5}
                  maxLength={3000}
                  value={handoverNoteContent}
                  onChange={(event) => setHandoverNoteContent(event.target.value)}
                  placeholder="Nêu rõ nội dung đang làm, lớp/buổi học, việc cần tiếp tục và lưu ý cho người nhận..."
                />
              </div>

              <div className="bzw-warning">
                Chủ trung tâm và Hành chính thấy toàn bộ bàn giao. Đào tạo thấy bàn giao thuộc nhóm Đào tạo hoặc Giáo viên. Người nhận phải xác nhận trước khi công việc được chuyển sang tài khoản của họ.
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button type="button" className="bzw-btn" onClick={() => setHandoverTask(null)}>
                Đóng
              </button>
              <button
                type="button"
                className="bzw-btn bzw-green"
                disabled={!handoverToUid || handoverCandidates.length === 0}
                onClick={handleSaveHandover}
              >
                Gửi bàn giao
              </button>
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: HANDOVER ACK */}
      {ackTask && (
        <BzwModalOverlay onClick={() => setAckTask(null)} aria-label="Xác nhận nhận bàn giao">
          <div className="bzw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>Xác nhận đã nhận bàn giao</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setAckTask(null)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-hint">
                <b>{ackTask.title}</b>
                <div>Người nhận ca đọc ghi chú và xác nhận đã nhận việc dang dở.</div>
              </div>

              <div className="bzw-field">
                <label htmlFor="ack_user_name">Tên người nhận ca *</label>
                <input
                  id="ack_user_name"
                  type="text"
                  required
                  value={ackName}
                  onChange={(e) => setAckName(e.target.value)}
                />
              </div>

              <div className="bzw-field">
                <label htmlFor="ack_user_note">Ghi chú người nhận (không bắt buộc)</label>
                <textarea
                  id="ack_user_note"
                  placeholder="Ví dụ: Đã nhận thông tin, sẽ liên hệ lại phụ huynh sáng mai."
                  value={ackNote}
                  onChange={(e) => setAckNote(e.target.value)}
                />
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn"
                onClick={() => setAckTask(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="bzw-btn bzw-green"
                onClick={handleAckHandover}
              >
                ✓ Xác nhận bàn giao
              </button>
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: DIRECTORY */}
      {directoryModal && (
        <BzwModalOverlay onClick={() => setDirectoryModal(false)} aria-label="Danh bạ giáo viên và nhân sự">
          <div className="bzw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>👥 Danh bạ giáo viên</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setDirectoryModal(false)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-hint">
                {supabase
                  ? 'Danh sách này đồng bộ từ các tài khoản hoạt động được cấp quyền trong mục Phân quyền giáo viên.'
                  : <>Nhập <b>Gmail thật</b> cho từng người để nút gửi email sử dụng được.</>}
              </div>

              {supabase && (
                <div className="flex justify-end pb-2">
                  <button
                    type="button"
                    className="bzw-btn bzw-sm"
                    onClick={() => void refreshAuthorizedPeople()}
                    disabled={peopleRefreshing}
                    aria-label="Làm mới danh sách người thực hiện"
                  >
                    {peopleRefreshing ? 'Đang đồng bộ…' : 'Làm mới danh sách'}
                  </button>
                </div>
              )}

              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                {people
                  .filter((p) => !isHiddenWorkEmail(p.email))
                  .map((p) => (
                    <div key={p.user_id} className="bzw-staffrow">
                    <span className="bzw-avatar">{getInitials(p.display_name)}</span>
                    <div className="bzw-text">
                      <b>{p.display_name}</b>
                      <small>
                        {p.department || 'Nhân sự'} • {p.email || 'Chưa có email'}
                      </small>
                    </div>
                    {!supabase && <button
                      type="button"
                      className="bzw-btn bzw-sm"
                      onClick={() => setStaffEditor(p)}
                    >
                      ✎ Sửa
                    </button>}
                  </div>
                ))}
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn"
                onClick={() => setDirectoryModal(false)}
              >
                Đóng
              </button>
              {!supabase && <button
                type="button"
                className="bzw-btn bzw-gold"
                onClick={() =>
                  setStaffEditor({
                    user_id: 'p-' + Date.now(),
                    display_name: '',
                    email: '',
                    department: 'Giáo viên',
                    branch: 'teacher',
                    role: 'teacher',
                    active: true,
                  })
                }
              >
                ＋ Thêm nhân sự
              </button>}
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: STAFF EDIT */}
      {staffEditor !== undefined && (
        <BzwModalOverlay onClick={() => setStaffEditor(undefined)} aria-label="Thêm sửa nhân sự">
          <div className="bzw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>{people.some((p) => p.user_id === staffEditor?.user_id) ? 'Sửa nhân sự' : 'Thêm nhân sự'}</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setStaffEditor(undefined)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-field">
                <label htmlFor="staff_name">Họ tên *</label>
                <input
                  id="staff_name"
                  type="text"
                  required
                  value={staffEditor?.display_name || ''}
                  onChange={(e) =>
                    setStaffEditor((s) => s ? { ...s, display_name: e.target.value } : s)
                  }
                />
              </div>

              <div className="bzw-field">
                <label htmlFor="staff_email">Email (Gmail hoặc email công việc)</label>
                <input
                  id="staff_email"
                  type="email"
                  value={staffEditor?.email || ''}
                  onChange={(e) =>
                    setStaffEditor((s) => s ? { ...s, email: e.target.value } : s)
                  }
                />
              </div>

              <div className="bzw-field">
                <label htmlFor="staff_dept">Bộ phận / Chức danh</label>
                <input
                  id="staff_dept"
                  type="text"
                  value={staffEditor?.department || ''}
                  onChange={(e) =>
                    setStaffEditor((s) => s ? { ...s, department: e.target.value } : s)
                  }
                />
              </div>

              <div className="bzw-field">
                <label htmlFor="staff_branch">Nhóm phân quyền</label>
                <select
                  id="staff_branch"
                  value={staffEditor?.branch || 'admin'}
                  onChange={(e) =>
                    setStaffEditor((s) => s ? { ...s, branch: e.target.value as Branch } : s)
                  }
                >
                  <option value="admin">Hành chính</option>
                  <option value="training">Đào tạo</option>
                  <option value="teacher">Giáo viên</option>
                </select>
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn"
                onClick={() => setStaffEditor(undefined)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="bzw-btn bzw-gold"
                onClick={handleSaveStaff}
              >
                💾 Lưu nhân sự
              </button>
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* MODAL: CUSTOMIZE */}
      {customizeModal && (
        <BzwModalOverlay onClick={() => setCustomizeModal(false)} aria-label="Tùy chỉnh giao diện">
          <div className="bzw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bzw-modal-head">
              <h2>🎨 Tùy chỉnh giao diện và trường công việc</h2>
              <button
                type="button"
                className="bzw-xbtn"
                onClick={() => setCustomizeModal(false)}
              >
                ×
              </button>
            </div>
            <div className="bzw-modal-content">
              <div className="bzw-formgrid">
                <div className="bzw-field">
                  <label htmlFor="set_title">Tiêu đề trang</label>
                  <input
                    id="set_title"
                    type="text"
                    value={settings.page}
                    onChange={(e) => setSettings({ ...settings, page: e.target.value })}
                  />
                </div>

                <div className="bzw-field">
                  <label htmlFor="set_admin">Khung việc Hành chính</label>
                  <input
                    id="set_admin"
                    type="text"
                    value={settings.admin}
                    onChange={(e) => setSettings({ ...settings, admin: e.target.value })}
                  />
                </div>

                <div className="bzw-field">
                  <label htmlFor="set_ho">Khung bàn giao</label>
                  <input
                    id="set_ho"
                    type="text"
                    value={settings.handover}
                    onChange={(e) => setSettings({ ...settings, handover: e.target.value })}
                  />
                </div>

                <div className="bzw-field">
                  <label htmlFor="set_train">Khung việc Đào tạo</label>
                  <input
                    id="set_train"
                    type="text"
                    value={settings.training}
                    onChange={(e) => setSettings({ ...settings, training: e.target.value })}
                  />
                </div>

                <div className="bzw-field">
                  <label htmlFor="set_teacher">Khung việc Giáo viên</label>
                  <input
                    id="set_teacher"
                    type="text"
                    value={settings.teacher || 'Việc giảng dạy · Giáo viên'}
                    onChange={(e) => setSettings({ ...settings, teacher: e.target.value })}
                  />
                </div>

                <div
                  className="bzw-field bzw-span2"
                  style={{
                    marginTop: 10,
                    paddingTop: 12,
                    borderTop: '1px solid #e2e8f0',
                  }}
                >
                  <label style={{ fontWeight: 600, color: '#334155' }}>
                    Sao lưu & Khôi phục dữ liệu phân hệ
                  </label>
                  <p style={{ margin: '4px 0 10px', fontSize: 13, color: '#64748b' }}>
                    Tải về tệp JSON để lưu trữ hoặc khôi phục dữ liệu công việc và bàn giao khi cần.
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="bzw-btn bzw-sm"
                      onClick={handleDownloadBackup}
                    >
                      ↓ Tải bản sao lưu JSON
                    </button>
                    <button
                      type="button"
                      className="bzw-btn bzw-sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      ↑ Khôi phục từ tệp JSON
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      hidden
                      accept="application/json"
                      onChange={handleRestoreFile}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="bzw-modal-bottom">
              <button
                type="button"
                className="bzw-btn bzw-danger"
                onClick={() => {
                  localStorage.removeItem(WORK_SETTINGS_KEY);
                  setSettings(defaultSettings());
                  setCustomizeModal(false);
                  showToast('Đã khôi phục cài đặt mặc định.');
                }}
              >
                ↶ Khôi phục mặc định
              </button>
              <button
                type="button"
                className="bzw-btn bzw-gold"
                onClick={() => {
                  localStorage.setItem(WORK_SETTINGS_KEY, JSON.stringify(settings));
                  setCustomizeModal(false);
                  showToast('Đã lưu tùy chỉnh giao diện.');
                }}
              >
                💾 Lưu giao diện
              </button>
            </div>
          </div>
        </BzwModalOverlay>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMsg && <div className="bzw-toast">{toastMsg}</div>}
    </section>
  );
}

export default BeeZoneWork;
