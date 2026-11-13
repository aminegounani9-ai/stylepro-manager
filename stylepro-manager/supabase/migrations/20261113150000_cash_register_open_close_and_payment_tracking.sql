create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cashier_id uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_float numeric(14,2) not null check (opening_float >= 0),
  opening_note text,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closing_cash_count numeric(14,2) check (closing_cash_count >= 0),
  expected_cash numeric(14,2),
  cash_difference numeric(14,2),
  cash_sales numeric(14,2),
  cash_expenses numeric(14,2),
  closed_by uuid references auth.users(id),
  closing_note text,
  created_at timestamptz not null default now(),
  constraint cash_register_close_state_check check (
    (status='open' and closed_at is null and closing_cash_count is null)
    or (status='closed' and closed_at is not null and closing_cash_count is not null)
  )
);
create unique index if not exists cash_register_one_open_per_cashier
  on public.cash_register_sessions(store_id,cashier_id) where status='open';
create index if not exists cash_register_store_opened_idx
  on public.cash_register_sessions(store_id,opened_at desc);
alter table public.cash_register_sessions enable row level security;
drop policy if exists cash_register_select_member on public.cash_register_sessions;
create policy cash_register_select_member on public.cash_register_sessions for select to authenticated
using (private.is_store_member(store_id));
drop policy if exists cash_register_insert_cashier on public.cash_register_sessions;
create policy cash_register_insert_cashier on public.cash_register_sessions for insert to authenticated
with check (cashier_id=auth.uid() and private.has_store_role(store_id,array['admin','manager','cashier']::text[]));
drop policy if exists cash_register_update_owner_manager on public.cash_register_sessions;
create policy cash_register_update_owner_manager on public.cash_register_sessions for update to authenticated
using (cashier_id=auth.uid() or private.has_store_role(store_id,array['admin','manager']::text[]))
with check (cashier_id=auth.uid() or private.has_store_role(store_id,array['admin','manager']::text[]));

create unique index if not exists payments_one_method_per_sale
  on public.payments(store_id,sale_id,method);

create or replace function public.open_cash_register(p_store_id uuid,p_opening_float numeric,p_note text default null)
returns public.cash_register_sessions
language plpgsql security definer set search_path=''
as $$
declare v_session public.cash_register_sessions;
begin
 if auth.uid() is null then raise exception 'Authentification requise'; end if;
 if p_opening_float is null or p_opening_float < 0 then raise exception 'Montant initial invalide'; end if;
 if not private.has_store_role(p_store_id,array['admin','manager','cashier']::text[]) then raise exception 'Accès refusé'; end if;
 insert into public.cash_register_sessions(store_id,cashier_id,opening_float,opening_note)
 values(p_store_id,auth.uid(),p_opening_float,nullif(trim(p_note),''))
 returning * into v_session;
 return v_session;
exception when unique_violation then
 raise exception 'Une session de caisse est déjà ouverte pour cet utilisateur dans cette boutique.';
end $$;

create or replace function public.close_cash_register(p_session_id uuid,p_counted_cash numeric,p_note text default null)
returns table(session_id uuid,opening_float numeric,cash_sales numeric,cash_expenses numeric,expected_cash numeric,counted_cash numeric,cash_difference numeric,closed_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_session public.cash_register_sessions; v_cash_sales numeric(14,2); v_cash_expenses numeric(14,2); v_expected numeric(14,2); v_now timestamptz:=now();
begin
 if auth.uid() is null then raise exception 'Authentification requise'; end if;
 if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Comptage de caisse invalide'; end if;
 select * into v_session from public.cash_register_sessions where id=p_session_id for update;
 if not found then raise exception 'Session de caisse introuvable'; end if;
 if v_session.status <> 'open' then raise exception 'Cette session est déjà clôturée'; end if;
 if v_session.cashier_id <> auth.uid() and not private.has_store_role(v_session.store_id,array['admin','manager']::text[]) then raise exception 'Seul le caissier ou un responsable peut clôturer cette caisse'; end if;

 select coalesce(sum(pay.amount),0)::numeric(14,2) into v_cash_sales
 from public.payments pay
 join public.sales s on s.id=pay.sale_id and s.store_id=pay.store_id
 where pay.store_id=v_session.store_id and s.cashier_id=v_session.cashier_id
   and pay.method='cash' and pay.status='received'
   and pay.created_at>=v_session.opened_at and pay.created_at<=v_now
   and s.status='completed';

 select coalesce(sum(e.amount),0)::numeric(14,2) into v_cash_expenses
 from public.expenses e
 where e.store_id=v_session.store_id and e.created_by=v_session.cashier_id
   and e.payment_source='cashbox'
   and e.created_at>=v_session.opened_at and e.created_at<=v_now;

 v_expected := v_session.opening_float + v_cash_sales - v_cash_expenses;
 update public.cash_register_sessions
 set status='closed',closed_at=v_now,closing_cash_count=p_counted_cash,
     cash_sales=v_cash_sales,cash_expenses=v_cash_expenses,
     expected_cash=v_expected,cash_difference=p_counted_cash-v_expected,
     closed_by=auth.uid(),closing_note=nullif(trim(p_note),'')
 where id=p_session_id;

 return query select p_session_id,v_session.opening_float,v_cash_sales,v_cash_expenses,
   v_expected,p_counted_cash,p_counted_cash-v_expected,v_now;
end $$;

create or replace function public.create_pos_sale_paid_idempotent(
 p_store_id uuid,p_items jsonb,p_customer_id uuid,p_idempotency_key uuid,
 p_cash_session_id uuid,p_payment_method text,p_cash_amount numeric default 0,p_card_amount numeric default 0
)
returns table(sale_id uuid,sale_number bigint,total numeric,item_count integer)
language plpgsql security definer set search_path=''
as $$
declare v_sale record; v_cash numeric(14,2):=coalesce(p_cash_amount,0); v_card numeric(14,2):=coalesce(p_card_amount,0);
begin
 if auth.uid() is null then raise exception 'Authentification requise'; end if;
 if not exists(select 1 from public.cash_register_sessions cr where cr.id=p_cash_session_id and cr.store_id=p_store_id and cr.cashier_id=auth.uid() and cr.status='open') then
   raise exception 'Ouvrez votre caisse avant de valider une vente.';
 end if;
 if p_payment_method not in ('cash','card','mixed') then raise exception 'Mode de paiement invalide'; end if;
 select * into v_sale from public.create_pos_sale_cart_idempotent(p_store_id,p_items,p_customer_id,p_idempotency_key);
 if p_payment_method='cash' then
   v_cash:=v_sale.total; v_card:=0;
 elsif p_payment_method='card' then
   v_cash:=0; v_card:=v_sale.total;
 end if;
 if v_cash<0 or v_card<0 or round(v_cash+v_card,2)<>round(v_sale.total,2) then
   raise exception 'Les montants espèces/carte doivent correspondre exactement au total de la vente.';
 end if;
 if v_cash>0 then
   insert into public.payments(store_id,sale_id,amount,method,status)
   values(p_store_id,v_sale.sale_id,v_cash,'cash','received')
   on conflict(store_id,sale_id,method) do nothing;
   if exists(select 1 from public.payments where store_id=p_store_id and sale_id=v_sale.sale_id and method='cash' and amount<>v_cash) then
     raise exception 'Le paiement espèces enregistré ne correspond pas à cette vente.';
   end if;
 end if;
 if v_card>0 then
   insert into public.payments(store_id,sale_id,amount,method,status)
   values(p_store_id,v_sale.sale_id,v_card,'card','received')
   on conflict(store_id,sale_id,method) do nothing;
   if exists(select 1 from public.payments where store_id=p_store_id and sale_id=v_sale.sale_id and method='card' and amount<>v_card) then
     raise exception 'Le paiement carte enregistré ne correspond pas à cette vente.';
   end if;
 end if;
 return query select v_sale.sale_id,v_sale.sale_number,v_sale.total,v_sale.item_count;
end $$;

revoke all on function public.open_cash_register(uuid,numeric,text) from public,anon;
revoke all on function public.close_cash_register(uuid,numeric,text) from public,anon;
revoke all on function public.create_pos_sale_paid_idempotent(uuid,jsonb,uuid,uuid,uuid,text,numeric,numeric) from public,anon;
grant execute on function public.open_cash_register(uuid,numeric,text) to authenticated;
grant execute on function public.close_cash_register(uuid,numeric,text) to authenticated;
grant execute on function public.create_pos_sale_paid_idempotent(uuid,jsonb,uuid,uuid,uuid,text,numeric,numeric) to authenticated;
