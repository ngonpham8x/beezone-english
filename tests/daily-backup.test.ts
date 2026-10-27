import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/cron/daily-backup';
import { verifyBackupArchive } from '../src/lib/centerData';
import * as initial from '../src/mock/initialData';
import { createDailyBackupEmail } from '../server/dailyBackup';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

const centerPayload = () => structuredClone({
  settings: initial.initialSettings,
  programs: initial.initialPrograms,
  teachers: initial.initialTeachers,
  rooms: initial.initialRooms,
  classes: initial.initialClasses,
  students: initial.initialStudents,
  timetableSlots: initial.initialTimetableSlots,
  grades: initial.initialGrades,
  receipts: initial.initialTuitionReceipts,
  backups: initial.initialBackups,
  activityLogs: initial.initialActivityLogs,
  attendanceSessions: initial.initialAttendanceSessions,
  enrollments: [],
  scheduleChanges: [],
  sessionBillingVersion: 1 as const,
});

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://project.example.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'server-secret');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('BACKUP_FROM_EMAIL', 'BeeZone Backup <backup@example.test>');
  vi.stubEnv('CRON_SECRET', 'cron-test-secret');
  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => table === 'center_data'
        ? { eq: () => ({ maybeSingle: async () => ({ data: { payload: centerPayload() }, error: null }) }) }
        : Promise.resolve({ data: [], error: null })),
    })),
  };
  mocks.createClient.mockReturnValue(client);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('daily full backup email', () => {
  it('builds a verified attachment with center and work sections and sends it once per date', async () => {
    const send = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) =>
      new Response('{"id":"mail-1"}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', send);

    const result = await createDailyBackupEmail();

    expect(result.filename).toMatch(/^BEEZONE_FullBackup_\d{4}-\d{2}-\d{2}\.json$/);
    expect(result.groups).toBe(19);
    const [, options] = send.mock.calls[0];
    expect((options?.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^beezone-daily-backup\//);
    const message = JSON.parse(String(options?.body));
    expect(message.to).toEqual([initial.initialSettings.adminReportEmail]);
    const archive = JSON.parse(Buffer.from(message.attachments[0].content, 'base64').toString('utf8'));
    await expect(verifyBackupArchive(archive, initial.initialSettings)).resolves.toMatchObject({
      schemaVersion: 2,
      workData: { tasks: [], notes: [], reasons: [], handoffs: [], events: [] },
    });
  });

  it('rejects cron requests without the configured bearer secret', async () => {
    const response = {
      statusCode: 0,
      body: null as unknown,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) { this.headers[name] = value; },
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    };
    await handler({ method: 'GET', headers: {} }, response);
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: 'Không được phép.' });
  });
});
