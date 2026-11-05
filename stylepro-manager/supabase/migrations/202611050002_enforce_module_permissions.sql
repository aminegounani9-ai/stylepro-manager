-- Enforce active store membership and per-user module/action permissions.
-- Additive and non-destructive: existing business rows are preserved.
-- Restrictive RLS policies are ANDed with the existing permissive policies,
-- so old broad member policies cannot bypass these module/action checks.

alter table public.store_members
  add column if not exists is_active boolean not null default true;

create or replace function private.is_store_member(uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
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
  select exists (
    select 1
    from public.store_members sm
    where sm.store_id = $1
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role = any($2)
  );
$$;

create or replace function private.has_store_module_permission(
  p_store_id uuid,
  p_module_key text,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    private.has_store_role(p_store_id, array['admin']::text[])
    or exists (
      select 1
      from public.store_member_module_permissions p
      join public.store_members sm
        on sm.store_id = p.store_id
       and sm.user_id = p.user_id
      where p.store_id = p_store_id
        and p.user_id = auth.uid()
        and sm.is_active = true
        and p.module_key = p_module_key
        and case p_action
          when 'view' then p.can_view
          when 'add' then p.can_add
          when 'edit' then p.can_edit
          when 'delete' then p.can_delete
          else false
        end
    );
$$;

revoke all on function private.has_store_module_permission(uuid, text, text) from public;
grant execute on function private.has_store_module_permission(uuid, text, text) to authenticated, service_role;

-- Map each business table to the module that controls it. Missing optional
-- tables are skipped; no table or business record is created or deleted.
do $$
declare
  item record;
  policy_name text;
begin
  for item in
    select * from (values
      ('products', 'catalogue'),
      ('product_variants', 'catalogue'),
      ('brands', 'catalogue'),
      ('categories', 'catalogue'),
      ('stock_movements', 'stock'),
      ('stock_locations', 'stock'),
      ('suppliers', 'stock'),
      ('purchase_orders', 'stock'),
      ('purchase_order_items', 'stock'),
      ('sales', 'sales'),
      ('sale_items', 'sales'),
      ('payments', 'sales'),
      ('returns', 'returns'),
      ('return_items', 'returns'),
      ('customers', 'clients'),
      ('expenses', 'expenses'),
      ('expense_categories', 'expenses'),
      ('atelier_productions', 'atelier'),
      ('atelier_production_models', 'atelier'),
      ('atelier_production_sizes', 'atelier'),
      ('atelier_suppliers', 'atelier'),
      ('atelier_stock_integrations', 'atelier'),
      ('deliveries', 'deliveries'),
      ('delivery_items', 'deliveries'),
      ('delivery_allocations', 'deliveries'),
      ('delivery_returns', 'deliveries'),
      ('delivery_return_items', 'deliveries'),
      ('promotions', 'promotions'),
      ('promotion_products', 'promotions'),
      ('store_settings', 'settings'),
      ('store_modules', 'settings')
    ) as t(table_name, module_key)
  loop
    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = item.table_name
        and c.column_name = 'store_id'
    ) then
      execute format('alter table public.%I enable row level security', item.table_name);

      -- This permissive membership policy supplies the base access path for all
      -- member roles; the restrictive action policies below decide what each
      -- user can actually do. Existing role-based policies remain in place.
      policy_name := left('module_member_base_' || item.table_name, 63);
      execute format('drop policy if exists %I on public.%I', policy_name, item.table_name);
      execute format(
        'create policy %I on public.%I as permissive for all to authenticated using (private.is_store_member(store_id)) with check (private.is_store_member(store_id))',
        policy_name, item.table_name
      );

      policy_name := left('module_gate_' || item.table_name || '_select', 63);
      execute format('drop policy if exists %I on public.%I', policy_name, item.table_name);
      execute format(
        'create policy %I on public.%I as restrictive for select to authenticated using (private.has_store_module_permission(store_id, %L, %L))',
        policy_name, item.table_name, item.module_key, 'view'
      );

      policy_name := left('module_gate_' || item.table_name || '_insert', 63);
      execute format('drop policy if exists %I on public.%I', policy_name, item.table_name);
      execute format(
        'create policy %I on public.%I as restrictive for insert to authenticated with check (private.has_store_module_permission(store_id, %L, %L))',
        policy_name, item.table_name, item.module_key, 'add'
      );

      policy_name := left('module_gate_' || item.table_name || '_update', 63);
      execute format('drop policy if exists %I on public.%I', policy_name, item.table_name);
      execute format(
        'create policy %I on public.%I as restrictive for update to authenticated using (private.has_store_module_permission(store_id, %L, %L)) with check (private.has_store_module_permission(store_id, %L, %L))',
        policy_name, item.table_name, item.module_key, 'edit', item.module_key, 'edit'
      );

      policy_name := left('module_gate_' || item.table_name || '_delete', 63);
      execute format('drop policy if exists %I on public.%I', policy_name, item.table_name);
      execute format(
        'create policy %I on public.%I as restrictive for delete to authenticated using (private.has_store_module_permission(store_id, %L, %L))',
        policy_name, item.table_name, item.module_key, 'delete'
      );
    end if;
  end loop;
end;
$$;

-- Existing store settings/modules and promotions policies were admin-only.
-- Add a manager path, still constrained by the restrictive per-action gate above.
do $$
begin
  if to_regclass('public.store_settings') is not null then
    execute 'drop policy if exists module_manager_store_settings on public.store_settings';
    execute 'create policy module_manager_store_settings on public.store_settings as permissive for all to authenticated using (private.has_store_role(store_id, array[''admin'',''manager'']::text[])) with check (private.has_store_role(store_id, array[''admin'',''manager'']::text[]))';
  end if;

  if to_regclass('public.store_modules') is not null then
    execute 'drop policy if exists module_manager_store_modules on public.store_modules';
    execute 'create policy module_manager_store_modules on public.store_modules as permissive for all to authenticated using (private.has_store_role(store_id, array[''admin'',''manager'']::text[])) with check (private.has_store_role(store_id, array[''admin'',''manager'']::text[]))';
  end if;

  if to_regclass('public.promotions') is not null then
    execute 'drop policy if exists module_manager_promotions on public.promotions';
    execute 'create policy module_manager_promotions on public.promotions as permissive for all to authenticated using (private.has_store_role(store_id, array[''admin'',''manager'']::text[])) with check (private.has_store_role(store_id, array[''admin'',''manager'']::text[]))';
  end if;

  if to_regclass('public.promotion_products') is not null then
    execute 'drop policy if exists module_manager_promotion_products on public.promotion_products';
    execute 'create policy module_manager_promotion_products on public.promotion_products as permissive for all to authenticated using (private.has_store_role(store_id, array[''admin'',''manager'']::text[])) with check (private.has_store_role(store_id, array[''admin'',''manager'']::text[]))';
  end if;
end;
$$;
