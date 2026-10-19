// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionTuitionManager } from '../src/modules/tuition/SessionTuitionManager';
import { AttendanceManager } from '../src/modules/attendance/AttendanceManager';
import { TuitionManager } from '../src/modules/tuition/TuitionManager';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import { withUnbilledSessionReceipts } from '../src/lib/sessionBilling';
import * as initial from '../src/mock/initialData';
import type { AttendanceSession, ClassRoom, TuitionReceipt } from '../src/types';
const classroom: ClassRoom = {
  ...initial.initialClasses[0],
  id: 'c',
  billingMode: 'session',
  sessionRate: 150000,
  sessionBillingStartDate: '2026-10-01',
  sessionAbsencePolicy: 'attended',
};
const student = {
  ...initial.initialStudents[0],
  id: 's',
  classId: 'c',
  name: 'Học viên thử nghiệm',
};
const sessions: AttendanceSession[] = ['2026-10-06', '2026-10-09'].map((date) => ({
  id: date,
  classId: 'c',
  date,
  lessonTopic: 'Speaking',
  entries: [{ studentId: 's', status: 'present' }],
  billing: { unitPrice: 150000, absencePolicy: 'attended' },
}));
const props = {
  sessions,
  receipts: [],
  students: [student],
  classes: [classroom],
  canCollect: true,
  showDebt: true,
  onCreate: vi.fn(),
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
it('selects specific lessons and creates a partial payment with a real payment date', () => {
  const onCreate = vi.fn();
  render(<SessionTuitionManager {...props} onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Chọn buổi và thu tiền' }));
  fireEvent.click(screen.getByLabelText('Chọn buổi 2026-10-06'));
  fireEvent.change(screen.getByLabelText('Số tiền đã thu theo buổi'), {
    target: { value: '50000' },
  });
  fireEvent.change(screen.getByLabelText('Ngày thu tiền theo buổi'), {
    target: { value: '2026-10-12' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu phiếu theo buổi' }));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      paymentKind: 'session',
      sessionFee: 150000,
      courseFee: 0,
      monthlyFee: 0,
      paidAmount: 50000,
      debtAmount: 100000,
      paymentDate: '2026-10-12',
      sessionLines: [{ attendanceSessionId: '2026-10-09', date: '2026-10-09', unitPrice: 150000 }],
      installments: [expect.objectContaining({ date: '2026-10-12', amount: 50000 })],
    }),
  );
});
it('rejects stale collection if another invoice now covers that lesson', () => {
  const onCreate = vi.fn();
  const view = render(<SessionTuitionManager {...props} onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Chọn buổi và thu tiền' }));
  const real = { ...withUnbilledSessionReceipts([], sessions)[0], id: 'r', code: 'PT-2026-0001' };
  view.rerender(<SessionTuitionManager {...props} receipts={[real]} onCreate={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Lưu phiếu theo buổi' }));
  expect(onCreate).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toMatch(/lần thứ hai/);
});
it('opens unbilled lessons directly from an overdue task and respects read-only access', () => {
  const onRequestHandled = vi.fn();
  const id = withUnbilledSessionReceipts([], sessions)[0].id;
  render(
    <SessionTuitionManager
      {...props}
      requestId={id}
      onRequestHandled={onRequestHandled}
      canCollect={false}
      showDebt={false}
    />,
  );
  expect(screen.getByRole('dialog', { name: 'Thu học phí theo buổi' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Lưu phiếu theo buổi' })).toBeNull();
  expect(screen.queryByText(/150\.000/)).toBeNull();
  expect(onRequestHandled).toHaveBeenCalledTimes(1);
});
it('captures the class price when saving attendance and preserves an old price', () => {
  const onSave = vi.fn();
  const props = {
    classes: [classroom],
    students: [student],
    teachers: [],
    attendanceSessions: [],
    onSaveSession: onSave,
    isOwner: true,
  };
  const view = render(<AttendanceManager {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Lưu.*điểm danh/i }));
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ billing: { unitPrice: 150000, absencePolicy: 'attended' } }),
  );
  view.rerender(
    <AttendanceManager
      {...props}
      classes={[{ ...classroom, sessionRate: 200000 }]}
      attendanceSessions={[{ ...sessions[0], date: '2026-10-13' }]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Lưu.*điểm danh/i }));
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ billing: { unitPrice: 150000, absencePolicy: 'attended' } }),
  );
});
it('does not charge a legacy attendance edit without an explicit owner choice', () => {
  const onSave = vi.fn();
  render(
    <AttendanceManager
      classes={[classroom]}
      students={[student]}
      teachers={[]}
      attendanceSessions={[{ ...sessions[0], date: '2026-10-13', billing: undefined }]}
      onSaveSession={onSave}
      isOwner
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Lưu.*điểm danh/i }));
  expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ billing: undefined }));
  fireEvent.click(screen.getByLabelText('Ghi nhận học phí cho buổi cũ này theo đơn giá hiện tại'));
  fireEvent.click(screen.getByRole('button', { name: /Lưu.*điểm danh/i }));
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ billing: { unitPrice: 150000, absencePolicy: 'attended' } }),
  );
});
it('updates the deadline of a session invoice without altering the billed lessons', () => {
  const receipt: TuitionReceipt = {
    ...withUnbilledSessionReceipts([], sessions)[0],
    id: 'r',
    code: 'PT-2026-0001',
    paidAmount: 50000,
    debtAmount: 250000,
    status: 'partial',
    installments: [{ id: 'i', date: '2026-10-10', amount: 50000 }],
  };
  const onUpdate = vi.fn();
  render(
    <TuitionManager
      receipts={[receipt]}
      attendanceSessions={sessions}
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
  fireEvent.change(screen.getByLabelText('Hạn thanh toán phiếu theo buổi', { selector: 'input' }), {
    target: { value: '2026-10-20' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu hạn thanh toán' }));
  expect(onUpdate).toHaveBeenCalledWith({ ...receipt, dueDate: '2026-10-20' });
});

it('opens payment reminders from the compact section without losing receipt editing', () => {
  const receipt: TuitionReceipt = {
    ...withUnbilledSessionReceipts([], sessions)[0],
    id: 'r',
    code: 'PT-2026-0001',
  };
  render(
    <TuitionManager
      receipts={[receipt]}
      attendanceSessions={sessions}
      students={[student]}
      classes={[classroom]}
      programs={initial.initialPrograms}
      settings={initial.initialSettings}
      permissions={DEV_OWNER_ACCOUNT.permissions}
      isOwner
      onAddReceipt={vi.fn()}
      onUpdateReceipt={vi.fn()}
      onDeleteReceipt={vi.fn()}
    />,
  );
  const summary = screen.getByText(/Nhắc hạn thanh toán · 1 phiếu còn nợ/);
  const section = summary.closest('details')!;
  expect(section.open).toBe(false);
  fireEvent.click(summary);
  expect(section.open).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Mở phiếu' }));
  expect(screen.getByRole('dialog', { name: 'Điều chỉnh hạn thanh toán' })).toBeTruthy();
  expect(screen.getByLabelText('Hạn thanh toán phiếu theo buổi').getAttribute('value')).toBe(
    '2026-10-06',
  );
});

it('displays active unpaid students in TuitionManager with quick collect button', () => {
  const unpaidStudent = {
    ...initial.initialStudents[0],
    id: 'hs-unpaid',
    name: 'Trương Gia Bảo',
    code: 'HS001',
    status: 'active' as const,
    feeStatus: 'unpaid' as const,
    programId: initial.initialPrograms[0].id,
    classId: initial.initialClasses[0].id,
  };
  render(
    <TuitionManager
      receipts={[]}
      attendanceSessions={[]}
      students={[unpaidStudent]}
      classes={initial.initialClasses}
      programs={initial.initialPrograms}
      settings={initial.initialSettings}
      permissions={DEV_OWNER_ACCOUNT.permissions}
      isOwner
      onAddReceipt={vi.fn()}
      onUpdateReceipt={vi.fn()}
      onDeleteReceipt={vi.fn()}
    />,
  );

  expect(screen.getByRole('region', { name: 'Học viên cần thu học phí' })).toBeTruthy();
  expect(screen.getByText('Trương Gia Bảo')).toBeTruthy();
  expect(screen.getByText('HS001')).toBeTruthy();

  const collectButton = screen.getByRole('button', { name: 'Thu học phí' });
  fireEvent.click(collectButton);

  expect(screen.getByText('Lập Phiếu Thu Học Phí')).toBeTruthy();
  expect(screen.getByDisplayValue(/Trương Gia Bảo/)).toBeTruthy();
});
