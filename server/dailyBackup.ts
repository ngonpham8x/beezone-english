import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import {
  backupRecordCounts,
  createBackupArchive,
  type WorkBackupSnapshot,
} from '../src/lib/centerData.js';
import { centerDate } from '../src/lib/dates.js';
import type { CenterBackupData, CenterSettings } from '../src/types.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_BACKUP_BYTES = 18 * 1024 * 1024;
const WORK_TABLES = {
  people: 'bz_work_people',
  tasks: 'bz_work_tasks',
  notes: 'bz_work_notes',
  reasons: 'bz_work_reasons',
  handoffs: 'bz_work_handoffs',
  events: 'bz_work_events',
} as const;

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Supabase server configuration is missing.');
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
  });
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] || character);

export async function createDailyBackupEmail() {
  const client = serviceClient();
  const center = await client.from('center_data').select('payload').eq('id', 'primary').maybeSingle();
  if (center.error || !center.data?.payload) throw new Error('Center data is unavailable.');
  const raw = center.data.payload as CenterBackupData;
  const settings = raw.settings as CenterSettings | undefined;
  if (!settings) throw new Error('Center settings are unavailable.');
  const recipient = (settings.adminReportEmail || settings.email || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(recipient) || recipient.length > 254) throw new Error('Backup recipient is invalid.');

  const workEntries = await Promise.all(
    Object.entries(WORK_TABLES).map(async ([key, table]) => {
      const result = await client.from(table).select('*');
      if (result.error) throw new Error(`Work backup table ${key} is unavailable.`);
      return [key, (result.data || []) as Array<Record<string, unknown>>] as const;
    }),
  );
  const workData = Object.fromEntries(workEntries) as unknown as WorkBackupSnapshot;
  const archive = await createBackupArchive(raw, settings.name, workData);
  const json = JSON.stringify(archive, null, 2);
  const size = Buffer.byteLength(json, 'utf8');
  if (size > MAX_EMAIL_BACKUP_BYTES) throw new Error('Backup attachment exceeds the safe email size.');

  const resendKey = process.env.RESEND_API_KEY;
  const sender = process.env.BACKUP_FROM_EMAIL;
  if (!resendKey || !sender || sender.length > 320 || /[\r\n\0]/.test(sender)) throw new Error('Backup email configuration is missing.');
  const date = centerDate();
  const filename = `BEEZONE_FullBackup_${date}.json`;
  const counts = backupRecordCounts(archive);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `beezone-daily-backup/${date}`,
    },
    body: JSON.stringify({
      from: sender,
      to: [recipient],
      subject: `[BeeZone] Bản sao lưu toàn hệ thống ${date}`,
      html: `<p>Bản sao lưu tự động của <strong>${escapeHtml(settings.name)}</strong> đã được tạo thành công.</p><p>Tệp đính kèm có ${Object.keys(counts).length} nhóm dữ liệu, ${total} bản ghi và mã kiểm tra toàn vẹn SHA-256.</p><p>Hãy giữ email này để khôi phục khi cần. Không chuyển tiếp tệp vì có dữ liệu nội bộ của trung tâm.</p>`,
      attachments: [{ filename, content: Buffer.from(json, 'utf8').toString('base64') }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Backup email provider returned ${response.status}.`);
  return { filename, recipient, bytes: size, groups: Object.keys(counts).length, records: total };
}
