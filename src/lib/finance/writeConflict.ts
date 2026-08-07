import { WriteNotAppliedError } from "./concurrency";

/** What FinanceContext needs to show the conflict dialog — nothing technical, just enough to identify the row. */
export interface WriteConflict {
  table: string;
  id: string;
}

/**
 * Pure classification: a sync failure is either a write conflict (show the
 * dialog, offer to refresh) or anything else (keep using the existing
 * generic toast). Kept separate from FinanceContext so it's testable without
 * rendering React.
 */
export function classifySyncError(error: unknown): WriteConflict | null {
  if (!(error instanceof WriteNotAppliedError)) return null;
  return { table: error.table, id: error.id };
}
