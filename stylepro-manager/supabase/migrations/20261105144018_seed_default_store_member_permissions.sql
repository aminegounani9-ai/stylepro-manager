-- Give existing active store members safe, role-based starting permissions.
-- Additive/upsert only: no accounts, memberships, or business data are removed.
with role_users as (
  select store_id,user_id,role
  from public.store_members
  where is_active=true and role in ('manager','stock_manager','cashier')
),
modules(module_key) as (
  values ('dashboard'),('catalogue'),('sales'),('stock'),('returns'),('clients'),
         ('expenses'),('atelier'),('deliveries'),('promotions'),('labels'),('users'),('settings')
),
grants as (
  select ru.store_id,ru.user_id,m.module_key,
    case
      when ru.role='manager' then true
      when ru.role='stock_manager' and m.module_key in ('dashboard','catalogue','stock','labels','deliveries') then true
      when ru.role='cashier' and m.module_key in ('dashboard','sales','returns','clients') then true
      else false
    end as can_view,
    case
      when ru.role='manager' then true
      when ru.role='stock_manager' and m.module_key in ('stock','deliveries') then true
      when ru.role='cashier' and m.module_key in ('sales','returns','clients') then true
      else false
    end as can_add,
    case
      when ru.role='manager' then true
      when ru.role='stock_manager' and m.module_key in ('stock','deliveries') then true
      when ru.role='cashier' and m.module_key in ('returns','clients') then true
      else false
    end as can_edit,
    (ru.role='manager') as can_delete,
    (select user_id from public.global_admins order by created_at limit 1) as granted_by
  from role_users ru cross join modules m
)
insert into public.store_member_module_permissions
(store_id,user_id,module_key,can_view,can_add,can_edit,can_delete,granted_by,updated_at)
select store_id,user_id,module_key,can_view,can_add,can_edit,can_delete,granted_by,now()
from grants
on conflict (store_id,user_id,module_key) do update
set can_view=excluded.can_view,
    can_add=excluded.can_add,
    can_edit=excluded.can_edit,
    can_delete=excluded.can_delete,
    granted_by=excluded.granted_by,
    updated_at=now();