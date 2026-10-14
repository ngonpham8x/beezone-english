-- Apply after 008, first in staging. No business records or CAS rules are changed.
-- Private, atomic quotas survive concurrent functions, token rotation and cold starts.
create table public.request_quotas (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('admin-read', 'admin-write', 'center-write')),
  request_count integer not null check (request_count between 1 and 60),
  reset_at timestamptz not null,
  primary key (actor_id, scope)
);
alter table public.request_quotas enable row level security;
revoke all on table public.request_quotas from public, anon, authenticated, service_role;

create or replace function public.consume_request_quota(p_actor_id uuid, p_scope text)
returns table (allowed boolean, retry_after integer)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare quota_limit integer; window_seconds integer; request_time timestamptz := clock_timestamp(); deadline timestamptz;
begin
  case p_scope
    when 'admin-read' then quota_limit := 60; window_seconds := 60;
    when 'admin-write' then quota_limit := 10; window_seconds := 900;
    when 'center-write' then quota_limit := 60; window_seconds := 60;
    else raise exception 'Invalid quota scope' using errcode = '22023';
  end case;
  insert into public.request_quotas as q(actor_id, scope, request_count, reset_at)
  values (p_actor_id, p_scope, 1, request_time + make_interval(secs => window_seconds))
  on conflict (actor_id, scope) do update
  set request_count = case when q.reset_at <= request_time then 1 else q.request_count + 1 end,
      reset_at = case when q.reset_at <= request_time then excluded.reset_at else q.reset_at end
  where q.reset_at <= request_time or q.request_count < quota_limit
  returning reset_at into deadline;
  if found then return query select true, 0; return; end if;
  select q.reset_at into deadline from public.request_quotas q where q.actor_id = p_actor_id and q.scope = p_scope;
  return query select false, greatest(1, ceil(extract(epoch from deadline - request_time))::integer);
end;
$$;
revoke all on function public.consume_request_quota(uuid,text) from public, anon, authenticated, service_role;

create or replace function public.consume_admin_request_quota(p_actor_id uuid, p_scope text)
returns table (allowed boolean, retry_after integer)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authentication required' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in ('admin-read', 'admin-write') then
    raise exception 'Invalid admin quota scope' using errcode = '22023';
  end if;
  if not exists(select 1 from public.profiles where id = p_actor_id and role = 'owner' and is_active) then
    raise exception 'Active owner required' using errcode = '42501';
  end if;
  return query select * from public.consume_request_quota(p_actor_id, p_scope);
end;
$$;
revoke all on function public.consume_admin_request_quota(uuid,text) from public, anon, authenticated;
grant execute on function public.consume_admin_request_quota(uuid,text) to service_role;

create or replace function public.guard_center_request()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare quota record;
begin
  -- Bound work before the more expensive roster/history/billing validation triggers.
  if octet_length(new.payload::text) > 32 * 1024 * 1024 then
    raise exception 'Center document exceeds 32 MB' using errcode = 'PT413';
  end if;
  if auth.role() = 'service_role' then return new; end if;
  if not exists(select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Active account required' using errcode = '42501';
  end if;
  select * into quota from public.consume_request_quota(auth.uid(), 'center-write');
  if not quota.allowed then
    raise exception 'Too many saves. Wait before retrying; local edits are preserved.' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_center_request() from public, anon, authenticated;
create trigger center_data_00_request_guard before insert or update on public.center_data
for each row execute function public.guard_center_request();
