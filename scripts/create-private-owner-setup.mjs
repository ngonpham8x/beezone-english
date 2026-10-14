import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Generate private configuration only. Never connect to a database or print the email. */
export function buildPrivateOwnerSetup(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || /[\r\n\0]/.test(email))
    throw new Error('A valid administrator email is required.');
  const literal = email.replaceAll("'", "''");
  return `-- Private BeeZone owner configuration. Do not upload this file or commit it.
-- Apply migrations 001-010 first. Confirm the correct project in Supabase.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
insert into public.owner_bootstrap_allowlist(email, is_private)
values ('${literal}', true)
on conflict (email) do update set is_private = true
where owner_bootstrap_allowlist.is_private is distinct from true;
commit;

-- No email or user ID is returned. If not yet registered, sign in with Google after enabling it.
select exists(select 1 from public.owner_bootstrap_allowlist
  where email = '${literal}' and is_private) as privately_configured,
exists(select 1 from public.profiles where email = '${literal}'
  and role = 'owner' and is_active and is_private) as account_active;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const output = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../.vercel/setup-private-owner.sql',
  );
  const sql = buildPrivateOwnerSetup(Buffer.concat(chunks).toString('utf8'));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, sql, 'utf8');
  console.log('Created ignored .vercel/setup-private-owner.sql. No database change was executed.');
}
