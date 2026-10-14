// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OWNER_PERMISSIONS } from '../src/lib/auth';
import * as initial from '../src/mock/initialData';
import { AdmissionsManager } from '../src/modules/admissions/AdmissionsManager';
import type { CourseProgram, Student } from '../src/types';
import { chooseOption } from './helpers/select';

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
  async (width) => {
    renderAdmissions(width);
    const search = screen.getByRole('searchbox', { name: 'Tìm học viên tuyển sinh' });
    const stage = screen.getByRole('combobox', { name: 'Lọc theo giai đoạn' });
    const program = screen.getByRole('combobox', { name: 'Lọc theo chương trình' });
    await chooseOption(stage, 'Tiềm năng / Tư vấn');
    expect(screen.getByText('Trần An')).toBeTruthy();
    expect(screen.queryByText('Lê Bình')).toBeNull();
    expect(screen.queryByText('Nguyễn Chi')).toBeNull();
    await chooseOption(stage, 'Tất cả giai đoạn');
    await chooseOption(program, longProgramName);
    expect(screen.getByText('Nguyễn Chi')).toBeTruthy();
    expect(screen.queryByText('Lê Bình')).toBeNull();
    fireEvent.change(search, { target: { value: 'Trần' } });
    expect(screen.queryByText('Nguyễn Chi')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dạng Bảng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dạng Thẻ Mobile' }));
    expect((search as HTMLInputElement).value).toBe('Trần');
    expect(program.textContent).toBe(longProgramName);
    expect(screen.getByText('Trần An')).toBeTruthy();
    expect(screen.queryByText('Lê Bình')).toBeNull();
  },
);

it('keeps controls in keyboard order and exposes the complete selected program name', async () => {
  renderAdmissions(480);
  const filters = screen.getByRole('region', { name: 'Bộ lọc tuyển sinh' });
  const controls = [...filters.querySelectorAll('input[type="search"],button[role="combobox"]')];
  expect(
    controls.map((control) => control.getAttribute('role') || control.getAttribute('type')),
  ).toEqual(['search', 'combobox', 'combobox']);
  controls.forEach((control) => {
    (control as HTMLElement).focus();
    expect(document.activeElement).toBe(control);
  });
  await chooseOption(controls[2] as HTMLElement, longProgramName);
  expect(controls[2].getAttribute('title')).toBe(longProgramName);
  expect(controls[2].textContent).toBe(longProgramName);
  expect(document.activeElement).toBe(controls[2]);
});
