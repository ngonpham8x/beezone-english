import { centerDate, isCalendarDate } from '../../lib/dates';
import type { AttendanceStudentEntry, ClassRoom, Student, UserAccount } from '../../types';
import { canEditAttendanceClass } from './access';

export const CONTACT_CHANNELS = ['Zalo', 'SMS', 'Điện thoại', 'Khác'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export interface ParentContactRequest {
  sessionId: string;
  studentId: string;
  channel: ContactChannel;
  details: string;
  type?: 'absence' | 'review';
}

// Human-readable lines in the existing attendance note keep old JSON/Excel compatible.
const contactLine =
  /^\[Liên hệ PH \| (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \| (Zalo|SMS|Tin nhắn|Điện thoại|Khác) \| ([^\]|\r\n]+)\] (.+)$/;
export function splitAttendanceNote(note = '') {
  const history: Array<{
    line: string;
    time: string;
    channel: string;
    author: string;
    details: string;
  }> = [];
  const text: string[] = [];
  for (const line of note.split(/\r?\n/)) {
    const match = contactLine.exec(line);
    if (
      match &&
      isCalendarDate(match[1].slice(0, 10)) &&
      !Number.isNaN(Date.parse(`${match[1].replace(' ', 'T')}+07:00`))
    ) {
      history.push({
        line,
        time: match[1],
        channel: match[2],
        author: match[3],
        details: match[4],
      });
    } else text.push(line);
  }
  return { text: text.join('\n'), history };
}

export function retainContactHistory(note: string, previousNote = ''): string {
  const current = splitAttendanceNote(note);
  const lines = new Set(
    [...splitAttendanceNote(previousNote).history, ...current.history].map((item) => item.line),
  );
  return [current.text, ...lines].filter(Boolean).join('\n');
}

const oneLine = (value: string) => value.replace(/[\r\n|\]]+/g, ' ').trim();
export function appendParentContact(
  note: string,
  channel: ContactChannel,
  details: string,
  author: string,
  now = new Date(),
): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const line = `[Liên hệ PH | ${centerDate(now)} ${time} | ${channel} | ${oneLine(author).slice(0, 100) || 'Giáo viên'}] ${oneLine(details) || 'Đã thông báo học viên vắng.'}`;
  return retainContactHistory([note, line].filter(Boolean).join('\n'));
}

export function canContactParent(
  user: UserAccount | null | undefined,
  classroom: ClassRoom | undefined,
): boolean {
  return canEditAttendanceClass(user, classroom);
}

export function parentPhoneHref(phone: string): string | null {
  const clean = phone.replace(/[\s().-]/g, '');
  return /^\+?\d{8,15}$/.test(clean) ? `tel:${clean}` : null;
}

export function parentZaloHref(phone?: string): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^0-9]/g, '');
  return clean.length >= 9 ? `https://zalo.me/${clean}` : null;
}

export function parentSmsHref(phone?: string, body?: string): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[\s().-]/g, '');
  if (!/^\+?\d{8,15}$/.test(clean)) return null;
  return body ? `sms:${clean}?body=${encodeURIComponent(body)}` : `sms:${clean}`;
}

export function absenceMessage(
  student: Student,
  className: string,
  date: string,
  centerName: string,
): string {
  const formattedDate = isCalendarDate(date) ? date.split('-').reverse().join('/') : date;
  return [
    '⚠️ THÔNG BÁO HỌC VIÊN VẮNG MẶT',
    `Kính gửi phụ huynh${student.parentName ? ` ${student.parentName}` : ''},`,
    `Hiện tại, ${centerName} ghi nhận học viên ${student.name} CHƯA CÓ MẶT tại lớp ${className} trong buổi học ngày ${formattedDate}.`,
    '• Trạng thái chuyên cần: VẮNG MẶT',
    'Kính mong phụ huynh kiểm tra và phản hồi lý do vắng mặt để trung tâm kịp thời hỗ trợ, theo dõi và sắp xếp nội dung học bù cho con.',
    'Nếu học viên đang trên đường đến lớp, phụ huynh vui lòng thông báo lại cho trung tâm.',
    'Trân trọng cảm ơn quý phụ huynh!',
  ].join('\n');
}

export function sessionReviewMessage(
  student: Student,
  className: string,
  date: string,
  centerName: string,
  entry?: AttendanceStudentEntry | null,
  lessonTopic?: string,
  generalNotes?: string,
  teacherName?: string,
  attendanceSaved = true,
): string {
  const formattedDate = isCalendarDate(date) ? date.split('-').reverse().join('/') : date;
  const statusLabel =
    entry?.status === 'present'
      ? 'Có mặt đầy đủ ✓'
      : entry?.status === 'late'
        ? 'Đi muộn'
        : entry?.status === 'excused'
          ? 'Nghỉ học có phép'
          : entry?.status === 'absent'
            ? 'Vắng mặt'
            : 'Có mặt';

  const attitudeLabel =
    entry?.learningAttitude === 'excellent'
      ? 'Rất tích cực, hăng hái phát biểu'
      : entry?.learningAttitude === 'good'
        ? 'Tốt, chú ý nghe giảng'
        : entry?.learningAttitude === 'needs_focus'
          ? 'Cần tập trung hơn trong giờ học'
          : entry?.learningAttitude === 'needs_support'
            ? 'Cần cô giáo hỗ trợ thêm'
            : entry?.learningAttitude === 'normal'
              ? 'Bình thường'
              : '';

  const stars = entry?.rating && entry.rating > 0 ? '⭐'.repeat(Math.min(entry.rating, 5)) : '';
  const cleanNote = entry?.note ? splitAttendanceNote(entry.note).text.trim() : '';

  if (entry?.status === 'absent') {
    return [
      '⚠️ THÔNG BÁO HỌC VIÊN VẮNG MẶT',
      `Kính gửi phụ huynh${student.parentName ? ` ${student.parentName}` : ''},`,
      `Hiện tại, ${centerName} ghi nhận học viên ${student.name} CHƯA CÓ MẶT tại lớp ${className} trong buổi học ngày ${formattedDate}.`,
      '• Trạng thái chuyên cần: VẮNG MẶT',
      teacherName ? `• Giáo viên phụ trách: ${teacherName}` : null,
      lessonTopic ? `• Chủ đề / nội dung buổi học: ${lessonTopic}` : null,
      generalNotes ? `• Dặn dò / BTVN chung của lớp: ${generalNotes}` : null,
      entry.homeworkAssignment ? `• BTVN riêng cần bổ sung: ${entry.homeworkAssignment}` : null,
      cleanNote ? `• Ghi chú của giáo viên: ${cleanNote}` : null,
      'Kính mong phụ huynh kiểm tra và phản hồi lý do vắng mặt để trung tâm kịp thời hỗ trợ, theo dõi và sắp xếp nội dung học bù cho con.',
      'Nếu học viên đang trên đường đến lớp, phụ huynh vui lòng thông báo lại cho trung tâm.',
      'Trân trọng cảm ơn quý phụ huynh!',
    ].filter(Boolean).join('\n');
  }

  const items = [
    `Kính gửi phụ huynh${student.parentName ? ` ${student.parentName}` : ''},`,
    `${centerName} xin gửi nhận xét buổi học của học viên ${student.name} ngày ${formattedDate} (Lớp ${className}):`,
    teacherName ? `• Giáo viên phụ trách: ${teacherName}` : null,
    lessonTopic ? `• Chủ đề bài học: ${lessonTopic}` : null,
    `• Chuyên cần: ${attendanceSaved
      ? statusLabel
      : entry?.status && entry.status !== 'present'
        ? `${statusLabel} (chưa lưu)`
        : 'Chưa lưu điểm danh'}`,
    entry?.homeworkCompleted !== undefined
      ? `• BTVN buổi trước: ${entry.homeworkCompleted ? 'Đã hoàn thành tốt ✓' : 'Chưa hoàn thành'}`
      : null,
    attitudeLabel ? `• Thái độ học tập: ${attitudeLabel}` : null,
    stars ? `• Đánh giá sao buổi học: ${stars}` : null,
    entry?.sessionScore !== undefined && entry.sessionScore !== null
      ? `• Điểm số bài học: ${entry.sessionScore}/10`
      : null,
    cleanNote ? `• Nhận xét của giáo viên: ${cleanNote}` : null,
    generalNotes ? `• Dặn dò / BTVN chung của lớp: ${generalNotes}` : null,
    entry?.homeworkAssignment ? `• BTVN & Dặn dò về nhà: ${entry.homeworkAssignment}` : null,
    `Kính mong quý phụ huynh cùng đồng hành và nhắc nhở con ôn bài. Trân trọng cảm ơn quý phụ huynh!`,
  ].filter(Boolean);

  return items.join('\n');
}
