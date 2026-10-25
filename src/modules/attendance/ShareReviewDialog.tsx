import { Copy, Phone, Send, Smartphone, Star, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import type { AttendanceStudentEntry, Student } from '../../types';
import {
  parentPhoneHref,
  parentSmsHref,
  parentZaloHref,
  sessionReviewMessage,
} from './parentContact';
import type { ParentContactRequest } from './parentContact';

interface Props {
  sessionId?: string;
  student: Student;
  className: string;
  sessionDate: string;
  centerName: string;
  teacherName?: string;
  lessonTopic?: string;
  generalNotes?: string;
  entry: AttendanceStudentEntry;
  onRecord?: (request: ParentContactRequest) => string | null;
  onClose: () => void;
}

const ATTITUDE_LABELS: Record<string, string> = {
  excellent: 'Xuất sắc ⭐',
  good: 'Tốt & Hăng hái 👍',
  normal: 'Bình thường',
  needs_focus: 'Cần tập trung hơn 👀',
  needs_support: 'Cần cô kèm thêm 📖',
};

const STATUS_LABELS: Record<string, string> = {
  present: 'Có mặt',
  late: 'Đi muộn',
  excused: 'Nghỉ có phép',
  absent: 'Vắng mặt',
};

export function ShareReviewDialog({
  sessionId,
  student,
  className,
  sessionDate,
  centerName,
  teacherName,
  lessonTopic,
  generalNotes,
  entry,
  onRecord,
  onClose,
}: Props) {
  const [message, setMessage] = useState(() =>
    sessionReviewMessage(
      student,
      className,
      sessionDate,
      centerName,
      entry,
      lessonTopic,
      generalNotes,
      teacherName,
    ),
  );
  const [feedback, setFeedback] = useState('');
  const absent = entry.status === 'absent';

  const phone = student.parentPhone || student.phone || '';
  const zaloHref = parentZaloHref(phone);
  const smsHref = parentSmsHref(phone, message);
  const callHref = parentPhoneHref(phone);

  const recordShare = (channel: 'Zalo' | 'SMS') => {
    if (!onRecord || !sessionId) return true;
    const error = onRecord({
      sessionId,
      studentId: student.id,
      channel,
      type: 'review',
      details: absent
        ? `Đã mở ${channel} để gửi thông báo học viên đang vắng mặt.`
        : `Đã mở ${channel} để gửi nhận xét cuối buổi cho phụ huynh.`,
    });
    if (error) {
      setFeedback(error);
      return false;
    }
    return true;
  };

  const handleCopy = async (customFeedback?: string) => {
    try {
      if (message.trim()) {
        await navigator.clipboard.writeText(message);
        setFeedback(customFeedback || 'Đã sao chép nội dung nhận xét vào bộ nhớ tạm.');
        return true;
      }
    } catch {
      setFeedback('Chưa thể tự động sao chép. Bạn có thể chọn và sao chép thủ công.');
    }
    return false;
  };

  const handleOpenZalo = () => {
    if (!zaloHref || !recordShare('Zalo')) return;
    window.open(zaloHref, '_blank', 'noopener,noreferrer');
    void handleCopy(absent
      ? 'Đã sao chép nội dung và mở Zalo phụ huynh để gửi thông báo vắng mặt.'
      : 'Đã sao chép nội dung và mở Zalo phụ huynh. Bạn chỉ cần bấm Dán (Ctrl+V) trong khung chat Zalo để gửi.');
  };

  const handleOpenSms = () => {
    if (!smsHref || !recordShare('SMS')) return;
    void handleCopy(absent
      ? 'Đã mở ứng dụng SMS với nội dung thông báo học viên vắng mặt.'
      : 'Đã sao chép nội dung và mở ứng dụng tin nhắn SMS.');
    window.open(smsHref, '_self');
  };

  return (
    <DialogFrame
      label={absent ? 'Thông báo phụ huynh học viên vắng mặt' : 'Chia sẻ nhận xét buổi học cho phụ huynh'}
      onClose={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-3 sm:p-5"
    >
      <div className="flex max-h-[92vh] w-full min-w-0 max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className={`flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-gradient-to-r ${absent ? 'from-rose-50 to-amber-50' : 'from-sky-50 to-blue-50'}`}>
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-xs ${absent ? 'bg-rose-600' : 'bg-sky-600'}`}>
              {absent ? <XCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{absent ? 'Thông báo học viên vắng mặt' : 'Chia sẻ nhận xét buổi học'}</h2>
              <p className="text-[11px] text-slate-500">{absent ? 'Thông báo ngay để phụ huynh biết học viên hiện chưa có mặt tại lớp' : 'Gửi nhận xét của giáo viên đến phụ huynh qua Zalo hoặc tin nhắn'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chia sẻ nhận xét"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X aria-hidden="true" className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 space-y-3.5 overflow-y-auto p-5 text-xs text-slate-600">
          {/* Student Info Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-slate-900">{student.name}</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-semibold">{student.code}</span>
            </div>
            <p className="font-medium text-slate-700">
              Lớp {className} · Ngày {sessionDate.split('-').reverse().join('/')}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 text-[11px]">
              <span>Phụ huynh: <strong className="text-slate-800">{student.parentName || 'Chưa có tên'}</strong></span>
              <span>·</span>
              <span>SĐT: <strong className="text-slate-800">{phone || 'Chưa cập nhật'}</strong></span>
            </div>
          </div>

          {absent && (
            <div role="alert" className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3.5 text-rose-950 shadow-xs">
              <div className="flex items-start gap-2.5">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                <div>
                  <p className="font-extrabold uppercase tracking-wide">Học viên đang vắng mặt</p>
                  <p className="mt-1 leading-relaxed">
                    Tại thời điểm gửi thông báo, <strong>{student.name}</strong> chưa có mặt trong buổi học của lớp <strong>{className}</strong>. Vui lòng gửi ngay và đề nghị phụ huynh xác nhận lý do.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Highlights summary */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className={`px-2 py-1 rounded-lg border font-semibold ${absent ? 'border-rose-300 bg-rose-100 text-rose-900' : entry.status === 'excused' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {STATUS_LABELS[entry.status] || 'Có mặt'}
            </span>
            {!absent && entry.homeworkCompleted !== undefined && (
              <span className={`px-2 py-1 rounded-lg border font-medium ${
                entry.homeworkCompleted
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                {entry.homeworkCompleted ? '✓ BTVN: Hoàn thành' : '⚠ BTVN: Chưa hoàn thành'}
              </span>
            )}
            {!absent && Boolean(entry.rating && entry.rating > 0) && (
              <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-semibold flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                {entry.rating}/5 sao
              </span>
            )}
            {!absent && entry.learningAttitude && (
              <span className="px-2 py-1 rounded-lg bg-purple-50 text-purple-800 border border-purple-200 font-medium">
                {ATTITUDE_LABELS[entry.learningAttitude] || entry.learningAttitude}
              </span>
            )}
            {!absent && entry.sessionScore !== undefined && entry.sessionScore !== null && (
              <span className="px-2 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 font-bold">
                Điểm bài học: {entry.sessionScore}/10
              </span>
            )}
          </div>

          {/* Message content textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-800">
                Nội dung tin nhắn gửi phụ huynh:
              </label>
              <span className="text-[11px] text-slate-400">Có thể chỉnh sửa trực tiếp bên dưới</span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              className="w-full resize-y rounded-xl border border-slate-300 p-3.5 text-xs font-normal leading-relaxed text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-hidden"
              placeholder="Nhập nội dung tin nhắn gửi phụ huynh..."
            />
          </div>

          {/* Feedback */}
          {feedback && (
            <div className="rounded-xl bg-sky-50 border border-sky-200 p-2.5 text-xs font-medium text-sky-900">
              {feedback}
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
            {zaloHref ? (
              <button
                type="button"
                onClick={handleOpenZalo}
                aria-label="Mở Zalo gửi phụ huynh"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0068FF] px-4 text-xs font-bold text-white hover:bg-[#0057D9] shadow-sm active:scale-95 transition cursor-pointer"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[9px] font-black text-[#0068FF]">
                  Z
                </span>
                <span>Mở Zalo gửi phụ huynh</span>
              </button>
            ) : (
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-slate-500 italic">
                Chưa có SĐT Zalo
              </span>
            )}

            {smsHref && (
              <button
                type="button"
                onClick={handleOpenSms}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm active:scale-95 transition cursor-pointer"
              >
                <Smartphone className="h-4 w-4" />
                <span>Gửi SMS</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleCopy()}
              disabled={!message.trim()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50 cursor-pointer"
            >
              <Copy className="h-4 w-4" />
              <span>Sao chép</span>
            </button>

            {callHref && (
              <a
                href={callHref}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                <Phone className="h-4 w-4 text-slate-500" />
                <span>Gọi điện</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="ml-auto inline-flex min-h-10 items-center rounded-xl px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </DialogFrame>
  );
}

