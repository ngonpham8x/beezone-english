import { describe, expect, it } from 'vitest';
import { createRolePermissions } from '../src/lib/permissions';
import {
  canEditAttendanceClass,
  canShareSessionReview,
  canViewAttendanceClass,
  hasRegularAttendanceClassAccess,
  isSubstituteTeacherForClassOnDate,
} from '../src/modules/attendance/access';
import type { ClassRoom, ScheduleChange, Teacher, UserAccount } from '../src/types';

const classroom: ClassRoom = {
  id: 'class-a',
  code: 'A',
  name: 'Class A',
  programId: 'program',
  teacherId: 'teacher-a',
  roomId: 'room',
  scheduleTime: '18:00 - 19:30',
  days: ['Thứ 3'],
  capacity: 20,
  studentIds: [],
};

const teachers: Teacher[] = [
  { id: 'teacher-a', name: 'Teacher A', email: 'a@beezone.test', phone: '', address: '', specialty: '', assignedClassIds: ['class-a'] },
  { id: 'teacher-b', name: 'Teacher B', email: 'b@beezone.test', phone: '', address: '', specialty: '', assignedClassIds: [] },
];

const substitute: UserAccount = {
  id: 'account-b',
  name: 'Teacher B',
  email: 'b@beezone.test',
  avatar: '',
  role: 'teacher',
  active: true,
  permissions: { ...createRolePermissions('teacher'), teacherId: 'teacher-b', assignedClassIds: [] },
};

const change: ScheduleChange = {
  id: 'off-a',
  classId: classroom.id,
  kind: 'teacher_off',
  date: '2026-10-27',
  sourceSlotId: 'slot-a',
  startTime: '18:00',
  endTime: '19:30',
  teacherId: 'teacher-a',
  substituteTeacherId: 'teacher-b',
  roomId: 'room',
  reason: 'Teacher A is off',
};

describe('substitute attendance access', () => {
  it('grants attendance and parent-sharing access only for the approved class date', () => {
    const approved = { date: change.date, scheduleChanges: [change], teachers };
    const anotherDate = { ...approved, date: '2026-10-28' };

    expect(hasRegularAttendanceClassAccess(substitute, classroom)).toBe(false);
    expect(isSubstituteTeacherForClassOnDate(substitute, classroom, approved)).toBe(true);
    expect(canViewAttendanceClass(substitute, classroom, approved)).toBe(true);
    expect(canEditAttendanceClass(substitute, classroom, approved)).toBe(true);
    expect(canShareSessionReview(substitute, classroom, false, approved)).toBe(true);

    expect(isSubstituteTeacherForClassOnDate(substitute, classroom, anotherDate)).toBe(false);
    expect(canViewAttendanceClass(substitute, classroom, anotherDate)).toBe(false);
    expect(canEditAttendanceClass(substitute, classroom, anotherDate)).toBe(false);
  });

  it('resolves the substitute teacher by account email without granting permanent assignment', () => {
    const accountWithoutTeacherId: UserAccount = {
      ...substitute,
      permissions: { ...substitute.permissions, teacherId: undefined },
    };
    const approved = { date: change.date, scheduleChanges: [change], teachers };

    expect(isSubstituteTeacherForClassOnDate(accountWithoutTeacherId, classroom, approved)).toBe(true);
    expect(hasRegularAttendanceClassAccess(accountWithoutTeacherId, classroom)).toBe(false);
  });
});
