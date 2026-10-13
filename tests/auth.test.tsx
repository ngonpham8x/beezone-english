// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { initialSettings, initialStudents } from '../src/mock/initialData';

const state = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: any) => void),
  payload: {} as any, centerError: false, profileActive: true,
  profileReads: 0, centerReads: 0, writes: [] as any[],
}));
vi.mock('../src/lib/supabase', () => {
  const session = { access_token: 'test-token', user: { id: 'test-owner', email: 'owner@example.test', user_metadata: {} } };
  return { isSupabaseConfigured: true, isLocalPreview: false, supabase: {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: (listener: any) => { state.listener = listener; return { data: { subscription: { unsubscribe: () => { if (state.listener === listener) state.listener = null; } } } }; },
      signOut: async () => ({ error: null }),
    },
    from(table: string) {
      let update: any;
      const builder = {
        select: () => builder, eq: () => builder,
        update: (value: any) => { update = value; return builder; }, insert: (value: any) => { update = value; return builder; },
        async maybeSingle() {
          if (table === 'profiles') { state.profileReads++; return { data: state.profileActive ? { id: 'test-owner', full_name: 'Test Owner', role: 'owner', is_active: true, avatar_url: null, permissions: null } : null, error: null }; }
          if (update) { state.writes.push(structuredClone(update.payload)); return { data: { updated_at: `revision-${state.writes.length}` }, error: null }; }
          state.centerReads++;
          return { data: { payload: structuredClone(state.payload), updated_at: 'initial-revision' }, error: state.centerError ? { message: 'offline' } : null };
        },
        async single() { return builder.maybeSingle(); },
      };
      return builder;
    },
  } };
});
vi.mock('../src/components/DashboardView', () => ({ DashboardView: ({ onNavigateTab }: any) => <button onClick={() => onNavigateTab('students')}>Open students</button> }));
vi.mock('../src/components/StudentManager', () => ({ StudentManager: ({ students, onUpdateStudent }: any) => <div><p>{students[0]?.name}</p><button onClick={() => onUpdateStudent({ ...students[0], name: 'Edited locally' })}>Edit student</button></div> }));
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  state.payload = { settings: initialSettings, students: [{ ...initialStudents[0], name: 'Cloud student' }] };
  state.centerError = false; state.profileActive = true; state.profileReads = 0; state.centerReads = 0; state.writes = [];
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
it('shows a data-load error and retries without opening demonstration data', async () => {
  state.centerError = true;
  render(<App />);
  await screen.findByText('Chưa thể tải hệ thống');
  expect(screen.queryByRole('button', { name: 'Open students' })).toBeNull();
  state.centerError = false;
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByRole('button', { name: 'Open students' })).toBeTruthy();
});
it('revokes the visible workspace when the refreshed profile is locked', async () => {
  render(<App />);
  await screen.findByRole('button', { name: 'Open students' });
  state.profileActive = false;
  act(() => state.listener?.('SIGNED_IN', { access_token: 'test', user: { id: 'test-owner', email: 'owner@example.test', user_metadata: {} } }));
  await screen.findByText('Tài khoản chưa được cấp quyền');
  expect(screen.queryByRole('button', { name: 'Open students' })).toBeNull();
});
