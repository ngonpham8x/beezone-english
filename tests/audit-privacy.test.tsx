// @vitest-environment jsdom
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createAuditPrivacy } from '../src/lib/auditPrivacy';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import { PRIVATE_ACCOUNT_LABEL } from '../src/lib/accountPrivacy';
import { ActivityLogView } from '../src/modules/system/ActivityLogView';
import { useAccountAudit } from '../src/modules/system/useAccountAudit';

vi.mock('../src/lib/supabase', () => ({ isLocalPreview: false }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const privateProfile = {
  id: 'private-id',
  email: 'private@example.test',
  full_name: 'Private Person',
  is_private: true,
};
const base = {
  id: 'log',
  timestamp: '2026-10-14',
  userEmail: privateProfile.email,
  userName: 'Old Google Name',
  action: 'SỬA' as const,
  module: 'Học viên',
  details: 'Private Person saved a student',
};

it('omits the entire private activity from the rendered journal and search, preserving stored records', () => {
  const privacy = createAuditPrivacy([privateProfile]);
  const visible = { ...base, id: 'visible-log', userEmail: 'visible@example.test', userName: 'Visible Person', details: 'A visible activity' };
  const stored = structuredClone([base, visible]);
  const logs = privacy.activityLogs(stored);
  expect(logs).toEqual([visible]);
  render(
    <ActivityLogView
      logs={logs}
      accountLogs={[]}
      isAccountAuditLoading={false}
      accountAuditError={null}
      onRefreshAccountLogs={vi.fn()}
    />,
  );
  expect(screen.queryByText(PRIVATE_ACCOUNT_LABEL)).toBeNull();
  expect(screen.queryByText(base.details)).toBeNull();
  expect(screen.getByText(visible.details)).toBeTruthy();
  expect(document.body.textContent).not.toContain('Old Google Name');
  expect(document.body.textContent).not.toContain('private@example.test');
  expect(document.body.textContent).not.toContain('p•••@example.test');
  fireEvent.change(screen.getByLabelText('Tìm nhật ký hệ thống'), {
    target: { value: privateProfile.email },
  });
  expect(screen.queryByText(logs[0].details)).toBeNull();
  expect(stored).toEqual([base, visible]);
});

it('keeps legacy visible accounts and treats special characters in a private name literally', () => {
  expect(
    createAuditPrivacy([{ ...privateProfile, is_private: undefined }]).activityLogs([base]),
  ).toEqual([base]);
  const privacy = createAuditPrivacy([{ ...privateProfile, full_name: 'A+B (Owner)' }]);
  const visible = { ...base, userEmail: 'visible@example.test', userName: 'Visible Person', details: 'AAB Owner unchanged' };
  expect(privacy.activityLogs([
    { ...visible, id: 'hidden-1', details: 'A+B (Owner) saved' },
    { ...visible, id: 'hidden-2', details: 'A+B (Owner) saved again' },
    visible,
  ])).toEqual([visible]);
});

it('hides whole account entries for private actors, targets and identity references, retaining ordinary entries', () => {
  const row = {
    id: 'audit',
    occurred_at: '2026-10-14T08:00:00Z',
    action: 'ACCOUNT_UPDATED' as const,
    actor_id: privateProfile.id,
    actor_name: 'Old Google Name',
    target_id: 'visible-id',
    target_name: 'Visible Person',
    target_role: 'staff' as const,
    details: 'Updated by PRIVATE@example.test',
  };
  const rows = [
    row,
    { ...row, id: 'hidden-id', target_id: privateProfile.id },
    { ...row, id: 'hidden-legacy', target_id: null, target_name: privateProfile.full_name },
    { ...row, id: 'hidden-actor-id', actor_name: PRIVATE_ACCOUNT_LABEL, details: 'Permission update' },
    { ...row, id: 'hidden-target-id', actor_id: 'visible-owner', actor_name: 'Visible Owner', target_id: privateProfile.id, target_name: PRIVATE_ACCOUNT_LABEL, details: 'Permission update' },
    { ...row, id: 'hidden-reference', actor_id: 'visible-owner', actor_name: 'Visible Owner', details: 'Mentioned PRIVATE@example.test' },
    { ...row, id: 'hidden-legacy-email', actor_id: null, actor_name: 'Visible Owner', target_id: null, target_name: 'Old name (Private@example.test)', details: 'Permission update' },
    { ...row, id: 'visible', actor_id: 'visible-owner', actor_name: 'Visible Owner', details: 'An ordinary permission update' },
  ];
  const snapshot = structuredClone(rows);
  const visible = createAuditPrivacy([privateProfile]).accountLogs(rows);
  expect(visible).toHaveLength(1);
  expect(visible[0]).toMatchObject({
    id: 'visible',
    actorName: 'Visible Owner',
    targetName: 'Visible Person',
    details: 'An ordinary permission update',
  });
  expect(rows).toEqual(snapshot);
});

it('hides private references in another actor\'s details, name and module, without treating the generic system label as an identity', () => {
  const visible = { ...base, userEmail: 'visible@example.test', userName: 'Visible Owner', details: 'An ordinary update' };
  const privacy = createAuditPrivacy([privateProfile]);
  expect(privacy.activityLogs([
    { ...visible, id: 'email', details: 'Changed PRIVATE@example.test' },
    { ...visible, id: 'name', details: 'Changed Private Person' },
    { ...visible, id: 'module', module: 'Profile private-id' },
    { ...visible, id: 'legacy', userEmail: '', userName: privateProfile.full_name },
    visible,
  ])).toEqual([visible]);
  expect(createAuditPrivacy([{ ...privateProfile, full_name: PRIVATE_ACCOUNT_LABEL }]).activityLogs([
    { ...visible, userName: PRIVATE_ACCOUNT_LABEL },
  ])).toEqual([{ ...visible, userName: PRIVATE_ACCOUNT_LABEL }]);
  expect(() => privacy.activityLogs([{ ...base, userEmail: null }])).toThrow('Invalid activity log');
});

it('never falls back to raw shared logs when the audit API fails or a late response belongs to a previous account', async () => {
  let finish!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pending));
  const store = { activityLogs: [base], accountAuditLogs: [], setAccountAuditLogs: vi.fn() } as any;
  const session = { access_token: 'example' } as any;
  const view = renderHook(({ user }) => useAccountAudit(store, user, session, 'activity-logs'), {
    initialProps: { user: DEV_OWNER_ACCOUNT as typeof DEV_OWNER_ACCOUNT | null },
  });
  expect(view.result.current.visibleActivityLogs).toEqual([]);
  view.rerender({ user: null });
  await act(async () => {
    finish(
      new Response(JSON.stringify({ logs: [], activityLogs: [base] }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await pending;
  });
  expect(view.result.current.visibleActivityLogs).toEqual([]);
  expect(store.setAccountAuditLogs).not.toHaveBeenCalledWith(expect.arrayContaining([base]));
  view.unmount();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
  const failed = renderHook(() =>
    useAccountAudit(store, DEV_OWNER_ACCOUNT, session, 'activity-logs'),
  );
  await waitFor(() => expect(failed.result.current.accountAuditError).toBeTruthy());
  expect(failed.result.current.visibleActivityLogs).toEqual([]);
});
