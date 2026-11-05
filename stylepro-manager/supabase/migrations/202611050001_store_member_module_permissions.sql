-- StylePro Manager: per-user, per-store module grants.
-- Additive only: this migration creates a new table and does not alter existing
-- tables, policies, memberships, or business records.
--
-- Apply only after reviewing this migration in the intended Supabase project.

create table if not exists public.store_member_module_permissions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null check (module_key in (
    'dashboard',
    'catalogue',
    'sales',
    'stock',
    'returns',
    'clients',
    'expenses',
    'atelier',
    'deliveries',
    'promotions',
    'labels',
    'users',
    'settings'
  )),
  can_view boolean not null default false,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_member_module_permissions_unique
    unique (store_id, user_id, module_key)
);

create index if not exists idx_member_module_permissions_user_store
  on public.store_member_module_permissions (user_id, store_id);

alter table public.store_member_module_permissions enable row level security;

-- Permission changes are performed by the manage-users Edge Function using
-- the service-role key. No direct browser/mobile table access is granted.
revoke all on table public.store_member_module_permissions from anon, authenticated;
grant all on table public.store_member_module_permissions to service_role;

comment on table public.store_member_module_permissions is
  'Per-user module/action grants scoped to a store. Managed only by the manage-users Edge Function.';
