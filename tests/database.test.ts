import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';

let db: PGlite;
const owner = '00000000-0000-4000-8000-000000000001';
const staff = '00000000-0000-4000-8000-000000000002';
const base = { settings: {}, programs: [], teachers: [], rooms: [], classes: [], students: [], timetableSlots: [], grades: [], receipts: [], backups: [], activityLogs: [], attendanceSessions: [] };
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;`);
  for (const filename of readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${filename}`, 'utf8'));
  await db.exec(`insert into auth.users(id,email) values ('${owner}','owner@example.test'),('${staff}','staff@example.test');
    update public.profiles set role='owner',is_active=true where id='${owner}';
    update public.profiles set is_active=true,permissions='{}' where id='${staff}';
    grant usage on schema public,auth to authenticated; grant select,insert,update on public.center_data to authenticated; grant select on public.profiles to authenticated;`);
}, 60_000);
beforeEach(async () => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)", [owner]);
  await db.exec('delete from public.center_data');
  await db.query("insert into public.center_data(id,payload) values ('primary',$1::jsonb)", [JSON.stringify(base)]);
  await db.query("update public.profiles set permissions='{}',is_active=true where id=$1", [staff]);
});
afterAll(async () => { await db?.close(); });
async function asStaff(permissions: object = {}) {
  await db.query('update public.profiles set permissions=$1::jsonb where id=$2', [JSON.stringify(permissions), staff]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
  await db.exec('set role authenticated');
}
describe('database migrations and permission enforcement', () => {
  it('denies an unauthorized settings write at the database', async () => {
    await asStaff();
    await expect(db.query("update public.center_data set payload=$1::jsonb where id='primary'", [JSON.stringify({ ...base, settings: { name: 'Injected' } })])).rejects.toThrow(/Owner permission/);
  });
  it('allows login activity without permitting business changes', async () => {
    await asStaff();
    const payload = { ...base, activityLogs: [{ id: 'login', action: 'ĐĂNG NHẬP' }] };
    await db.query("update public.center_data set payload=$1::jsonb where id='primary'", [JSON.stringify(payload)]);
    expect((await db.query<{ payload: typeof payload }>('select payload from public.center_data')).rows[0].payload.activityLogs).toEqual(payload.activityLogs);
  });
  it('denies student creation to a user with view-only access', async () => {
    await asStaff({ student: { view: true } });
    await expect(db.query("update public.center_data set payload=$1::jsonb", [JSON.stringify({ ...base, students: [{ id: 's1' }] })])).rejects.toThrow(/creation denied/);
  });
  it('uses a revision comparison to reject a stale update', async () => {
    const { rows } = await db.query<{ updated_at: string }>('select updated_at::text from public.center_data');
    await db.exec("update public.center_data set payload=jsonb_set(payload,'{activityLogs}','[{\"id\":\"other\"}]')");
    const updated = await db.query('update public.center_data set payload=$1::jsonb where updated_at=$2::timestamptz returning id', [JSON.stringify(base), rows[0].updated_at]);
    expect(updated.rows).toHaveLength(0);
  });
  it('rejects malformed IDs and negative receipt amounts even for an owner', async () => {
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, students: [{ id: 's' }, { id: 's' }] })])).rejects.toThrow(/Duplicate/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, receipts: [{ id: 'r', courseFee: 100, discount: 0, paidAmount: -1, debtAmount: 100 }] })])).rejects.toThrow(/Invalid receipt/);
  });
  it('allows assigned attendance edits and rejects another class', async () => {
    const classes = [{ id: 'a', teacherId: 't', studentIds: [] }, { id: 'b', teacherId: 'other', studentIds: [] }];
    const payload = { ...base, classes };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await asStaff({ teacher: { edit: true }, teacherId: 't' });
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, attendanceSessions: [{ id: 'att', classId: 'a' }] })]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, attendanceSessions: [{ id: 'att', classId: 'b' }] })])).rejects.toThrow(/Attendance permission/);
  });
  it('blocks inactive accounts using RLS', async () => {
    await db.query('update public.profiles set is_active=false where id=$1', [staff]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
    await db.exec('set role authenticated');
    expect((await db.query('select * from public.center_data')).rows).toHaveLength(0);
  });
  it('prevents demoting or deleting the final active owner', async () => {
    await expect(db.query("update public.profiles set role='staff' where id=$1", [owner])).rejects.toThrow(/final owner/);
    await expect(db.query('delete from public.profiles where id=$1', [owner])).rejects.toThrow(/final owner/);
  });
});
