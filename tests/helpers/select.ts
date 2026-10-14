import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';

export async function chooseOption(control: HTMLElement, label: string) {
  // jsdom has no layout. Supply an on-screen anchor for interaction tests;
  // this does not verify the rendered popup's size or viewport collisions.
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    get: () => window.innerWidth,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    get: () => window.innerHeight,
  });
  vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(new DOMRect(16, 120, 200, 44));
  control.focus();
  fireEvent.keyDown(control, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: label }));
  await waitFor(() => expect(control.getAttribute('aria-expanded')).toBe('false'));
}
