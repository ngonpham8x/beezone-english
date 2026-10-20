// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { splitProgramCategories } from '../src/lib/programCategories';
import { CourseProgramManager } from '../src/modules/programs/CourseProgramManager';

afterEach(cleanup);
it('keeps nested category punctuation and reads legacy multiple categories', () => {
  expect(splitProgramCategories('Cambridge (Starters, KET, PET), IELTS, IELTS')).toEqual(['Cambridge (Starters, KET, PET)', 'IELTS']);
  expect(splitProgramCategories('A (B (C, D), E), TOEIC')).toEqual(['A (B (C, D), E)', 'TOEIC']);
  expect(splitProgramCategories('')).toEqual([]);
});
it('preserves categories through editing and closes the category popup before the dialog with Escape', () => {
  const onUpdateProgram = vi.fn();
  const program = { id: 'p', code: 'CAM', name: 'Cambridge Kids', category: 'Cambridge (Starters, KET, PET), IELTS', tuitionFee: 500000 };
  render(<CourseProgramManager programs={[program]} classes={[]} students={[]} isOwner onAddProgram={vi.fn()} onUpdateProgram={onUpdateProgram} onDeleteProgram={vi.fn()} />);
  fireEvent.click(screen.getByTitle('Chỉnh sửa khóa học'));
  expect(screen.getByText('2 đã chọn')).toBeTruthy();
  const trigger = screen.getByRole('button', { name: 'Chọn phân loại chương trình' });
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(screen.getByRole('button', { name: /Lưu Thay Đổi/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  expect(onUpdateProgram).toHaveBeenCalledWith(expect.objectContaining({ category: program.category }));
});
