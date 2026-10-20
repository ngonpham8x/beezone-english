// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { NotificationDialogs } from '../src/components/NotificationDialogs';
import { askConfirmation, currentDialog, settleDialog, showAlert } from '../src/lib/dialogs';

afterEach(() => {
  cleanup();
  while (currentDialog()) settleDialog(false);
});

it('queues confirmations and notices, resolves exactly once, and closes with Escape', async () => {
  render(<NotificationDialogs />);
  let confirmation!: Promise<boolean>;
  act(() => {
    confirmation = askConfirmation('Xóa hồ sơ chưa có lịch sử?');
    showAlert('Hồ sơ đang được sử dụng.');
  });
  expect(screen.getByRole('dialog').textContent).toContain('Xóa hồ sơ');
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
  expect(await confirmation).toBe(true);
  expect(screen.getByRole('dialog').textContent).toContain('Hồ sơ đang được sử dụng.');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('cancels a confirmation without accepting it and portals out of transformed layout containers', async () => {
  render(<div style={{ transform: 'translateY(100px)' }}><NotificationDialogs /></div>);
  let confirmation!: Promise<boolean>;
  act(() => { confirmation = askConfirmation('Đăng xuất?'); });
  expect(screen.getByRole('dialog').parentElement).toBe(document.body);
  fireEvent.click(screen.getByRole('button', { name: 'Hủy bỏ' }));
  expect(await confirmation).toBe(false);
});
