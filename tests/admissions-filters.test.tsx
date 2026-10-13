// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OWNER_PERMISSIONS } from '../src/lib/auth';
import * as initial from '../src/mock/initialData';
import { AdmissionsManager } from '../src/modules/admissions/AdmissionsManager';
import type { CourseProgram, Student } from '../src/types';

const longProgramName =
  'Chương trình Cambridge dành cho học viên tiểu học và luyện thi chứng chỉ quốc tế';
const programs: CourseProgram[] = [
  { ...initial.initialPrograms[0], id: 'long', name: longProgramName },
  { ...initial.initialPrograms[1], id: 'short', name: 'IELTS' },
];
const students: Student[] = [
  {
    ...initial.initialStudents[0],
    id: 'lead',
    code: 'TS-001',
    name: 'Trần An',
    status: 'lead',
    programId: 'long',
  },
  {
    ...initial.initialStudents[0],
    id: 'registered',
    code: 'TS-002',
    name: 'Lê Bình',
    status: 'registered',
    programId: 'short',
  },
  {
    ...initial.initialStudents[0],
    id: 'active',
    code: 'TS-003',
    name: 'Nguyễn Chi',
    status: 'active',
    programId: 'long',
  },
];

function renderAdmissions(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: width <= Number(/max-width:\s*(\d+)px/.exec(query)?.[1] || 0),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  render(
    <AdmissionsManager
      students={students}
      programs={programs}
      classes={[]}
      teachers={[]}
      permissions={OWNER_PERMISSIONS}
      isOwner
      onAddStudent={vi.fn()}
      onUpdateStudent={vi.fn()}
      onDeleteStudent={vi.fn()}
      onEnrollStudent={vi.fn()}
    />,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Verify filter behavior and retained selections at mobile/tablet/desktop sizes.
// jsdom cannot verify pixel overflow; the grid uses bounded tracks and controls.
it.each([320, 480, 820, 1366])(
  'combines filters and retains them when switching views at %s px',
  (width) => {
    renderAdmissions(width);
    const search = screen.getByRole('searchbox', { name: 'Tìm học viên tuyển sinh' });
    const stage = screen.getByRole('combobox', { name: 'Lọc theo giai đoạn' });
    const program = screen.getByRole('combobox', { name: 'Lọc theo chương trình' });
    fireEvent.change(stage, { target: { value: 'lead' } });
    expect(screen.getByText('Trần An')).toBeTruthy();
    expect(screen.queryByText('Lê Bình')).toBeNull();
    expect(screen.queryByText('Nguyễn Chi')).toBeNull();
    fireEvent.change(stage, { target: { value: 'all' } });
    fireEvent.change(program, { target: { value: 'long' } });
    expect(screen.getByText('Nguyễn Chi')).toBeTruthy();
    expect(screen.queryByText('Lê Bình')).toBeNull();
    fireEvent.change(search, { target: { value: 'Trần' } });
    expect(screen.queryByText('Nguyễn Chi')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dạng Bảng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dạng Thẻ Mobile' }));
    expect((search as HTMLInputElement).value).toBe('Trần');
    expect((program as HTMLSelectElement).value).toBe('long');
    expect(screen.getByText('Trần An')).toBeTruthy();
    expect(screen.queryByText('Lê Bình')).toBeNull();
  },
);

it('keeps controls in keyboard order and exposes the complete selected program name', () => {
  renderAdmissions(480);
  const filters = screen.getByRole('region', { name: 'Bộ lọc tuyển sinh' });
  const controls = [...filters.querySelectorAll('input,select')];
  expect(controls.map((control) => control.getAttribute('type') || control.tagName)).toEqual([
    'search',
    'SELECT',
    'SELECT',
  ]);
  controls.forEach((control) => {
    (control as HTMLElement).focus();
    expect(document.activeElement).toBe(control);
  });
  fireEvent.change(controls[2], { target: { value: 'long' } });
  expect(controls[2].getAttribute('title')).toBe(longProgramName);
  expect(
    (screen.getByRole('option', { name: longProgramName }) as HTMLOptionElement).selected,
  ).toBe(true);
  expect(document.activeElement).toBe(controls[2]);
});
