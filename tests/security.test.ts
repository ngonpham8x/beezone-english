import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBurstLimiter, clientAddress } from '../server/rateLimit';
import { getBearerToken, parseRequestBody, requestIsAllowed } from '../server/request';
import { reportError } from '../src/lib/diagnostics';

const callerId = '00000000-0000-4000-8000-000000000001';
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  create: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  writes: vi.fn(),
  reads: vi.fn(),
  profile: {} as any,
  existing: null as any,
  members: [] as any[],
  target: null as any,
  auditError: false,
  auditRows: [] as any[],
  center: null as any,
  profileListError: false,
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: any[]) => {
    state.create(...args);
    return {
      auth: {
        getUser: state.auth,
        admin: { createUser: state.createUser, deleteUser: state.deleteUser },
      },
      rpc: state.rpc,
      from(table: string) {
        let action = 'read';
        let lookup = '';
        let column = '';
        const result = () => {
          if (action !== 'read')
            return {
              data: null,
              error:
                table === 'account_audit_logs' && state.auditError
                  ? { message: 'private failure' }
                  : null,
            };
          if (table === 'profiles' && column === 'id' && lookup === callerId)
            return { data: state.profile, error: null };
          if (table === 'profiles' && column === 'id') return { data: state.target, error: null };
          if (column === 'email') return { data: state.existing, error: null };
          if (table === 'profiles') return { data: state.members, error: state.profileListError ? { message: 'private profile failure' } : null };
          if (table === 'account_audit_logs') return { data: state.auditRows, error: null };
          if (table === 'center_data') return { data: state.center, error: null };
          return { data: [], error: null };
        };
        const builder: any = {
          select: () => builder,
          eq: (key: string, value: string) => {
            column = key;
            lookup = value;
            return builder;
          },
          order: () => {
            state.reads(table);
            return builder;
          },
          limit: () => builder,
          update: (value: any) => {
            action = 'update';
            state.writes(table, value);
            return builder;
          },
          upsert: (value: any) => {
            action = 'upsert';
            state.writes(table, value);
            return builder;
          },
          insert: (value: any) => {
            action = 'insert';
            state.writes(table, value);
            return builder;
          },
          maybeSingle: async () => result(),
          then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
        };
        return builder;
      },
    };
  },
}));

const request = (method = 'GET', extra: Record<string, any> = {}) => ({
  method,
  socket: { remoteAddress: '203.0.113.4' },
  headers: {
    authorization: 'Bearer header.payload.signature',
    origin: 'https://center.example.test',
    'content-type': 'application/json',
  },
  ...extra,
});
function response() {
  const res = {
    statusCode: 0,
    body: {} as any,
    headersSent: false,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      res.headersSent = true;
      return res;
    },
  };
  return res;
}
async function call(route = 'users', req = request()) {
  const handler = (await import(`../api/admin/${route}.ts`)).default;
  const res = response();
  await handler(req, res);
  return res;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('APP_URL', 'https://center.example.test');
  vi.stubEnv('ALLOWED_ORIGINS', '');
  vi.stubEnv('SUPABASE_URL', 'https://project.example.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'server-only-test-key');
  state.profile = { id: callerId, full_name: 'Test Owner', role: 'owner', is_active: true };
  state.existing = null;
  state.members = [];
  state.target = null;
  state.auditError = false;
  state.auditRows = [];
  state.center = null;
  state.profileListError = false;
  state.auth.mockResolvedValue({ data: { user: { id: callerId } }, error: null });
  state.rpc.mockResolvedValue({ data: [{ allowed: true, retry_after: 0 }], error: null });
  state.createUser.mockResolvedValue({
    data: { user: { id: '00000000-0000-4000-8000-000000000002' } },
    error: null,
  });
  state.deleteUser.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('request boundary', () => {
  it.each([
    'https://evil.example',
    'null',
    ['https://center.example.test'],
    'https://center.example.test/path',
  ])('rejects untrusted/malformed origin %j', async (origin) => {
    const res = await call(
      'users',
      request('GET', { headers: { origin, host: 'evil.example', authorization: 'Bearer token' } }),
    );
    expect(res.statusCode).toBe(403);
    expect(state.create).not.toHaveBeenCalled();
  });
  it('uses configured deployment domains, not Host as an origin allowlist', () => {
    expect(
      requestIsAllowed({ headers: { origin: 'https://evil.example', host: 'evil.example' } }),
    ).toBe(false);
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_URL', 'preview.example.test');
    expect(requestIsAllowed({ headers: { origin: 'https://preview.example.test' } })).toBe(true);
    expect(requestIsAllowed({ headers: { 'sec-fetch-site': 'cross-site' } })).toBe(false);
  });
  it.each([
    undefined,
    ['Bearer token'],
    'Bearer ',
    'Bearer token',
    'Bearer token,token',
    `Bearer ${'x'.repeat(8192)}`,
  ])('rejects malformed bearer %j', async (authorization) => {
    expect(getBearerToken({ headers: { authorization } })).toBeNull();
    const res = await call('users', request('GET', { headers: { authorization } }));
    expect(res.statusCode).toBe(401);
    expect(state.create).not.toHaveBeenCalled();
  });
  it('rejects oversized UTF-8, even when its character count is small', async () => {
    const body = JSON.stringify({ fullName: 'ệ'.repeat(4000) });
    expect(body.length).toBeLessThan(10_000);
    expect(parseRequestBody(body)).toBeNull();
    const res = await call('users', request('POST', { body }));
    expect(res.statusCode).toBe(400);
    expect(state.auth).not.toHaveBeenCalled();
  });
  it.each([
    [{ 'content-type': 'text/plain' }, 415],
    [{ 'content-type': 'application/json', 'content-length': '10001' }, 413],
    [{ 'content-type': 'application/json', 'content-length': '-1' }, 400],
    [{ 'content-type': 'application/json', 'content-encoding': 'gzip' }, 415],
  ])('rejects bad body headers before authentication %j', async (headers, status) => {
    const res = await call('users', request('POST', { headers, body: '{}' }));
    expect(res.statusCode).toBe(status);
    expect(state.auth).not.toHaveBeenCalled();
  });
  it('rejects unsupported methods without reaching Supabase', async () => {
    const res = await call('audit-logs', request('POST'));
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(state.create).not.toHaveBeenCalled();
  });
});

describe('authorization and durable quotas', () => {
  it('excludes whole private activities and account entries from API responses without writing history', async () => {
    state.members = [{ id: 'private-id', email: 'private@example.test', full_name: 'Private Person', is_private: true }];
    const base = { id: 'account-log', occurred_at: '2026-10-14T08:00:00Z', action: 'ACCOUNT_UPDATED', actor_id: 'private-id', actor_name: 'Private Person', target_id: 'visible-id', target_name: 'Visible Person', target_role: 'staff', details: 'Changed by private@example.test' };
    state.auditRows = [base, { ...base, id: 'hidden', target_id: 'private-id', target_name: 'Private Person' }, { ...base, id: 'visible-account-log', actor_id: callerId, actor_name: 'Visible Owner', details: 'An ordinary permission update' }];
    const visibleActivity = { id: 'visible-business-log', timestamp: '2026-10-14', userEmail: 'visible@example.test', userName: 'Visible Owner', action: 'SỬA', module: 'Học viên', details: 'An ordinary update' };
    state.center = { payload: { activityLogs: [{ id: 'business-log', timestamp: '2026-10-14', userEmail: 'PRIVATE@example.test', userName: 'Old Google Name', action: 'SỬA', module: 'Học viên', details: 'Private Person updated a record' }, visibleActivity] } };
    const stored = structuredClone({ audit: state.auditRows, center: state.center });
    const res = await call('audit-logs');
    expect(res.statusCode).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0]).toMatchObject({ id: 'visible-account-log', actorName: 'Visible Owner', targetName: 'Visible Person' });
    expect(res.body.activityLogs).toEqual([visibleActivity]);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('private@example.test');
    expect(JSON.stringify(res.body)).not.toContain('Private Person');
    expect(JSON.stringify(res.body)).not.toContain('Old Google Name');
    expect({ audit: state.auditRows, center: state.center }).toEqual(stored);
    expect(state.writes).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalled();
  });
  it('returns no logs when private-account visibility cannot be checked', async () => {
    state.profileListError = true;
    const res = await call('audit-logs');
    expect(res.statusCode).toBe(500);
    expect(res.body.logs).toBeUndefined();
    expect(res.body.activityLogs).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('private profile failure');
  });
  it('omits private identities from account responses but retains IDs for filtering cached session rows', async () => {
    state.members = [
      { id: 'private-id', email: 'private@example.test', full_name: 'Private Person', is_private: true },
      { id: 'visible-id', email: 'visible@example.test', full_name: 'Visible Person', role: 'staff', is_active: true },
    ];
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.hiddenAccountIds).toEqual(['private-id']);
    expect(JSON.stringify(res.body)).not.toContain('private@example.test');
    expect(JSON.stringify(res.body)).not.toContain('Private Person');
    expect(state.rpc).toHaveBeenCalled();
  });
  it('does not modify a private owner through an account name guessed from outside the list', async () => {
    state.existing = { id: 'private-id', is_private: true, role: 'owner', is_active: true };
    const res = await call('users', request('POST', { body: { email: 'private@example.test', fullName: 'Changed Name', role: 'staff' } }));
    expect(res.statusCode).toBe(404);
    expect(state.writes).not.toHaveBeenCalled();
    expect(state.createUser).not.toHaveBeenCalled();
  });
  it('preserves the actor ID and audit event when the acting owner has display privacy enabled', async () => {
    state.profile = { ...state.profile, full_name: 'Private Person', is_private: true };
    const res = await call('users', request('POST', { body: { email: 'visible@example.test', fullName: 'Visible Person', role: 'staff' } }));
    expect(res.statusCode).toBe(201);
    const log = state.writes.mock.calls.find(call => call[0] === 'account_audit_logs')![1];
    expect(log).toMatchObject({ actor_id: callerId, actor_name: 'Quản trị hệ thống', action: 'ACCOUNT_PROVISIONED' });
  });
  it.each(['users', 'audit-logs'])('blocks inactive owners and staff at %s', async (route) => {
    state.profile = { ...state.profile, is_active: false };
    expect((await call(route)).statusCode).toBe(403);
    state.profile = { ...state.profile, is_active: true, role: 'staff' };
    expect((await call(route)).statusCode).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.reads).not.toHaveBeenCalled();
  });
  it('rejects invalid live sessions rather than trusting JWT contents', async () => {
    state.auth.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });
    expect((await call()).statusCode).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each(['users', 'audit-logs'])(
    'returns 429 with Retry-After before reading %s',
    async (route) => {
      state.rpc.mockResolvedValue({ data: [{ allowed: false, retry_after: 42 }], error: null });
      const res = await call(route);
      expect(res.statusCode).toBe(429);
      expect(res.headers['Retry-After']).toBe('42');
      expect(res.headers['Cache-Control']).toContain('no-store');
      expect(state.reads).not.toHaveBeenCalled();
    },
  );
  it('fails closed when the quota migration/database is unavailable', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'internal SQL details' } });
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('SQL');
    expect(state.reads).not.toHaveBeenCalled();
    expect(state.writes).not.toHaveBeenCalled();
  });
  it('shares a quota scope between admin read routes', async () => {
    expect((await call('users')).statusCode).toBe(200);
    expect((await call('audit-logs')).statusCode).toBe(200);
    expect(state.rpc.mock.calls.map((call) => call[1])).toEqual([
      { p_actor_id: callerId, p_scope: 'admin-read' },
      { p_actor_id: callerId, p_scope: 'admin-read' },
    ]);
  });
  it('preserves provisioning and audit behavior under a write quota', async () => {
    const res = await call(
      'users',
      request('POST', {
        body: {
          email: 'new@example.test',
          fullName: 'Test Staff',
          role: 'staff',
          permissions: { student: { view: true, delete: 'true' }, academic: { classes: true, rooms: true, programs: 'true' } },
        },
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(state.rpc).toHaveBeenCalledWith('consume_admin_request_quota', {
      p_actor_id: callerId,
      p_scope: 'admin-write',
    });
    const profile = state.writes.mock.calls.find((call) => call[0] === 'profiles')[1];
    expect(profile.permissions.student.view).toBe(true);
    expect(profile.permissions.student.delete).toBe(false);
    expect(profile.permissions.academic).toEqual({ classes: true, rooms: true, programs: false, classesAdd: true, classesEdit: true, classesDelete: true, roomsAdd: true, roomsEdit: true, roomsDelete: true, programsAdd: false, programsEdit: false, programsDelete: false });
    expect(state.writes.mock.calls.some((call) => call[0] === 'account_audit_logs')).toBe(true);
  });
  it('removes a partly provisioned account if audit recording fails', async () => {
    state.auditError = true;
    const res = await call(
      'users',
      request('POST', {
        body: { email: 'new@example.test', fullName: 'Test Staff', role: 'staff' },
      }),
    );
    expect(res.statusCode).toBe(500);
    expect(state.deleteUser).toHaveBeenCalledOnce();
  });
  it('never allows an owner to lock their own account', async () => {
    const res = await call(
      'users',
      request('PATCH', { body: { action: 'setActive', userId: callerId, active: false } }),
    );
    expect(res.statusCode).toBe(400);
    expect(state.writes).not.toHaveBeenCalled();
  });
  it('reports unconfirmed rollback when deleting a partly provisioned account fails', async () => {
    state.auditError = true;
    state.deleteUser.mockResolvedValue({ error: { message: 'private deletion failure' } });
    const res = await call(
      'users',
      request('POST', {
        body: { email: 'new@example.test', fullName: 'Test Staff', role: 'staff' },
      }),
    );
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain('không thể xác nhận hoàn tác');
    expect(res.body.error).not.toContain('private deletion failure');
  });
  it('sanitizes unexpected SDK errors', async () => {
    state.auth.mockRejectedValue(new Error('secret-token-private-contact'));
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('secret-token');
  });
  it('blocks repeated requests before another auth call', async () => {
    for (let i = 0; i < 60; i++) expect((await call()).statusCode).toBe(200);
    const res = await call('audit-logs');
    expect(res.statusCode).toBe(429);
    expect(state.auth).toHaveBeenCalledTimes(60);
  });
});

describe('bounded local burst guard and diagnostics', () => {
  it('resets expired windows and provides a real wait time', () => {
    const consume = createBurstLimiter();
    expect(consume('ip', 2, 60_000, 0)).toBe(0);
    expect(consume('ip', 2, 60_000, 1)).toBe(0);
    expect(consume('ip', 2, 60_000, 1000)).toBe(59);
    expect(consume('ip', 2, 60_000, 60_000)).toBe(0);
  });
  it('bounds memory without evicting active quotas to allow bypass', () => {
    const consume = createBurstLimiter(2);
    consume('a', 1, 60_000, 0);
    consume('b', 1, 60_000, 0);
    expect(consume('new', 1, 60_000, 1)).toBeGreaterThan(0);
    expect(consume('a', 1, 60_000, 1)).toBeGreaterThan(0);
    expect(consume('new', 1, 60_000, 60_000)).toBe(0);
  });
  it('ignores spoofed IP headers outside Vercel and invalid/multiple IPs', () => {
    const req = request('GET', { headers: { 'x-vercel-forwarded-for': '203.0.113.9' } });
    expect(clientAddress(req)).toBe('203.0.113.4');
    vi.stubEnv('VERCEL', '1');
    expect(clientAddress(req)).toBe('203.0.113.9');
    expect(
      clientAddress(request('GET', { headers: { 'x-vercel-forwarded-for': 'evil,spoof' } })),
    ).toBe('unknown');
  });
  it('omits raw exception and personal data from production logs', () => {
    vi.stubEnv('DEV', false);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError('ui.render', new Error('private token/contact'));
    expect(log).toHaveBeenCalledExactlyOnceWith('[BeeZone:ui.render]');
  });
});
