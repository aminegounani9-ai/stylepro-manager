-- Register the existing primary administrator as the cross-store Global Admin.
-- No business data is modified. The seed is conditional on the auth user existing.
create table if not exists public.global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.global_admins enable row level security;
revoke all on table public.global_admins from anon, authenticated;
grant all on table public.global_admins to service_role;

create or replace function private.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1 from public.global_admins ga
    where ga.user_id = auth.uid()
  );
$$;

revoke all on function private.is_global_admin() from public;
grant execute on function private.is_global_admin() to authenticated, service_role;

create or replace function private.is_store_member(uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.is_global_admin()
    or exists (
      select 1
      from public.store_members sm
      where sm.store_id = $1
        and sm.user_id = auth.uid()
        and sm.is_active = true
    );
$$;

create or replace function private.has_store_role(uuid, text[])
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.is_global_admin()
    or exists (
      select 1
      from public.store_members sm
      where sm.store_id = $1
        and sm.user_id = auth.uid()
        and sm.is_active = true
        and sm.role = any($2)
    );
$$;

-- Primary admin account previously confirmed by the project owner.
insert into public.global_admins (user_id, assigned_by)
select 'd7be9212-252a-48aa-bbc2-e409aae0aa20'::uuid, null
where exists (
  select 1 from auth.users
  where id = 'd7be9212-252a-48aa-bbc2-e409aae0aa20'::uuid
)
on conflict (user_id) do nothing;
