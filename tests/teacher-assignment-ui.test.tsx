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
