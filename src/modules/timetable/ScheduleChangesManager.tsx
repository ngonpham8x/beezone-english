import React, { useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { centerDate } from '../../lib/dates';
import { lessonsOn, validateScheduleChange } from '../../lib/operations';
import type {
  AttendanceSession,
  ClassRoom,
  Room,
  ScheduleChange,
  Teacher,
  TimetableSlot,
} from '../../types';

interface Props {
  classes: ClassRoom[];
  slots: TimetableSlot[];
  changes: ScheduleChange[];
  teachers: Teacher[];
  rooms: Room[];
  attendance: AttendanceSession[];
  isOwner: boolean;
  canManage?: boolean;
  onSave: (change: ScheduleChange) => string | null;
  onDelete: (id: string) => string | null;
}
const labels = { cancel: 'Nghỉ buổi học', move: 'Đổi lịch / học bù', extra: 'Thêm buổi học' };
const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2';
export function ScheduleChangesManager({
  classes,
  slots,
  changes,
  teachers,
  rooms,
  attendance,
  isOwner,
  canManage = false,
  onSave,
  onDelete,
}: Props) {
  const canEdit = isOwner || canManage;
  const [date, setDate] = useState(centerDate);
  const [draft, setDraft] = useState<ScheduleChange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lessons = lessonsOn(date, classes, slots, changes);
  const sourceDate = draft?.kind === 'move' ? draft.sourceDate || date : draft?.date || date;
  const originalLessons = draft
    ? lessonsOn(
        sourceDate,
        classes,
        slots,
        changes.filter((c) => c.id !== draft.id),
      ).filter((slot) => slot.classId === draft.classId && !slot.changeId)
    : [];
  const open = () => {
    setDraft({
      id: `SC_${crypto.randomUUID()}`,
      kind: 'cancel',
      classId: classes[0]?.id || '',
      date,
      sourceDate: date,
      startTime: '18:00',
      endTime: '19:30',
      teacherId: '',
      roomId: '',
      reason: '',
    });
    setError(null);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !canEdit) return;
    const source = originalLessons.find((slot) => slot.id === draft.sourceSlotId);
    const next =
      draft.kind === 'cancel' && source
        ? {
            ...draft,
            startTime: source.startTime,
            endTime: source.endTime,
            teacherId: source.teacherId,
            roomId: source.roomId,
            sourceDate: undefined,
          }
        : draft;
    const message =
      validateScheduleChange(next, classes, slots, changes, attendance) || onSave(next);
    if (message) {
      setError(message);
      return;
    }
    setDraft(null);
  };
  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">Lịch thực tế · nghỉ và học bù</h3>
          <p className="mt-1 text-xs text-slate-500">
            Lịch theo ngày đã tính các thay đổi của từng buổi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Ngày xem lịch thực tế"
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
            className="rounded-lg border border-slate-300 p-2 text-sm"
          />
          {canEdit && (
            <button
              onClick={open}
              disabled={!classes.length}
              className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Nghỉ / đổi / học bù
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lessons.map((lesson) => (
          <article key={lesson.id} className="rounded-xl border border-slate-200 p-3 text-sm">
            <strong>{classes.find((c) => c.id === lesson.classId)?.name}</strong>
            <div>
              {lesson.startTime}–{lesson.endTime} ·{' '}
              {teachers.find((t) => t.id === lesson.teacherId)?.name || 'Chưa có giáo viên'}
            </div>
            <div className="text-xs text-slate-600">
              {rooms.find((r) => r.id === lesson.roomId)?.name || 'Chưa có phòng'}
              {lesson.changeId ? ' · Lịch đã điều chỉnh' : ''}
            </div>
            {lesson.reason && <p className="mt-1 text-xs text-sky-800">{lesson.reason}</p>}
          </article>
        ))}
        {!lessons.length && (
          <p className="text-sm text-slate-500">Không có buổi học trong ngày đã chọn.</p>
        )}
      </div>
      {changes.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            Các lịch đã điều chỉnh ({changes.length})
          </summary>
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {[...changes]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"
                >
                  <div>
                    <strong>
                      {classes.find((item) => item.id === c.classId)?.name} · {labels[c.kind]}
                    </strong>
                    <p className="text-xs">
                      {c.sourceDate && c.kind === 'move' ? `${c.sourceDate} → ` : ''}
                      {c.date} · {c.reason}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <button
                        className="rounded border border-slate-300 px-3 py-2"
                        onClick={() => {
                          setDraft(c);
                          setError(null);
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        className="rounded border border-red-200 px-3 py-2 text-red-700"
                        onClick={() => {
                          if (window.confirm('Hủy điều chỉnh này và khôi phục lịch gốc?'))
                            setError(onDelete(c.id));
                        }}
                      >
                        Hủy điều chỉnh
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </details>
      )}
      {error && !draft && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {draft && (
        <DialogFrame
          label="Nghỉ, đổi lịch và học bù"
          onClose={() => setDraft(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <form
            onSubmit={save}
            className="dialog-panel w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 text-sm"
          >
            <h3 className="text-lg font-bold">Điều chỉnh một buổi học</h3>
            <label className="block">
              Loại điều chỉnh
              <select
                aria-label="Loại điều chỉnh"
                value={draft.kind}
                className={field}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value as ScheduleChange['kind'],
                    sourceSlotId: undefined,
                    sourceDate: draft.sourceDate || draft.date,
                  })
                }
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Lớp học
              <select
                aria-label="Lớp điều chỉnh"
                value={draft.classId}
                className={field}
                onChange={(e) =>
                  setDraft({ ...draft, classId: e.target.value, sourceSlotId: undefined })
                }
              >
                {classes.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {draft.kind === 'move' && (
              <label className="block">
                Ngày buổi gốc
                <input
                  aria-label="Ngày buổi gốc"
                  required
                  type="date"
                  value={draft.sourceDate || ''}
                  className={field}
                  onChange={(e) =>
                    setDraft({ ...draft, sourceDate: e.target.value, sourceSlotId: undefined })
                  }
                />
              </label>
            )}
            <label className="block">
              {draft.kind === 'cancel' ? 'Ngày nghỉ' : 'Ngày học mới'}
              <input
                aria-label="Ngày điều chỉnh"
                required
                type="date"
                value={draft.date}
                className={field}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    date: e.target.value,
                    sourceSlotId: draft.kind === 'cancel' ? undefined : draft.sourceSlotId,
                  })
                }
              />
            </label>
            {draft.kind !== 'extra' && (
              <label className="block">
                Buổi gốc
                <select
                  aria-label="Buổi gốc"
                  required
                  className={field}
                  value={draft.sourceSlotId || ''}
                  onChange={(e) => {
                    const slot = originalLessons.find((item) => item.id === e.target.value);
                    setDraft({
                      ...draft,
                      sourceSlotId: e.target.value,
                      ...(slot
                        ? {
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            teacherId: slot.teacherId,
                            roomId: slot.roomId,
                          }
                        : {}),
                    });
                  }}
                >
                  <option value="">Chọn buổi gốc</option>
                  {originalLessons.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.startTime}–{slot.endTime}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.kind !== 'cancel' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    Bắt đầu
                    <input
                      aria-label="Giờ bắt đầu buổi mới"
                      type="time"
                      required
                      value={draft.startTime}
                      className={field}
                      onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                    />
                  </label>
                  <label>
                    Kết thúc
                    <input
                      aria-label="Giờ kết thúc buổi mới"
                      type="time"
                      required
                      value={draft.endTime}
                      className={field}
                      onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                    />
                  </label>
                </div>
                <label className="block">
                  Giáo viên
                  <select
                    aria-label="Giáo viên buổi mới"
                    required
                    value={draft.teacherId}
                    className={field}
                    onChange={(e) => setDraft({ ...draft, teacherId: e.target.value })}
                  >
                    <option value="">Chọn giáo viên</option>
                    {teachers.map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Phòng học
                  <select
                    aria-label="Phòng buổi mới"
                    required
                    value={draft.roomId}
                    className={field}
                    onChange={(e) => setDraft({ ...draft, roomId: e.target.value })}
                  >
                    <option value="">Chọn phòng</option>
                    {rooms
                      .filter((r) => r.status === 'available')
                      .map((r) => (
                        <option value={r.id} key={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            <label className="block">
              Lý do
              <textarea
                aria-label="Lý do điều chỉnh"
                required
                maxLength={1000}
                value={draft.reason}
                className={field}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </label>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg border px-4 py-2"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="rounded-lg bg-sky-700 px-4 py-2 font-bold text-white"
              >
                Lưu điều chỉnh
              </button>
            </div>
          </form>
        </DialogFrame>
      )}
    </section>
  );
}
