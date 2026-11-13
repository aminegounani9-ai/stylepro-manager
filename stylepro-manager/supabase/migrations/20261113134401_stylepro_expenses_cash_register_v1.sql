alter table public.expenses
  add column if not exists expense_type text not null default 'other',
  add column if not exists payment_source text not null default 'cashbox',
  add column if not exists payee_name text,
  add column if not exists reference text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_expense_type_check'
  ) then
    alter table public.expenses
      add constraint expenses_expense_type_check
      check (expense_type in ('cash_withdrawal','salary','delivery','company','other'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_payment_source_check'
  ) then
    alter table public.expenses
      add constraint expenses_payment_source_check
      check (payment_source in ('cashbox','bank','other'));
  end if;
end $$;

create index if not exists expenses_store_date_type_idx
  on public.expenses (store_id, expense_date desc, expense_type);
create index if not exists expenses_store_source_date_idx
  on public.expenses (store_id, payment_source, expense_date desc);

comment on column public.expenses.expense_type is 'Business expense classification: cash withdrawal, salary, delivery, company, other.';
comment on column public.expenses.payment_source is 'Source of outgoing funds: cashbox, bank, or other.';
