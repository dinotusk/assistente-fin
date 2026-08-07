/**
 * Serializes async writes to a remote store and only advances the "last
 * confirmed" state once a write actually succeeds. Without this, a failed
 * write's delta gets silently dropped: the next write would diff against a
 * base that was optimistically advanced past the failure, so whatever
 * changed in the failed write never gets resent.
 */
export interface SyncQueue<TState, TWorkspace> {
  /** Queue a write. Resolves once it lands, rejects with the real error if it doesn't — see `push` below. */
  push(next: TState, opts?: PushOptions): Promise<void>;
}

export interface PushOptions {
  /**
   * When true, a failed write still notifies via `onError` for anything
   * that needs ambient handling regardless of source (e.g. the write-conflict
   * dialog), but skips the generic "could not save" toast — the caller is
   * about to surface its own, more specific error instead (see importData).
   */
  silent?: boolean;
}

export function createSyncQueue<TState, TWorkspace>(options: {
  getWorkspace: () => TWorkspace | null;
  setWorkspace: (workspace: TWorkspace) => void;
  getConfirmed: () => TState;
  setConfirmed: (state: TState) => void;
  /**
   * Resolves with both the updated workspace AND the state to treat as
   * confirmed. `state` is not required to be the exact `next` that was
   * passed in — a write can hand back `next` patched with server-assigned
   * data (e.g. optimistic-concurrency version numbers) so the *next* push
   * diffs against what the server actually has, not just what this device
   * locally asked for.
   */
  write: (
    workspace: TWorkspace,
    base: TState,
    next: TState,
  ) => Promise<{ workspace: TWorkspace; state: TState }>;
  onError: (error: unknown, opts?: PushOptions) => void;
}): SyncQueue<TState, TWorkspace> {
  let queue: Promise<void> = Promise.resolve();

  return {
    /**
     * The returned promise reflects THIS push's real outcome (rejects if the
     * write ultimately failed) — unlike the internal `queue` chain, which
     * must never reject, or every push queued after a failure would be
     * silently skipped instead of attempted. Most callers (every ordinary
     * mutation) fire-and-forget this and rely on `onError`'s ambient
     * handling; a caller that needs to know whether its own write actually
     * landed (e.g. import, before it reports success) can await it.
     */
    push(next: TState, opts?: PushOptions): Promise<void> {
      const attempt = queue.then(async () => {
        const workspace = options.getWorkspace();
        if (!workspace) return;
        const base = options.getConfirmed();
        const result = await options.write(workspace, base, next);
        options.setWorkspace(result.workspace);
        options.setConfirmed(result.state);
      });
      queue = attempt.catch((error) => {
        options.onError(error, opts);
      });
      return attempt;
    },
  };
}
