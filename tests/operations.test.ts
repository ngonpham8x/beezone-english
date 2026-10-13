import { describe, expect, it } from 'vitest';
import {
  addDays,
  lessonsOn,
  tuitionDueStatus,
  updateEnrollmentHistory,
  validateCourse,
  validateScheduleChange,
  weekdayForDate,
  validateRecurringChanges,
} from '../src/lib/operations';
import { parseCenterData, parseBackupArchive } from '../src/lib/centerData';
import {
  initialClasses,
  initialSettings,
  initialStudents,
  initialTuitionReceipts,
} from '../src/mock/initialData';
import type { AttendanceSession, ScheduleChange, TimetableSlot } from '../src/types';

const classroom = {
  ...initialClasses[0],
  id: 'a',
  startDate: '2026-10-01',
  endDate: '2026-12-31',
  courseStatus: 'active' as const,
};
const classes = [classroom, { ...classroom, id: 'b', teacherId: 'other', roomId: 'other' }];
const slot: TimetableSlot = {
  id: 'slot',
  classId: 'a',
  dayOfWeek: 'Thứ 3',
  startTime: '18:00',
  endTime: '19:30',
  teacherId: 't',
  roomId: 'r',
};
const move: ScheduleChange = {
  id: 'move',
  classId: 'a',
  kind: 'move',
  sourceSlotId: 'slot',
  sourceDate: '2026-10-13',
  date: '2026-10-16',
  startTime: '18:00',
  endTime: '19:30',
  teacherId: 't',
  roomId: 'r',
  reason: 'Học bù',
};

describe('dated lessons and course periods', () => {
  it('protects makeup reservations and source lesson IDs when the weekly timetable changes', () => {
    expect(validateRecurringChanges(classes, [], [move])).toMatch(/Ca học/);
    const friday = { ...slot, id: 'friday', classId: 'b', dayOfWeek: 'Thứ 6' };
    expect(validateRecurringChanges(classes, [slot, friday], [move])).toMatch(/trùng/);
    expect(validateRecurringChanges(classes, [slot], [move])).toBeNull();
  });
  it('uses calendar dates across weekends and month boundaries', () => {
    expect(weekdayForDate('2026-10-13')).toBe('Thứ 3');
    expect(weekdayForDate('2026-10-18')).toBe('Chủ Nhật');
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
  });
  it('moves one occurrence while preserving the following weekly occurrence', () => {
    expect(lessonsOn('2026-10-13', classes, [slot], [move])).toEqual([]);
    expect(lessonsOn('2026-10-16', classes, [slot], [move])[0]).toMatchObject({
      changeId: 'move',
      teacherId: 't',
    });
    expect(lessonsOn('2026-10-20', classes, [slot], [move])[0].id).toBe('slot');
    expect(slot.dayOfWeek).toBe('Thứ 3');
  });
  it('cancels a dated lesson without cancelling its whole weekday', () => {
    const cancel = { ...move, kind: 'cancel' as const, date: '2026-10-13', sourceDate: undefined };
    expect(lessonsOn('2026-10-13', classes, [slot], [cancel])).toHaveLength(0);
    expect(lessonsOn('2026-10-20', classes, [slot], [cancel])).toHaveLength(1);
  });
  it('applies course dates and closure, and permits an explicitly arranged final makeup', () => {
    expect(lessonsOn('2026-09-29', classes, [slot])).toHaveLength(0);
    expect(lessonsOn('2027-01-05', classes, [slot])).toHaveLength(0);
    const closed = [
      { ...classroom, courseStatus: 'completed' as const, completedDate: '2026-10-12' },
    ];
    expect(lessonsOn('2026-10-13', closed, [slot])).toHaveLength(0);
    expect(lessonsOn('2026-10-16', closed, [slot], [move])).toHaveLength(1);
  });
  it('rejects reversed dates and fractional planned lesson counts', () => {
    expect(validateCourse({ ...classroom, endDate: '2026-09-01' })).toBeTruthy();
    expect(validateCourse({ ...classroom, totalSessions: 2.5 })).toBeTruthy();
    expect(validateCourse({ ...classroom, totalSessions: 24 })).toBeNull();
  });
  it('checks the actual target date for teacher and room conflicts, allowing adjacent times', () => {
    const other = { ...slot, id: 'other', classId: 'b', dayOfWeek: 'Thứ 6' };
    expect(validateScheduleChange(move, classes, [slot, other], [], [])).toMatch(/Trùng/);
    expect(
      validateScheduleChange(
        { ...move, startTime: '19:30', endTime: '21:00' },
        classes,
        [slot, other],
        [],
        [],
      ),
    ).toBeNull();
  });
  it('uses the changed teacher and room in the target schedule', () => {
    expect(
      lessonsOn('2026-10-16', classes, [slot], [{ ...move, teacherId: 'sub', roomId: 'new' }])[0],
    ).toMatchObject({ teacherId: 'sub', roomId: 'new' });
  });
  it('rejects duplicate cancellation and protects already recorded attendance', () => {
    const cancel = { ...move, kind: 'cancel' as const, date: '2026-10-13' };
    expect(
      validateScheduleChange({ ...cancel, id: 'again' }, classes, [slot], [cancel], []),
    ).toMatch(/Buổi gốc/);
    const attendance = [
      { id: 'att', classId: 'a', date: '2026-10-13', lessonTopic: '', entries: [] },
    ] as AttendanceSession[];
    expect(validateScheduleChange(move, classes, [slot], [], attendance)).toMatch(/đã điểm danh/);
  });
});
describe('due dates and enrollment history', () => {
  const receipt = { ...initialTuitionReceipts[0], debtAmount: 100, dueDate: '2026-10-13' };
  it('distinguishes overdue, due today, future and unknown; paid receipts are never overdue', () => {
    expect(tuitionDueStatus(receipt, '2026-10-14')).toBe('overdue');
    expect(tuitionDueStatus(receipt, '2026-10-13')).toBe('soon');
    expect(tuitionDueStatus(receipt, '2026-10-01')).toBe('later');
    expect(tuitionDueStatus({ ...receipt, dueDate: undefined }, '2026-10-13')).toBe('unknown');
    expect(tuitionDueStatus({ ...receipt, debtAmount: 0 }, '2026-10-14')).toBe('paid');
  });
  it('captures the old class before a transfer, and keeps separate history when returning', () => {
    const original = {
      ...initialStudents[0],
      classId: 'a',
      status: 'active' as const,
      enrollDate: '2026-10-01',
    };
    const next = { ...original, classId: 'b' };
    const history = updateEnrollmentHistory([], original, next, '2026-10-13');
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      classId: 'a',
      status: 'transferred',
      startDate: '2026-10-01',
      endDate: '2026-10-13',
    });
    const returned = updateEnrollmentHistory(history, next, original, '2026-10-20');
    expect(returned).toHaveLength(3);
    expect(returned.filter((e) => e.classId === 'a')).toHaveLength(2);
  });
  it('does not create a new enrollment when editing contact information after completion', () => {
    const original = { ...initialStudents[0], classId: 'a' };
    const history = [
      {
        id: 'e',
        studentId: original.id,
        classId: 'a',
        status: 'completed' as const,
        endDate: '2026-10-12',
      },
    ];
    expect(
      updateEnrollmentHistory(history, original, { ...original, phone: '123' }, '2026-10-13'),
    ).toEqual(history);
  });
  it('keeps old backups compatible and round-trips all new operational data', () => {
    const old = { settings: initialSettings };
    const legacy = parseCenterData(old, initialSettings);
    expect(legacy.enrollments).toEqual([]);
    expect(legacy.scheduleChanges).toEqual([]);
    const data = {
      ...legacy,
      classes,
      scheduleChanges: [move],
      receipts: [receipt],
      enrollments: [{ id: 'e', studentId: 's', classId: 'a', status: 'active' as const }],
    };
    expect(
      parseBackupArchive(
        JSON.parse(JSON.stringify({ app: 'BEEZONE', schemaVersion: 1, data })),
        initialSettings,
      ).data,
    ).toEqual(data);
    expect(() =>
      parseCenterData(
        { ...data, scheduleChanges: [{ ...move, endTime: '19:99' }] },
        initialSettings,
      ),
    ).toThrow(/Giờ/);
    expect(() =>
      parseCenterData(
        { ...data, receipts: [{ ...receipt, dueDate: '2026-02-30' }] },
        initialSettings,
      ),
    ).toThrow(/Hạn/);
  });
});
