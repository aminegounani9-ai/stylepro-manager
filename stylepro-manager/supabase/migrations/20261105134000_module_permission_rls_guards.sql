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
  select_expression text;
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
      ('store_settings', 'settings')
    ) as mapped(table_name, module_name)
  loop
    table_name := item.table_name;
    module_name := item.module_name;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and information_schema.columns.table_name = item.table_name
        and information_schema.columns.column_name = 'store_id'
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
        select_expression := format('private.has_module_permission(store_id, %L, %L)', module_name, 'view');

        -- Read-only dependencies needed by related modules (e.g. POS needs
        -- product/variant/customer/stock reads even when Catalogue is hidden).
        if table_name in ('products', 'product_variants') then
          select_expression := 'private.has_module_permission(store_id, ''catalogue'', ''view'')
            or private.has_module_permission(store_id, ''sales'', ''view'')
            or private.has_module_permission(store_id, ''stock'', ''view'')
            or private.has_module_permission(store_id, ''atelier'', ''view'')
            or private.has_module_permission(store_id, ''labels'', ''view'')
            or private.has_module_permission(store_id, ''promotions'', ''view'')
            or private.has_module_permission(store_id, ''deliveries'', ''view'')';
        elsif table_name in ('categories', 'brands') then
          select_expression := 'private.has_module_permission(store_id, ''catalogue'', ''view'')
            or private.has_module_permission(store_id, ''sales'', ''view'')
            or private.has_module_permission(store_id, ''promotions'', ''view'')';
        elsif table_name = 'customers' then
          select_expression := 'private.has_module_permission(store_id, ''clients'', ''view'')
            or private.has_module_permission(store_id, ''sales'', ''view'')';
        elsif table_name = 'stock_movements' then
          select_expression := 'private.has_module_permission(store_id, ''stock'', ''view'')
            or private.has_module_permission(store_id, ''sales'', ''view'')
            or private.has_module_permission(store_id, ''dashboard'', ''view'')
            or private.has_module_permission(store_id, ''deliveries'', ''view'')';
        elsif table_name = 'stock_locations' then
          select_expression := 'private.has_module_permission(store_id, ''stock'', ''view'')
            or private.has_module_permission(store_id, ''deliveries'', ''view'')';
        elsif table_name = 'suppliers' then
          select_expression := 'private.has_module_permission(store_id, ''stock'', ''view'')
            or private.has_module_permission(store_id, ''atelier'', ''view'')';
        elsif table_name in ('sales', 'sale_items') then
          select_expression := 'private.has_module_permission(store_id, ''sales'', ''view'')
            or private.has_module_permission(store_id, ''dashboard'', ''view'')';
        elsif table_name in ('returns', 'return_items') then
          select_expression := 'private.has_module_permission(store_id, ''returns'', ''view'')
            or private.has_module_permission(store_id, ''dashboard'', ''view'')';
        elsif table_name = 'expenses' then
          select_expression := 'private.has_module_permission(store_id, ''expenses'', ''view'')
            or private.has_module_permission(store_id, ''dashboard'', ''view'')';
        elsif table_name in ('promotions', 'promotion_products') then
          select_expression := 'private.has_module_permission(store_id, ''promotions'', ''view'')
            or private.has_module_permission(store_id, ''sales'', ''view'')';
        elsif table_name = 'store_settings' then
          select_expression := 'private.has_module_permission(store_id, ''settings'', ''view'')
            or private.has_module_permission(store_id, ''dashboard'', ''view'')';
        end if;

        execute format(
          'create policy %I on public.%I as restrictive for select to authenticated using ((%s))',
          policy_name, table_name, select_expression
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
