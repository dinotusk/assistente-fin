-- PROPOSED — NOT APPLIED. Part of P0-IMPORT-1 (Etapa 3: identidade bancária).
-- Do not run this migration until it has been explicitly reviewed and
-- reauthorized. It is committed here only so the exact DDL can be reviewed
-- alongside the client-side changes that would depend on it.
--
-- Why: bank-statement import today can only tell two transactions apart by
-- date + amount + description, because the bank's own unique transaction id
-- (OFX FITID) is parsed but never persisted. Two genuinely different
-- transactions that happen to share date/amount/description (e.g. two same-
-- day purchases of the same value at the same vendor) are silently treated
-- as duplicates and dropped. Persisting the bank's id lets real duplicates
-- (same id imported twice) be rejected while genuinely distinct transactions
-- (different id) are both kept.
--
-- Name chosen deliberately neutral (`bank_transaction_id`, not `fit_id`):
-- OFX's FITID is the only source today, but CSV or a future Open Finance
-- integration could supply the same kind of identifier under a different
-- name.

begin;

alter table public.expenses
  add column if not exists bank_transaction_id text;

comment on column public.expenses.bank_transaction_id is
  'Bank-assigned unique transaction identifier (e.g. OFX FITID), when the row came from a bank statement import. Null for expenses entered manually or imported from a source with no such identifier.';

-- Defense in depth: even if a client-side dedup check is ever bypassed or
-- buggy, the same bank transaction id can never be inserted twice for the
-- same household. Partial index so it costs nothing for the (common) rows
-- that have no bank id at all.
create unique index if not exists expenses_household_bank_transaction_id_key
  on public.expenses (household_id, bank_transaction_id)
  where bank_transaction_id is not null;

commit;
