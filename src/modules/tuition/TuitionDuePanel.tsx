import { useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { tuitionDueStatus, tuitionReminder } from '../../lib/operations';
import type { CenterSettings, Student, TuitionReceipt } from '../../types';

export function TuitionDuePanel({
  receipts,
  students,
  settings,
  onOpen,
}: {
  receipts: TuitionReceipt[];
  students: Student[];
  settings: CenterSettings;
  onOpen: (r: TuitionReceipt) => void;
}) {
  const [filter, setFilter] = useState<'overdue' | 'soon' | 'unknown'>('overdue');
  const [reminder, setReminder] = useState('');
  const [message, setMessage] = useState('');
  const debt = receipts.filter((r) => r.debtAmount > 0);
  const selected = debt
    .filter((r) => tuitionDueStatus(r) === filter)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  return (
    <section className="rounded-2xl border border-rose-200 bg-white p-4 sm:p-5">
      <h3 className="font-bold text-slate-900">Theo dõi hạn học phí</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {(['overdue', 'soon', 'unknown'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${filter === value ? 'border-rose-300 bg-rose-100 text-rose-950' : 'border-slate-200 text-slate-600'}`}
          >
            {{ overdue: 'Quá hạn', soon: 'Đến hạn trong 7 ngày', unknown: 'Chưa đặt hạn' }[value]} (
            {debt.filter((r) => tuitionDueStatus(r) === value).length})
          </button>
        ))}
      </div>
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {selected.map((r) => {
          const student = students.find((s) => s.id === r.studentId);
          return (
            <article
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"
            >
              <div>
                <strong>{student?.name || r.studentId}</strong>
                <div className="text-xs text-slate-600">
                  {r.code} · {r.debtAmount.toLocaleString('vi-VN')} đ ·{' '}
                  {r.dueDate ? `Hạn ${r.dueDate}` : 'Chưa đặt hạn'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onOpen(r)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  Mở phiếu
                </button>
                {student && (
                  <button
                    onClick={() => {
                      setReminder(tuitionReminder(r, student, settings.name));
                      setMessage('');
                    }}
                    className="rounded-lg bg-amber-100 px-3 py-2 font-semibold text-amber-950"
                  >
                    Soạn lời nhắc
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!selected.length && (
          <p className="py-3 text-sm text-slate-500">Không có khoản học phí trong nhóm này.</p>
        )}
      </div>
      {reminder && (
        <DialogFrame
          label="Soạn lời nhắc học phí"
          onClose={() => setReminder('')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="dialog-panel w-full max-w-lg rounded-2xl bg-white p-5">
            <h3 className="font-bold">Lời nhắc học phí</h3>
            <p className="mt-1 text-xs text-slate-500">
              Kiểm tra nội dung rồi sao chép để gửi cho phụ huynh.
            </p>
            <textarea
              aria-label="Nội dung nhắc học phí"
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              rows={7}
              className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
            />
            {message && (
              <p role="status" className="mt-2 text-sm">
                {message}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setReminder('')} className="rounded-lg border px-3 py-2">
                Đóng
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(reminder);
                    setMessage('Đã sao chép nội dung.');
                  } catch {
                    setMessage('Hãy chọn nội dung trong ô và sao chép thủ công.');
                  }
                }}
                className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950"
              >
                Sao chép
              </button>
            </div>
          </div>
        </DialogFrame>
      )}
    </section>
  );
}
