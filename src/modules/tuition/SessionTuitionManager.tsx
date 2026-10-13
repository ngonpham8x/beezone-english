import React, { useEffect, useMemo, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { centerDate, isCalendarDate } from '../../lib/dates';
import { nextReceiptCode } from '../../lib/identifiers';
import { matchesSearch } from '../../lib/search';
import { validateSessionReceipt, withUnbilledSessionReceipts } from '../../lib/sessionBilling';
import type { AttendanceSession, ClassRoom, Student, TuitionReceipt } from '../../types';

interface Props {
  sessions: AttendanceSession[];
  receipts: TuitionReceipt[];
  students: Student[];
  classes: ClassRoom[];
  canCollect: boolean;
  showDebt: boolean;
  requestId?: string;
  onRequestHandled?: () => void;
  onCreate: (receipt: TuitionReceipt) => boolean | void;
}
export function SessionTuitionManager({
  sessions,
  receipts,
  students,
  classes,
  canCollect,
  showDebt,
  requestId,
  onRequestHandled,
  onCreate,
}: Props) {
  const [classFilter, setClassFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<TuitionReceipt | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [paid, setPaid] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [date, setDate] = useState(centerDate);
  const [dueDate, setDueDate] = useState('');
  const [method, setMethod] = useState<TuitionReceipt['paymentMethod']>('Tiền mặt');
  const [collector, setCollector] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = useMemo(
    () =>
      withUnbilledSessionReceipts(receipts, sessions).filter((r) =>
        r.id.startsWith('pending-session:'),
      ),
    [sessions, receipts],
  );
  const open = (group: TuitionReceipt) => {
    setDraft(group);
    setSelected(group.sessionLines!.map((l) => l.attendanceSessionId));
    setPaid(group.sessionFee || 0);
    setDiscount(0);
    setDate(centerDate());
    setDueDate('');
    setMethod('Tiền mặt');
    setCollector('');
    setError(null);
  };
  useEffect(() => {
    if (!requestId?.startsWith('pending-session:')) return;
    const group = pending.find((r) => r.id === requestId);
    if (group) open(group);
    onRequestHandled?.();
  }, [requestId]);
  // Match names/codes independently of the selected class filter.
  const groups = pending.filter((group) => {
    const student = students.find((s) => s.id === group.studentId);
    return (
      (classFilter === 'all' || group.classId === classFilter) &&
      matchesSearch(query, student?.name, student?.code, student?.parentPhone)
    );
  });
  const selectedLines =
    draft?.sessionLines?.filter((line) => selected.includes(line.attendanceSessionId)) || [];
  const amount = selectedLines.reduce((sum, line) => sum + line.unitPrice, 0);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !canCollect) return;
    if (!isCalendarDate(date) || (dueDate && !isCalendarDate(dueDate))) {
      setError('Ngày thu hoặc hạn thanh toán không hợp lệ.');
      return;
    }
    const receipt: TuitionReceipt = {
      ...draft,
      id: `REC_${crypto.randomUUID()}`,
      code: nextReceiptCode(receipts),
      sessionLines: selectedLines,
      sessionFee: amount,
      billingPeriod: `${selectedLines.length} buổi · ${selectedLines[0]?.date || ''} – ${selectedLines.at(-1)?.date || ''}`,
      paidAmount: paid,
      discount,
      debtAmount: amount - discount - paid,
      status: paid >= amount - discount ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      paymentDate: date,
      dueDate: dueDate || date,
      collectorName: collector.trim(),
      paymentMethod: method,
      installments:
        paid > 0
          ? [
              {
                id: `INST_${crypto.randomUUID()}`,
                date,
                amount: paid,
                paymentMethod: method,
                collectorName: collector.trim(),
              },
            ]
          : [],
      notes: 'Học phí theo các buổi điểm danh đã chọn',
    };
    const issue = validateSessionReceipt(receipt, sessions, receipts);
    if (issue) {
      setError(issue);
      return;
    }
    if (onCreate(receipt) === false) {
      setError('Không lưu được phiếu. Kiểm tra thông báo và thử lại.');
      return;
    }
    setDraft(null);
  };
  return (
    <section
      className="rounded-2xl border border-violet-200 bg-white p-4 sm:p-5"
      aria-label="Học phí theo buổi"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">Học phí theo buổi</h3>
          <p className="mt-1 text-xs text-slate-500">
            Buổi đã điểm danh, đơn giá đã ghi nhận. Thu một buổi hoặc gộp nhiều buổi vào một phiếu.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Tìm học viên thu phí theo buổi"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên, mã học viên, SĐT phụ huynh"
            className="min-w-0 max-w-full rounded-lg border border-slate-300 p-2 text-sm"
          />
          <select
            aria-label="Lọc lớp học theo buổi"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-lg border border-slate-300 p-2 text-sm"
          >
            <option value="all">Tất cả lớp</option>
            {classes
              .filter(
                (c) =>
                  c.billingMode === 'session' ||
                  sessions.some((s) => s.classId === c.id && s.billing),
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      {showDebt && (
        <p className="mt-3 text-sm font-semibold text-violet-900">
          {pending.reduce((sum, r) => sum + (r.sessionLines?.length || 0), 0)} buổi chưa lập phiếu ·{' '}
          {pending.reduce((sum, r) => sum + r.debtAmount, 0).toLocaleString('vi-VN')} đ phải thu
        </p>
      )}
      <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
        {groups.map((group) => (
          <article
            key={group.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-violet-50 p-3 text-sm"
          >
            <div className="min-w-0 break-words">
              <strong>
                {students.find((s) => s.id === group.studentId)?.name || group.studentId}
              </strong>
              <p className="text-xs text-slate-600">
                {classes.find((c) => c.id === group.classId)?.name} · {group.sessionLines!.length}{' '}
                buổi{showDebt ? ` · ${group.sessionFee!.toLocaleString('vi-VN')} đ` : ''}
              </p>
            </div>
            <button
              onClick={() => open(group)}
              className="rounded-lg bg-violet-700 px-3 py-2 font-semibold text-white"
            >
              {canCollect ? 'Chọn buổi và thu tiền' : 'Xem các buổi'}
            </button>
          </article>
        ))}
        {!groups.length && (
          <p className="py-3 text-sm text-slate-500">
            Chưa có buổi phải thu mới. Cấu hình lớp học theo buổi và lưu điểm danh để ghi nhận học
            phí.
          </p>
        )}
      </div>
      {draft && (
        <DialogFrame
          label="Thu học phí theo buổi"
          onClose={() => setDraft(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <form
            className="dialog-panel w-full max-w-xl space-y-4 rounded-2xl bg-white p-5 text-sm"
            onSubmit={save}
          >
            <h3 className="text-lg font-bold">
              Thu học phí theo buổi · {students.find((s) => s.id === draft.studentId)?.name}
            </h3>
            <p className="text-xs text-slate-500">
              Chọn các buổi phải thu. Số tiền đã thu được ghi nhận vào ngày thu tiền.
            </p>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border p-3">
              {draft.sessionLines!.map((line) => (
                <label
                  key={line.attendanceSessionId}
                  className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <input
                      aria-label={`Chọn buổi ${line.date}`}
                      type="checkbox"
                      disabled={!canCollect}
                      checked={selected.includes(line.attendanceSessionId)}
                      onChange={(e) => {
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, line.attendanceSessionId]
                            : current.filter((id) => id !== line.attendanceSessionId),
                        );
                        setPaid(0);
                        setDiscount(0);
                      }}
                    />
                    {line.date.split('-').reverse().join('/')}
                  </span>
                  {(canCollect || showDebt) && (
                    <strong>{line.unitPrice.toLocaleString('vi-VN')} đ</strong>
                  )}
                </label>
              ))}
            </div>
            {(canCollect || showDebt) && (
              <p className="font-bold">
                {selectedLines.length} buổi · Tổng học phí {amount.toLocaleString('vi-VN')} đ
              </p>
            )}
            {canCollect && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>
                    Giảm giá (VNĐ)
                    <input
                      aria-label="Giảm giá học phí buổi"
                      type="number"
                      min="0"
                      max={amount}
                      step="1"
                      value={discount}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setDiscount(next);
                        setPaid((current) =>
                          current === amount - discount
                            ? Math.max(0, amount - next)
                            : Math.min(current, Math.max(0, amount - next)),
                        );
                      }}
                      className="mt-1 w-full rounded-lg border p-2"
                    />
                  </label>
                  <label>
                    Đã thu (VNĐ)
                    <input
                      aria-label="Số tiền đã thu theo buổi"
                      type="number"
                      min="0"
                      max={Math.max(0, amount - discount)}
                      step="1"
                      value={paid}
                      onChange={(e) => setPaid(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border p-2"
                    />
                  </label>
                  <label>
                    Ngày thu tiền
                    <input
                      aria-label="Ngày thu tiền theo buổi"
                      required
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border p-2"
                    />
                  </label>
                  <label>
                    Hạn thanh toán
                    <input
                      aria-label="Hạn thanh toán phí buổi"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border p-2"
                    />
                  </label>
                  <label>
                    Hình thức
                    <select
                      aria-label="Hình thức thanh toán phí buổi"
                      value={method}
                      onChange={(e) => setMethod(e.target.value as TuitionReceipt['paymentMethod'])}
                      className="mt-1 w-full rounded-lg border p-2"
                    >
                      <option>Tiền mặt</option>
                      <option>Chuyển khoản</option>
                      <option>Thẻ</option>
                    </select>
                  </label>
                  <label>
                    Người thu
                    <input
                      aria-label="Người thu phí buổi"
                      value={collector}
                      onChange={(e) => setCollector(e.target.value)}
                      className="mt-1 w-full rounded-lg border p-2"
                    />
                  </label>
                </div>
                <p className="rounded-lg bg-amber-50 p-3 font-semibold">
                  Còn phải thu: {Math.max(0, amount - discount - paid).toLocaleString('vi-VN')} đ
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg border px-3 py-2"
              >
                Đóng
              </button>
              {canCollect && (
                <button
                  disabled={!selectedLines.length}
                  type="submit"
                  className="rounded-lg bg-violet-700 px-3 py-2 font-bold text-white disabled:opacity-50"
                >
                  Lưu phiếu theo buổi
                </button>
              )}
            </div>
          </form>
        </DialogFrame>
      )}
    </section>
  );
}
