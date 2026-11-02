-- StylePro Manager — READ-ONLY schema/security inventory
-- Run in Supabase Dashboard > SQL Editor on the intended project.
-- This script contains SELECT statements only. It does not alter tables, policies, data, or storage.
-- Review every result set before preparing any migration.

-- 1) Public tables and Row Level Security status
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relkind as relation_type,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p','v','m')
order by c.relname;

-- 2) Exact column definitions for public tables
select
  table_schema, table_name, ordinal_position, column_name,
  data_type, udt_name, is_nullable, column_default,
  character_maximum_length
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 3) Primary keys, unique constraints, foreign keys and check constraints
select
  tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type,
  kcu.column_name,
  ccu.table_schema as foreign_schema,
  ccu.table_name as foreign_table,
  ccu.column_name as foreign_column,
  rc.update_rule, rc.delete_rule,
  cc.check_clause
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_catalog = kcu.constraint_catalog
 and tc.constraint_schema = kcu.constraint_schema
 and tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
 and tc.table_name = kcu.table_name
left join information_schema.constraint_column_usage ccu
  on tc.constraint_catalog = ccu.constraint_catalog
 and tc.constraint_schema = ccu.constraint_schema
 and tc.constraint_name = ccu.constraint_name
left join information_schema.referential_constraints rc
  on tc.constraint_catalog = rc.constraint_catalog
 and tc.constraint_schema = rc.constraint_schema
 and tc.constraint_name = rc.constraint_name
left join information_schema.check_constraints cc
  on tc.constraint_catalog = cc.constraint_catalog
 and tc.constraint_schema = cc.constraint_schema
 and tc.constraint_name = cc.constraint_name
where tc.table_schema = 'public'
order by tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

-- 4) Existing RLS policies, including commands, roles and USING/WITH CHECK expressions
select
  schemaname, tablename, policyname, permissive, roles,
  cmd, qual as using_expression, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5) Table-level privileges currently granted in public
select
  grantee, table_schema, table_name, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
order by table_name, grantee, privilege_type;

-- 6) Public functions/procedures (names and signatures only)
select
  n.nspname as schema_name,
  p.proname as routine_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind in ('f','p')
order by p.proname, arguments;

-- 7) Storage buckets and their public/private setting
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by name;

-- 8) Storage object policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;

-- 9) Expected application tables: report missing tables without modifying anything
with expected(table_name) as (
  values
    ('stores'), ('products'), ('product_variants'), ('categories'), ('brands'),
    ('sales'), ('sale_items'), ('returns'), ('return_items'), ('customers'),
    ('expenses'), ('stock_movements'), ('promotions'), ('promotion_products'),
    ('mobile_scanner_sessions'), ('mobile_scanner_events'),
    ('atelier_suppliers'), ('atelier_productions'), ('atelier_production_models'),
    ('atelier_production_sizes'), ('atelier_stock_integrations'), ('audit_logs')
)
select
  e.table_name,
  case when t.table_name is null then 'MISSING' else 'EXISTS' end as status
from expected e
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = e.table_name
order by e.table_name;
