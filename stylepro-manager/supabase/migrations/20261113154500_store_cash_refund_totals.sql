alter table public.cash_register_sessions
  add column if not exists cash_refunds numeric(14,2) not null default 0;
