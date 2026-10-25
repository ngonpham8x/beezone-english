import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Assemble the reviewed migrations; never connect to or modify a database. */
export function buildSupabaseSetup() {
  const directory = resolve(workspace, "supabase/migrations");
  const migrations = readdirSync(directory)
    .filter((name) => /^\d{3}_.*\.sql$/.test(name))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(resolve(directory, name), "utf8"),
    }));
  if (!migrations.length) throw new Error("No Supabase migrations found.");
  const functionNames = [
    ...new Set(
      migrations.flatMap(({ sql }) =>
        [
          ...sql.matchAll(
            /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi,
          ),
        ].map((match) => match[1]),
      ),
    ),
  ]
    .map((name) => `'${name}'`)
    .join(", ");

  return `-- BeeZone: NEW project only. Check the project URL in the Dashboard first.
-- Generated from supabase/migrations; never edit this generated file.
-- No administrator email, keys or center records are embedded.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_advisory_xact_lock(165081227, 1);

do $beezone_setup$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and not exists (
        select 1 from pg_depend d where d.classid = 'pg_class'::regclass
          and d.objid = c.oid and d.deptype = 'e'
      )
  ) or to_regtype('public.app_role') is not null or exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (${functionNames})
  ) or exists (
    select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    raise exception 'BeeZone setup refused: existing public schema. Review applied migrations; do not drop data.';
  end if;
end;
$beezone_setup$;

${migrations.map(({ name, sql }) => `-- Migration: ${name}\n${sql}`).join("\n\n")}

-- Auth accounts created before setup also receive an INACTIVE teacher profile.
-- Administrator activation remains an explicit private Dashboard action.
insert into public.profiles (id, email, full_name, avatar_url)
select id, lower(email),
  coalesce(left(nullif(trim(raw_user_meta_data ->> 'full_name'), ''), 120), ''),
  nullif(left(raw_user_meta_data ->> 'avatar_url', 2000), '')
from auth.users
where email is not null and char_length(email) between 1 and 254
on conflict do nothing;

notify pgrst, 'reload schema';
commit;

-- Read-only confirmation; this does not consume quota or return personal data.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'profiles', 'owner_bootstrap_allowlist', 'center_data', 'account_audit_logs', 'request_quotas'
)
order by c.relname;
`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const output = resolve(workspace, ".vercel/setup-new-project.sql");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, buildSupabaseSetup(), "utf8");
  console.log(
    `Created ${output}. No database connection or migration was executed.`,
  );
}
