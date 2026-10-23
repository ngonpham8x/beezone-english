import React, { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../../lib/supabase';
import type { ClassRoom, CourseProgram, Teacher, UserAccount } from '../../types';
import './beezone-work.css';
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
import {
  buildWorkPeople,
  fetchWorkModuleData,
  localISODate,
  mapUserToWorkRole,
  saveLocalWorkData,
  statusName,
  timeVN,
  validEmail,
} from './workStorage';

export interface BeeZoneWorkProps {
  currentUser?: UserAccount | null;
  teachers?: Teacher[];
  classes?: ClassRoom[];
  programs?: CourseProgram[];
  supabaseClient?: SupabaseClient | null;
}

export function BeeZoneWork({
  currentUser,
  teachers = [],
  classes = [],
  programs = [],
  supabaseClient,
}: BeeZoneWorkProps) {
  const supabase = supabaseClient !== undefined ? supabaseClient : defaultSupabase;

  const [uid, setUid] = useState<string>(currentUser?.id || 'guest-user');
  const [role, setRole] = useState<WorkRole>(
    currentUser ? mapUserToWorkRole(currentUser) : 'manager',
  );
  const [people, setPeople] = useState<WorkPerson[]>(() =>
    buildWorkPeople(currentUser, teachers),
  );
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [notes, setNotes] = useState<WorkNote[]>([]);
  const [reasons, setReasons] = useState<WorkReason[]>([]);
  const [handoffs, setHandoffs] = useState<WorkHandoff[]>([]);
  const [dataSource, setDataSource] = useState<'supabase' | 'local'>('local');

  const [day, setDay] = useState(localISODate());
  const [history, setHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<'all' | Branch>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [filter, setFilter] = useState<DetailFilter | null>(null);
  const [selected, setSelected] = useState<WorkTask | null>(null);
  const [editor, setEditor] = useState<WorkTask | null | undefined>(undefined);

  const initialForm: WorkFormState = {
    title: '',
    description: '',
    branch: 'admin',
    assigned_uid: currentUser?.id || '',
    work_date: localISODate(),
    shift_label: 'Ca chiều',
    class_label: '',
    priority: 'normal',
  };
  const [form, setForm] = useState<WorkFormState>(initialForm);

  const [noteDraft, setNoteDraft] = useState('');
  const [reasonDraft, setReasonDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<TaskStatus>('progress');
  const [handoffTo, setHandoffTo] = useState('');
  const [handoffNote, setHandoffNote] = useState('');

  const [sendTask, setSendTask] = useState<WorkTask | null>(null);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const [refreshKey, setRefreshKey] = useState(0);

  // Determine permissions
  const manager = role === 'manager' || role === 'admin';
  const canManage = (t: WorkTask) => manager || (role === 'trainer' && t.branch === 'training');
  const canEditStatus = (t: WorkTask) =>
    canManage(t) || (role === 'teacher' && t.branch === 'training' && t.assigned_uid === uid);

  const eligible = (_branch?: Branch) =>
    people.filter((p) => p.active);

  const name = (id: string) => people.find((p) => p.user_id === id)?.display_name || 'Nhân sự chưa xác định';
  const email = (id: string) => people.find((p) => p.user_id === id)?.email || '';

  // Synchronize people when currentUser or teachers change
  useEffect(() => {
    setPeople((prev) => buildWorkPeople(currentUser, teachers, prev));
    if (currentUser) {
      setUid(currentUser.id);
      setRole((prevRole) => (prevRole === 'manager' && currentUser.role === 'owner' ? 'manager' : mapUserToWorkRole(currentUser)));
    }
  }, [currentUser, teachers]);

  // Load work data
  async function load() {
    setError('');
    const today = localISODate();
    const effectiveUid = currentUser?.id || 'guest-user';
    setUid(effectiveUid);

    const { state, dbPeople, dbRole } = await fetchWorkModuleData(supabase, today, effectiveUid);
    setTasks(state.tasks);
    setNotes(state.notes);
    setReasons(state.reasons);
    setHandoffs(state.handoffs);
    setDataSource(state.source);

    if (dbRole) {
      setRole(dbRole);
    } else if (currentUser) {
      setRole(mapUserToWorkRole(currentUser));
    }

    setPeople(buildWorkPeople(currentUser, teachers, dbPeople));
  }

  useEffect(() => {
    let cancelled = false;
    load().catch((e) => {
      if (!cancelled) setError(e.message || String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, refreshKey]);

  const reload = () => setRefreshKey((n) => n + 1);

  // Helper to persist in local storage and keep state updated
  function syncLocalChanges(
    updater: (prev: {
      tasks: WorkTask[];
      notes: WorkNote[];
      reasons: WorkReason[];
      handoffs: WorkHandoff[];
    }) => {
      tasks: WorkTask[];
      notes: WorkNote[];
      reasons: WorkReason[];
      handoffs: WorkHandoff[];
    },
  ) {
    const updated = updater({ tasks, notes, reasons, handoffs });
    setTasks(updated.tasks);
    setNotes(updated.notes);
    setReasons(updated.reasons);
    setHandoffs(updated.handoffs);
    saveLocalWorkData(updated);
  }

  // RPC or Local Fallback Dispatcher
  async function callAction(
    fn: string,
    args: Record<string, unknown>,
    localAction: () => void,
  ): Promise<boolean> {
    setBusy(true);
    setError('');
    setSuccessMsg('');

    let rpcSucceeded = false;
    if (supabase && dataSource === 'supabase') {
      try {
        const { error: e } = await supabase.rpc(fn, args);
        if (!e) {
          rpcSucceeded = true;
          await load();
        } else {
          // If RPC doesn't exist or permissions issue, fall back to local
          console.warn(`RPC ${fn} failed, applying local fallback:`, e.message);
        }
      } catch (err: any) {
        console.warn(`RPC ${fn} threw, applying local fallback:`, err?.message);
      }
    }

    if (!rpcSucceeded) {
      // Execute local action
      localAction();
    }

    setBusy(false);
    return true;
  }

  // Filter visible tasks
  const visible = useMemo(() => {
    return tasks.filter((t) => {
      // If there is a pending handoff waiting for current user, always show it
      const isPendingForMe = handoffs.some(
        (h) => h.task_id === t.id && !h.acknowledged_at && h.to_uid === uid,
      );
      if (isPendingForMe) return true;

      // Teacher role: see tasks assigned to self
      if (role === 'teacher' && t.assigned_uid !== uid) {
        return false;
      }
      if (role === 'trainer' && t.branch === 'admin') {
        return false;
      }
      if (branchFilter !== 'all' && t.branch !== branchFilter) {
        return false;
      }
      const matchSearch =
        !search ||
        [t.title, t.description, t.class_label, name(t.assigned_uid)]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase());

      if (history) {
        return t.status === 'done' && matchSearch;
      }
      return t.work_date === day && matchSearch;
    });
  }, [tasks, day, history, search, people, branchFilter, role, uid, handoffs]);

  const stats = {
    all: visible.length,
    progress: visible.filter((t) => t.status === 'progress').length,
    done: visible.filter((t) => t.status === 'done').length,
    handover: visible.filter((t) => t.needs_handover && t.status !== 'done').length,
  };

  const statList = (kind: DetailFilter) =>
    visible.filter((t) =>
      kind === 'all'
        ? true
        : kind === 'handover'
        ? t.needs_handover && t.status !== 'done'
        : t.status === kind,
    );

  const column = (branch: Branch) => visible.filter((t) => t.branch === branch);
  const hasPending = (t: WorkTask) => handoffs.some((h) => h.task_id === t.id && !h.acknowledged_at);
  const pendingForMe = (t: WorkTask) =>
    handoffs.find((h) => h.task_id === t.id && !h.acknowledged_at && h.to_uid === uid);

  // Editor Actions
  function openEditor(t?: WorkTask) {
    setEditor(t || null);
    const next: WorkFormState = t
      ? {
          title: t.title,
          description: t.description,
          branch: t.branch,
          assigned_uid: t.assigned_uid,
          work_date: t.work_date,
          shift_label: t.shift_label,
          class_label: t.class_label,
          priority: t.priority,
        }
      : {
          ...initialForm,
          branch: role === 'trainer' ? 'training' : 'admin',
          work_date: day,
          assigned_uid: people.find((p) => (role === 'trainer' ? p.role === 'teacher' : p.user_id === uid))?.user_id || uid,
        };
    setForm(next);
  }

  // Handle class selection helper
  function handleSelectClass(classNameOrCode: string) {
    const selectedClass = classes.find(
      (c) => c.name === classNameOrCode || c.code === classNameOrCode || `${c.code} - ${c.name}` === classNameOrCode,
    );
    if (selectedClass) {
      setForm((prev) => ({
        ...prev,
        class_label: `${selectedClass.code} - ${selectedClass.name}`,
        assigned_uid:
          prev.branch === 'training' && selectedClass.teacherId
            ? selectedClass.teacherId
            : prev.assigned_uid,
      }));
    } else {
      setForm((prev) => ({ ...prev, class_label: classNameOrCode }));
    }
  }

  async function saveEditor() {
    if (!form.title.trim() || !form.assigned_uid) {
      setError('Vui lòng nhập tên công việc và chọn người thực hiện.');
      return;
    }

    const args = {
      p_title: form.title.trim(),
      p_description: form.description.trim(),
      p_assigned_uid: form.assigned_uid,
      p_work_date: form.work_date,
      p_shift_label: form.shift_label,
      p_class_label: form.class_label.trim(),
      p_priority: form.priority,
    };

    if (editor?.id) {
      await callAction(
        'bz_work_edit_task',
        { p_task_id: editor.id, ...args },
        () => {
          syncLocalChanges((prev) => ({
            ...prev,
            tasks: prev.tasks.map((item) =>
              item.id === editor.id
                ? {
                    ...item,
                    title: form.title.trim(),
                    description: form.description.trim(),
                    assigned_uid: form.assigned_uid,
                    work_date: form.work_date,
                    shift_label: form.shift_label,
                    class_label: form.class_label.trim(),
                    priority: form.priority,
                    updated_at: new Date().toISOString(),
                  }
                : item,
            ),
          }));
        },
      );
    } else {
      await callAction(
        'bz_work_create_task',
        { p_branch: form.branch, ...args },
        () => {
          const newTask: WorkTask = {
            id: `task-${crypto.randomUUID()}`,
            branch: form.branch,
            title: form.title.trim(),
            description: form.description.trim(),
            assigned_uid: form.assigned_uid,
            work_date: form.work_date,
            shift_label: form.shift_label,
            class_label: form.class_label.trim(),
            priority: form.priority,
            status: 'todo',
            needs_handover: false,
            completed_at: null,
            email_sent_at: null,
            email_sent_to: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          syncLocalChanges((prev) => ({
            ...prev,
            tasks: [newTask, ...prev.tasks],
          }));
        },
      );
    }
    setEditor(undefined);
  }

  // Email Functions
  function openSend(t: WorkTask) {
    setSendTask(t);
    const targetUid = t.assigned_uid || people[0]?.user_id || uid;
    setRecipient(targetUid);
    fillEmail(t, targetUid);
  }

  function fillEmail(t: WorkTask, pid: string) {
    setSubject(`[BeeZone] Giao việc: ${t.title}`);
    setEmailBody(
      `Xin chào ${name(pid)},\n\nTrung tâm Anh ngữ BeeZone gửi phân công công việc:\n\n` +
        `- Tên công việc: ${t.title}\n` +
        `- Ngày thực hiện: ${t.work_date} (${t.shift_label})\n` +
        `- Lớp / Chương trình: ${t.class_label || 'Toàn trung tâm'}\n` +
        `- Người thực hiện: ${name(pid)} (${email(pid) || 'Chưa cập nhật email'})\n` +
        `- Mức ưu tiên: ${t.priority === 'high' ? 'Ưu tiên cao' : 'Bình thường'}\n` +
        `- Yêu cầu & nội dung: ${t.description || 'Theo hướng dẫn phân công'}\n\n` +
        `Vui lòng truy cập hệ thống để cập nhật tiến độ công việc và bàn giao khi kết thúc ca.\n\n` +
        `Trân trọng,\nTrung tâm Anh ngữ BeeZone`,
    );
  }

  function openGmail() {
    if (!sendTask) return;
    const recipientEmail = email(recipient);
    if (!validEmail(recipientEmail)) {
      setError('Email người nhận chưa đúng định dạng. Vui lòng kiểm tra lại email.');
      return;
    }
    if (!subject.trim() || !emailBody.trim()) {
      setError('Vui lòng điền tiêu đề và nội dung thư.');
      return;
    }
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      recipientEmail,
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // Keyboard shortcut: close modals on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (filter) setFilter(null);
        else if (editor !== undefined) setEditor(undefined);
        else if (selected) setSelected(null);
        else if (sendTask) setSendTask(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filter, editor, selected, sendTask]);

  // Task Card Component
  const taskCard = (t: WorkTask) => (
    <article key={t.id} className={`bzw-task ${t.priority === 'high' ? 'priority-high' : ''}`}>
      <div className="bzw-top">
        <input
          type="checkbox"
          checked={t.status === 'done'}
          disabled={!canEditStatus(t) || busy}
          onChange={() => {
            setSelected(t);
            setStatusDraft(t.status === 'done' ? 'progress' : 'done');
          }}
          aria-label={'Đánh dấu hoàn thành ' + t.title}
        />
        <strong>{t.title}</strong>
      </div>
      <div className="bzw-line">
        <span className={'bzw-chip ' + t.status}>{statusName[t.status]}</span>
        {t.priority === 'high' && <span className="bzw-chip warn font-bold">⚡ Ưu tiên</span>}
        {t.needs_handover && <span className="bzw-chip warn">↪ Cần bàn giao</span>}
        <span className={'bzw-chip ' + (t.email_sent_at ? 'done' : '')}>
          {t.email_sent_at ? '✓ Đã đánh dấu gửi email' : 'Chưa gửi email'}
        </span>
      </div>
      <p>{t.description || 'Chưa có mô tả chi tiết.'}</p>
      <small>
        👤 <strong>{name(t.assigned_uid)}</strong> {email(t.assigned_uid) && `· ${email(t.assigned_uid)}`}
      </small>
      <small>
        📅 {t.work_date} · {t.shift_label} {t.class_label && `· Lớp: ${t.class_label}`}
      </small>
      {t.email_sent_at && <small>📧 Gửi lúc: {timeVN(t.email_sent_at)}</small>}
      <div className="bzw-actions">
        <button type="button" onClick={() => setSelected(t)}>Xem chi tiết</button>
        {canManage(t) && (
          <button type="button" onClick={() => openEditor(t)}>Sửa</button>
        )}
        {canManage(t) && (
          <button type="button" onClick={() => openSend(t)}>📧 Gửi email</button>
        )}
        {pendingForMe(t) && (
          <button
            type="button"
            className="bzw-primary font-bold"
            disabled={busy}
            onClick={async () => {
              const pendingHandoff = pendingForMe(t);
              if (!pendingHandoff) return;
              await callAction(
                'bz_work_ack_handoff',
                { p_handoff_id: pendingHandoff.id },
                () => {
                  syncLocalChanges((prev) => ({
                    ...prev,
                    handoffs: prev.handoffs.map((h) =>
                      h.id === pendingHandoff.id
                        ? { ...h, acknowledged_at: new Date().toISOString(), acknowledged_by: uid }
                        : h,
                    ),
                    tasks: prev.tasks.map((task) =>
                      task.id === t.id
                        ? { ...task, assigned_uid: uid, needs_handover: false, updated_at: new Date().toISOString() }
                        : task,
                    ),
                  }));
                },
              );
            }}
          >
            ✓ Nhận bàn giao
          </button>
        )}
      </div>
    </article>
  );

  const details = selected && tasks.find((t) => t.id === selected.id);

  return (
    <section className="bzw-root">
      <header className="bzw-heading">
        <div>
          <h2>📋 Giao việc & Bàn giao</h2>
          <p>Trung tâm Anh ngữ BeeZone · Quản lý công việc hành chính, giáo viên và bàn giao ca làm việc</p>
          <div className="mt-1 text-xs">
            {dataSource === 'supabase' ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ☁️ Đám mây Supabase
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                💾 Bộ nhớ đồng bộ trung tâm
              </span>
            )}
          </div>
        </div>
        <div className="bzw-actions">
          {(manager || role === 'trainer') && (
            <button type="button" className="bzw-primary" onClick={() => openEditor()}>
              ＋ Tạo công việc
            </button>
          )}
          <button type="button" onClick={reload}>↻ Tải lại</button>
        </div>
      </header>

      {error && (
        <div className="bzw-error" role="alert">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bzw-chip done p-2 mb-3 text-xs font-bold" role="status">
          {successMsg}
        </div>
      )}
      {busy && <p className="bzw-muted">Đang lưu thay đổi…</p>}

      {/* 4 Interactive Statistics Cards */}
      <div className="bzw-stats">
        {(
          [
            ['all', '📋', 'Việc trong danh sách'],
            ['progress', '◷', 'Đang làm'],
            ['done', '✓', 'Hoàn thành'],
            ['handover', '↪', 'Cần bàn giao'],
          ] as const
        ).map(([k, ic, l]) => (
          <button
            type="button"
            key={k}
            className={`bzw-stat ${filter === k ? 'bzw-selected' : ''}`}
            onClick={() => setFilter(k)}
          >
            <div>
              {ic} <span>{l}</span>
            </div>
            <b>{stats[k]}</b>
            <small>Bấm để xem chi tiết</small>
          </button>
        ))}
      </div>

      {/* Filters Toolbar */}
      <div className="bzw-tools">
        <button
          type="button"
          className={!history ? 'bzw-selected' : ''}
          onClick={() => setHistory(false)}
        >
          Việc trong ngày
        </button>
        <button
          type="button"
          className={history ? 'bzw-selected' : ''}
          onClick={() => setHistory(true)}
        >
          Lịch sử hoàn thành
        </button>
        {!history && (
          <input
            aria-label="Ngày làm việc"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        )}
        <select
          aria-label="Lọc theo nhánh"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value as 'all' | Branch)}
          style={{ width: 'auto', minWidth: '150px' }}
        >
          <option value="all">Tất cả các nhánh</option>
          <option value="admin">Hành chính / Lễ tân</option>
          <option value="training">Đào tạo / Giáo viên</option>
        </select>
        <input
          placeholder="Tìm việc, lớp, người thực hiện…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* 3 Main Workflow Columns */}
      <div className="bzw-columns">
        {manager && (
          <div className="bzw-col">
            <h3>Hành chính / Lễ tân ({column('admin').length})</h3>
            {column('admin').length ? (
              column('admin').map(taskCard)
            ) : (
              <p className="bzw-muted text-xs p-3 text-center">Chưa có công việc nào.</p>
            )}
          </div>
        )}

        <div className="bzw-col">
          <h3>Đào tạo / Giáo viên ({column('training').length})</h3>
          {column('training').length ? (
            column('training').map(taskCard)
          ) : (
            <p className="bzw-muted text-xs p-3 text-center">Chưa có công việc nào.</p>
          )}
        </div>

        <div className="bzw-col">
          <h3>Bàn giao cuối ca / cuối buổi ({visible.filter((t) => t.needs_handover && t.status !== 'done').length})</h3>
          {visible.filter((t) => t.needs_handover && t.status !== 'done').length ? (
            visible.filter((t) => t.needs_handover && t.status !== 'done').map(taskCard)
          ) : (
            <p className="bzw-muted text-xs p-3 text-center">Không có việc cần bàn giao.</p>
          )}
        </div>
      </div>

      {/* MODAL 1: Detail Filter Modal */}
      {filter && (
        <div
          className="bzw-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFilter(null);
          }}
        >
          <div className="bzw-modal">
            <div className="bzw-modal-head">
              <h3>
                {(
                  {
                    all: 'Việc trong danh sách',
                    progress: 'Đang làm',
                    done: 'Hoàn thành',
                    handover: 'Cần bàn giao',
                  } as const
                )[filter]}{' '}
                ({statList(filter).length})
              </h3>
              <button type="button" onClick={() => setFilter(null)}>×</button>
            </div>
            {statList(filter).length ? (
              <div className="space-y-3">{statList(filter).map(taskCard)}</div>
            ) : (
              <p className="p-4 text-center text-slate-500">Không có công việc nào phù hợp.</p>
            )}
            <footer>
              <button type="button" onClick={() => setFilter(null)}>Đóng</button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL 2: Create / Edit Task Modal */}
      {editor !== undefined && (
        <div
          className="bzw-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditor(undefined);
          }}
        >
          <div className="bzw-modal">
            <div className="bzw-modal-head">
              <h3>{editor ? 'Sửa công việc' : 'Tạo công việc mới'}</h3>
              <button type="button" onClick={() => setEditor(undefined)}>×</button>
            </div>
            <div className="bzw-grid">
              <label className="full">
                Tên công việc *
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Nhập tên nhiệm vụ hoặc công việc..."
                  required
                />
              </label>

              <label>
                Nhánh công việc *
                <select
                  disabled={Boolean(editor) || role === 'trainer'}
                  value={form.branch}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      branch: e.target.value as Branch,
                      assigned_uid: '',
                    })
                  }
                >
                  <option value="admin">Hành chính / Lễ tân</option>
                  <option value="training">Đào tạo / Giáo viên</option>
                </select>
              </label>

              <label>
                Người thực hiện *
                <select
                  value={form.assigned_uid}
                  onChange={(e) => setForm({ ...form, assigned_uid: e.target.value })}
                  required
                >
                  <option value="">— Chọn nhân sự / giáo viên —</option>
                  {eligible(form.branch).map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.display_name} {p.role === 'teacher' ? '(Giáo viên)' : '(Nhân viên)'} {p.email ? `– ${p.email}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="full">
                Lớp học / Chương trình (tùy chọn)
                <input
                  list="beezone-class-options"
                  value={form.class_label}
                  onChange={(e) => handleSelectClass(e.target.value)}
                  placeholder="Chọn lớp có sẵn hoặc gõ tên chương trình..."
                />
                <datalist id="beezone-class-options">
                  {classes.map((c) => (
                    <option key={c.id} value={`${c.code} - ${c.name}`}>
                      {c.name}
                    </option>
                  ))}
                  {programs.map((prog) => (
                    <option key={prog.id} value={prog.name}>
                      Chương trình: {prog.name}
                    </option>
                  ))}
                </datalist>
              </label>

              <label className="full">
                Nội dung / Yêu cầu chi tiết
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Mô tả các bước cần thực hiện, tiêu chí hoàn thành hoặc lưu ý..."
                />
              </label>

              <label>
                Ngày thực hiện
                <input
                  type="date"
                  value={form.work_date}
                  onChange={(e) => setForm({ ...form, work_date: e.target.value })}
                />
              </label>

              <label>
                Ca / Buổi
                <select
                  value={form.shift_label}
                  onChange={(e) => setForm({ ...form, shift_label: e.target.value })}
                >
                  <option>Ca sáng</option>
                  <option>Ca chiều</option>
                  <option>Ca tối</option>
                  <option>Cuối buổi</option>
                </select>
              </label>

              <label>
                Mức ưu tiên
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                >
                  <option value="normal">Bình thường</option>
                  <option value="high">Ưu tiên cao</option>
                </select>
              </label>
            </div>
            <footer>
              <button type="button" onClick={() => setEditor(undefined)}>Hủy</button>
              <button
                type="button"
                className="bzw-primary font-bold"
                disabled={busy}
                onClick={saveEditor}
              >
                Lưu công việc
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL 3: View Details & Status/Notes/Handoff Modal */}
      {details && (
        <div
          className="bzw-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="bzw-modal">
            <div className="bzw-modal-head">
              <h3>{details.title}</h3>
              <button type="button" onClick={() => setSelected(null)}>×</button>
            </div>
            <p className="text-slate-700">{details.description || 'Chưa có mô tả chi tiết.'}</p>
            <p>
              <b>Người thực hiện:</b> {name(details.assigned_uid)} ({email(details.assigned_uid) || 'Chưa cập nhật email'})
            </p>
            <p>
              <b>Trạng thái:</b>{' '}
              <span className={'bzw-chip ' + details.status}>{statusName[details.status]}</span>{' '}
              · <b>Ngày thực hiện:</b> {details.work_date} ({details.shift_label})
              {details.class_label && ` · Lớp: ${details.class_label}`}
            </p>

            {/* Panel: Update status & reason */}
            {canEditStatus(details) && (
              <div className="bzw-panel">
                <h4>Cập nhật trạng thái & Lý do</h4>
                <div className="space-y-2">
                  <select
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value as TaskStatus)}
                  >
                    {Object.entries(statusName).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <textarea
                    placeholder="Nhập lý do / kết quả thực hiện (bắt buộc khi cập nhật tiến độ)..."
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="bzw-primary font-bold"
                    disabled={busy}
                    onClick={async () => {
                      if (statusDraft !== 'todo' && !reasonDraft.trim()) {
                        setError('Vui lòng nhập lý do hoặc kết quả thực hiện.');
                        return;
                      }
                      await callAction(
                        'bz_work_update_status',
                        {
                          p_task_id: details.id,
                          p_status: statusDraft,
                          p_reason: reasonDraft.trim(),
                        },
                        () => {
                          const newReason: WorkReason = {
                            id: `reason-${crypto.randomUUID()}`,
                            task_id: details.id,
                            author_uid: uid,
                            kind: statusDraft === 'todo' ? 'progress' : (statusDraft as WorkReason['kind']),
                            body: reasonDraft.trim() || `Chuyển trạng thái sang ${statusName[statusDraft]}`,
                            created_at: new Date().toISOString(),
                          };
                          syncLocalChanges((prev) => ({
                            ...prev,
                            reasons: [newReason, ...prev.reasons],
                            tasks: prev.tasks.map((task) =>
                              task.id === details.id
                                ? {
                                    ...task,
                                    status: statusDraft,
                                    completed_at: statusDraft === 'done' ? new Date().toISOString() : null,
                                    needs_handover: statusDraft === 'done' ? false : task.needs_handover,
                                    updated_at: new Date().toISOString(),
                                  }
                                : task,
                            ),
                          }));
                        },
                      );
                      setReasonDraft('');
                      setSelected(null);
                    }}
                  >
                    Lưu trạng thái
                  </button>
                </div>
              </div>
            )}

            {/* Panel: Notes */}
            <div className="bzw-panel">
              <h4>Ghi chú ({notes.filter((n) => n.task_id === details.id).length})</h4>
              <div className="space-y-1.5 mb-2 max-h-48 overflow-y-auto">
                {notes.filter((n) => n.task_id === details.id).length === 0 ? (
                  <p className="text-slate-400 text-xs italic">Chưa có ghi chú nào.</p>
                ) : (
                  notes
                    .filter((n) => n.task_id === details.id)
                    .map((n) => (
                      <p key={n.id} className="text-xs bg-slate-50 p-2 rounded border border-slate-100">
                        <b>{name(n.author_uid)}</b> · <small>{timeVN(n.created_at)}</small>: {n.body}
                      </p>
                    ))
                )}
              </div>
              {canEditStatus(details) && (
                <div className="space-y-2">
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Thêm ghi chú bổ sung..."
                  />
                  <button
                    type="button"
                    disabled={busy || !noteDraft.trim()}
                    onClick={async () => {
                      if (!noteDraft.trim()) return;
                      await callAction(
                        'bz_work_add_note',
                        {
                          p_task_id: details.id,
                          p_body: noteDraft.trim(),
                        },
                        () => {
                          const newNote: WorkNote = {
                            id: `note-${crypto.randomUUID()}`,
                            task_id: details.id,
                            author_uid: uid,
                            body: noteDraft.trim(),
                            created_at: new Date().toISOString(),
                          };
                          syncLocalChanges((prev) => ({
                            ...prev,
                            notes: [...prev.notes, newNote],
                          }));
                        },
                      );
                      setNoteDraft('');
                    }}
                  >
                    ＋ Thêm ghi chú
                  </button>
                </div>
              )}
            </div>

            {/* Panel: Reasons */}
            <div className="bzw-panel">
              <h4>Lý do & Nhật ký kết quả ({reasons.filter((r) => r.task_id === details.id).length})</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {reasons.filter((r) => r.task_id === details.id).length === 0 ? (
                  <p className="text-slate-400 text-xs italic">Chưa có ghi nhận lý do.</p>
                ) : (
                  reasons
                    .filter((r) => r.task_id === details.id)
                    .map((r) => (
                      <p key={r.id} className="text-xs">
                        <span className="bzw-chip">{r.kind}</span> <b>{name(r.author_uid)}</b> ({timeVN(r.created_at)}): {r.body}
                      </p>
                    ))
                )}
              </div>
            </div>

            {/* Panel: Handoff */}
            {canManage(details) && details.status !== 'done' && !hasPending(details) && (
              <div className="bzw-panel">
                <h4>↪ Bàn giao ca</h4>
                <div className="space-y-2">
                  <select
                    value={handoffTo}
                    onChange={(e) => setHandoffTo(e.target.value)}
                  >
                    <option value="">Chọn người nhận ca</option>
                    {eligible(details.branch)
                      .filter((p) => p.user_id !== uid)
                      .map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {p.display_name} {p.role === 'teacher' ? '(Giáo viên)' : '(Nhân viên)'}
                        </option>
                      ))}
                  </select>
                  <textarea
                    placeholder="Việc còn lại và nội dung ca sau cần thực hiện tiếp..."
                    value={handoffNote}
                    onChange={(e) => setHandoffNote(e.target.value)}
                  />
                  <button
                    type="button"
                    className="bzw-primary font-bold"
                    disabled={busy || !handoffTo || !handoffNote.trim()}
                    onClick={async () => {
                      if (!handoffTo || !handoffNote.trim()) {
                        setError('Vui lòng chọn người nhận ca và nhập nội dung bàn giao.');
                        return;
                      }
                      await callAction(
                        'bz_work_handoff',
                        {
                          p_task_id: details.id,
                          p_to_uid: handoffTo,
                          p_note: handoffNote.trim(),
                        },
                        () => {
                          const newHandoff: WorkHandoff = {
                            id: `handoff-${crypto.randomUUID()}`,
                            task_id: details.id,
                            from_uid: uid,
                            to_uid: handoffTo,
                            note: handoffNote.trim(),
                            handed_at: new Date().toISOString(),
                            acknowledged_at: null,
                          };
                          const newReason: WorkReason = {
                            id: `reason-${crypto.randomUUID()}`,
                            task_id: details.id,
                            author_uid: uid,
                            kind: 'handover',
                            body: handoffNote.trim(),
                            created_at: new Date().toISOString(),
                          };
                          syncLocalChanges((prev) => ({
                            ...prev,
                            handoffs: [newHandoff, ...prev.handoffs],
                            reasons: [newReason, ...prev.reasons],
                            tasks: prev.tasks.map((task) =>
                              task.id === details.id
                                ? { ...task, needs_handover: true, updated_at: new Date().toISOString() }
                                : task,
                            ),
                          }));
                        },
                      );
                      setHandoffNote('');
                      setSelected(null);
                    }}
                  >
                    Bàn giao công việc
                  </button>
                </div>
              </div>
            )}

            {pendingForMe(details) && (
              <button
                type="button"
                className="bzw-primary font-bold w-full my-2"
                disabled={busy}
                onClick={async () => {
                  const pending = pendingForMe(details);
                  if (!pending) return;
                  await callAction(
                    'bz_work_ack_handoff',
                    { p_handoff_id: pending.id },
                    () => {
                      syncLocalChanges((prev) => ({
                        ...prev,
                        handoffs: prev.handoffs.map((h) =>
                          h.id === pending.id
                            ? { ...h, acknowledged_at: new Date().toISOString(), acknowledged_by: uid }
                            : h,
                        ),
                        tasks: prev.tasks.map((task) =>
                          task.id === details.id
                            ? { ...task, assigned_uid: uid, needs_handover: false, updated_at: new Date().toISOString() }
                            : task,
                        ),
                      }));
                    },
                  );
                  setSelected(null);
                }}
              >
                ✓ Xác nhận nhận bàn giao
              </button>
            )}

            <footer>
              <button type="button" onClick={() => setSelected(null)}>Đóng</button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL 4: Send Email Modal */}
      {sendTask && (
        <div
          className="bzw-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSendTask(null);
          }}
        >
          <div className="bzw-modal">
            <div className="bzw-modal-head">
              <h3>📧 Gửi email công việc</h3>
              <button type="button" onClick={() => setSendTask(null)}>×</button>
            </div>

            <label>
              Người nhận
              <select
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  fillEmail(sendTask, e.target.value);
                }}
              >
                {people.filter((p) => p.active).map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name} {p.email ? `– ${p.email}` : '(chưa có email)'}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tiêu đề email
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>

            <label>
              Nội dung thư
              <textarea
                rows={9}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
              />
            </label>

            <div className="bzw-panel">
              <b>
                {sendTask.email_sent_at
                  ? '☑ Đã đánh dấu gửi email'
                  : '☐ Chưa đánh dấu gửi email'}
              </b>
              {sendTask.email_sent_at && (
                <p>
                  Thời điểm: {timeVN(sendTask.email_sent_at)} · Người nhận:{' '}
                  {name(sendTask.email_sent_to || '')}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Lưu ý: Mở Gmail chỉ hỗ trợ điền sẵn thông tin. Hãy nhấn "Mở Gmail để gửi" để gửi thư thực tế trên trình duyệt, sau đó nhấn "Xác nhận đã gửi email" để lưu dấu mốc vào hệ thống.
              </p>
            </div>

            <footer>
              <button type="button" onClick={() => setSendTask(null)}>Đóng</button>
              <button type="button" onClick={openGmail}>📧 Mở Gmail để gửi</button>
              <button
                type="button"
                className="bzw-primary font-bold"
                disabled={busy}
                onClick={async () => {
                  const newSent = !sendTask.email_sent_at;
                  await callAction(
                    'bz_work_mark_email',
                    {
                      p_task_id: sendTask.id,
                      p_sent: newSent,
                      p_to_uid: recipient,
                    },
                    () => {
                      syncLocalChanges((prev) => ({
                        ...prev,
                        tasks: prev.tasks.map((task) =>
                          task.id === sendTask.id
                            ? {
                                ...task,
                                email_sent_at: newSent ? new Date().toISOString() : null,
                                email_sent_to: newSent ? recipient : null,
                                updated_at: new Date().toISOString(),
                              }
                            : task,
                        ),
                      }));
                    },
                  );
                  setSendTask(null);
                }}
              >
                {sendTask.email_sent_at ? 'Bỏ đánh dấu đã gửi' : '✓ Xác nhận đã gửi email'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

export default BeeZoneWork;

