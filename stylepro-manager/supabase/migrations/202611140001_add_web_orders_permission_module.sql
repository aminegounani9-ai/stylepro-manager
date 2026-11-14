-- Add the independently controlled Commandes Web module to per-user permissions.
-- Existing grants and business data are preserved.
alter table public.store_member_module_permissions
  drop constraint if exists store_member_module_permissions_module_key_check;

alter table public.store_member_module_permissions
  add constraint store_member_module_permissions_module_key_check
  check (module_key in (
    'dashboard',
    'catalogue',
    'sales',
    'web_orders',
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
  ));
