// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TodayTasks } from '../src/modules/dashboard/TodayTasks';
import { ScheduleChangesManager } from '../src/modules/timetable/ScheduleChangesManager';
import { TuitionDuePanel } from '../src/modules/tuition/TuitionDuePanel';
import { AttendanceManager } from '../src/modules/attendance/AttendanceManager';
import { ClassManager } from '../src/modules/classes/ClassManager';
import { TuitionManager } from '../src/modules/tuition/TuitionManager';
import { LanguageProvider } from '../src/context/LanguageContext';
import * as initial from '../src/mock/initialData';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import type { TimetableSlot } from '../src/types';

const classroom = {
  ...initial.initialClasses[0],
  id: 'a',
  startDate: '2026-10-01',
  endDate: '2026-10-25',
};
const student = { ...initial.initialStudents[0], id: 's', classId: 'a', status: 'active' as const };
const slot: TimetableSlot = {
  id: 'slot',
  classId: 'a',
  dayOfWeek: 'Thứ 3',
  startTime: '18:00',
  endTime: '19:30',
  teacherId: classroom.teacherId,
  roomId: classroom.roomId,
};
const receipt = {
  ...initial.initialTuitionReceipts[0],
  id: 'r',
  studentId: 's',
  classId: 'a',
  debtAmount: 300,
  dueDate: '2026-10-12',
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T05:00:00Z'));
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('opens the exact class/date and receipt from today tasks', () => {
  const onOpen = vi.fn();
  render(
    <TodayTasks
      classes={[classroom]}
      students={[student]}
      slots={[slot]}
      changes={[]}
      attendance={[]}
      receipts={[receipt]}
      teachers={initial.initialTeachers}
      user={DEV_OWNER_ACCOUNT}
      onOpen={onOpen}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Chưa điểm danh/ }));
  expect(onOpen).toHaveBeenLastCalledWith({ tab: 'attendance', classId: 'a', date: '2026-10-13' });
  fireEvent.click(screen.getByRole('button', { name: /Quá hạn/ }));
  expect(onOpen).toHaveBeenLastCalledWith({ tab: 'tuition', receiptId: 'r' });
});
it('hides debt tasks when the user has no debt-reading permission', () => {
  const user = {
    ...DEV_OWNER_ACCOUNT,
    role: 'staff' as const,
    permissions: {
      ...DEV_OWNER_ACCOUNT.permissions,
      tuition: { ...DEV_OWNER_ACCOUNT.permissions.tuition, showDebt: false },
    },
  };
  render(
    <TodayTasks
      classes={[classroom]}
      students={[student]}
      slots={[slot]}
      changes={[]}
      attendance={[]}
      receipts={[receipt]}
      teachers={[]}
      user={user}
      onOpen={vi.fn()}
    />,
  );
  expect(screen.queryByText(/Học phí cần nhắc/)).toBeNull();
  expect(screen.queryByText(/300 đ/)).toBeNull();
});
it('detects consecutive absences and resets that warning after attending', () => {
  const attendance = ['2026-10-06', '2026-10-09'].map((date) => ({
    id: date,
    classId: 'a',
    date,
    lessonTopic: '',
    entries: [{ studentId: 's', status: 'absent' as const }],
  }));
  const props = {
    classes: [classroom],
    students: [student],
    slots: [slot],
    changes: [],
    attendance,
    receipts: [],
    teachers: [],
    user: DEV_OWNER_ACCOUNT,
    onOpen: vi.fn(),
  };
  const view = render(<TodayTasks {...props} />);
  expect(screen.getByText('Nghỉ 2 buổi liên tiếp (1)')).toBeTruthy();
  view.rerender(
    <TodayTasks
      {...props}
      attendance={[
        ...attendance,
        {
          id: 'present',
          classId: 'a',
          date: '2026-10-13',
          lessonTopic: '',
          entries: [{ studentId: 's', status: 'present' }],
        },
      ]}
    />,
  );
  expect(screen.getByText('Nghỉ 2 buổi liên tiếp (0)')).toBeTruthy();
});
it('saves a dated cancellation with the actual source teacher and room', () => {
  const onSave = vi.fn(() => null);
  render(
    <ScheduleChangesManager
      classes={[classroom]}
      slots={[slot]}
      changes={[]}
      attendance={[]}
      teachers={initial.initialTeachers}
      rooms={initial.initialRooms}
      isOwner
      onSave={onSave}
      onDelete={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Nghỉ / đổi / học bù' }));
  fireEvent.change(screen.getByLabelText('Buổi gốc'), { target: { value: 'slot' } });
  fireEvent.change(screen.getByLabelText('Lý do điều chỉnh'), { target: { value: 'Nghỉ lễ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu điều chỉnh' }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'cancel',
      date: '2026-10-13',
      sourceSlotId: 'slot',
      teacherId: slot.teacherId,
      roomId: slot.roomId,
    }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('lets staff view a dated schedule without schedule editing controls', () => {
  render(
    <ScheduleChangesManager
      classes={[classroom]}
      slots={[slot]}
      changes={[]}
      attendance={[]}
      teachers={[]}
      rooms={[]}
      isOwner={false}
      onSave={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Nghỉ / đổi / học bù' })).toBeNull();
  expect(screen.getByText(classroom.name)).toBeTruthy();
});
it('prevents attendance being saved for a cancelled lesson', () => {
  const onSave = vi.fn();
  const changes = [
    {
      ...slot,
      id: 'cancel',
      kind: 'cancel' as const,
      date: '2026-10-13',
      sourceSlotId: 'slot',
      reason: 'Nghỉ lễ',
    },
  ];
  render(
    <AttendanceManager
      classes={[classroom]}
      students={[student]}
      teachers={[]}
      attendanceSessions={[]}
      timetableSlots={[slot]}
      scheduleChanges={changes}
      onSaveSession={onSave}
      isOwner
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Lưu.*điểm danh/i }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText(/Ngày này không có buổi học/)).toBeTruthy();
});
it('keeps the old roster before a future transfer and excludes a new enrollment before its start', () => {
  const history = [
    {
      id: 'old',
      studentId: 's',
      classId: 'a',
      status: 'transferred' as const,
      startDate: '2026-10-01',
      endDate: '2026-10-20',
    },
    { id: 'new', studentId: 's', classId: 'b', status: 'active' as const, startDate: '2026-10-20' },
  ];
  const onSave = vi.fn();
  render(
    <AttendanceManager
      classes={[classroom, { ...classroom, id: 'b', name: 'New course' }]}
      students={[{ ...student, classId: 'b' }]}
      teachers={[]}
      attendanceSessions={[]}
      enrollments={history}
      timetableSlots={[slot]}
      onSaveSession={onSave}
      isOwner
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Lưu.*điểm danh/i }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      classId: 'a',
      entries: [expect.objectContaining({ studentId: 's' })],
    }),
  );
});
it('saves a payment deadline without changing payments or installment history', () => {
  const onUpdate = vi.fn();
  const existing = {
    ...receipt,
    paymentKind: 'course' as const,
    billingPeriod: 'Khóa A',
    courseFee: 1000,
    monthlyFee: 0,
    discount: 0,
    paidAmount: 600,
    debtAmount: 400,
    installments: [{ id: 'p', date: '2026-10-01', amount: 600 }],
  };
  const view = render(
    <TuitionManager
      receipts={[existing]}
      students={[student]}
      classes={[classroom]}
      programs={initial.initialPrograms}
      settings={initial.initialSettings}
      permissions={DEV_OWNER_ACCOUNT.permissions}
      isOwner
      requestReceiptId="r"
      onAddReceipt={vi.fn()}
      onUpdateReceipt={onUpdate}
      onDeleteReceipt={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Hạn thanh toán'), { target: { value: '2026-10-20' } });
  fireEvent.submit(view.container.querySelector('form')!);
  fireEvent.click(screen.getByRole('button', { name: 'Có, hoàn thành' }));
  expect(onUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      dueDate: '2026-10-20',
      paidAmount: 600,
      debtAmount: 400,
      installments: existing.installments,
    }),
  );
});
it('shows unknown due dates separately and creates an editable parent reminder', () => {
  render(
    <TuitionDuePanel
      receipts={[receipt, { ...receipt, id: 'unknown', dueDate: undefined }]}
      students={[student]}
      settings={initial.initialSettings}
      onOpen={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Chưa đặt hạn (1)' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Soạn lời nhắc' }));
  expect((screen.getByLabelText('Nội dung nhắc học phí') as HTMLTextAreaElement).value).toContain(
    '12/10/2026',
  );
  fireEvent.change(screen.getByLabelText('Nội dung nhắc học phí'), {
    target: { value: 'Nội dung đã kiểm tra' },
  });
  expect((screen.getByLabelText('Nội dung nhắc học phí') as HTMLTextAreaElement).value).toBe(
    'Nội dung đã kiểm tra',
  );
});
it('rejects an invalid course period before changing class or recurring schedule', () => {
  const onUpdate = vi.fn();
  const onReplace = vi.fn();
  const view = render(
    <LanguageProvider>
      <ClassManager
        classes={[classroom]}
        teachers={initial.initialTeachers}
        rooms={initial.initialRooms}
        programs={initial.initialPrograms}
        students={[]}
        receipts={[]}
        timetableSlots={[slot]}
        permissions={DEV_OWNER_ACCOUNT.permissions}
        isOwner
        searchQuery=""
        editRequest={classroom}
        onAddClass={vi.fn()}
        onUpdateClass={onUpdate}
        onDeleteClass={vi.fn()}
        onReplaceClassSchedule={onReplace}
        onCreateRoom={vi.fn()}
        onCreateProgram={vi.fn()}
      />
    </LanguageProvider>,
  );
  fireEvent.change(screen.getByLabelText('Ngày kết thúc'), { target: { value: '2026-09-01' } });
  fireEvent.submit(view.container.querySelector('form')!);
  expect(onUpdate).not.toHaveBeenCalled();
  expect(onReplace).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('Ngày kết thúc');
});
