// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/context/LanguageContext';
import { OWNER_PERMISSIONS } from '../src/lib/auth';
import * as initial from '../src/mock/initialData';
import { ReportView } from '../src/modules/reports/ReportView';
import { StudentManager } from '../src/modules/students/StudentManager';

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
  (width) => {
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
    fireEvent.change(program, { target: { value: programs[0].id } });
    fireEvent.change(classroom, { target: { value: classes[0].id } });
    fireEvent.change(status, { target: { value: 'active' } });
    expect(program.getAttribute('title')).toBe(longName);
    expect(classroom.getAttribute('title')).toBe(classes[0].name);
    for (const view of ['Dạng Bảng', 'Dạng Thẻ']) {
      fireEvent.click(screen.getByRole('button', { name: view }));
      expect(screen.getByText('Học viên kiểm tra')).toBeTruthy();
      expect(screen.queryByText('Học viên khác')).toBeNull();
      expect((program as HTMLSelectElement).value).toBe(programs[0].id);
      expect((classroom as HTMLSelectElement).value).toBe(classes[0].id);
      expect((status as HTMLSelectElement).value).toBe('active');
    }
  },
);

it('provides a focusable report action and returns focus after closing the details', () => {
  render(
    <ReportView
      students={[]}
      teachers={[]}
      classes={[classes[0]]}
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
