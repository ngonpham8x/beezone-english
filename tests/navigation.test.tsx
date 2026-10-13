// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import App from '../src/App';
import { LanguageProvider } from '../src/context/LanguageContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: false,
  isLocalPreview: true,
  supabase: null,
}));
let navigation: HTMLElement;
let errors: any;
let viewportWidth = 1366;
const mediaTargets: EventTarget[] = [];
function matches(query: string) {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  return (
    Boolean(min || max) &&
    (!min || viewportWidth >= Number(min[1])) &&
    (!max || viewportWidth <= Number(max[1]))
  );
}
function resize(width: number) {
  act(() => {
    viewportWidth = width;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    mediaTargets.forEach((target) => target.dispatchEvent(new Event('change')));
    window.dispatchEvent(new Event('resize'));
  });
}
beforeAll(async () => {
  // Compile lazy modules before measuring navigation. Cold Vite transforms on
  // Windows are independent of the application's loading/interaction logic.
  await Promise.all([
    import('../src/components/DashboardView'),
    import('../src/components/StudentManager'),
    import('../src/components/TeacherManager'),
    import('../src/components/ClassManager'),
    import('../src/components/RoomManager'),
    import('../src/components/TimetableManager'),
    import('../src/components/TeacherScheduleMatrix'),
    import('../src/components/GradeManager'),
    import('../src/components/TuitionManager'),
    import('../src/components/ReportView'),
    import('../src/components/AttendanceManager'),
    import('../src/components/AdmissionsManager'),
    import('../src/components/CourseProgramManager'),
    import('../src/components/BackupManager'),
  ]);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => {
      const target = new EventTarget();
      mediaTargets.push(target);
      return {
        get matches() {
          return matches(query);
        },
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
      };
    }),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  errors = vi.spyOn(console, 'error');
  render(
    <LanguageProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </LanguageProvider>,
  );
  navigation = document.getElementById('primary-navigation')!.querySelector('nav')!;
  const labels = within(navigation)
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')!);
  expect(labels).toHaveLength(18);
}, 60_000);
afterAll(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// This checks navigation, rendering and drawer behavior, not pixel layout.
it.each(
  [390, 820, 1366].flatMap((width) => Array.from({ length: 18 }, (_, index) => [width, index])),
)('opens management page at %spx, tab #%s without a runtime failure', async (width, index) => {
  resize(width);
  const openMenu = screen.queryByRole('button', { name: 'Mở menu điều hướng' });
  if (openMenu) fireEvent.click(openMenu);
  expect(document.getElementById('primary-navigation')!.getAttribute('role')).toBe(
    width < 1024 ? 'dialog' : null,
  );
  const button = within(navigation).getAllByRole('button')[index];
  const label = button.getAttribute('aria-label')!;
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByText('Đang tải chức năng…'), label).toBeNull(), {
    timeout: 10_000,
  });
  expect(button.getAttribute('aria-current')).toBe('page');
  expect(screen.queryByText('Không thể hiển thị trang này')).toBeNull();
  expect(errors.mock.calls).toEqual([]);
  expect(document.body.style.overflow).toBe('');
});
