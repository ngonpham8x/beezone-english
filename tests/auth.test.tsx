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
  writeError: null as null | { code: string; message?: string; details?: string },
  casConflictOnce: false,
  realtimeListener: null as null | ((change: any) => void),
  revision: 'initial-revision',
  consentActive: true,
  profileReads: 0, centerReads: 0, centerRevisionReads: 0, writes: [] as any[],
}));
vi.mock('../src/lib/supabase', () => {
  const session = { access_token: 'test-token', user: { id: 'test-owner', email: 'owner@example.test', user_metadata: { full_name: 'Google Account Name' } } };
  return { isSupabaseConfigured: true, isLocalPreview: false, supabase: {
    auth: {
      getSession: async () => state.sessionRequest ? state.sessionRequest() : ({ data: { session }, error: null }),
      onAuthStateChange: (listener: any) => { state.listener = listener; return { data: { subscription: { unsubscribe: () => { if (state.listener === listener) state.listener = null; } } } }; },
      signOut: async () => ({ error: null }),
    },
    channel() {
      const channel: any = {
        listener: null as null | ((change: any) => void),
        on: (_event: string, _filter: unknown, listener: (change: any) => void) => {
          channel.listener = listener;
          state.realtimeListener = listener;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: async (channel: any) => {
      if (state.realtimeListener === channel.listener) state.realtimeListener = null;
      return 'ok';
    },
    rpc: async (name: string, args?: any) => {
      if (name === 'bz_accept_privacy_policy') state.consentActive = true;
      if (name === 'bz_withdraw_privacy_policy') state.consentActive = false;
      if (name === 'bz_get_center_snapshot') {
        state.centerReads++;
        return state.centerError
          ? { data: null, error: { message: 'offline' } }
          : { data: { payload: structuredClone(state.payload), updated_at: state.revision }, error: null };
      }
      if (name === 'bz_save_center_snapshot') {
        if (state.writeError) return { data: null, error: state.writeError };
        if (state.casConflictOnce) {
          state.casConflictOnce = false;
          return { data: { applied: false, updated_at: state.revision }, error: null };
        }
        state.payload = structuredClone(args.p_payload);
        state.writes.push(structuredClone(args.p_payload));
        state.revision = `revision-${state.writes.length}`;
        return { data: { applied: true, updated_at: state.revision }, error: null };
      }
      return { data: null, error: null };
    },
    from(table: string) {
      let update: any;
      let selectedColumns = '*';
      const builder = {
        select: (columns = '*') => { selectedColumns = columns; return builder; }, eq: () => builder,
        update: (value: any) => { update = value; return builder; }, insert: (value: any) => { update = value; return builder; },
        async maybeSingle() {
          if (table === 'profiles') { state.profileReads++; return { data: state.profileActive ? { id: 'test-owner', full_name: 'Test Owner', role: state.profileRole, is_active: true, is_private: state.profilePrivate, avatar_url: null, permissions: state.profilePermissions } : null, error: state.profileError ? { message: 'offline' } : null }; }
          if (table === 'privacy_consents') return { data: state.consentActive ? { purposes: ['authentication', 'center-operations', 'security-audit'], consented_at: '2026-11-05T00:00:00.000Z', withdrawn_at: null } : null, error: null };
          if (update) {
            if (state.writeError) return { data: null, error: state.writeError };
            if (state.casConflictOnce) {
              state.casConflictOnce = false;
              return { data: null, error: null };
            }
            state.payload = structuredClone(update.payload);
            state.writes.push(structuredClone(update.payload));
            state.revision = `revision-${state.writes.length}`;
            return { data: { updated_at: state.revision }, error: null };
          }
          if (selectedColumns === 'updated_at') {
            state.centerRevisionReads++;
            return { data: { updated_at: state.revision }, error: state.centerError ? { message: 'offline' } : null };
          }
          state.centerReads++;
          return { data: { payload: structuredClone(state.payload), updated_at: state.revision }, error: state.centerError ? { message: 'offline' } : null };
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
  state.centerError = false; state.profileActive = true; state.profileReads = 0; state.centerReads = 0; state.centerRevisionReads = 0; state.writes = [];
  state.writeError = null;
  state.casConflictOnce = false;
  state.realtimeListener = null;
  state.revision = 'initial-revision';
  state.consentActive = true;
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
  expect(state.centerReads).toBe(2);
  expect(screen.getByText('Edited locally')).toBeTruthy();
  state.profilePermissions.student.add = true;
  time.mockReturnValue(now + 8000);
  fireEvent.focus(window);
  await screen.findByText('Can add student');
  expect(state.profileReads).toBe(3);
  expect(state.centerReads).toBe(3);
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

it('refreshes and merges the latest server data before retrying after the network returns', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open students' }));
  await waitFor(() => expect(state.writes.length).toBeGreaterThan(0), { timeout: 3000 });

  state.writeError = { code: '', message: 'TypeError: Load failed' };
  fireEvent.click(screen.getByRole('button', { name: 'Edit student' }));
  await screen.findByText(/Mất kết nối với máy chủ/);

  const remotePayload = structuredClone(state.payload);
  remotePayload.students[0].phone = '0777777777';
  state.payload = remotePayload;
  state.revision = 'remote-after-offline';
  state.writeError = null;
  fireEvent(window, new Event('online'));

  await waitFor(() => expect(state.writes.some((payload) =>
    payload.students[0].name === 'Edited locally' && payload.students[0].phone === '0777777777',
  )).toBe(true), { timeout: 4000 });
  expect(screen.queryByText(/Mất kết nối với máy chủ/)).toBeNull();
});

it('merges non-overlapping polled edits from another device and saves both changes', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open students' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit student' }));
  const remotePayload = structuredClone(state.payload);
  remotePayload.students[0].phone = '0999999999';
  state.payload = remotePayload;
  state.revision = 'remote-revision-2';
  fireEvent.focus(window);

  expect(screen.getByText('Edited locally')).toBeTruthy();
  expect(screen.queryByText(/nội dung đang được sửa khác nhau/)).toBeNull();
  await waitFor(() => expect(state.writes.some((payload) =>
    payload.students[0].name === 'Edited locally' && payload.students[0].phone === '0999999999',
  )).toBe(true), { timeout: 3000 });
});

it('asks which value to keep only when two devices edit the same field', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open students' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit student' }));
  const remotePayload = structuredClone(state.payload);
  remotePayload.students[0].name = 'Edited remotely';
  state.payload = remotePayload;
  state.revision = 'remote-revision-3';
  fireEvent.focus(window);

  expect(await screen.findByText(/nội dung đang được sửa khác nhau/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Ưu tiên thay đổi trên máy này' }));
  expect(screen.getByText('Edited locally')).toBeTruthy();
  await waitFor(() => expect(state.writes.some((payload) => payload.students[0].name === 'Edited locally')).toBe(true), { timeout: 3000 });
});

it('falls back to a server read and automatic merge when a polling cycle is missed', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open students' }));
  await waitFor(() => expect(state.writes.length).toBeGreaterThan(0), { timeout: 3000 });
  const remotePayload = structuredClone(state.payload);
  remotePayload.students[0].phone = '0888888888';
  state.payload = remotePayload;
  state.revision = 'missed-realtime-revision';
  state.casConflictOnce = true;
  fireEvent.click(screen.getByRole('button', { name: 'Edit student' }));

  await waitFor(() => expect(state.writes.some((payload) =>
    payload.students[0].name === 'Edited locally' && payload.students[0].phone === '0888888888',
  )).toBe(true), { timeout: 4000 });
  expect(screen.queryByText(/nội dung đang được sửa khác nhau/)).toBeNull();
});

it('displays OAuth error descriptions returned in the URL on the login screen', async () => {
  window.history.replaceState(null, '', '/?error=access_denied&error_description=Signups+not+allowed+for+this+instance');
  state.sessionRequest = async () => ({ data: { session: null }, error: null });
  render(<App />);
  expect(await screen.findByText('Signups not allowed for this instance')).toBeTruthy();
});

it('does not load center data before the account records current privacy consent', async () => {
  state.consentActive = false;
  render(<App />);
  expect(await screen.findByText('Xác nhận bảo vệ dữ liệu cá nhân')).toBeTruthy();
  expect(state.centerReads).toBe(0);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận và tiếp tục' }));
  expect(await screen.findByRole('button', { name: 'Open students' })).toBeTruthy();
  expect(state.centerReads).toBe(1);
  expect(state.consentActive).toBe(true);
});

