// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfirmedForm } from '../src/components/ConfirmedForm';

afterEach(cleanup);
it('keeps edits on cancel, and writes exactly once only after confirmation', () => {
  const save = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(<ConfirmedForm confirmWhen entityLabel="học viên" onSubmit={save}><input aria-label="Tên" defaultValue="Draft" /><button>Lưu</button></ConfirmedForm>);
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Hủy bỏ' }));
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Draft');
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lưu thay đổi' }));
  expect(save).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});
