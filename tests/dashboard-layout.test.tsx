// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DashboardView } from '../src/modules/dashboard/DashboardView';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import * as initial from '../src/mock/initialData';
vi.mock('recharts', () => ({
  Bar: () => null,
  Cell: () => null,
  Legend: () => null,
  Pie: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
  BarChart: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));
const props = {
  students: initial.initialStudents,
  classes: initial.initialClasses,
  teachers: initial.initialTeachers,
  rooms: initial.initialRooms,
  programs: initial.initialPrograms,
  receipts: initial.initialTuitionReceipts,
  timetableSlots: initial.initialTimetableSlots,
  currentUser: DEV_OWNER_ACCOUNT,
  onNavigateTab: vi.fn(),
};
beforeEach(() => {
  localStorage.clear();
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
// jsdom confirms ordering/actions at these viewport settings; it does not render pixels.
it.each([320, 390, 820, 1024, 1366])(
  'puts the welcome above tasks and keeps one tuition shortcut at %spx',
  (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const navigate = vi.fn();
    render(<DashboardView {...props} onNavigateTab={navigate} />);
    const welcome = screen.getByRole('region', { name: 'Chào mừng' });
    const tasks = screen.getByRole('region', { name: 'Việc cần làm hôm nay' });
    expect(welcome.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(tasks).queryByRole('button', { name: 'Thu học phí' })).toBeNull();
    fireEvent.click(within(welcome).getByRole('button', { name: 'Thu học phí' }));
    expect(navigate).toHaveBeenCalledWith('tuition');
  },
);
it('preserves the welcome position and shortcuts when the banner is collapsed', () => {
  const navigate = vi.fn();
  render(<DashboardView {...props} onNavigateTab={navigate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Thu gọn banner' }));
  expect(screen.getByRole('button', { name: 'Mở rộng banner' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Thu phí' }));
  expect(navigate).toHaveBeenCalledWith('tuition');
  expect(
    within(screen.getByRole('region', { name: 'Việc cần làm hôm nay' })).queryByRole('button', {
      name: 'Thu học phí',
    }),
  ).toBeNull();
});

it('counts active unpaid students in debt metrics even when no receipts exist', () => {
  const activeUnpaidStudent = {
    ...initial.initialStudents[0],
    id: 'hs-new',
    name: 'Học sinh chưa đóng',
    status: 'active' as const,
    feeStatus: 'unpaid' as const,
  };
  render(
    <DashboardView
      {...props}
      students={[activeUnpaidStudent]}
      receipts={[]}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /Học sinh nợ phí/i }));
  expect(screen.getByText('Học sinh còn nợ học phí')).toBeTruthy();
  expect(screen.getAllByText('Học sinh chưa đóng').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Chưa đóng')).toBeTruthy();
});
