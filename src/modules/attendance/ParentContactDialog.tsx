import { Copy, MessageCircle, Phone, X } from 'lucide-react';
import { useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import type { AttendanceSession, Student } from '../../types';
import {
  absenceMessage,
  CONTACT_CHANNELS,
  parentPhoneHref,
  parentZaloHref,
  splitAttendanceNote,
} from './parentContact';
import type { ContactChannel, ParentContactRequest } from './parentContact';

interface Props {
  student: Student;
  session: AttendanceSession;
  className: string;
  centerName: string;
  canRecord: boolean;
  unavailableReason: string;
  onRecord: (request: ParentContactRequest) => string | null;
  onClose: () => void;
}

export function ParentContactButton({
  studentName,
  absent,
  note,
  ready,
  reason,
  onOpen,
}: {
  studentName: string;
  absent: boolean;
  note?: string;
  ready: boolean;
  reason: string;
  onOpen: () => void;
}) {
  const count = splitAttendanceNote(note).history.length;
  if (!absent && !count) return null;
  return (
    <div className="mt-2 min-w-0 text-xs">
      <button
        type="button"
        onClick={onOpen}
        disabled={!ready && !count}
        aria-label={`${count ? 'Lịch sử liên hệ phụ huynh' : 'Báo phụ huynh'} của ${studentName}`}
        className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-sky-200 px-3 py-1 text-left font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:cursor-default disabled:opacity-50"
      >
        <MessageCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>{count ? `Đã liên hệ (${count}) · Xem` : 'Báo phụ huynh'}</span>
      </button>
      {absent && !ready && <p className="mt-1 text-[11px] text-slate-500">{reason}</p>}
    </div>
  );
}

export function ParentContactDialog({
  student,
  session,
  className,
  centerName,
  canRecord,
  unavailableReason,
  onRecord,
  onClose,
}: Props) {
  const [message, setMessage] = useState(() =>
    absenceMessage(student, className, session.date, centerName),
  );
  const [channel, setChannel] = useState<ContactChannel>('Zalo');
  const [details, setDetails] = useState('');
  const [feedback, setFeedback] = useState('');
  const [recorded, setRecorded] = useState(false);
  const history = splitAttendanceNote(
    session.entries.find((entry) => entry.studentId === student.id)?.note,
  ).history;
  const phoneHref = parentPhoneHref(student.parentPhone || '');
  const zaloHref = parentZaloHref(student.parentPhone || student.phone);
  const openZalo = async () => {
    if (!zaloHref) return;
    try {
      if (message.trim()) {
        await navigator.clipboard.writeText(message);
      }
    } catch {
      // fallback
    }
    window.open(zaloHref, '_blank', 'noopener,noreferrer');
    setFeedback('Đã sao chép nội dung và mở Zalo của phụ huynh. Bạn chỉ cần nhấn Dán (Ctrl+V) trong khung chat Zalo để gửi.');
    if (!details.trim()) {
      setDetails('Đã gửi tin nhắn Zalo cho phụ huynh');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setFeedback('Đã sao chép. Hãy gửi nội dung cho phụ huynh rồi ghi nhận liên hệ.');
    } catch {
      setFeedback('Chưa sao chép được. Bạn có thể chọn nội dung bên dưới để sao chép thủ công.');
    }
  };
  const record = () => {
    if (recorded || !canRecord) return;
    const error = onRecord({ sessionId: session.id, studentId: student.id, channel, details });
    if (error) {
      setFeedback(error);
      return;
    }
    setDetails('');
    setRecorded(true);
    setFeedback('Đã ghi nhận liên hệ.');
  };
  return (
    <DialogFrame
      label="Báo phụ huynh học viên vắng"
      onClose={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-3 sm:p-5"
    >
      <div className="flex max-h-full w-full min-w-0 max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
          <h2 className="min-w-0 font-bold text-slate-900">Báo phụ huynh</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng thông báo phụ huynh"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4 text-sm">
          <div className="space-y-1 break-words text-slate-600">
            <p className="font-bold text-slate-900">{student.name}</p>
            <p>
              Lớp {className} · Ngày {session.date.split('-').reverse().join('/')}
            </p>
            <p>
              Phụ huynh: {student.parentName || 'Chưa có tên'} · SĐT:{' '}
              {student.parentPhone || student.phone || 'Chưa cập nhật'}
            </p>
          </div>
          {canRecord ? (
            <>
              {!phoneHref && (
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                  Số phụ huynh chưa có hoặc chưa hợp lệ.
                </p>
              )}
              <label className="block font-semibold text-slate-700">
                Nội dung gửi phụ huynh
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  className="mt-1 w-full min-w-0 resize-y rounded-xl border border-slate-200 p-3 font-normal focus:outline-2 focus:outline-sky-600"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copy}
                  disabled={!message.trim()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-50 px-3 font-semibold text-sky-800 disabled:opacity-50"
                >
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Sao chép
                </button>
                {phoneHref && (
                  <a
                    href={phoneHref}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 font-semibold text-slate-700"
                  >
                    <Phone aria-hidden="true" className="h-4 w-4" />
                    Gọi phụ huynh
                  </a>
                )}
              </div>
              <ResponsiveSelect
                label="Kênh liên hệ phụ huynh"
                value={channel}
                options={CONTACT_CHANNELS.map((value) => ({ value, label: value }))}
                onChange={(value) => {
                  setChannel(value as ContactChannel);
                  setRecorded(false);
                }}
              />

              {channel === 'Zalo' && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-sky-950">Gửi trực tiếp qua Zalo phụ huynh</p>
                    <p className="text-[11px] text-sky-700 truncate">
                      Số Zalo phụ huynh: <strong className="font-semibold text-sky-900">{student.parentPhone || student.phone || 'Chưa cập nhật'}</strong>
                    </p>
                  </div>
                  {zaloHref ? (
                    <button
                      type="button"
                      onClick={openZalo}
                      aria-label={`Mở Zalo phụ huynh ${student.name}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0068FF] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0057D9] active:scale-95 transition cursor-pointer"
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px] font-black text-[#0068FF]">
                        Z
                      </span>
                      Mở Zalo gửi ngay
                    </button>
                  ) : (
                    <span className="text-[11px] text-amber-700 italic">Chưa có số Zalo hợp lệ</span>
                  )}
                </div>
              )}
              <label className="block font-semibold text-slate-700">
                Kết quả liên hệ / phản hồi
                <textarea
                  value={details}
                  onChange={(event) => {
                    setDetails(event.target.value);
                    setRecorded(false);
                  }}
                  maxLength={500}
                  rows={2}
                  placeholder="VD: Đã gửi Zalo, phụ huynh báo con bị ốm…"
                  className="mt-1 w-full min-w-0 resize-y rounded-xl border border-slate-200 p-3 font-normal focus:outline-2 focus:outline-sky-600"
                />
              </label>
              <button
                type="button"
                onClick={record}
                disabled={recorded}
                className="min-h-11 w-full rounded-xl bg-sky-700 px-3 py-2 font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
              >
                Tôi đã liên hệ · Ghi nhận
              </button>
            </>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-slate-600">{unavailableReason}</p>
          )}
          {feedback && (
            <p role="status" className="break-words text-xs text-sky-800">
              {feedback}
            </p>
          )}
          {history.length > 0 && (
            <section
              aria-label="Lịch sử liên hệ phụ huynh"
              className="border-t border-slate-100 pt-3"
            >
              <h3 className="mb-2 font-semibold text-slate-900">
                Lịch sử liên hệ ({history.length})
              </h3>
              <ol className="space-y-2">
                {[...history].reverse().map((item, index) => (
                  <li
                    key={`${item.line}-${index}`}
                    className="break-words rounded-xl bg-slate-50 p-3 text-xs"
                  >
                    <p className="font-semibold text-slate-700">
                      {item.time} · {item.channel} · {item.author}
                    </p>
                    <p className="mt-1 text-slate-600">{item.details}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </DialogFrame>
  );
}
