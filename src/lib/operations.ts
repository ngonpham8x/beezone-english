import type {
  AttendanceSession,
  ClassEnrollment,
  ClassRoom,
  ScheduleChange,
  Student,
  TimetableSlot,
  TuitionReceipt,
} from '../types';
import { centerDate, isCalendarDate } from './dates';
import { validSessionRate } from './sessionBilling';
import { findScheduleConflict, timeMinutes } from './schedule';
import { studentClassIds } from './studentClasses';

export const courseStatusLabels = {
  planned: 'Sắp khai giảng',
  active: 'Đang học',
  paused: 'Tạm dừng',
  completed: 'Đã kết thúc',
};
export const weekdays = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export const weekdayForDate = (date: string) =>
  isCalendarDate(date) ? weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()] : '';
export function addDays(date: string, count: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function validateCourse(c: ClassRoom): string | null {
  if (c.billingMode === 'session' && (!validSessionRate(c.sessionRate) || !isCalendarDate(c.sessionBillingStartDate))) return 'Nhập đơn giá mỗi buổi (số nguyên lớn hơn 0) và ngày bắt đầu tính phí theo buổi.';
  if ((c.startDate && !isCalendarDate(c.startDate)) || (c.endDate && !isCalendarDate(c.endDate)))
    return 'Ngày khai giảng hoặc kết thúc không hợp lệ.';
  if (c.startDate && c.endDate && c.startDate > c.endDate)
    return 'Ngày kết thúc phải từ ngày khai giảng trở đi.';
  if (c.totalSessions !== undefined && (!Number.isInteger(c.totalSessions) || c.totalSessions < 1))
    return 'Số buổi dự kiến phải là số nguyên lớn hơn 0.';
  if (
    c.courseStatus === 'completed' &&
    c.startDate &&
    c.startDate > (c.completedDate || centerDate())
  )
    return 'Đợt học chưa khai giảng; chọn tạm dừng thay vì hoàn thành.';
  return null;
}
export function classRunsOn(c: ClassRoom, date: string): boolean {
  return (
    !(c.startDate && date < c.startDate) &&
    !(c.endDate && date > c.endDate) &&
    !(c.courseStatus === 'planned' && !c.startDate) &&
    c.courseStatus !== 'paused' &&
    !(c.courseStatus === 'completed' && date >= (c.completedDate || c.endDate || '0000-01-01'))
  );
}
export interface DatedLesson extends TimetableSlot {
  date: string;
  changeId?: string;
  changeKind?: ScheduleChange['kind'];
  reason?: string;
  substituteTeacherId?: string;
  originalTeacherId?: string;
}
export function weekDatesForDate(date: string): Record<string, string> {
  if (!isCalendarDate(date)) return {};
  const d = new Date(`${date}T00:00:00Z`);
  const diffToMonday = (d.getUTCDay() + 6) % 7;
  const monday = addDays(date, -diffToMonday);
  return {
    'Thứ 2': monday,
    'Thứ 3': addDays(monday, 1),
    'Thứ 4': addDays(monday, 2),
    'Thứ 5': addDays(monday, 3),
    'Thứ 6': addDays(monday, 4),
    'Thứ 7': addDays(monday, 5),
    'Chủ Nhật': addDays(monday, 6),
  };
}
export function formatShortDate(date: string): string {
  if (!date || !isCalendarDate(date)) return '';
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}
export function lessonsOn(
  date: string,
  classes: ClassRoom[],
  slots: TimetableSlot[],
  changes: ScheduleChange[] = [],
): DatedLesson[] {
  if (!isCalendarDate(date)) return [];
  const result: DatedLesson[] = slots
    .filter((slot) => {
      const c = classes.find((item) => item.id === slot.classId);
      return (
        c &&
        classRunsOn(c, date) &&
        slot.dayOfWeek === weekdayForDate(date) &&
        !changes.some(
          (change) =>
            change.sourceSlotId === slot.id &&
            ((change.kind === 'cancel' || (change.kind === 'teacher_off' && !change.substituteTeacherId))
              ? change.date : change.sourceDate) === date,
        )
      );
    })
    .map((slot) => {
      const teacherOff = changes.find(
        (change) =>
          change.kind === 'teacher_off' &&
          change.sourceSlotId === slot.id &&
          change.date === date,
      );
      if (teacherOff) {
        return {
          ...slot,
          date,
          changeId: teacherOff.id,
          changeKind: 'teacher_off',
          reason: teacherOff.reason,
          originalTeacherId: slot.teacherId,
          teacherId: teacherOff.substituteTeacherId || slot.teacherId,
          substituteTeacherId: teacherOff.substituteTeacherId,
          roomId: teacherOff.roomId || slot.roomId,
        };
      }
      return { ...slot, date };
    });
  for (const change of changes.filter(
    (item) => item.kind !== 'cancel' && item.kind !== 'teacher_off' && item.date === date,
  )) {
    // Extra/moved sessions can finish a course after its original end date.
    if (classes.some((c) => c.id === change.classId))
      result.push({
        ...change,
        id: `change:${change.id}`,
        date,
        dayOfWeek: weekdayForDate(date),
        changeId: change.id,
        changeKind: change.kind,
      });
  }
  return result.sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.classId.localeCompare(b.classId),
  );
}
export function validateScheduleChange(
  change: ScheduleChange,
  classes: ClassRoom[],
  slots: TimetableSlot[],
  changes: ScheduleChange[],
  attendance: AttendanceSession[],
): string | null {
  if (
    !isCalendarDate(change.date) ||
    (change.kind === 'move' && !isCalendarDate(change.sourceDate))
  )
    return 'Nhập ngày học hợp lệ.';
  if (!change.reason.trim()) return 'Nhập lý do nghỉ, đổi lịch, dạy thay hoặc học bù.';
  if (!classes.some((c) => c.id === change.classId)) return 'Lớp học không tồn tại.';
  const before = changes.filter((item) => item.id !== change.id);
  const sourceDate = change.kind === 'move' ? change.sourceDate! : change.date;
  if (change.kind === 'teacher_off' && before.some((item) =>
      item.sourceSlotId === change.sourceSlotId &&
      (item.kind === 'move' ? item.sourceDate : item.date) === change.date))
    return 'Buổi học này đã có điều chỉnh. Hãy sửa hoặc hủy điều chỉnh hiện tại.';
  if (change.kind !== 'extra') {
    if (
      !lessonsOn(sourceDate, classes, slots, before).some(
        (slot) => slot.id === change.sourceSlotId && slot.classId === change.classId,
      )
    )
      return 'Buổi gốc không còn trong lịch. Hãy chọn lại ngày và buổi gốc.';
    if (attendance.some((item) => item.classId === change.classId && item.date === sourceDate))
      return 'Buổi gốc đã điểm danh; giữ lịch sử và chọn buổi khác.';
  }
  if (change.kind === 'cancel') return null;
  if (change.kind === 'teacher_off') {
    const source = slots.find((slot) => slot.id === change.sourceSlotId);
    if (!source || source.teacherId !== change.teacherId ||
        source.startTime !== change.startTime || source.endTime !== change.endTime)
      return 'Ca học gốc đã thay đổi. Hãy chọn lại buổi học trước khi đăng ký giáo viên nghỉ.';
    if (change.substituteTeacherId) {
      if (change.substituteTeacherId === change.teacherId) {
        return 'Giáo viên dạy thay phải khác giáo viên chính của buổi học.';
      }
      const candidates = lessonsOn(change.date, classes, slots, before).filter(
        (item) => item.id !== change.sourceSlotId && item.changeId !== change.id,
      );
      const isOverlap = candidates.some((cand) => {
        if (cand.teacherId !== change.substituteTeacherId) return false;
        const s1 = timeMinutes(cand.startTime) ?? 0, e1 = timeMinutes(cand.endTime) ?? 0;
        const s2 = timeMinutes(change.startTime) ?? 0, e2 = timeMinutes(change.endTime) ?? 0;
        return s1 < e2 && e1 > s2;
      });
      if (isOverlap) {
        return 'Giáo viên dạy thay bị trùng giờ với một ca dạy khác trong ngày.';
      }
    }
    return null;
  }
  if (attendance.some((item) => item.classId === change.classId && item.date === change.date))
    return 'Ngày mới đã có điểm danh của lớp này.';
  const start = timeMinutes(change.startTime),
    end = timeMinutes(change.endTime);
  if (start === null || end === null || start >= end) return 'Giờ kết thúc phải sau giờ bắt đầu.';
  const candidates = lessonsOn(change.date, classes, slots, [...before, change]).filter(
    (item) => item.changeId !== change.id,
  );
  if (candidates.some((item) => item.classId === change.classId))
    return 'Lớp đã có buổi học trong ngày này. Hãy chọn ngày khác.';
  if (
    findScheduleConflict(candidates, {
      ...change,
      id: `change:${change.id}`,
      dayOfWeek: weekdayForDate(change.date),
    })
  )
    return 'Trùng giờ giáo viên hoặc phòng với một buổi khác trong ngày.';
  if (!change.teacherId || !change.roomId) return 'Chọn giáo viên và phòng cho buổi học.';
  return null;
}
/** Recurring edits must not orphan a dated change or collide with a makeup. */
export function validateRecurringChanges(
  classes: ClassRoom[],
  slots: TimetableSlot[],
  changes: ScheduleChange[],
): string | null {
  for (const change of changes) {
    if (change.kind !== 'extra') {
      const source = slots.find(
        (slot) => slot.id === change.sourceSlotId && slot.classId === change.classId,
      );
      if (
        !source ||
        source.dayOfWeek !==
          weekdayForDate(change.kind === 'move' ? change.sourceDate! : change.date)
      )
        return 'Ca học đang có lịch nghỉ/học bù liên quan. Giữ ngày học gốc hoặc hủy điều chỉnh trước.';
      if (change.kind === 'teacher_off' &&
          (source.teacherId !== change.teacherId || source.startTime !== change.startTime || source.endTime !== change.endTime))
        return 'Ca học có giáo viên đăng ký nghỉ. Hãy hủy điều chỉnh đó trước khi đổi giáo viên hoặc giờ học gốc.';
    }
  }
  for (const date of new Set(changes.filter((c) => c.kind !== 'cancel').map((c) => c.date))) {
    const lessons = lessonsOn(date, classes, slots, changes);
    if (lessons.some((lesson) => findScheduleConflict(lessons, lesson)))
      return `Lịch tuần mới trùng giờ giáo viên hoặc phòng với lịch học bù ngày ${date}.`;
  }
  return null;
}
export function tuitionDueStatus(
  receipt: TuitionReceipt,
  today = centerDate(),
): 'paid' | 'unknown' | 'overdue' | 'soon' | 'later' {
  if (receipt.debtAmount <= 0) return 'paid';
  if (!receipt.dueDate || !isCalendarDate(receipt.dueDate)) return 'unknown';
  if (receipt.dueDate < today) return 'overdue';
  return receipt.dueDate <= addDays(today, 7) ? 'soon' : 'later';
}
export function tuitionReminder(
  receipt: TuitionReceipt,
  student: Student,
  centerName: string,
): string {
  return `Kính gửi ${student.parentName || 'phụ huynh'} của học viên ${student.name}, ${centerName} xin nhắc khoản học phí ${receipt.billingPeriod || receipt.code} còn ${receipt.debtAmount.toLocaleString('vi-VN')} đ${receipt.dueDate ? `, hạn thanh toán ${receipt.dueDate.split('-').reverse().join('/')}` : ''}. Nếu gia đình đã chuyển khoản, vui lòng gửi thông tin để trung tâm đối chiếu. Xin cảm ơn!`;
}
export function updateEnrollmentHistory(
  records: ClassEnrollment[],
  previous: Student | undefined,
  next: Student,
  date: string,
): ClassEnrollment[] {
  const before = previous ? studentClassIds(previous) : [];
  const after = studentClassIds(next);
  let result = records;
  for (const classId of new Set([...before, ...after])) {
    const scoped = result.filter(item => item.studentId === next.id && item.classId === classId);
    const updated = updateSingleEnrollmentHistory(scoped,
      previous && before.includes(classId) ? { ...previous, classId } : undefined,
      { ...next, classId: after.includes(classId) ? classId : '' }, date);
    const byId = new Map(updated.map(item => [item.id, item]));
    result = result.map(item => byId.get(item.id) || item).concat(updated.filter(item => !result.some(existing => existing.id === item.id)));
  }
  return result;
}
function updateSingleEnrollmentHistory(
  records: ClassEnrollment[],
  previous: Student | undefined,
  next: Student,
  date: string,
): ClassEnrollment[] {
  if (
    previous?.classId === next.classId &&
    previous.status === next.status &&
    records.some(
      (item) =>
        item.studentId === next.id && item.classId === next.classId && item.status === 'completed',
    )
  )
    return records;
  let result = records.map((item) => ({ ...item }));
  // Capture legacy membership before the first transfer; no invented start date.
  if (
    previous?.classId &&
    !result.some((item) => item.studentId === next.id && item.classId === previous.classId)
  ) {
    result.push({
      id: `legacy:${previous.id}:${previous.classId}`,
      studentId: previous.id,
      classId: previous.classId,
      status:
        previous.status === 'reserved'
          ? 'reserved'
          : previous.status === 'dropped'
            ? 'dropped'
            : 'active',
      startDate: isCalendarDate(previous.enrollDate) ? previous.enrollDate : undefined,
    });
  }
  if (!next.classId)
    return result.map((item) =>
      item.studentId === next.id && ['active', 'reserved'].includes(item.status)
        ? { ...item, status: 'transferred', endDate: item.startDate && item.startDate > date ? item.startDate : date }
        : item,
    );
  if (previous?.classId !== next.classId)
    result = result.map((item) =>
      item.studentId === next.id && ['active', 'reserved'].includes(item.status)
        ? {
            ...item,
            status: 'transferred',
            endDate: item.startDate && item.startDate > date ? item.startDate : date,
          }
        : item,
    );
  const status =
    next.status === 'reserved' ? 'reserved' : next.status === 'dropped' ? 'dropped' : 'active';
  const existing = result.find(
    (item) =>
      item.studentId === next.id &&
      item.classId === next.classId &&
      ['active', 'reserved', 'dropped'].includes(item.status),
  );
  if (existing)
    result = result.map((item) =>
      item.id === existing.id
        ? { ...item, status, endDate: status === 'dropped' ? date : undefined }
        : item,
    );
  else
    result.push({
      id: `ENR_${crypto.randomUUID()}`,
      studentId: next.id,
      classId: next.classId,
      status,
      startDate:
        previous?.classId === next.classId && isCalendarDate(next.enrollDate)
          ? next.enrollDate
          : date,
    });
  return result;
}
