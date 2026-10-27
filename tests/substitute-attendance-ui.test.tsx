// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { centerDate } from '../src/lib/dates';
import { addDays, weekdayForDate } from '../src/lib/operations';
import { createRolePermissions } from '../src/lib/permissions';
import { AttendanceManager } from '../src/modules/attendance/AttendanceManager';
import type { ClassRoom, ScheduleChange, Teacher, UserAccount } from '../src/types';

afterEach(cleanup);

describe('substitute attendance screen', () => {
  it('shows the handed-over session but not attendance history from other dates', () => {
    const date = centerDate();
    const previousDate = addDays(date, -7);
    const weekday = weekdayForDate(date);
    const classroom: ClassRoom = {
      id: 'class-a', code: 'A', name: 'Class A', programId: 'program', teacherId: 'teacher-a',
      roomId: 'room', scheduleTime: '18:00 - 19:30', days: [weekday], capacity: 20, studentIds: [],
    };
    const teachers: Teacher[] = [
      { id: 'teacher-a', name: 'Teacher A', email: 'a@beezone.test', phone: '', address: '', specialty: '', assignedClassIds: ['class-a'] },
      { id: 'teacher-b', name: 'Teacher B', email: 'b@beezone.test', phone: '', address: '', specialty: '', assignedClassIds: [] },
    ];
    const user: UserAccount = {
      id: 'account-b', name: 'Teacher B', email: 'b@beezone.test', avatar: '', role: 'teacher', active: true,
      permissions: { ...createRolePermissions('teacher'), teacherId: 'teacher-b', assignedClassIds: [] },
    };
    const changes: ScheduleChange[] = [{
      id: 'off', classId: classroom.id, kind: 'teacher_off', date, sourceSlotId: 'slot-a',
      startTime: '18:00', endTime: '19:30', teacherId: 'teacher-a', substituteTeacherId: 'teacher-b',
      roomId: 'room', reason: 'Teacher A is off',
    }];

    render(
      <AttendanceManager
        classes={[classroom]}
        students={[]}
        teachers={teachers}
        attendanceSessions={[
          { id: 'today', classId: classroom.id, date, teacherId: 'teacher-b', lessonTopic: 'Today', entries: [] },
          { id: 'previous', classId: classroom.id, date: previousDate, teacherId: 'teacher-a', lessonTopic: 'Previous', entries: [] },
        ]}
        timetableSlots={[{
          id: 'slot-a', classId: classroom.id, teacherId: 'teacher-a', roomId: 'room', dayOfWeek: weekday,
          startTime: '18:00', endTime: '19:30',
        }]}
        scheduleChanges={changes}
        onSaveSession={vi.fn()}
        isOwner={false}
        currentUser={user}
      />,
    );

    expect(screen.getByText(/Bạn được bàn giao lớp/)).toBeTruthy();
    expect(screen.getByText(/Dạy thay hôm nay:/)).toBeTruthy();
    expect(screen.getByText(/Lịch Sử Các Buổi Đã Điểm Danh Của Lớp \(1 buổi\)/)).toBeTruthy();
    expect(screen.queryByText(previousDate)).toBeNull();
  });
});
