import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const staff = '00000000-0000-4000-8000-000000000003';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;`);
  for (const name of readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
  }
  await db.exec(`insert into auth.users(id,email) values ('${owner}','owner@example.test'),('${other}','other@example.test'),('${staff}','staff@example.test');
    update public.profiles set role='owner',is_active=true where id in ('${owner}','${other}');
    update public.profiles set is_active=true where id='${staff}';
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant select,insert,update on public.center_data to authenticated;
    grant select on public.profiles to authenticated;`);
}, 60_000);
beforeEach(async () => {
  await db.exec('reset role; delete from public.request_quotas; delete from public.center_data');
  await db.query(
    "select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',$1,false)",
    [owner],
  );
});
afterAll(async () => {
  await db?.close();
});

async function service() {
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  await db.exec('set role service_role');
}
async function consume(scope = 'admin-write', actor = owner) {
  return (
    await db.query<{ allowed: boolean; retry_after: number }>(
      'select * from public.consume_admin_request_quota($1::uuid,$2)',
      [actor, scope],
    )
  ).rows[0];
}

describe('database abuse protection', () => {
  it('counts concurrent calls atomically and isolates each owner', async () => {
    await service();
    const results = await Promise.all(Array.from({ length: 12 }, () => consume()));
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(
      results
        .filter((result) => !result.allowed)
        .every((result) => result.retry_after > 0 && result.retry_after <= 900),
    ).toBe(true);
    expect((await consume('admin-write', other)).allowed).toBe(true);
    expect((await consume('admin-read')).allowed).toBe(true);
  });
  it('enforces the shared read quota and reuses expired rows', async () => {
    await service();
    for (let i = 0; i < 60; i++) expect((await consume('admin-read')).allowed).toBe(true);
    expect((await consume('admin-read')).allowed).toBe(false);
    await db.exec('reset role');
    await db.exec("update public.request_quotas set reset_at = now() - interval '1 second'");
    await db.exec('set role service_role');
    expect((await consume('admin-read')).allowed).toBe(true);
    await db.exec('reset role');
    expect((await db.query('select request_count from public.request_quotas')).rows).toEqual([
      { request_count: 1 },
    ]);
  });
  it.each(['anon', 'authenticated'])('denies %s access to quota tables and RPCs', async (role) => {
    await db.exec(`set role ${role}`);
    await expect(db.query('select * from public.request_quotas')).rejects.toThrow(
      /permission denied/,
    );
    await expect(consume()).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select * from public.consume_request_quota($1::uuid,'center-write')", [owner]),
    ).rejects.toThrow(/permission denied/);
  });
  it('allows only active owners and admin scopes at the server RPC', async () => {
    await service();
    await expect(consume('center-write')).rejects.toThrow(/Invalid admin quota scope/);
    await expect(consume('admin-write', staff)).rejects.toThrow(/Active owner/);
    await db.exec('reset role');
    await db.query('update public.profiles set is_active=false where id=$1', [other]);
    await db.exec('set role service_role');
    await expect(consume('admin-write', other)).rejects.toThrow(/Active owner/);
    await db.exec('reset role');
    await db.query('update public.profiles set is_active=true where id=$1', [other]);
  });
  it('checks the service claim in addition to function privileges', async () => {
    await db.exec('set role service_role');
    await expect(consume()).rejects.toThrow(/Server authentication required/);
  });
  it('limits direct authenticated writes and preserves the last saved revision', async () => {
    await db.exec('set role authenticated');
    await db.query("insert into public.center_data(id,payload) values ('primary','{}')");
    for (let i = 1; i < 60; i++)
      await db.query('update public.center_data set payload=$1::jsonb', [
        JSON.stringify({ settings: { round: i } }),
      ]);
    const before = (await db.query('select payload,updated_at from public.center_data')).rows;
    await expect(
      db.query("update public.center_data set payload='{}'::jsonb"),
    ).rejects.toMatchObject({ code: 'PT429' });
    expect((await db.query('select payload,updated_at from public.center_data')).rows).toEqual(
      before,
    );
    await db.exec('reset role');
    expect((await db.query('select request_count from public.request_quotas')).rows).toEqual([
      { request_count: 60 },
    ]);
  });
  it('keeps CAS conflicts from consuming a write quota or replacing data', async () => {
    await db.exec('set role authenticated');
    await db.query("insert into public.center_data(id,payload) values ('primary','{}')");
    const saved = (await db.query('select updated_at from public.center_data')).rows[0];
    const result = await db.query(
      "update public.center_data set payload='{}' where updated_at='2000-01-01' returning updated_at",
    );
    expect(result.rows).toEqual([]);
    expect((await db.query('select updated_at from public.center_data')).rows[0]).toEqual(saved);
    await db.exec('reset role');
    expect((await db.query('select request_count from public.request_quotas')).rows).toEqual([
      { request_count: 1 },
    ]);
  });
  it('rejects oversized documents before validation and stores nothing', async () => {
    await db.exec('set role authenticated');
    await expect(
      db.query("insert into public.center_data(id,payload) values ('primary',$1::jsonb)", [
        JSON.stringify({ settings: { text: 'x'.repeat(32 * 1024 * 1024) } }),
      ]),
    ).rejects.toMatchObject({ code: 'PT413' });
    expect((await db.query('select * from public.center_data')).rows).toEqual([]);
  });
});
