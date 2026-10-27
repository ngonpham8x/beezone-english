// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { initialSettings, initialStudents } from '../src/mock/initialData';

const state = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: any) => void),
  payload: {} as any, centerError: false, profileActive: true,
  profilePrivate: false,
  profileRole: 'owner', profilePermissions: null as any,
  profileError: false,
  sessionRequest: null as null | (() => Promise<any>),
  writeError: null as null | { code: string },
  profileReads: 0, centerReads: 0, writes: [] as any[],
}));
vi.mock('../src/lib/supabase', () => {
  const session = { access_token: 'test-token', user: { id: 'test-owner', email: 'owner@example.test', user_metadata: { full_name: 'Google Account Name' } } };
  return { isSupabaseConfigured: true, isLocalPreview: false, supabase: {
    auth: {
      getSession: async () => state.sessionRequest ? state.sessionRequest() : ({ data: { session }, error: null }),
      onAuthStateChange: (listener: any) => { state.listener = listener; return { data: { subscription: { unsubscribe: () => { if (state.listener === listener) state.listener = null; } } } }; },
      signOut: async () => ({ error: null }),
    },
    from(table: string) {
      let update: any;
      const builder = {
        select: () => builder, eq: () => builder,
        update: (value: any) => { update = value; return builder; }, insert: (value: any) => { update = value; return builder; },
        async maybeSingle() {
          if (table === 'profiles') { state.profileReads++; return { data: state.profileActive ? { id: 'test-owner', full_name: 'Test Owner', role: state.profileRole, is_active: true, is_private: state.profilePrivate, avatar_url: null, permissions: state.profilePermissions } : null, error: state.profileError ? { message: 'offline' } : null }; }
          if (update) { if (state.writeError) return { data: null, error: state.writeError }; state.writes.push(structuredClone(update.payload)); return { data: { updated_at: `revision-${state.writes.length}` }, error: null }; }
          state.centerReads++;
          return { data: { payload: structuredClone(state.payload), updated_at: 'initial-revision' }, error: state.centerError ? { message: 'offline' } : null };
        },
        async single() { return builder.maybeSingle(); },
      };
      return builder;
    },
  } };
});
vi.mock('../src/modules/dashboard/DashboardView', () => ({ DashboardView: ({ onNavigateTab }: any) => <button onClick={() => onNavigateTab('students')}>Open students</button> }));
vi.mock('../src/modules/students/StudentManager', () => ({ StudentManager: ({ students, onUpdateStudent, permissions }: any) => <div><p>{students[0]?.name}</p><span>{permissions.student.add ? 'Can add student' : 'Cannot add student'}</span><button onClick={() => onUpdateStudent({ ...students[0], name: 'Edited locally' })}>Edit student</button></div> }));
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  state.payload = { settings: initialSettings, students: [{ ...initialStudents[0], name: 'Cloud student' }] };
  state.centerError = false; state.profileActive = true; state.profileReads = 0; state.centerReads = 0; state.writes = [];
  state.writeError = null;
  state.profilePrivate = false;
  state.profileRole = 'owner'; state.profilePermissions = null;
  state.profileError = false;
  state.sessionRequest = null;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows the signed-in Google identity only inside the private owner account dialog', async () => {
  state.profilePrivate = true;
  render(<App />);
  const accountButton = await screen.findByRole('button', { name: 'Mở tài khoản' });
  expect(screen.queryByText('Google Account Name')).toBeNull();
  expect(screen.queryByText('owner@example.test')).toBeNull();
  accountButton.focus();
  fireEvent.click(accountButton);
  expect(screen.getByRole('heading', { name: 'Google Account Name' })).toBeTruthy();
  expect(screen.getByText('owner@example.test')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Tài khoản' }), { key: 'Escape' });
  expect(screen.queryByText('Google Account Name')).toBeNull();
  expect(screen.queryByText('owner@example.test')).toBeNull();
  expect(document.activeElement).toBe(accountButton);
});

it('removes a completed OAuth code while retaining the current page query and anchor', async () => {
  window.history.replaceState(null, '', '/?code=example-consumed-code&tab=dashboard&view=compact#today');
  render(<App />);
  await screen.findByRole('button', { name: 'Open students' });
  expect(window.location.search).toBe('?tab=dashboard&view=compact');
  expect(window.location.hash).toBe('#today');
});

it('does not reload business data or erase unsaved edits when the same session refreshes', async () => {
  render(<StrictMode><App /></StrictMode>);
  fireEvent.click(await screen.findByRole('button', { name: 'Open students' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit student' }));
  expect(screen.getByText('Edited locally')).toBeTruthy();
  act(() => state.listener?.('TOKEN_REFRESHED', { access_token: 'refreshed', user: { id: 'test-owner', email: 'owner@example.test', user_metadata: {} } }));
  await waitFor(() => expect(state.profileReads).toBeGreaterThanOrEqual(2));
  expect(state.centerReads).toBe(1); expect(screen.getByText('Edited locally')).toBeTruthy();
  await waitFor(() => expect(state.writes.some(payload => payload.students[0].name === 'Edited locally')).toBe(true), { timeout: 3000 });
});
it('refreshes changed administrative grants on return without reloading edited data or duplicating focus checks', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open students' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit student' }));
  state.profileRole = 'admin';
  state.profilePermissions = { student: { view: true, add: false, edit: true } };
  const now = Date.now();
  const time = vi.spyOn(Date, 'now').mockReturnValue(now + 4000);
  fireEvent.focus(window);
  fireEvent(document, new Event('visibilitychange'));
  await screen.findByText('Cannot add student');
  expect(state.profileReads).toBe(2);
  expect(state.centerReads).toBe(1);
  expect(screen.getByText('Edited locally')).toBeTruthy();
  state.profilePermissions.student.add = true;
  time.mockReturnValue(now + 8000);
  fireEvent.focus(window);
  await screen.findByText('Can add student');
  expect(state.profileReads).toBe(3);
  expect(state.centerReads).toBe(1);
  expect(screen.getByText('Edited locally')).toBeTruthy();
});
it('shows a data-load error and retries without opening demonstration data', async () => {
  state.centerError = true;
  render(<App />);
  await screen.findByText('Chưa thể tải hệ thống');
  expect(screen.queryByRole('button', { name: 'Open students' })).toBeNull();
  state.centerError = false;
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByRole('button', { name: 'Open students' })).toBeTruthy();
});
it('retains unsaved edits when retrying a failed profile refresh and resumes saving without reloading the cloud payload', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open students' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit student' }));
  state.profileError = true;
  act(() => state.listener?.('TOKEN_REFRESHED', {
    access_token: 'refreshed', user: { id: 'test-owner', email: 'owner@example.test', user_metadata: {} },
  }));
  await screen.findByText('Chưa thể tải hệ thống');
  // The login audit may already have synced before editing on a busy runner.
  // The unsaved student edit must not be written while profile validation fails.
  expect(state.writes.every(payload => payload.students[0].name === 'Cloud student')).toBe(true);
  state.profileError = false;
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('Edited locally')).toBeTruthy();
  expect(state.centerReads).toBe(1);
  await waitFor(() => expect(state.writes.some(payload => payload.students[0].name === 'Edited locally')).toBe(true), { timeout: 3000 });
});

it('ignores a stale initial session rejection after an auth event has opened the workspace', async () => {
  let failInitial!: (error: Error) => void;
  state.sessionRequest = () => new Promise((_, reject) => { failInitial = reject; });
  render(<App />);
  act(() => state.listener?.('SIGNED_IN', {
    access_token: 'current', user: { id: 'test-owner', email: 'owner@example.test', user_metadata: {} },
  }));
  await screen.findByRole('button', { name: 'Open students' });
  await act(async () => { failInitial(new Error('old network request failed')); });
  expect(screen.getByRole('button', { name: 'Open students' })).toBeTruthy();
  expect(screen.queryByText('Chưa thể tải hệ thống')).toBeNull();
  expect(state.centerReads).toBe(1);
});
it('revokes the visible workspace when the refreshed profile is locked', async () => {
  render(<App />);
  await screen.findByRole('button', { name: 'Open students' });
  state.profileActive = false;
  act(() => state.listener?.('SIGNED_IN', { access_token: 'test', user: { id: 'test-owner', email: 'owner@example.test', user_metadata: {} } }));
  await screen.findByText('Tài khoản chưa được cấp quyền');
  expect(screen.queryByRole('button', { name: 'Open students' })).toBeNull();
});
it('keeps local edits and pauses saving when the database quota is exceeded', async () => {
  state.writeError = { code: 'PT429' };
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open students' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit student' }));
  await screen.findByText(/Đã đạt giới hạn lưu dữ liệu/);
  expect(screen.getByText('Edited locally')).toBeTruthy();
  expect(state.writes).toEqual([]); expect(state.centerReads).toBe(1);
});

it('displays OAuth error descriptions returned in the URL on the login screen', async () => {
  window.history.replaceState(null, '', '/?error=access_denied&error_description=Signups+not+allowed+for+this+instance');
  state.sessionRequest = async () => ({ data: { session: null }, error: null });
  render(<App />);
  expect(await screen.findByText('Signups not allowed for this instance')).toBeTruthy();
});

