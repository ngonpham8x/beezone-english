import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackupArchive, WorkBackupSnapshot } from '../../lib/centerData';

const WORK_TABLES = {
  people: 'bz_work_people',
  tasks: 'bz_work_tasks',
  notes: 'bz_work_notes',
  reasons: 'bz_work_reasons',
  handoffs: 'bz_work_handoffs',
  events: 'bz_work_events',
} as const;

export async function fetchWorkBackupSnapshot(client: SupabaseClient): Promise<WorkBackupSnapshot> {
  const people = await client.rpc('bz_work_sync_people');
  if (people.error) throw new Error('Không thể đồng bộ danh bạ trước khi sao lưu Giao việc.');
  const entries = await Promise.all(
    Object.entries(WORK_TABLES).map(async ([key, table]) => {
      const result = await client.from(table).select('*');
      if (result.error) throw new Error(`Không thể sao lưu bảng Giao việc ${key}.`);
      return [key, (result.data || []) as Array<Record<string, unknown>>] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as WorkBackupSnapshot;
}

export async function restoreFullBackupArchive(
  client: SupabaseClient,
  archive: BackupArchive,
): Promise<void> {
  if (!archive.workData) throw new Error('Bản sao này không có dữ liệu Giao việc để khôi phục máy chủ.');
  const { error } = await client.rpc('bz_restore_full_backup', {
    p_payload: archive.data,
    p_work: archive.workData,
  });
  if (error) throw new Error('Không thể khôi phục toàn bộ bản sao trên máy chủ. Hãy kiểm tra migration sao lưu và thử lại.');
}
