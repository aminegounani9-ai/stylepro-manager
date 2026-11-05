-- StylePro Manager — additive foundation for per-member module permissions.
-- This migration does not delete or rewrite business data.
-- IMPORTANT: it does not yet secure business tables. Follow-up restrictive RLS
-- policies must be installed for each module-owned table before release.

alter table public.store_members
  add column if not exists is_active boolean not null default true;

create table if not exists public.store_member_module_permissions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null check (module_key in (
    'dashboard', 'catalogue', 'sales', 'stock', 'returns', 'clients',
    'expenses', 'atelier', 'deliveries', 'promotions', 'labels', 'users', 'settings'
  )),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_member_module_permissions_unique
    unique (store_id, user_id, module_key),
  constraint store_member_module_permissions_view_required
    check (can_view or not (can_create or can_update or can_delete))
);

create index if not exists idx_store_member_module_permissions_user_store
  on public.store_member_module_permissions (user_id, store_id);

alter table public.store_member_module_permissions enable row level security;

create or replace function private.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.store_members sm
    where sm.user_id = auth.uid()
      and sm.role = 'admin'
      and coalesce(sm.is_active, true)
  );
$$;

create or replace function private.has_module_permission(
  p_store_id uuid,
  p_module_key text,
  p_action text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    private.is_global_admin()
    or exists (
      select 1
      from public.store_members sm
      join public.store_member_module_permissions mp
        on mp.store_id = sm.store_id
       and mp.user_id = sm.user_id
      where sm.store_id = p_store_id
        and sm.user_id = auth.uid()
        and coalesce(sm.is_active, true)
        and mp.module_key = p_module_key
        and case p_action
          when 'view' then mp.can_view
          when 'create' then mp.can_create
          when 'update' then mp.can_update
          when 'delete' then mp.can_delete
          else false
        end
    );
$$;

create or replace function private.can_manage_store_users(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    private.is_global_admin()
    or (
      exists (
        select 1
        from public.store_members sm
        where sm.store_id = p_store_id
          and sm.user_id = auth.uid()
          and sm.role = 'manager'
          and coalesce(sm.is_active, true)
      )
      and private.has_module_permission(p_store_id, 'users', 'view')
    );
$$;

create or replace function private.can_manage_member_module(
  p_store_id uuid,
  p_user_id uuid,
  p_module_key text,
  p_can_view boolean,
  p_can_create boolean,
  p_can_update boolean,
  p_can_delete boolean
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $can_manage_member_module$
  select
    private.is_global_admin()
    or (
      private.can_manage_store_users(p_store_id)
      and private.has_module_permission(p_store_id, 'users', 'update')
      and (not p_can_view or private.has_module_permission(p_store_id, p_module_key, 'view'))
      and (not p_can_create or private.has_module_permission(p_store_id, p_module_key, 'create'))
      and (not p_can_update or private.has_module_permission(p_store_id, p_module_key, 'update'))
      and (not p_can_delete or private.has_module_permission(p_store_id, p_module_key, 'delete'))
      and exists (
        select 1
        from public.store_members target
        where target.store_id = p_store_id
          and target.user_id = p_user_id
          and target.role in ('cashier', 'stock_manager')
          and coalesce(target.is_active, true)
      )
    );
$can_manage_member_module$;

drop policy if exists store_member_module_permissions_select
  on public.store_member_module_permissions;
create policy store_member_module_permissions_select
  on public.store_member_module_permissions
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.is_global_admin()
    or private.can_manage_store_users(store_id)
  );

drop policy if exists store_member_module_permissions_insert
  on public.store_member_module_permissions;
create policy store_member_module_permissions_insert
  on public.store_member_module_permissions
  for insert to authenticated
  with check (
    private.can_manage_member_module(store_id, user_id, module_key, can_view, can_create, can_update, can_delete)
  );

drop policy if exists store_member_module_permissions_update
  on public.store_member_module_permissions;
create policy store_member_module_permissions_update
  on public.store_member_module_permissions
  for update to authenticated
  using (
    private.can_manage_member_module(store_id, user_id, module_key, can_view, can_create, can_update, can_delete)
  )
  with check (
    private.can_manage_member_module(store_id, user_id, module_key)
  );

drop policy if exists store_member_module_permissions_delete
  on public.store_member_module_permissions;
create policy store_member_module_permissions_delete
  on public.store_member_module_permissions
  for delete to authenticated
  using (
    private.can_manage_member_module(store_id, user_id, module_key)
  );

grant execute on function private.is_global_admin()
  to authenticated, service_role;
grant execute on function private.has_module_permission(uuid, text, text)
  to authenticated, service_role;
grant execute on function private.can_manage_store_users(uuid)
  to authenticated, service_role;
grant execute on function private.can_manage_member_module(uuid, uuid, text, boolean, boolean, boolean, boolean)
  to authenticated, service_role;

grant select, insert, update, delete
  on public.store_member_module_permissions to authenticated;

comment on table public.store_member_module_permissions is
  'Per-store, per-user module and CRUD grants. Business-table RLS enforcement is installed separately.';
comment on column public.store_members.is_active is
  'Store-specific membership status; do not globally ban the Supabase Auth account to disable one store membership.';
