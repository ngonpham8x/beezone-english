import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildSupabaseSetup } from "../scripts/create-supabase-setup.mjs";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth;
    create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select current_setting('request.jwt.claim.role', true)
    $$;`);
}, 120_000);
beforeEach(async () => {
  // Only this in-memory fixture is reset; no remote database is used by tests.
  await db.exec(
    "rollback; drop schema public cascade; create schema public; truncate auth.users cascade;",
  );
});
afterAll(async () => {
  await db?.close();
});

describe("new Supabase project setup", () => {
  it("initializes RLS and quota enforcement without activating existing Auth accounts", async () => {
    await db.exec(`insert into auth.users(id,email,raw_user_meta_data)
        values ('00000000-0000-4000-8000-000000000001', 'Owner@example.test',
          '{"role":"owner","is_active":true,"full_name":"Existing user"}');`);
    await db.exec(buildSupabaseSetup());
    const { rows } = await db.query(
      `select role, is_active from public.profiles`,
    );
    expect(rows).toEqual([{ role: "staff", is_active: false }]);
    expect(
      (await db.query(`select * from public.owner_bootstrap_allowlist`)).rows,
    ).toEqual([]);
    expect((await db.query(`select * from public.center_data`)).rows).toEqual(
      [],
    );
    const tables = await db.query<{
      count: number;
    }>(`select count(*)::int as count
        from pg_tables where schemaname='public' and rowsecurity`);
    expect(tables.rows[0].count).toBe(6);
    const visibilityPrivileges = await db.query(`select
      has_table_privilege('authenticated', 'public.account_visibility_rules', 'select') as client,
      has_table_privilege('service_role', 'public.account_visibility_rules', 'select') as server`);
    expect(visibilityPrivileges.rows).toEqual([{ client: false, server: true }]);
    const quota = await db.query(`select
        has_function_privilege('authenticated', 'public.consume_admin_request_quota(uuid,text)', 'execute') as client,
        has_function_privilege('service_role', 'public.consume_admin_request_quota(uuid,text)', 'execute') as server`);
    expect(quota.rows).toEqual([{ client: false, server: true }]);
    expect(
      (
        await db.query(`select tgname from pg_trigger
        where tgname='center_data_00_request_guard' and not tgisinternal`)
      ).rows,
    ).toHaveLength(1);
    // The allowlist remains the only automatic path to an active owner.
    await db.exec(
      `insert into public.owner_bootstrap_allowlist(email) values ('owner@example.test')`,
    );
    expect(
      (await db.query(`select role, is_active from public.profiles`)).rows,
    ).toEqual([{ role: "owner", is_active: true }]);
  });

  it("refuses an existing schema and preserves its records", async () => {
    await db.exec(`create table public.existing_data(value text);
        insert into public.existing_data values ('keep this record')`);
    await expect(db.exec(buildSupabaseSetup())).rejects.toThrow(
      /existing public schema/,
    );
    await db.exec("rollback");
    expect((await db.query(`select * from public.existing_data`)).rows).toEqual(
      [{ value: "keep this record" }],
    );
    expect(
      (await db.query(`select to_regclass('public.profiles') as profiles`))
        .rows,
    ).toEqual([{ profiles: null }]);
  });

  it("rolls back the entire initialization if a migration fails", async () => {
    const broken = buildSupabaseSetup().replace(
      "notify pgrst, 'reload schema';",
      "select beezone_missing_function();",
    );
    await expect(db.exec(broken)).rejects.toThrow(/beezone_missing_function/);
    await db.exec("rollback");
    expect(
      (
        await db.query(`select to_regclass('public.profiles') as profiles,
        to_regtype('public.app_role') as role_type`)
      ).rows,
    ).toEqual([{ profiles: null, role_type: null }]);
    expect(
      (
        await db.query(`select tgname from pg_trigger
        where tgname='on_auth_user_created' and not tgisinternal`)
      ).rows,
    ).toEqual([]);
  });
});
