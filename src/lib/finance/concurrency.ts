/**
 * Thrown when a version-conditional write (UPDATE/DELETE with `id` + expected
 * `version`) affects zero rows — another write reached the row first. Never
 * caught-and-retried automatically: the caller's write fails, the local
 * optimistic state is not confirmed, and the existing sync-error handling
 * (a toast, see FinanceContext.tsx) surfaces it like any other failed write.
 */
export class ConcurrencyConflictError extends Error {
  readonly table: string;
  readonly id: string;

  constructor(table: string, id: string) {
    super(
      `Conflito de versao ao salvar em "${table}" (id ${id}): outro dispositivo alterou este registro primeiro.`,
    );
    this.name = "ConcurrencyConflictError";
    this.table = table;
    this.id = id;
  }
}
