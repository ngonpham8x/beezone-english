// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionTuitionManager } from '../src/modules/tuition/SessionTuitionManager';
import { AttendanceManager } from '../src/modules/attendance/AttendanceManager';
import { TuitionManager } from '../src/modules/tuition/TuitionManager';
import { ReceiptPreview } from '../src/modules/tuition/ReceiptPreview';
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
  const summary = screen.getByText(/Nhắc hạn thanh toán · 1 phiếu chưa hoàn thành/);
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

it('defaults a new receipt to course tuition and stores SHĐ/Quyển', () => {
  const program = { ...initial.initialPrograms[0], id: 'program-monthly', tuitionFee: 5_400_000 };
  const monthlyClass = {
    ...initial.initialClasses[0],
    id: 'class-monthly',
    programId: program.id,
    billingMode: 'monthly' as const,
  };
  const learner = {
    ...initial.initialStudents[0],
    id: 'student-monthly',
    classId: monthlyClass.id,
    programId: program.id,
    feeStatus: 'unpaid' as const,
  };
  const onAddReceipt = vi.fn();
  render(
    <TuitionManager
      receipts={[]}
      attendanceSessions={[]}
      students={[learner]}
      classes={[monthlyClass]}
      programs={[program]}
      settings={initial.initialSettings}
      permissions={DEV_OWNER_ACCOUNT.permissions}
      isOwner
      onAddReceipt={onAddReceipt}
      onUpdateReceipt={vi.fn()}
      onDeleteReceipt={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Thu học phí' }));
  expect((screen.getByLabelText('Khoản Thu') as HTMLSelectElement).value).toBe('course');
  expect((screen.getByLabelText('Học Phí Khóa (VNĐ)') as HTMLInputElement).value).toBe('5400000');
  fireEvent.change(screen.getByLabelText('Số Hóa Đơn (SHĐ)'), { target: { value: '00125' } });
  fireEvent.change(screen.getByLabelText('Quyển Số'), { target: { value: '03' } });
  fireEvent.click(screen.getByRole('button', { name: /Hoàn Thành Lập Phiếu/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Có, hoàn thành' }));

  expect(onAddReceipt).toHaveBeenCalledWith(expect.objectContaining({
    paymentKind: 'course',
    courseFee: 5_400_000,
    invoiceNo: '00125',
    bookNo: '03',
    invoiceBook: '00125 / 03',
    installments: [expect.objectContaining({ invoiceNo: '00125', bookNo: '03' })],
  }));
});

it('always shows the remaining amount and each installment SHĐ/Quyển on the receipt', () => {
  const courseClass = { ...initial.initialClasses[0], id: 'course-receipt', billingMode: 'course' as const };
  const learner = { ...initial.initialStudents[0], id: 'receipt-student', classId: courseClass.id };
  const receipt: TuitionReceipt = {
    id: 'receipt-complete',
    code: 'PT-2026-0100',
    invoiceNo: '00126',
    bookNo: '03',
    invoiceBook: '00126 / 03',
    studentId: learner.id,
    classId: courseClass.id,
    courseFee: 5_400_000,
    paymentKind: 'course',
    billingPeriod: 'Khóa 2026',
    discount: 0,
    paidAmount: 5_400_000,
    debtAmount: 0,
    status: 'paid',
    paymentDate: '2026-10-13',
    collectorName: 'Chủ trung tâm',
    paymentMethod: 'Tiền mặt',
    installments: [
      { id: 'i1', date: '2026-10-01', amount: 2_000_000, invoiceNo: '00125', bookNo: '03' },
      { id: 'i2', date: '2026-10-13', amount: 3_400_000, invoiceNo: '00126', bookNo: '03' },
    ],
  };
  render(
    <ReceiptPreview
      receipt={receipt}
      settings={initial.initialSettings}
      students={[learner]}
      classes={[courseClass]}
      onClose={vi.fn()}
      onCollectInstallment={vi.fn()}
    />,
  );

  const dialog = screen.getByRole('dialog', { name: 'In phiếu thu' });
  expect(within(dialog).getByText(/Số tiền còn lại:/)).toBeTruthy();
  expect(within(dialog).getByText('Đã hoàn thành')).toBeTruthy();
  expect(within(dialog).getByText('13/10/2026')).toBeTruthy();
  expect(within(dialog).getByText(/Đợt 1 \(01\/10\/2026\):/)).toBeTruthy();
  expect(within(dialog).getByText(/Đợt 2 \(13\/10\/2026\):/)).toBeTruthy();
  expect(within(dialog).getByText(/· SHĐ\/Quyển: 00125 \/ 03/)).toBeTruthy();
  expect(within(dialog).getByText(/· SHĐ\/Quyển: 00126 \/ 03/)).toBeTruthy();
  expect(within(dialog).getAllByText(/SHĐ\/Quyển: 0012[56] \/ 03/)).toHaveLength(3);
  expect((document.querySelector('[data-print-receipt]') as HTMLElement).style.fontSize).toBe('13pt');

  const installment1Toggle = within(dialog).getByRole('checkbox', { name: 'In đợt 1 ngày 01/10/2026' }) as HTMLInputElement;
  const installment2Toggle = within(dialog).getByRole('checkbox', { name: 'In đợt 2 ngày 13/10/2026' }) as HTMLInputElement;
  const selectAllToggle = within(dialog).getByRole('checkbox', { name: 'Chọn tất cả các đợt để in' }) as HTMLInputElement;
  const printButton = within(dialog).getByRole('button', { name: /In Phiếu Thu/ }) as HTMLButtonElement;
  expect(installment1Toggle.checked).toBe(true);
  expect(installment2Toggle.checked).toBe(true);
  expect(selectAllToggle.checked).toBe(true);

  fireEvent.click(installment1Toggle);
  expect(within(dialog).getByText('Chi tiết các đợt đóng tiền (1 đợt đã chọn)')).toBeTruthy();
  expect(installment1Toggle.closest('[data-print-installment-selected]')?.getAttribute('data-print-installment-selected')).toBe('false');
  expect(installment2Toggle.closest('[data-print-installment-selected]')?.getAttribute('data-print-installment-selected')).toBe('true');
  expect(selectAllToggle.checked).toBe(false);
  expect(printButton.disabled).toBe(false);

  fireEvent.click(installment2Toggle);
  expect(within(dialog).getByText('Chi tiết các đợt đóng tiền (0 đợt đã chọn)')).toBeTruthy();
  expect(printButton.disabled).toBe(true);

  fireEvent.click(selectAllToggle);
  expect(installment1Toggle.checked).toBe(true);
  expect(installment2Toggle.checked).toBe(true);
  expect(printButton.disabled).toBe(false);
});

it('preserves distinct SHĐ/Quyển for installment 1 and installment 2 when paying subsequent installments', () => {
  const courseClass = { ...initial.initialClasses[0], id: 'course-class-inst', billingMode: 'course' as const };
  const learner = { ...initial.initialStudents[0], id: 'student-inst', classId: courseClass.id };
  const partialReceipt: TuitionReceipt = {
    id: 'receipt-partial-inst',
    code: 'PT-2026-0005',
    invoiceNo: '5',
    bookNo: '1',
    invoiceBook: '5 / 1',
    studentId: learner.id,
    classId: courseClass.id,
    courseFee: 3_300_000,
    paymentKind: 'course',
    billingPeriod: 'Khóa 2026',
    discount: 0,
    paidAmount: 1_200_000,
    debtAmount: 2_100_000,
    status: 'partial',
    paymentDate: '2026-10-26',
    collectorName: 'Bích Tuyền',
    paymentMethod: 'Tiền mặt',
    installments: [
      {
        id: 'i1',
        date: '2026-10-26',
        amount: 1_200_000,
        paymentMethod: 'Tiền mặt',
        collectorName: 'Bích Tuyền',
        invoiceNo: '5',
        bookNo: '1',
        invoiceBook: '5 / 1',
      },
    ],
  };

  const onUpdateReceipt = vi.fn();
  render(
    <TuitionManager
      receipts={[partialReceipt]}
      attendanceSessions={[]}
      students={[learner]}
      classes={[courseClass]}
      programs={initial.initialPrograms}
      settings={initial.initialSettings}
      permissions={DEV_OWNER_ACCOUNT.permissions}
      isOwner
      onAddReceipt={vi.fn()}
      onUpdateReceipt={onUpdateReceipt}
      onDeleteReceipt={vi.fn()}
    />,
  );

  // Click on "Thu tiếp" button in the receipt row
  fireEvent.click(screen.getByRole('button', { name: /Thu tiếp/i }));

  expect(screen.getByText('Thu Học Phí Đợt Tiếp Theo / Đóng Đợt Cuối')).toBeTruthy();
  expect(screen.getByText(/Lịch sử các đợt đã đóng/)).toBeTruthy();
  expect(screen.getByText(/SHĐ\/Quyển: 5 \/ 1/)).toBeTruthy();

  // Enter SHĐ 6 and Quyển 1 for installment 2
  fireEvent.change(screen.getByLabelText('Số Hóa Đơn (SHĐ) đợt này'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('Quyển Số đợt này'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: /Xác Nhận Thu Tiền/i }));

  expect(onUpdateReceipt).toHaveBeenCalledWith(
    expect.objectContaining({
      paidAmount: 3_300_000,
      debtAmount: 0,
      status: 'paid',
      invoiceBook: '6 / 1',
      installments: [
        expect.objectContaining({ amount: 1_200_000, invoiceBook: '5 / 1' }),
        expect.objectContaining({ amount: 2_100_000, invoiceBook: '6 / 1' }),
      ],
    }),
  );
});

it('keeps the paid total read-only when editing a receipt with multiple installments', () => {
  const courseClass = { ...initial.initialClasses[0], id: 'course-class-edit', billingMode: 'course' as const };
  const learner = { ...initial.initialStudents[0], id: 'student-edit', classId: courseClass.id };
  const receipt: TuitionReceipt = {
    id: 'receipt-edit-installments', code: 'PT-2026-0006', studentId: learner.id, classId: courseClass.id,
    courseFee: 3_300_000, paymentKind: 'course', billingPeriod: 'Khóa 2026', discount: 0,
    paidAmount: 2_000_000, debtAmount: 1_300_000, status: 'partial', paymentDate: '2026-10-26',
    collectorName: 'Hành chính', paymentMethod: 'Tiền mặt',
    installments: [
      { id: 'i1', date: '2026-10-20', amount: 1_200_000, invoiceNo: '5', bookNo: '1' },
      { id: 'i2', date: '2026-10-26', amount: 800_000, invoiceNo: '6', bookNo: '1' },
    ],
  };
  render(
    <TuitionManager
      receipts={[receipt]} attendanceSessions={[]} students={[learner]} classes={[courseClass]}
      programs={initial.initialPrograms} settings={initial.initialSettings}
      permissions={DEV_OWNER_ACCOUNT.permissions} isOwner onAddReceipt={vi.fn()}
      onUpdateReceipt={vi.fn()} onDeleteReceipt={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
  const total = screen.getByLabelText('Tổng Đã Đóng (VNĐ)') as HTMLInputElement;
  expect(total.value).toBe('2000000');
  expect(total.disabled).toBe(true);
  expect(screen.getByText(/dùng “Thu tiếp” để thêm khoản thanh toán/i)).toBeTruthy();
});

it('lists both classes in tuition debt and opens collection for the unpaid second class', () => {
  const programs = initial.initialPrograms.slice(0, 2).map((program, index) => ({ ...program, tuitionFee: index ? 2400000 : 3400000 }));
  const classes = initial.initialClasses.slice(0, 2).map((item, index) => ({ ...item, programId: programs[index].id, billingMode: 'course' as const }));
  const learner = { ...initial.initialStudents[0], classId: classes[0].id, additionalClassIds: [classes[1].id], programId: programs[0].id, feeStatus: 'partial' as const };
  const receipt = { ...initial.initialTuitionReceipts[0], studentId: learner.id, classId: classes[0].id, paymentKind: 'course' as const, debtAmount: 3400000, paidAmount: 0 };
  render(<TuitionManager receipts={[receipt]} attendanceSessions={[]} students={[learner]} classes={classes} programs={programs}
    settings={initial.initialSettings} permissions={DEV_OWNER_ACCOUNT.permissions} isOwner
    onAddReceipt={vi.fn()} onUpdateReceipt={vi.fn()} onDeleteReceipt={vi.fn()} />);
  const pending = screen.getByRole('region', { name: 'Học viên cần thu học phí' });
  expect(within(pending).getByText('5.800.000 đ')).toBeTruthy();
  expect(within(pending).getByText('3.400.000 đ')).toBeTruthy();
  expect(within(pending).getByText('2.400.000 đ')).toBeTruthy();
  fireEvent.click(within(pending).getAllByRole('button', { name: 'Thu học phí' })[1]);
  expect((screen.getByLabelText('Lớp thu học phí *') as HTMLSelectElement).value).toBe(classes[1].id);
});
