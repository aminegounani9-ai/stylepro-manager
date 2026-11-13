alter table public.cash_register_sessions
 add column if not exists total_sales numeric(14,2) not null default 0,
 add column if not exists sales_returns numeric(14,2) not null default 0,
 add column if not exists cost_of_goods_sold numeric(14,2) not null default 0,
 add column if not exists gross_profit numeric(14,2) not null default 0,
 add column if not exists total_expenses numeric(14,2) not null default 0,
 add column if not exists net_profit numeric(14,2) not null default 0;

drop function if exists public.close_cash_register(uuid,numeric,text);
create function public.close_cash_register(p_session_id uuid,p_counted_cash numeric,p_note text default null)
returns table(session_id uuid,opening_float numeric,cash_sales numeric,cash_expenses numeric,cash_refunds numeric,expected_cash numeric,counted_cash numeric,cash_difference numeric,closed_at timestamptz,total_sales numeric,sales_returns numeric,cost_of_goods_sold numeric,gross_profit numeric,total_expenses numeric,net_profit numeric)
language plpgsql security definer set search_path=''
as $$
declare
 v_session public.cash_register_sessions;
 v_cash_sales numeric(14,2); v_cash_expenses numeric(14,2); v_cash_refunds numeric(14,2); v_expected numeric(14,2);
 v_total_sales numeric(14,2); v_returns numeric(14,2); v_cogs numeric(14,2); v_restock_cost numeric(14,2);
 v_total_expenses numeric(14,2); v_gross_profit numeric(14,2); v_net_profit numeric(14,2);
 v_now timestamptz:=now();
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
 and pay.method='cash' and pay.status='received' and pay.created_at>=v_session.opened_at and pay.created_at<=v_now
 and s.status in ('completed','refunded');

 select coalesce(sum(e.amount),0)::numeric(14,2) into v_cash_expenses
 from public.expenses e where e.store_id=v_session.store_id and e.created_by=v_session.cashier_id
 and e.payment_source='cashbox' and e.created_at>=v_session.opened_at and e.created_at<=v_now;

 select coalesce(sum(r.total),0)::numeric(14,2) into v_cash_refunds
 from public.returns r where r.store_id=v_session.store_id and r.processed_by=v_session.cashier_id
 and r.refund_method='cash' and r.created_at>=v_session.opened_at and r.created_at<=v_now;

 select coalesce(sum(s.total),0)::numeric(14,2) into v_total_sales
 from public.sales s where s.store_id=v_session.store_id and s.cashier_id=v_session.cashier_id
 and s.status in ('completed','refunded') and coalesce(s.completed_at,s.created_at)>=v_session.opened_at
 and coalesce(s.completed_at,s.created_at)<=v_now;

 select coalesce(sum(r.total),0)::numeric(14,2) into v_returns
 from public.returns r where r.store_id=v_session.store_id and r.processed_by=v_session.cashier_id
 and r.created_at>=v_session.opened_at and r.created_at<=v_now;

 select coalesce(sum(si.unit_cost*si.quantity),0)::numeric(14,2) into v_cogs
 from public.sale_items si join public.sales s on s.id=si.sale_id and s.store_id=si.store_id
 where s.store_id=v_session.store_id and s.cashier_id=v_session.cashier_id
 and s.status in ('completed','refunded') and coalesce(s.completed_at,s.created_at)>=v_session.opened_at
 and coalesce(s.completed_at,s.created_at)<=v_now;

 select coalesce(sum(ri.quantity*si.unit_cost),0)::numeric(14,2) into v_restock_cost
 from public.return_items ri join public.returns r on r.id=ri.return_id and r.store_id=ri.store_id
 join public.sale_items si on si.id=ri.sale_item_id and si.store_id=ri.store_id
 join public.sales s on s.id=si.sale_id and s.store_id=si.store_id
 where r.store_id=v_session.store_id and r.processed_by=v_session.cashier_id
 and r.created_at>=v_session.opened_at and r.created_at<=v_now and ri.restock=true
 and s.cashier_id=v_session.cashier_id and coalesce(s.completed_at,s.created_at)>=v_session.opened_at
 and coalesce(s.completed_at,s.created_at)<=v_now;

 select coalesce(sum(e.amount),0)::numeric(14,2) into v_total_expenses
 from public.expenses e where e.store_id=v_session.store_id and e.created_by=v_session.cashier_id
 and e.created_at>=v_session.opened_at and e.created_at<=v_now;

 v_cogs:=greatest(0,v_cogs-v_restock_cost);
 v_gross_profit:=v_total_sales-v_returns-v_cogs;
 v_net_profit:=v_gross_profit-v_total_expenses;
 v_expected:=v_session.opening_float+v_cash_sales-v_cash_expenses-v_cash_refunds;

 update public.cash_register_sessions set status='closed',closed_at=v_now,closing_cash_count=p_counted_cash,
 cash_sales=v_cash_sales,cash_expenses=v_cash_expenses,cash_refunds=v_cash_refunds,expected_cash=v_expected,
 cash_difference=p_counted_cash-v_expected,total_sales=v_total_sales,sales_returns=v_returns,
 cost_of_goods_sold=v_cogs,gross_profit=v_gross_profit,total_expenses=v_total_expenses,net_profit=v_net_profit,
 closed_by=auth.uid(),closing_note=nullif(trim(p_note),'')
 where id=p_session_id;

 return query select p_session_id,v_session.opening_float,v_cash_sales,v_cash_expenses,v_cash_refunds,v_expected,
 p_counted_cash,p_counted_cash-v_expected,v_now,v_total_sales,v_returns,v_cogs,v_gross_profit,v_total_expenses,v_net_profit;
end $$;
revoke all on function public.close_cash_register(uuid,numeric,text) from public,anon;
grant execute on function public.close_cash_register(uuid,numeric,text) to authenticated;
