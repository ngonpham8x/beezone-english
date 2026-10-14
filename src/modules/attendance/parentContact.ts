import { centerDate, isCalendarDate } from '../../lib/dates';
import type { ClassRoom, Student, UserAccount } from '../../types';

export const CONTACT_CHANNELS = ['Zalo', 'Điện thoại', 'Khác'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export interface ParentContactRequest {
  sessionId: string;
  studentId: string;
  channel: ContactChannel;
  details: string;
}

// Human-readable lines in the existing attendance note keep old JSON/Excel compatible.
const contactLine =
  /^\[Liên hệ PH \| (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \| (Zalo|Điện thoại|Khác) \| ([^\]|\r\n]+)\] (.+)$/;
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
  const line = `[Liên hệ PH | ${centerDate(now)} ${time} | ${channel} | ${oneLine(author).slice(0, 100) || 'Nhân viên'}] ${oneLine(details) || 'Đã thông báo học viên vắng.'}`;
  return retainContactHistory([note, line].filter(Boolean).join('\n'));
}

export function canContactParent(
  user: UserAccount | null | undefined,
  classroom: ClassRoom | undefined,
): boolean {
  if (!user?.active || !classroom) return false;
  if (user.role === 'owner') return true;
  const permissions = user.permissions;
  return Boolean(
    (permissions.student.edit || permissions.teacher.edit) &&
      (permissions.assignedClassIds?.includes(classroom.id) ||
        (permissions.teacherId && permissions.teacherId === classroom.teacherId)),
  );
}

export function parentPhoneHref(phone: string): string | null {
  const clean = phone.replace(/[\s().-]/g, '');
  return /^\+?\d{8,15}$/.test(clean) ? `tel:${clean}` : null;
}

export function absenceMessage(
  student: Student,
  className: string,
  date: string,
  centerName: string,
): string {
  const formattedDate = isCalendarDate(date) ? date.split('-').reverse().join('/') : date;
  return `Kính gửi phụ huynh${student.parentName ? ` ${student.parentName}` : ''}, ${centerName} ghi nhận học viên ${student.name} vắng buổi học lớp ${className} ngày ${formattedDate}. Mong phụ huynh xác nhận lý do để trung tâm hỗ trợ học viên. Cảm ơn phụ huynh!`;
}
