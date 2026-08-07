/**
 * Thrown when a conditional write (UPDATE/DELETE scoped to `id` + expected
 * `version`) affects zero rows. That shape is genuinely ambiguous from the
 * client's side: Postgres/PostgREST give back the exact same result — no
 * error, an empty row set — whether the row's version changed under a
 * concurrent write, the row was deleted, or RLS is simply hiding it from
 * this user (e.g. it belongs to a different household). Confirmed
 * empirically against a real Supabase project: an RLS-blocked write and a
 * stale-version write are indistinguishable at this layer.
 *
 * Telling those apart would require an extra lookup with elevated
 * (service_role) privileges to bypass RLS and inspect the row directly —
 * deliberately not done here, since that would mean quietly working around
 * the same access control this app relies on elsewhere. So this error makes
 * NO claim about which of those three happened; it only says the write
 * didn't take effect. Never caught-and-retried automatically: the caller's
 * write fails, the local optimistic state is not confirmed, and the
 * existing sync-error handling (a toast, see FinanceContext.tsx) surfaces
 * it like any other failed write.
 */
export class WriteNotAppliedError extends Error {
  readonly table: string;
  readonly id: string;

  constructor(table: string, id: string) {
    super(
      `Nao foi possivel salvar em "${table}" (id ${id}): o registro pode ter sido alterado, removido, ou nao esta mais acessivel.`,
    );
    this.name = "WriteNotAppliedError";
    this.table = table;
    this.id = id;
  }
}
