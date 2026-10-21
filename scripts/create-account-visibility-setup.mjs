import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildAccountVisibilitySetup(input) {
  const email = value => {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254 || /[\r\n\0]/.test(normalized)) throw new Error('Valid account and viewer emails are required.');
    return normalized.replaceAll("'", "''");
  };
  const account = email(input?.accountEmail), viewer = email(input?.viewerEmail);
  return `-- Private account visibility configuration. Do not commit or upload this file.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
do $$
declare target_id uuid; allowed_viewer_id uuid;
begin
  select id into target_id from public.profiles where email = '${account}';
  select id into allowed_viewer_id from public.profiles where email = '${viewer}' and role = 'owner' and is_active;
  if target_id is null or allowed_viewer_id is null then
    raise exception 'Account must exist and viewer must be an active owner. No changes applied.';
  end if;
  insert into public.account_visibility_rules(account_id, viewer_id)
  values (target_id, allowed_viewer_id)
  on conflict (account_id) do update set viewer_id = excluded.viewer_id;
end $$;
commit;
select exists(select 1 from public.account_visibility_rules r
join public.profiles p on p.id = r.account_id
join public.profiles v on v.id = r.viewer_id
where p.email = '${account}' and v.email = '${viewer}') as visibility_configured;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const config = buildAccountVisibilitySetup(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const output = resolve('.vercel/setup-account-visibility.sql');
  mkdirSync(resolve('.vercel'), { recursive: true });
  writeFileSync(output, readFileSync('supabase/migrations/014_account_visibility_rules.sql', 'utf8') + '\n' + config, 'utf8');
  console.log('Created ignored .vercel/setup-account-visibility.sql. No database changes executed.');
}
