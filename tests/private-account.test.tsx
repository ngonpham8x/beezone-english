// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_STAFF_PERMISSIONS, DEV_OWNER_ACCOUNT, profileToAccount } from '../src/lib/auth';
import { getActiveSessions, registerActiveSession } from '../src/lib/activeSessions';
import { PRIVATE_ACCOUNT_LABEL } from '../src/lib/accountPrivacy';
import { AuthScreen } from '../src/modules/auth/AuthScreen';
import { LoginModal } from '../src/modules/auth/LoginModal';
import { UserManagementModal } from '../src/modules/auth/UserManagementModal';
import { NotificationDialogs } from '../src/components/NotificationDialogs';
import { currentDialog, settleDialog } from '../src/lib/dialogs';

const auth = vi.hoisted(() => ({ enabled: vi.fn(), signIn: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({
  isLocalPreview: false,
  isSupabaseConfigured: true,
  isGoogleSignInEnabled: auth.enabled,
  supabase: { auth: { signInWithOAuth: auth.signIn } },
}));
const privateOwner = {
  ...DEV_OWNER_ACCOUNT,
  id: 'private-owner-test',
  name: PRIVATE_ACCOUNT_LABEL,
  email: 'private@example.test',
  avatar: '',
  isPrivate: true,
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.enabled.mockResolvedValue(true);
  auth.signIn.mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  while (currentDialog()) settleDialog(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('uses only the trusted profile flag for identity privacy and never grants a role from user metadata', () => {
  const profile = {
    id: privateOwner.id,
    full_name: 'Private Person',
    avatar_url: 'https://example.test/private.png',
    role: 'owner' as const,
    is_active: true,
    permissions: null,
    is_private: true,
  };
  const user = {
    id: privateOwner.id,
    email: privateOwner.email,
    user_metadata: { full_name: 'Private Person', is_private: true, role: 'owner' },
  } as any;
  expect(profileToAccount(profile, user)).toMatchObject({
    name: PRIVATE_ACCOUNT_LABEL,
    email: privateOwner.email,
    avatar: '',
    isPrivate: true,
    role: 'owner',
  });
  expect(
    profileToAccount({ ...profile, role: 'staff', is_active: false, is_private: undefined }, user),
  ).toMatchObject({ isPrivate: false, role: 'staff', active: false });
});

it('removes only the private account from the local session list', () => {
  registerActiveSession({ ...privateOwner, isPrivate: false });
  registerActiveSession({ ...DEV_OWNER_ACCOUNT, email: 'visible@example.test' });
  registerActiveSession(privateOwner);
  expect(getActiveSessions().map((session) => session.id)).toEqual([DEV_OWNER_ACCOUNT.id]);
  const onClose = vi.fn();
  render(<LoginModal isOpen currentUser={privateOwner} authenticatedUser={{ id: privateOwner.id, email: privateOwner.email, user_metadata: { full_name: 'Private Person' } }} onClose={onClose} onLogout={vi.fn()} />);
  expect(screen.getByText(privateOwner.email)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Private Person' })).toBeTruthy();
  expect(screen.queryByText(PRIVATE_ACCOUNT_LABEL)).toBeNull();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
});

it('does not show another session identity when the session and profile IDs differ', () => {
  render(<LoginModal isOpen currentUser={privateOwner} authenticatedUser={{ id: 'another-account', email: 'other@example.test', user_metadata: { full_name: 'Another Person' } }} onClose={vi.fn()} onLogout={vi.fn()} />);
  expect(screen.queryByText('Another Person')).toBeNull();
  expect(screen.queryByText('other@example.test')).toBeNull();
  expect(screen.getByText(privateOwner.email)).toBeTruthy();
});

it('hides server-designated accounts from cached sessions without repeatedly requesting the member list', async () => {
  registerActiveSession({ ...privateOwner, isPrivate: false });
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          users: [
            {
              id: 'visible',
              email: 'visible@example.test',
              full_name: 'Visible Account',
              role: 'staff',
              is_active: true,
            },
          ],
          hiddenAccountIds: [privateOwner.id],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  render(
    <UserManagementModal isOpen onClose={vi.fn()} accessToken="test" currentUser={privateOwner} />,
  );
  await screen.findByText('Visible Account');
  await waitFor(() => expect(screen.queryByText(privateOwner.email)).toBeNull());
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(PRIVATE_ACCOUNT_LABEL)).toBeNull();
  expect(screen.getByText('visible@example.test')).toBeTruthy();
});

it('ignores an old member response after closing and reopening the account dialog', async () => {
  let finishOld!: (response: Response) => void;
  const oldRequest = new Promise<Response>((resolve) => {
    finishOld = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            users: [{ id: 'visible', full_name: 'Visible Account', email: 'visible@example.test' }],
            hiddenAccountIds: [privateOwner.id],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
  );
  const props = { onClose: vi.fn(), accessToken: 'test', currentUser: DEV_OWNER_ACCOUNT };
  const view = render(<UserManagementModal {...props} isOpen />);
  view.rerender(<UserManagementModal {...props} isOpen={false} />);
  view.rerender(<UserManagementModal {...props} isOpen />);
  await screen.findByText('Visible Account');
  await act(async () => {
    finishOld(
      new Response(
        JSON.stringify({
          users: [
            { id: privateOwner.id, full_name: 'Old private identity', email: privateOwner.email },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await oldRequest;
  });
  expect(screen.queryByText('Old private identity')).toBeNull();
  expect(screen.queryByText(privateOwner.email)).toBeNull();
  expect(screen.getByText('Visible Account')).toBeTruthy();
});

it('reports a disabled Google provider in the app and permits retry after it is enabled', async () => {
  auth.enabled.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<AuthScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập với Google' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Google chưa được bật');
  expect(auth.signIn).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập với Google' }));
  await waitFor(() =>
    expect(auth.signIn).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
    }),
  );
  expect(screen.queryByText(privateOwner.email)).toBeNull();
});

it('allows another attempt after the public provider check fails', async () => {
  auth.enabled.mockRejectedValueOnce(new Error('private connection details'));
  render(<AuthScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập với Google' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Không thể kết nối Google. Kiểm tra kết nối và thử lại.',
  );
  expect(
    (screen.getByRole('button', { name: 'Đăng nhập với Google' }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(auth.signIn).not.toHaveBeenCalled();
});

it('ignores a local origin preference in a production build and starts OAuth on the current origin', async () => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('MODE', 'development');
  vi.stubEnv('VITE_LOCAL_AUTH_ORIGIN', 'http://127.0.0.1:3000');
  render(<AuthScreen />);
  const button = screen.getByRole('button', { name: 'Đăng nhập với Google' });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button);
  await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith({
    provider: 'google',
    options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
  }));
});

it('announces a pending Google request and prevents duplicate sign-in attempts', async () => {
  let finishCheck!: (enabled: boolean) => void;
  auth.enabled.mockReturnValueOnce(new Promise<boolean>((resolve) => { finishCheck = resolve; }));
  render(<AuthScreen />);
  const button = screen.getByRole('button', { name: 'Đăng nhập với Google' });
  fireEvent.click(button);
  expect(button.textContent).toContain('Đang mở Google');
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(auth.enabled).toHaveBeenCalledTimes(1);
  expect(auth.signIn).not.toHaveBeenCalled();
  await act(async () => { finishCheck(true); });
  await waitFor(() => expect(auth.signIn).toHaveBeenCalledOnce());
  expect(auth.signIn).toHaveBeenCalledWith({
    provider: 'google',
    options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
  });
});

it('restores the login button after OAuth fails without exposing private error details', async () => {
  auth.signIn.mockResolvedValueOnce({ error: new Error('private provider details') });
  render(<AuthScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập với Google' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Không thể kết nối Google. Kiểm tra kết nối và thử lại.',
  );
  const button = screen.getByRole('button', { name: 'Đăng nhập với Google' });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(button.getAttribute('aria-busy')).toBe('false');
  fireEvent.click(button);
  await waitFor(() => expect(auth.signIn).toHaveBeenCalledTimes(2));
});

it('allows an owner to delete a managed account with confirmation and removes it from active sessions', async () => {
  const staffMember = {
    id: 'staff-1',
    email: 'staff@example.test',
    full_name: 'Staff Member',
    role: 'staff' as const,
    is_active: true,
  };
  registerActiveSession({
    id: staffMember.id,
    name: staffMember.full_name,
    email: staffMember.email,
    avatar: '',
    role: staffMember.role,
    active: true,
    permissions: DEFAULT_STAFF_PERMISSIONS,
  });

  render(<NotificationDialogs />);
  const deletedIds = new Set<string>();
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as any)?.url || '';
    const method = init?.method || (typeof input === 'object' && 'method' in input ? (input as any).method : 'GET');
    if (url.includes('/api/admin/users')) {
      if (method === 'PATCH') {
        const rawBody = init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : {};
        if (rawBody.action === 'delete') {
          deletedIds.add(rawBody.userId);
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      const allUsers = [
        { id: DEV_OWNER_ACCOUNT.id, full_name: 'BeeZone Owner', email: DEV_OWNER_ACCOUNT.email, role: 'owner', is_active: true },
        staffMember,
      ];
      return new Response(
        JSON.stringify({
          users: allUsers.filter((u) => !deletedIds.has(u.id)),
          hiddenAccountIds: [],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({}), { status: 404, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetcher);

  render(
    <UserManagementModal
      isOpen
      onClose={vi.fn()}
      accessToken="test-token"
      currentUser={DEV_OWNER_ACCOUNT}
    />,
  );

  const staffElements = await screen.findAllByText('Staff Member');
  expect(staffElements.length).toBeGreaterThanOrEqual(1);

  const deleteButtons = screen.getAllByRole('button', { name: 'Xóa' });
  expect(deleteButtons).toHaveLength(2);

  // First button corresponds to current user (DEV_OWNER_ACCOUNT) -> disabled
  expect((deleteButtons[0] as HTMLButtonElement).disabled).toBe(true);
  // Second button corresponds to staffMember -> enabled
  expect((deleteButtons[1] as HTMLButtonElement).disabled).toBe(false);

  // Click delete on staffMember
  fireEvent.click(deleteButtons[1]);
  expect(screen.getByRole('dialog', { name: 'Xác nhận thao tác' })).toBeTruthy();
  expect(deletedIds.size).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

  await waitFor(() => {
    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'delete', userId: staffMember.id }),
      }),
    );
  });

  // Verify staff session removed from active sessions
  expect(getActiveSessions().some((s) => s.id === staffMember.id)).toBe(false);
  expect(await screen.findByText(/Đã xóa vĩnh viễn tài khoản "Staff Member"/)).toBeTruthy();
  await waitFor(() => expect(screen.queryByText('Staff Member')).toBeNull());
});

it('does not send delete request if confirmation is cancelled', async () => {
  const staffMember = {
    id: 'staff-2',
    email: 'staff2@example.test',
    full_name: 'Staff Two',
    role: 'staff' as const,
    is_active: true,
  };
  render(<NotificationDialogs />);
  const fetcher = vi.fn(async () =>
    new Response(
      JSON.stringify({
        users: [staffMember],
        hiddenAccountIds: [],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  );
  vi.stubGlobal('fetch', fetcher);

  render(
    <UserManagementModal
      isOpen
      onClose={vi.fn()}
      accessToken="test-token"
      currentUser={DEV_OWNER_ACCOUNT}
    />,
  );

  await screen.findByText('Staff Two');
  const deleteBtn = screen.getByRole('button', { name: 'Xóa' });
  fireEvent.click(deleteBtn);

  fireEvent.click(screen.getByRole('button', { name: 'Hủy bỏ' }));
  await act(async () => {});
  expect(fetcher).toHaveBeenCalledTimes(1); // Only the initial GET
});

it.each([true, false])('confirms owner promotion above the editor and reports its result in the visible dialog: %s', async succeeds => {
  const member = { id: 'staff-promote', full_name: 'Promotion Staff', email: 'promote@example.test', role: 'staff', is_active: true };
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify(
    init?.method === 'PATCH' ? succeeds ? { success: true } : { error: 'Không thể cập nhật quyền.' } : { users: [member], hiddenAccountIds: [] }
  ), { status: init?.method === 'PATCH' && !succeeds ? 500 : 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  render(<UserManagementModal isOpen onClose={vi.fn()} accessToken="test-token" currentUser={DEV_OWNER_ACCOUNT} />);
  await screen.findByText('Promotion Staff');
  fireEvent.click(screen.getByRole('button', { name: 'Sửa quyền' }));
  const editor = screen.getByRole('dialog', { name: 'Sửa quyền Promotion Staff' });
  fireEvent.change(within(editor).getByRole('combobox'), { target: { value: 'owner' } });
  fireEvent.click(within(editor).getByRole('button', { name: 'Cập nhật cấp quyền' }));
  const confirmation = screen.getByRole('dialog', { name: 'Xác nhận cập nhật' });
  expect(Number(confirmation.style.zIndex)).toBeGreaterThan(Number(editor.style.zIndex));
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Lưu thay đổi' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
  const body = JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')![1]!.body));
  expect(body.role).toBe('owner');
  if (succeeds) {
    expect(await screen.findByText(/Cập nhật cấp quyền thành công cho tài khoản "Promotion Staff"!/)).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Sửa quyền Promotion Staff' })).toBeNull();
  } else {
    expect(await within(editor).findByRole('alert')).toHaveProperty('textContent', 'Không thể cập nhật quyền.');
    expect(screen.getByRole('dialog', { name: 'Sửa quyền Promotion Staff' })).toBeTruthy();
  }
});

it('opens edit permissions dialog for a user, allows batch selection and updates permissions', async () => {
  const staffMember = {
    id: 'staff-edit',
    email: 'staffedit@example.test',
    full_name: 'Staff To Edit',
    role: 'staff' as const,
    is_active: true,
  };
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as any)?.url || '';
    const method = init?.method || (typeof input === 'object' && 'method' in input ? (input as any).method : 'GET');
    if (url.includes('/api/admin/users')) {
      if (method === 'PATCH') {
        const rawBody = init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : {};
        if (rawBody.action === 'updatePermissions') {
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return new Response(
        JSON.stringify({
          users: [staffMember],
          hiddenAccountIds: [],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({}), { status: 404, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetcher);

  render(
    <UserManagementModal
      isOpen
      onClose={vi.fn()}
      accessToken="test-token"
      currentUser={DEV_OWNER_ACCOUNT}
    />,
  );

  await screen.findByText('Staff To Edit');
  const editBtn = screen.getByRole('button', { name: 'Sửa quyền' });
  fireEvent.click(editBtn);

  // Edit dialog is now open
  expect(screen.getByRole('dialog', { name: /Sửa quyền Staff To Edit/ })).toBeTruthy();
  expect(screen.getByText('Sửa cấp quyền: Staff To Edit')).toBeTruthy();

  // Click batch select button "✓ Chọn tất cả quyền" inside edit dialog
  const selectAllButtons = screen.getAllByRole('button', { name: '✓ Chọn tất cả quyền' });
  fireEvent.click(selectAllButtons[selectAllButtons.length - 1]);

  // Click "Cập nhật cấp quyền"
  const submitBtn = screen.getByRole('button', { name: 'Cập nhật cấp quyền' });
  fireEvent.click(submitBtn);
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

  await waitFor(() => {
    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"action":"updatePermissions"'),
      }),
    );
  });

  // Success message is displayed
  const update = fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1];
  const grants = JSON.parse(String(update?.body)).permissions;
  expect(Object.values(grants.academic).every(value => value === true)).toBe(true);
  expect(grants.academic.classesAdd).toBe(true);
  expect(grants.academic.classesEdit).toBe(true);
  expect(grants.academic.classesDelete).toBe(true);
  expect(grants.teacher.add).toBe(true);
  expect(grants.student.add).toBe(true);
  expect(grants.teacher.edit).toBe(true);
  expect(grants.teacher.delete).toBe(true);
  expect(grants.tuition.delete).toBe(true);
  expect(await screen.findByText(/Cập nhật cấp quyền thành công cho tài khoản "Staff To Edit"!/)).toBeTruthy();
  // Edit dialog is closed
  expect(screen.queryByRole('dialog', { name: /Sửa quyền Staff To Edit/ })).toBeNull();
  const reopen = screen.getByRole('button', { name: 'Sửa quyền' });
  reopen.focus();
  fireEvent.click(reopen);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: /Sửa quyền Staff To Edit/ })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Quản lý tài khoản' })).toBeTruthy();
  expect(document.activeElement).toBe(reopen);
});

