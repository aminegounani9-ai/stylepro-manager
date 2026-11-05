-- StylePro Manager — module permission RLS guard.
-- This migration only adds RESTRICTIVE guards and a global-Admin allow policy.
-- It preserves existing permissive policies and their parent-row / draft-state checks.
-- Existing role policies may still be more restrictive than a member's grants; that
-- is intentional until each original policy is safely refactored with its full checks.

do $module_guard$
declare
  item record;
  table_name text;
  module_name text;
  action_name text;
  policy_name text;
  table_exists boolean;
begin
  for item in
    select * from (values
      ('products', 'catalogue'),
      ('product_variants', 'catalogue'),
      ('categories', 'catalogue'),
      ('brands', 'catalogue'),
      ('customers', 'clients'),
      ('sales', 'sales'),
      ('sale_items', 'sales'),
      ('payments', 'sales'),
      ('stock_movements', 'stock'),
      ('stock_locations', 'stock'),
      ('suppliers', 'stock'),
      ('purchase_orders', 'stock'),
      ('purchase_order_items', 'stock'),
      ('returns', 'returns'),
      ('return_items', 'returns'),
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
      ('promotions', 'promotions'),
      ('promotion_products', 'promotions'),
      ('store_modules', 'settings'),
      ('store_settings', 'settings'),
      ('audit_logs', 'settings')
    ) as mapped(table_name, module_name)
  loop
    table_name := item.table_name;
    module_name := item.module_name;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = item.table_name
        and column_name = 'store_id'
    ) into table_exists;

    if not table_exists then
      raise notice 'Skipping %.public table or store_id column not found.', item.table_name;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);

    execute format('drop policy if exists global_admin_all on public.%I', table_name);
    execute format(
      'create policy global_admin_all on public.%I for all to authenticated using (private.is_global_admin()) with check (private.is_global_admin())',
      table_name
    );

    foreach action_name in array array['select', 'insert', 'update', 'delete']
    loop
      policy_name := 'module_guard_' || action_name;
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);

      if action_name = 'select' then
        execute format(
          'create policy %I on public.%I as restrictive for select to authenticated using (private.has_module_permission(store_id, %L, %L))',
          policy_name, table_name, module_name, 'view'
        );
      elsif action_name = 'insert' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated with check (private.has_module_permission(store_id, %L, %L))',
          policy_name, table_name, module_name, 'create'
        );
      elsif action_name = 'update' then
        execute format(
          'create policy %I on public.%I as restrictive for update to authenticated using (private.has_module_permission(store_id, %L, %L)) with check (private.has_module_permission(store_id, %L, %L))',
          policy_name, table_name, module_name, 'update', module_name, 'update'
        );
      elsif action_name = 'delete' then
        execute format(
          'create policy %I on public.%I as restrictive for delete to authenticated using (private.has_module_permission(store_id, %L, %L))',
          policy_name, table_name, module_name, 'delete'
        );
      end if;
    end loop;
  end loop;
end;
$module_guard$;

-- Global Admin must be able to discover and open every store, not only stores
-- where a separate store_members row exists.
drop policy if exists global_admin_all_stores on public.stores;
create policy global_admin_all_stores
  on public.stores
  for all to authenticated
  using (private.is_global_admin())
  with check (private.is_global_admin());
