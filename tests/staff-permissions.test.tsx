// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/context/LanguageContext';
import { createStaffPermissions } from '../src/lib/permissions';
import { initialClasses, initialPrograms, initialRooms, initialTeachers } from '../src/mock/initialData';
import { ClassManager } from '../src/modules/classes/ClassManager';
import { RoomManager } from '../src/modules/rooms/RoomManager';
import { StudentManager } from '../src/modules/students/StudentManager';
import { TeacherManager } from '../src/modules/teachers/TeacherManager';
import type { StaffPermissions } from '../src/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each([
  ['class', 'Tạo Lớp Học Mới'],
  ['room', 'Thêm Phòng Học Mới'],
  ['teacher', 'Thêm Giáo Viên Mới'],
  ['student', 'Thêm Học Sinh Mới'],
] as const)('lets a granted staff member open and submit a new %s, and denies an ungranted staff member', (kind, label) => {
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  const add = vi.fn();
  const replaceSchedule = vi.fn();
  const props = { permissions: createStaffPermissions(), isOwner: false };
  const element = (permissions: StaffPermissions) => {
    const common = { ...props, permissions };
    const content = kind === 'class'
      ? <ClassManager {...common} classes={[]} students={[]} receipts={[]} timetableSlots={[]} programs={initialPrograms} teachers={initialTeachers} rooms={initialRooms} onAddClass={add} onUpdateClass={vi.fn()} onDeleteClass={vi.fn()} onCreateProgram={vi.fn()} onCreateRoom={vi.fn()} onReplaceClassSchedule={replaceSchedule} />
      : kind === 'room'
        ? <RoomManager {...common} rooms={[]} classes={[]} onAddRoom={add} onUpdateRoom={vi.fn()} onDeleteRoom={vi.fn()} />
        : kind === 'teacher'
          ? <TeacherManager {...common} teachers={[]} classes={[]} onAddTeacher={add} onUpdateTeacher={vi.fn()} onDeleteTeacher={vi.fn()} onEditClass={vi.fn()} />
          : <StudentManager {...common} students={[]} classes={[initialClasses[0]]} programs={initialPrograms} receipts={[]} timetableSlots={[]} searchQuery="" onAddStudent={add} onUpdateStudent={vi.fn()} onDeleteStudent={vi.fn()} onCreateProgram={vi.fn()} onOpenImportExportModal={vi.fn()} onOpenTuition={vi.fn()} />;
    return <LanguageProvider>{content}</LanguageProvider>;
  };
  const view = render(element(props.permissions));
  expect(screen.queryByRole('button', { name: label })).toBeNull();
  view.rerender(element(createStaffPermissions(true)));
  fireEvent.click(screen.getByRole('button', { name: label }));
  const dialog = screen.getByRole('dialog');
  const form = dialog.querySelector('form')!;
  const name = kind === 'student' ? screen.getByPlaceholderText('Nguyễn Văn A') : [...form.querySelectorAll('input[type="text"][required]')].at(-1)!;
  fireEvent.change(name, { target: { value: 'Test new record' } });
  if (kind === 'room') fireEvent.change(form.querySelector('input[type="number"]')!, { target: { value: '12' } });
  if (kind === 'student') {
    fireEvent.change(form.querySelector('select[required]')!, { target: { value: initialPrograms[0].id } });
    fireEvent.change(screen.getByPlaceholderText('Ví dụ: L9-PPTE hoặc Lớp 9 - Global Success'), { target: { value: initialClasses[0].code } });
  }
  if (kind === 'class') {
    fireEvent.change(screen.getByPlaceholderText('Chọn chương trình đã import hoặc nhập mới'), { target: { value: initialPrograms[0].name } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thứ 2' }));
  }
  fireEvent.submit(form);
  expect(alert.mock.calls).toEqual([]);
  expect(screen.queryByRole('alert')?.textContent ?? '').toBe('');
  expect(add).toHaveBeenCalledOnce();
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test new record' }));
  if (kind === 'class') expect(replaceSchedule).toHaveBeenCalledWith(expect.any(String), [expect.objectContaining({ dayOfWeek: 'Thứ 2', startTime: '18:00', endTime: '19:30' })]);
  expect(screen.queryByRole('dialog')).toBeNull();
});
