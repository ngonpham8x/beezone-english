// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import App from '../src/App';
import { LanguageProvider } from '../src/context/LanguageContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
vi.mock('../src/lib/supabase', () => ({ isSupabaseConfigured: false, isLocalPreview: true, supabase: null }));
let navigation: HTMLElement;
let errors: any;
beforeAll(async () => {
  // Compile lazy modules before measuring navigation. Cold Vite transforms on
  // Windows are independent of the application's loading/interaction logic.
  await Promise.all([
    import('../src/components/DashboardView'), import('../src/components/StudentManager'),
    import('../src/components/TeacherManager'), import('../src/components/ClassManager'),
    import('../src/components/RoomManager'), import('../src/components/TimetableManager'),
    import('../src/components/TeacherScheduleMatrix'), import('../src/components/GradeManager'),
    import('../src/components/TuitionManager'), import('../src/components/ReportView'),
    import('../src/components/AttendanceManager'), import('../src/components/AdmissionsManager'),
    import('../src/components/CourseProgramManager'), import('../src/components/BackupManager'),
  ]);
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  errors = vi.spyOn(console, 'error');
  render(<LanguageProvider><ErrorBoundary><App /></ErrorBoundary></LanguageProvider>);
  navigation = document.getElementById('primary-navigation')!.querySelector('nav')!;
  const labels = within(navigation).getAllByRole('button').map(button => button.getAttribute('aria-label')!);
  expect(labels).toHaveLength(18);
}, 60_000);
afterAll(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(Array.from({ length: 18 }, (_, index) => index))('opens management page #%s without a runtime failure', async (index) => {
  const button = within(navigation).getAllByRole('button')[index];
  const label = button.getAttribute('aria-label')!;
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByText('Đang tải chức năng…'), label).toBeNull(), { timeout: 10_000 });
  expect(button.getAttribute('aria-current')).toBe('page');
  expect(screen.queryByText('Không thể hiển thị trang này')).toBeNull();
  expect(errors.mock.calls).toEqual([]);
});
