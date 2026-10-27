// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TeacherManager } from '../src/modules/teachers/TeacherManager';
import { LanguageProvider } from '../src/context/LanguageContext';
import * as initial from '../src/mock/initialData';
import { createStaffPermissions } from '../src/lib/permissions';
import { submitForm } from './submitForm';

afterEach(cleanup);
it('selects two classes with checkbox and keyboard controls and permits removing an existing assignment', () => {
  const save = vi.fn(() => null);
  const teacher = { ...initial.initialTeachers[0], assignedClassIds: [] };
  const classes = initial.initialClasses.slice(0, 2).map(item => ({ ...item, teacherId: teacher.id }));
  render(<LanguageProvider><TeacherManager teachers={[teacher]} classes={classes} permissions={createStaffPermissions(true)} isOwner onAddTeacher={vi.fn()} onUpdateTeacher={vi.fn()} onDeleteTeacher={vi.fn()} onEditClass={vi.fn()} onSaveTeacher={save} /></LanguageProvider>);
  fireEvent.click(screen.getByRole('button', { name: `Sửa giáo viên ${teacher.name}` }));
  fireEvent.click(screen.getByLabelText('Chọn các lớp phụ trách'));
  const options = screen.getAllByRole('checkbox');
  expect(options.map(option => (option as HTMLInputElement).checked)).toEqual([true, true]);
  fireEvent.click(options[0]);
  submitForm(screen.getByRole('dialog').querySelector('form')!);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ assignedClassIds: [classes[1].id] }));
});

it('shows only real schedule data in teacher details and never invents a default evening schedule', () => {
  const teacher = { ...initial.initialTeachers[0], assignedClassIds: [], scheduleNotes: '' };
  render(
    <LanguageProvider>
      <TeacherManager
        teachers={[teacher]}
        classes={[]}
        timetableSlots={[]}
        permissions={createStaffPermissions(true)}
        isOwner
        onAddTeacher={vi.fn()}
        onUpdateTeacher={vi.fn()}
        onDeleteTeacher={vi.fn()}
        onEditClass={vi.fn()}
      />
    </LanguageProvider>,
  );
  expect(screen.queryByText(/Giảng dạy các ca tối|Giảng dạy cố định ca tối/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
  expect(screen.getByText('Các lớp học đang phụ trách (0)')).toBeTruthy();
  expect(screen.getByText('Giáo viên hiện chưa được xếp lớp giảng dạy.')).toBeTruthy();
  expect(screen.getAllByText(/Chưa có ghi chú lịch giảng dạy/).length).toBeGreaterThan(0);
});
