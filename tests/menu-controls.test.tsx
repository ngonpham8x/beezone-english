// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/context/LanguageContext';
import { OWNER_PERMISSIONS } from '../src/lib/auth';
import * as initial from '../src/mock/initialData';
import { ReportView } from '../src/modules/reports/ReportView';
import { StudentManager } from '../src/modules/students/StudentManager';
import { AttendanceManager } from '../src/modules/attendance/AttendanceManager';
import { TuitionManager } from '../src/modules/tuition/TuitionManager';
import { ActivityLogView } from '../src/modules/system/ActivityLogView';
import type { TuitionReceipt } from '../src/types';
import { chooseOption } from './helpers/select';

let viewportWidth = 320;
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const max = /max-width:\s*(\d+)px/.exec(query);
      return {
        matches: Boolean(max && viewportWidth <= Number(max[1])),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const longName = 'Chương trình Cambridge luyện thi chứng chỉ quốc tế dành cho học viên tiểu học';
const programs = initial.initialPrograms.slice(0, 2).map((program, index) => ({
  ...program,
  id: `ui-program-${index}`,
  name: index === 0 ? longName : 'Chương trình khác',
}));
const classes = initial.initialClasses.slice(0, 2).map((classroom, index) => ({
  ...classroom,
  id: `ui-class-${index}`,
  programId: programs[index].id,
  name: index === 0 ? `${longName} - Lớp buổi tối` : 'Lớp khác',
}));
const students = initial.initialStudents.slice(0, 2).map((student, index) => ({
  ...student,
  id: `ui-student-${index}`,
  name: index === 0 ? 'Học viên kiểm tra' : 'Học viên khác',
  classId: classes[index].id,
  programId: programs[index].id,
  status: index === 0 ? ('active' as const) : ('reserved' as const),
}));

// jsdom checks filtering, focus and view switching; it does not measure pixel overflow.
it.each([320, 480, 820, 1366])(
  'keeps the student filters usable with long names at %spx',
  async (width) => {
    viewportWidth = width;
    render(
      <LanguageProvider>
        <StudentManager
          students={students}
          programs={programs}
          classes={classes}
          receipts={[]}
          timetableSlots={[]}
          permissions={OWNER_PERMISSIONS}
          isOwner
          searchQuery=""
          onAddStudent={vi.fn()}
          onUpdateStudent={vi.fn()}
          onDeleteStudent={vi.fn()}
          onOpenImportExportModal={vi.fn()}
          onOpenTuition={vi.fn()}
          onCreateProgram={vi.fn(() => null)}
        />
      </LanguageProvider>,
    );
    const program = screen.getByRole('combobox', { name: 'Lọc chương trình học viên' });
    const classroom = screen.getByRole('combobox', { name: 'Lọc lớp học viên' });
    const status = screen.getByRole('combobox', { name: 'Lọc trạng thái học viên' });
    for (const control of [program, classroom, status]) {
      control.focus();
      expect(document.activeElement).toBe(control);
    }
    await chooseOption(program, programs[0].name);
    await chooseOption(classroom, classes[0].name);
    status.focus();
    fireEvent.keyDown(status, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: /Đang học/i }));
    expect(program.getAttribute('title')).toBe(longName);
    expect(classroom.getAttribute('title')).toBe(classes[0].name);
    for (const view of ['Dạng Bảng', 'Dạng Thẻ']) {
      fireEvent.click(screen.getByRole('button', { name: view }));
      expect(screen.getByText('Học viên kiểm tra')).toBeTruthy();
      expect(screen.queryByText('Học viên khác')).toBeNull();
      expect(program.textContent).toBe(programs[0].name);
      expect(classroom.textContent).toBe(classes[0].name);
      expect(status.textContent).toMatch(/Đang học/i);
    }
  },
);

it('provides a focusable report action and returns focus after closing the details', () => {
  render(
    <ReportView
      students={[]}
      teachers={[]}
      classes={[classes[0]]}
      programs={[]}
      receipts={[]}
      onNavigateTab={vi.fn()}
    />,
  );
  const day = screen.getByRole('button', { name: 'Hằng Ngày' });
  fireEvent.click(day);
  expect(day.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Hằng Tháng' }).getAttribute('aria-pressed')).toBe(
    'false',
  );
  const open = screen.getByRole('button', { name: `Xem chi tiết lớp ${classes[0].name}` });
  open.focus();
  expect(document.activeElement).toBe(open);
  expect(open.tagName).toBe('BUTTON');
  fireEvent.click(open);
  expect(screen.getByRole('dialog', { name: 'Chi tiết báo cáo lớp' })).toBeTruthy();
  expect(screen.getByText('Chưa có học viên trong lớp.')).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(open);
});

it('supports yearly report filtering, year selection and monthly breakdown', () => {
  const sampleReceipt: TuitionReceipt = {
    id: 'rc-yearly-1',
    code: 'PT-2026-001',
    studentId: 'st-1',
    classId: classes[0].id,
    courseFee: 1500000,
    paidAmount: 1500000,
    debtAmount: 0,
    discount: 0,
    paymentDate: '2026-04-15',
    collectorName: 'Admin',
    paymentMethod: 'Tiền mặt',
    paymentKind: 'monthly',
  };
  render(
    <ReportView
      students={[]}
      teachers={[]}
      classes={[classes[0]]}
      programs={[]}
      receipts={[sampleReceipt]}
      onNavigateTab={vi.fn()}
    />,
  );
  const yearBtn = screen.getByRole('button', { name: 'Hằng Năm' });
  fireEvent.click(yearBtn);
  expect(yearBtn.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('BÁO CÁO TỔNG HỢP HẰNG NĂM')).toBeTruthy();
  expect(screen.getByLabelText('Chọn năm báo cáo')).toBeTruthy();
  expect(screen.getByText(/Doanh Thu 12 Tháng Trong Năm 2026/)).toBeTruthy();
  expect(screen.getAllByText('1.500.000 đ').length).toBeGreaterThan(0);
});

it('retains the attendance date when selecting a class with the keyboard and saves the correct roster', async () => {
  viewportWidth = 320;
  // Supply an on-screen anchor for keyboard focus; jsdom does not measure layout.
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(320);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(640);
  const getRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'combobox' ? new DOMRect(12, 100, 130, 44) : getRect.call(this);
  });
  const save = vi.fn();
  render(<AttendanceManager classes={classes} students={students.map(student => ({ ...student, status: 'active' }))}
    teachers={[]} attendanceSessions={[]} onSaveSession={save} isOwner />);
  const date = screen.getByLabelText('Ngày điểm danh') as HTMLInputElement;
  fireEvent.change(date, { target: { value: '2026-01-15' } });
  const classroom = screen.getByRole('combobox', { name: 'Lớp điểm danh' });
  classroom.focus();
  fireEvent.keyDown(classroom, { key: 'ArrowDown' });
  fireEvent.keyDown(await screen.findByRole('listbox'), { key: 'End' });
  const option = screen.getByRole('option', { name: classes[1].name });
  await waitFor(() => expect(document.activeElement).toBe(option));
  fireEvent.keyDown(option, { key: 'Enter' });
  await waitFor(() => expect(document.activeElement).toBe(classroom));
  expect(date.value).toBe('2026-01-15');
  fireEvent.click(screen.getByRole('button', { name: /Lưu Điểm Danh/i }));
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    classId: classes[1].id, date: '2026-01-15',
    entries: [expect.objectContaining({ studentId: students[1].id, status: 'present' })],
  }));
});

it('combines all compact tuition filters and resets them without changing receipts', async () => {
  viewportWidth = 320;
  const base: TuitionReceipt = {
    ...initial.initialTuitionReceipts[0], id: 'keep', code: 'UI-KEEP',
    studentId: students[0].id, classId: classes[0].id, paymentKind: 'monthly',
    courseFee: 0, monthlyFee: 1000, discount: 0, paidAmount: 500, debtAmount: 500,
    billingPeriod: '2026-06', paymentDate: '2026-06-02', paymentMethod: 'Chuyển khoản',
    installments: undefined, dueDate: undefined,
  };
  const receipts: TuitionReceipt[] = [base,
    { ...base, id: 'cash', code: 'UI-CASH', paymentMethod: 'Tiền mặt' },
    { ...base, id: 'other', code: 'UI-OTHER', studentId: students[1].id, classId: classes[1].id,
      paymentKind: 'course', courseFee: 1000, monthlyFee: 0, paidAmount: 1000, debtAmount: 0,
      billingPeriod: '2026-07', paymentDate: '2026-07-02' },
  ];
  const mutate = vi.fn();
  render(<TuitionManager receipts={receipts} students={students} classes={classes} programs={programs}
    permissions={OWNER_PERMISSIONS} settings={initial.initialSettings} isOwner
    onAddReceipt={mutate} onUpdateReceipt={mutate} onDeleteReceipt={mutate} />);
  for (const [label, option] of [
    ['Lọc lớp trên phiếu thu', classes[0].name], ['Lọc khoản thu', 'Học phí tháng'],
    ['Lọc tình trạng phiếu thu', 'Chưa hoàn thành'], ['Lọc tháng thu', 'Tháng 06/2026'],
    ['Lọc hình thức thanh toán', 'Chuyển khoản'],
  ]) await chooseOption(screen.getByRole('combobox', { name: label }), option);
  expect(screen.getByText('UI-KEEP')).toBeTruthy();
  expect(screen.queryByText('UI-CASH')).toBeNull();
  expect(screen.queryByText('UI-OTHER')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
  expect(screen.getByText('UI-CASH')).toBeTruthy();
  expect(screen.getByText('UI-OTHER')).toBeTruthy();
  expect(mutate).not.toHaveBeenCalled();
});

it('combines the journal search and action dropdown while retaining the search term', async () => {
  viewportWidth = 320;
  const base = { id: 'add', timestamp: '2026-01-15T08:00:00Z', userEmail: 'test@example.test',
    userName: 'Người kiểm tra', action: 'THÊM' as const, module: 'Học viên', details: 'needle: thêm hồ sơ' };
  render(<ActivityLogView logs={[base, { ...base, id: 'edit', action: 'SỬA', details: 'needle: sửa hồ sơ' }]}
    accountLogs={[]} isAccountAuditLoading={false} accountAuditError={null} onRefreshAccountLogs={vi.fn()} />);
  const search = screen.getByLabelText('Tìm nhật ký hệ thống') as HTMLInputElement;
  fireEvent.change(search, { target: { value: 'needle' } });
  const action = screen.getByRole('combobox', { name: 'Lọc hành động nhật ký' });
  await chooseOption(action, 'Thêm mới');
  expect(screen.getByText('needle: thêm hồ sơ')).toBeTruthy();
  expect(screen.queryByText('needle: sửa hồ sơ')).toBeNull();
  await chooseOption(action, 'Tất cả hành động');
  expect(search.value).toBe('needle');
  expect(screen.getByText('needle: sửa hồ sơ')).toBeTruthy();
});
