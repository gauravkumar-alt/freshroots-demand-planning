-- Freshroots demand planning — Supabase / PostgreSQL schema
-- Run once in the Supabase SQL editor. Safe to re-run: every statement is idempotent.
-- Tables are prefixed fr_ so they can live in a shared project without clashing.
-- RLS is on with no policies: only the server (service-role key) can read or write.

-- Audit log: the single source of truth for analysis runs, decisions, POs, kill-switch events and emails.
create table if not exists fr_audit_events (
  id                  text primary key,
  created_at          timestamptz not null,
  run_id              text not null,
  type                text not null,
  user_name           text not null,
  sku                 text,
  product             text,
  system_action       text,
  system_qty          integer,
  final_action        text,
  final_qty           integer,
  override            boolean not null default false,
  reason              text not null default '',
  exception_category  text,
  risk                text,
  reference           text
);
create index if not exists fr_audit_events_run_idx on fr_audit_events (run_id, created_at);
create index if not exists fr_audit_events_created_idx on fr_audit_events (created_at desc);

-- The audit trail is append-only.
create or replace function fr_audit_events_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'fr_audit_events is append-only';
end $$;
drop trigger if exists fr_audit_events_no_change on fr_audit_events;
create trigger fr_audit_events_no_change before update or delete on fr_audit_events
  for each row execute function fr_audit_events_immutable();

-- The latest uploaded file per slot (sales, inventory, skuMaster, purchaseOrders, distributors, calendar).
create table if not exists fr_uploads (
  kind         text primary key,
  file_name    text not null,
  content      text not null,
  uploaded_at  timestamptz not null default now(),
  uploaded_by  text not null
);

-- Rubric notes Raghav has retired before they expired.
create table if not exists fr_retired_notes (
  note_id     text primary key,
  retired_at  timestamptz not null default now(),
  retired_by  text not null
);

-- Actual quarterly losses recorded by finance, for the loss kill criterion.
create table if not exists fr_quarter_outcomes (
  quarter              text primary key,
  stockout_loss_lakh   numeric not null,
  overstock_loss_lakh  numeric not null,
  recorded_at          timestamptz not null default now(),
  recorded_by          text not null
);

alter table fr_audit_events enable row level security;
alter table fr_uploads enable row level security;
alter table fr_retired_notes enable row level security;
alter table fr_quarter_outcomes enable row level security;

-- Make the API see the new tables immediately.
notify pgrst, 'reload schema';
