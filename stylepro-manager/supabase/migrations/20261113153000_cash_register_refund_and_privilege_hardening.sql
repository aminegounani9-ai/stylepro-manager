alter table public.returns
  add column if not exists refund_method text not null default 'other';
do $$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.returns'::regclass and conname='returns_refund_method_check') then
  alter table public.returns add constraint returns_refund_method_check check(refund_method in ('cash','card','transfer','other'));
 end if;
end $$;

create or replace function public.create_pos_return_paid_idempotent(
 p_store_id uuid,p_sale_id uuid,p_items jsonb,p_reason text,p_idempotency_key uuid,p_refund_method text
)
returns table(return_id uuid,refund_total numeric)
language plpgsql security definer set search_path=''
as $$
declare v_result record;
begin
 if p_refund_method not in ('cash','card','transfer','other') then raise exception 'Mode de remboursement invalide'; end if;
 select * into v_result from public.create_pos_return_idempotent(p_store_id,p_sale_id,p_items,p_reason,p_idempotency_key);
 update public.returns set refund_method=p_refund_method
 where id=v_result.return_id and store_id=p_store_id and processed_by=auth.uid();
 return query select v_result.return_id,v_result.refund_total;
end $$;

revoke all on function public.create_pos_return_paid_idempotent(uuid,uuid,jsonb,text,uuid,text) from public,anon;
grant execute on function public.create_pos_return_paid_idempotent(uuid,uuid,jsonb,text,uuid,text) to authenticated;

create or replace function public.close_cash_register(p_session_id uuid,p_counted_cash numeric,p_note text default null)
returns table(session_id uuid,opening_float numeric,cash_sales numeric,cash_expenses numeric,cash_refunds numeric,expected_cash numeric,counted_cash numeric,cash_difference numeric,closed_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_session public.cash_register_sessions; v_cash_sales numeric(14,2); v_cash_expenses numeric(14,2); v_cash_refunds numeric(14,2); v_expected numeric(14,2); v_now timestamptz:=now();
begin
 if auth.uid() is null then raise exception 'Authentification requise'; end if;
 if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Comptage de caisse invalide'; end if;
 select * into v_session from public.cash_register_sessions where id=p_session_id for update;
 if not found then raise exception 'Session de caisse introuvable'; end if;
 if v_session.status <> 'open' then raise exception 'Cette session est déjà clôturée'; end if;
 if v_session.cashier_id <> auth.uid() and not private.has_store_role(v_session.store_id,array['admin','manager']::text[]) then raise exception 'Seul le caissier ou un responsable peut clôturer cette caisse'; end if;
 select coalesce(sum(pay.amount),0)::numeric(14,2) into v_cash_sales
 from public.payments pay join public.sales s on s.id=pay.sale_id and s.store_id=pay.store_id
 where pay.store_id=v_session.store_id and s.cashier_id=v_session.cashier_id
 and pay.method='cash' and pay.status='received' and pay.created_at>=v_session.opened_at and pay.created_at<=v_now and s.status='completed';
 select coalesce(sum(e.amount),0)::numeric(14,2) into v_cash_expenses
 from public.expenses e where e.store_id=v_session.store_id and e.created_by=v_session.cashier_id
 and e.payment_source='cashbox' and e.created_at>=v_session.opened_at and e.created_at<=v_now;
 select coalesce(sum(r.total),0)::numeric(14,2) into v_cash_refunds
 from public.returns r where r.store_id=v_session.store_id and r.processed_by=v_session.cashier_id
 and r.refund_method='cash' and r.created_at>=v_session.opened_at and r.created_at<=v_now;
 v_expected:=v_session.opening_float+v_cash_sales-v_cash_expenses-v_cash_refunds;
 update public.cash_register_sessions set status='closed',closed_at=v_now,closing_cash_count=p_counted_cash,
 cash_sales=v_cash_sales,cash_expenses=v_cash_expenses,expected_cash=v_expected,cash_difference=p_counted_cash-v_expected,
 closed_by=auth.uid(),closing_note=nullif(trim(p_note),'') where id=p_session_id;
 return query select p_session_id,v_session.opening_float,v_cash_sales,v_cash_expenses,v_cash_refunds,v_expected,p_counted_cash,p_counted_cash-v_expected,v_now;
end $$;
revoke all on function public.close_cash_register(uuid,numeric,text) from public,anon;
grant execute on function public.close_cash_register(uuid,numeric,text) to authenticated;

drop policy if exists cash_register_update_owner_manager on public.cash_register_sessions;
revoke insert,update,delete on public.cash_register_sessions from authenticated;
