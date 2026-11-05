-- StylePro Manager — module permission RLS guard.
-- This migration adds RESTRICTIVE guards, a global-Admin allow policy, and
-- permission-based allow policies for audited simple tables and child rows whose
-- same-store parent relationship is checked explicitly.
-- Existing role policies and delivery draft-state checks are preserved. Existing
-- role policies may still be more restrictive than a member's grants on workflows
-- intentionally not expanded here.

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
      ('stock_movements', 'stock'),
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
      ('atelier_production_counters', 'atelier'),
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
            or private.has_module_permission(store_id, ''deliveries'', ''view'')
            or private.has_module_permission(store_id, ''dashboard'', ''view'')';
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
            or private.has_module_permission(store_id, ''deliveries'', ''view'')
            or private.has_module_permission(store_id, ''labels'', ''view'')';
        elsif table_name = 'stock_locations' then
          select_expression := 'private.has_module_permission(store_id, ''stock'', ''view'')
            or private.has_module_permission(store_id, ''deliveries'', ''view'')';
        elsif table_name = 'suppliers' then
          select_expression := 'private.has_module_permission(store_id, ''stock'', ''view'')
            or private.has_module_permission(store_id, ''atelier'', ''view'')';
        elsif table_name in ('sales', 'sale_items') then
          select_expression := 'private.has_module_permission(store_id, ''sales'', ''view'')
            or private.has_module_permission(store_id, ''dashboard'', ''view'')
            or private.has_module_permission(store_id, ''returns'', ''view'')';
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

-- These tables had straightforward store-member / role-only policies in the
-- supplied audit. Add permission-based permissive policies so a Manager can
-- delegate them across employee roles. Child tables with parent-row checks and
-- delivery tables with draft-state checks are intentionally excluded here.
do $module_grant_allow$
declare
  item record;
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
      ('stock_locations', 'stock'),
      ('suppliers', 'stock'),
      ('purchase_orders', 'stock'),
      ('expenses', 'expenses'),
      ('expense_categories', 'expenses'),
      ('promotions', 'promotions')
    ) as mapped(table_name, module_name)
  loop
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and information_schema.columns.table_name = item.table_name
        and information_schema.columns.column_name = 'store_id'
    ) into table_exists;

    if not table_exists then
      raise notice 'Skipping module allow policies for %.public table or store_id column not found.', item.table_name;
      continue;
    end if;

    foreach action_name in array array['select', 'insert', 'update', 'delete']
    loop
      if item.table_name = 'stock_movements' and action_name <> 'select' then
        continue;
      end if;
      policy_name := 'module_grant_allow_' || action_name;
      execute format('drop policy if exists %I on public.%I', policy_name, item.table_name);

      if action_name = 'select' then
        if item.table_name = 'expenses' then
          execute format(
            'create policy %I on public.%I for select to authenticated using (private.has_module_permission(store_id, %L, %L) or private.has_module_permission(store_id, %L, %L))',
            policy_name, item.table_name, item.module_name, 'view', 'dashboard', 'view'
          );
        elsif item.table_name = 'stock_movements' then
          execute format(
            'create policy %I on public.%I for select to authenticated using (private.has_module_permission(store_id, %L, %L) or private.has_module_permission(store_id, %L, %L) or private.has_module_permission(store_id, %L, %L) or private.has_module_permission(store_id, %L, %L) or private.has_module_permission(store_id, %L, %L))',
            policy_name, item.table_name, 'stock', 'view', 'sales', 'view', 'dashboard', 'view', 'deliveries', 'view', 'labels', 'view'
          );
        else
          execute format(
            'create policy %I on public.%I for select to authenticated using (private.has_module_permission(store_id, %L, %L))',
            policy_name, item.table_name, item.module_name, 'view'
          );
        end if;
      elsif action_name = 'insert' then
        execute format(
          'create policy %I on public.%I for insert to authenticated with check (private.has_module_permission(store_id, %L, %L))',
          policy_name, item.table_name, item.module_name, 'create'
        );
      elsif action_name = 'update' then
        execute format(
          'create policy %I on public.%I for update to authenticated using (private.has_module_permission(store_id, %L, %L)) with check (private.has_module_permission(store_id, %L, %L))',
          policy_name, item.table_name, item.module_name, 'update', item.module_name, 'update'
        );
      elsif action_name = 'delete' then
        execute format(
          'create policy %I on public.%I for delete to authenticated using (private.has_module_permission(store_id, %L, %L))',
          policy_name, item.table_name, item.module_name, 'delete'
        );
      end if;
    end loop;
  end loop;
end;
$module_grant_allow$;

-- Child-row policies preserve the same-store parent relationship explicitly.
-- The sale_items condition also avoids the tautological store comparison noted
-- in the supplied audit (s.store_id = s.store_id).
do $module_child_allow$
declare
  child_table text;
  parent_table text;
  child_fk text;
  action_name text;
  policy_name text;
  has_columns boolean;
begin
  for child_table, parent_table, child_fk in
    select * from (values
      ('sale_items', 'sales', 'sale_id'),
      ('payments', 'sales', 'sale_id'),
      ('returns', 'sales', 'sale_id'),
      ('return_items', 'returns', 'return_id')
    ) as child_map(child_table, parent_table, child_fk)
  loop
    select
      exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=child_table and c.column_name='store_id')
      and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=child_table and c.column_name=child_fk)
      and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=parent_table and c.column_name='id')
      and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=parent_table and c.column_name='store_id')
    into has_columns;

    if not has_columns then
      raise notice 'Skipping parent-scoped module policy for %. Required store or parent key column not found.', child_table;
      continue;
    end if;

    if child_table = 'sale_items' then
      foreach action_name in array array['insert', 'update', 'delete']
      loop
        policy_name := 'module_grant_allow_' || action_name;
        execute format('drop policy if exists %I on public.%I', policy_name, child_table);
        if action_name = 'insert' then
          execute format(
            'create policy %I on public.%I for insert to authenticated with check (private.has_module_permission(store_id, %L, %L) and exists (select 1 from public.%I parent_row where parent_row.id = %I.%I and parent_row.store_id = %I.store_id))',
            policy_name, child_table, 'sales', 'create', parent_table, child_table, child_fk, child_table
          );
        elsif action_name = 'update' then
          execute format(
            'create policy %I on public.%I for update to authenticated using (private.has_module_permission(store_id, %L, %L) and exists (select 1 from public.%I parent_row where parent_row.id = %I.%I and parent_row.store_id = %I.store_id)) with check (private.has_module_permission(store_id, %L, %L) and exists (select 1 from public.%I parent_row where parent_row.id = %I.%I and parent_row.store_id = %I.store_id))',
            policy_name, child_table, 'sales', 'update', parent_table, child_table, child_fk, child_table,
            'sales', 'update', parent_table, child_table, child_fk, child_table
          );
        else
          execute format(
            'create policy %I on public.%I for delete to authenticated using (private.has_module_permission(store_id, %L, %L) and exists (select 1 from public.%I parent_row where parent_row.id = %I.%I and parent_row.store_id = %I.store_id))',
            policy_name, child_table, 'sales', 'delete', parent_table, child_table, child_fk, child_table
          );
        end if;
      end loop;
    else
      policy_name := 'module_grant_allow_insert';
      execute format('drop policy if exists %I on public.%I', policy_name, child_table);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (private.has_module_permission(store_id, %L, %L) and exists (select 1 from public.%I parent_row where parent_row.id = %I.%I and parent_row.store_id = %I.store_id))',
        policy_name, child_table, case when child_table = 'payments' then 'sales' else 'returns' end,
        'create', parent_table, child_table, child_fk, child_table
      );
    end if;
  end loop;
end;
$module_child_allow$;

-- Purchase-order line access is tied to a same-store parent order.
do $purchase_order_item_allow$
declare
  action_name text;
  has_columns boolean;
begin
  select
    exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='purchase_order_items' and c.column_name='store_id')
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='purchase_order_items' and c.column_name='purchase_order_id')
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='purchase_orders' and c.column_name='id')
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='purchase_orders' and c.column_name='store_id')
  into has_columns;

  if has_columns then
    foreach action_name in array array['insert', 'update', 'delete']
    loop
      execute format('drop policy if exists %I on public.purchase_order_items', 'module_grant_allow_' || action_name);
      if action_name = 'insert' then
        execute 'create policy module_grant_allow_insert on public.purchase_order_items for insert to authenticated with check (
          private.has_module_permission(store_id, ''stock'', ''create'')
          and exists (select 1 from public.purchase_orders po where po.id = purchase_order_items.purchase_order_id and po.store_id = purchase_order_items.store_id)
        )';
      elsif action_name = 'update' then
        execute 'create policy module_grant_allow_update on public.purchase_order_items for update to authenticated using (
          private.has_module_permission(store_id, ''stock'', ''update'')
          and exists (select 1 from public.purchase_orders po where po.id = purchase_order_items.purchase_order_id and po.store_id = purchase_order_items.store_id)
        ) with check (
          private.has_module_permission(store_id, ''stock'', ''update'')
          and exists (select 1 from public.purchase_orders po where po.id = purchase_order_items.purchase_order_id and po.store_id = purchase_order_items.store_id)
        )';
      else
        execute 'create policy module_grant_allow_delete on public.purchase_order_items for delete to authenticated using (
          private.has_module_permission(store_id, ''stock'', ''delete'')
          and exists (select 1 from public.purchase_orders po where po.id = purchase_order_items.purchase_order_id and po.store_id = purchase_order_items.store_id)
        )';
      end if;
    end loop;
  else
    raise notice 'Skipping purchase_order_items module policies; expected store_id and purchase_order_id columns were not found.';
  end if;
end;
$purchase_order_item_allow$;

-- Promotion-product rows must point to both a promotion and product in
-- the same store before module grants can authorize their mutation.
do $promotion_product_allow$
declare
  action_name text;
  has_columns boolean;
begin
  select
    exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='promotion_products' and c.column_name='store_id')
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='promotion_products' and c.column_name='promotion_id')
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='promotion_products' and c.column_name='product_id')
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='promotions' and c.column_name='id')
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='promotions' and c.column_name='store_id')
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='products' and c.column_name='id')
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='products' and c.column_name='store_id')
  into has_columns;

  if has_columns then
    foreach action_name in array array['insert', 'update', 'delete']
    loop
      execute format('drop policy if exists %I on public.promotion_products', 'module_grant_allow_' || action_name);
      if action_name = 'insert' then
        execute 'create policy module_grant_allow_insert on public.promotion_products for insert to authenticated with check (
          private.has_module_permission(store_id, ''promotions'', ''create'')
          and exists (select 1 from public.promotions p where p.id = promotion_products.promotion_id and p.store_id = promotion_products.store_id)
          and exists (select 1 from public.products pr where pr.id = promotion_products.product_id and pr.store_id = promotion_products.store_id)
        )';
      elsif action_name = 'update' then
        execute 'create policy module_grant_allow_update on public.promotion_products for update to authenticated using (
          private.has_module_permission(store_id, ''promotions'', ''update'')
          and exists (select 1 from public.promotions p where p.id = promotion_products.promotion_id and p.store_id = promotion_products.store_id)
          and exists (select 1 from public.products pr where pr.id = promotion_products.product_id and pr.store_id = promotion_products.store_id)
        ) with check (
          private.has_module_permission(store_id, ''promotions'', ''update'')
          and exists (select 1 from public.promotions p where p.id = promotion_products.promotion_id and p.store_id = promotion_products.store_id)
          and exists (select 1 from public.products pr where pr.id = promotion_products.product_id and pr.store_id = promotion_products.store_id)
        )';
      else
        execute 'create policy module_grant_allow_delete on public.promotion_products for delete to authenticated using (
          private.has_module_permission(store_id, ''promotions'', ''delete'')
          and exists (select 1 from public.promotions p where p.id = promotion_products.promotion_id and p.store_id = promotion_products.store_id)
          and exists (select 1 from public.products pr where pr.id = promotion_products.product_id and pr.store_id = promotion_products.store_id)
        )';
      end if;
    end loop;
  else
    raise notice 'Skipping promotion_products module policies; expected same-store relationship columns were not found.';
  end if;
end;
$promotion_product_allow$;

-- Global Admin must be able to discover and open every store, not only stores
-- where a separate store_members row exists.
drop policy if exists global_admin_all_stores on public.stores;
create policy global_admin_all_stores
  on public.stores
  for all to authenticated
  using (private.is_global_admin())
  with check (private.is_global_admin());
