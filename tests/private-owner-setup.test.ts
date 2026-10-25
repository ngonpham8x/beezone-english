import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPrivateOwnerSetup } from '../scripts/create-private-owner-setup.mjs';
import { buildAccountVisibilitySetup } from '../scripts/create-account-visibility-setup.mjs';

let db: PGlite | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});
async function database() {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;`);
  for (const filename of readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${filename}`, 'utf8'));
  return db;
}

describe('private administrator configuration', () => {
  it('restricts a staff account to one active owner without changing roles or permissions', async () => {
    const db = await database();
    await db.exec(`insert into auth.users(id,email) values
      ('00000000-0000-4000-8000-000000000001','viewer@example.test'),
      ('00000000-0000-4000-8000-000000000002','staff@example.test');
      update public.profiles set role='owner',is_active=true where email='viewer@example.test';`);
    const before = (await db.query('select * from public.profiles order by id')).rows;
    const sql = buildAccountVisibilitySetup({ accountEmail: 'staff@example.test', viewerEmail: 'viewer@example.test' });
    await db.exec(sql);
    await db.exec(sql);
    expect((await db.query('select * from public.profiles order by id')).rows).toEqual(before);
    expect((await db.query('select account_id,viewer_id from public.account_visibility_rules')).rows).toEqual([
      { account_id: '00000000-0000-4000-8000-000000000002', viewer_id: '00000000-0000-4000-8000-000000000001' },
    ]);
    await expect(db.exec('set role authenticated; select * from public.account_visibility_rules')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
    await expect(db.exec('set role authenticated; delete from public.account_visibility_rules')).rejects.toThrow(/permission denied/);
  }, 60000);
  it('activates an existing account, keeps other profiles and does not duplicate audit entries on replay', async () => {
    const db = await database();
    await db.exec(
      `insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','private@example.test'),('00000000-0000-4000-8000-000000000002','visible@example.test')`,
    );
    await db.exec(buildPrivateOwnerSetup(' Private@example.test '));
    expect(
      (await db.query('select role,is_active,is_private from public.profiles order by id')).rows,
    ).toEqual([
      { role: 'owner', is_active: true, is_private: true },
      { role: 'teacher', is_active: false, is_private: false },
    ]);
    await db.exec(buildPrivateOwnerSetup('private@example.test'));
    expect(
      (await db.query('select action,target_name,target_id from public.account_audit_logs')).rows,
    ).toEqual([
      {
        action: 'ACCOUNT_UPDATED',
        target_name: 'Quản trị hệ thống',
        target_id: '00000000-0000-4000-8000-000000000001',
      },
    ]);
    await expect(
      db.exec(`set role authenticated; update public.profiles set is_private=false`),
    ).rejects.toThrow();
    await db.exec('reset role');
    expect((await db.query('select is_private from public.profiles order by id')).rows[0]).toEqual({
      is_private: true,
    });
  }, 60000);
  it('activates only the preconfigured future Google account and ignores role/privacy claims in user metadata', async () => {
    const db = await database();
    await db.exec(buildPrivateOwnerSetup('private@example.test'));
    await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
      ('00000000-0000-4000-8000-000000000003','private@example.test','{"full_name":"Private Person"}'),
      ('00000000-0000-4000-8000-000000000004','outsider@example.test','{"role":"owner","is_private":true}')`);
    expect(
      (await db.query('select role,is_active,is_private from public.profiles order by id')).rows,
    ).toEqual([
      { role: 'owner', is_active: true, is_private: true },
      { role: 'teacher', is_active: false, is_private: false },
    ]);
    expect(
      (await db.query('select action,target_name from public.account_audit_logs')).rows,
    ).toEqual([{ action: 'ACCOUNT_PROVISIONED', target_name: 'Quản trị hệ thống' }]);
    await expect(
      db.exec(`update public.profiles set is_private=true where email='outsider@example.test'`),
    ).rejects.toThrow(/private_profiles_are_owners/);
  }, 60000);
  it('rejects missing or multiline inputs and safely quotes valid email apostrophes', () => {
    for (const value of ['', 'invalid', 'a@example.test\nDROP TABLE profiles', null])
      expect(() => buildPrivateOwnerSetup(value)).toThrow(/valid administrator email/);
    expect(buildPrivateOwnerSetup("o'neil@example.test")).toContain("o''neil@example.test");
  });
});
