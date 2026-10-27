// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('reopens a failed screen without reloading or losing surrounding state', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let fails = false;
  function Screen() { if (fails) throw new Error('private details'); return <p>Screen ready</p>; }
  function Workspace() {
    const [draft, setDraft] = useState('saved draft');
    return <><input aria-label="Draft" value={draft} onChange={e => setDraft(e.target.value)} /><ErrorBoundary><Screen /></ErrorBoundary></>;
  }
  const view = render(<Workspace />);
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'unsaved work' } });
  fails = true;
  view.rerender(<Workspace />);
  expect(screen.getByRole('alert').textContent).toContain('UI-RENDER');
  expect(screen.getByRole('alert').textContent).not.toContain('private details');
  fails = false;
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại mục này' }));
  expect(screen.getByText('Screen ready')).toBeTruthy();
  expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('unsaved work');
});

it.each(['Failed to fetch dynamically imported module: /assets/old.js', 'Importing a module script failed.', 'error loading dynamically imported module'])('identifies module failures without exposing the URL: %s', message => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function FailedScreen(): React.ReactNode { throw new TypeError(message); }
  render(<ErrorBoundary><FailedScreen /></ErrorBoundary>);
  expect(screen.getByRole('alert').textContent).toContain('UI-MODULE');
  expect(screen.queryByRole('button', { name: 'Thử lại mục này' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Khắc phục & tải lại' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('dữ liệu nghiệp vụ đã lưu không bị xóa');
  expect(screen.getByRole('alert').textContent).not.toContain('/assets/old.js');
});
