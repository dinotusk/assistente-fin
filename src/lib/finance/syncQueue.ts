/**
 * Serializes async writes to a remote store and only advances the "last
 * confirmed" state once a write actually succeeds. Without this, a failed
 * write's delta gets silently dropped: the next write would diff against a
 * base that was optimistically advanced past the failure, so whatever
 * changed in the failed write never gets resent.
 */
export interface SyncQueue<TState, TWorkspace> {
  /** Queue a write. Resolves once this write's turn has been attempted (success or failure). */
  push(next: TState): Promise<void>;
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
  onError: (error: unknown) => void;
}): SyncQueue<TState, TWorkspace> {
  let queue: Promise<void> = Promise.resolve();

  return {
    push(next: TState): Promise<void> {
      queue = queue.then(async () => {
        const workspace = options.getWorkspace();
        if (!workspace) return;
        const base = options.getConfirmed();
        try {
          const result = await options.write(workspace, base, next);
          options.setWorkspace(result.workspace);
          options.setConfirmed(result.state);
        } catch (error) {
          options.onError(error);
        }
      });
      return queue;
    },
  };
}
