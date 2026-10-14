// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResponsiveSelect } from '../src/components/ResponsiveSelect';

const longName = 'Tiếng Anh Tiểu Học (Bee 3 & Bee 4 - Family and Friends)';
const options = [
  { value: 'all', label: 'Tất cả chương trình' },
  { value: 'cambridge', label: 'Chương trình Cambridge' },
  { value: 'bee', label: longName },
];

function Harness({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('all');
  return (
    <ResponsiveSelect
      label="Chương trình"
      value={value}
      options={options}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

beforeEach(() => {
  // Keep the anchor in a simulated viewport while testing focus/selection.
  // jsdom does not render CSS or measure popup overflow.
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: 480,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    value: 640,
  });
  const getRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'combobox'
      ? new DOMRect(250, 100, 200, 44)
      : getRect.call(this);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('chooses a long option with the keyboard and returns focus to the control', async () => {
  const change = vi.fn();
  render(<Harness onChange={change} />);
  const trigger = screen.getByRole('combobox', { name: 'Chương trình' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const list = await screen.findByRole('listbox', { name: 'Chương trình' });
  fireEvent.keyDown(list, { key: 'End' });
  const last = screen.getByRole('option', { name: longName });
  await waitFor(() => expect(document.activeElement).toBe(last));
  fireEvent.keyDown(last, { key: 'Enter' });
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  expect(trigger.textContent).toBe(longName);
  expect(change).toHaveBeenCalledExactlyOnceWith('bee');
  expect(document.activeElement).toBe(trigger);
});

it('cancels uncommitted navigation with Escape and releases the scroll lock', async () => {
  const change = vi.fn();
  render(<Harness onChange={change} />);
  const trigger = screen.getByRole('combobox', { name: 'Chương trình' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const list = await screen.findByRole('listbox');
  fireEvent.keyDown(list, { key: 'End' });
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('option', { name: longName })),
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
  expect(trigger.textContent).toBe('Tất cả chương trình');
  expect(change).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.getAttribute('data-scroll-locked')).toBeNull();
});

it.each(['mouse', 'touch'])('chooses the correct ID with %s input', async (pointerType) => {
  const change = vi.fn();
  render(<Harness onChange={change} />);
  const trigger = screen.getByRole('combobox', { name: 'Chương trình' });
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
  });
  if (pointerType === 'touch') fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: longName });
  fireEvent.pointerMove(option, { pointerType, clientX: 20, clientY: 100 });
  fireEvent.pointerDown(option, { pointerType, pointerId: 1, clientX: 20, clientY: 100 });
  fireEvent.pointerUp(option, { pointerType, pointerId: 1, clientX: 20, clientY: 100 });
  if (pointerType === 'touch') fireEvent.click(option);
  await waitFor(() => expect(trigger.textContent).toBe(longName));
  expect(change).toHaveBeenCalledExactlyOnceWith('bee');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('keeps an unavailable class selector disabled', () => {
  const change = vi.fn();
  render(
    <ResponsiveSelect
      label="Lớp"
      value=""
      options={[]}
      onChange={change}
      placeholder="Chưa có lớp được phân quyền"
    />,
  );
  const trigger = screen.getByRole('combobox', { name: 'Lớp' });
  expect(trigger.hasAttribute('disabled')).toBe(true);
  expect(trigger.textContent).toBe('Chưa có lớp được phân quyền');
  fireEvent.click(trigger);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
