import { describe, expect, it, vi } from "vitest";

import { createSyncQueue } from "./syncQueue";

describe("createSyncQueue", () => {
  it("keeps the confirmed base after a failed write, so the next write resends the full delta", async () => {
    let workspace: { version: number } | null = { version: 0 };
    let confirmed = "A";
    const writeCalls: { base: string; next: string }[] = [];

    const queue = createSyncQueue<string, { version: number }>({
      getWorkspace: () => workspace,
      setWorkspace: (w) => {
        workspace = w;
      },
      getConfirmed: () => confirmed,
      setConfirmed: (s) => {
        confirmed = s;
      },
      write: async (ws, base, next) => {
        writeCalls.push({ base, next });
        if (next === "B") throw new Error("network down");
        return { workspace: { version: ws.version + 1 }, state: next };
      },
      onError: () => undefined,
    });

    await queue.push("B"); // fails — confirmed must stay "A"
    expect(confirmed).toBe("A");

    await queue.push("C"); // should diff against "A", not the failed "B"
    expect(writeCalls).toEqual([
      { base: "A", next: "B" },
      { base: "A", next: "C" },
    ]);
    expect(confirmed).toBe("C");
  });

  it("advances the confirmed base only after each successful write", async () => {
    let workspace: { version: number } | null = { version: 0 };
    let confirmed = "A";
    const writeCalls: { base: string; next: string }[] = [];

    const queue = createSyncQueue<string, { version: number }>({
      getWorkspace: () => workspace,
      setWorkspace: (w) => {
        workspace = w;
      },
      getConfirmed: () => confirmed,
      setConfirmed: (s) => {
        confirmed = s;
      },
      write: async (ws, base, next) => {
        writeCalls.push({ base, next });
        return { workspace: { version: ws.version + 1 }, state: next };
      },
      onError: () => undefined,
    });

    await queue.push("B");
    await queue.push("C");

    expect(writeCalls).toEqual([
      { base: "A", next: "B" },
      { base: "B", next: "C" },
    ]);
    expect(confirmed).toBe("C");
  });

  it("confirms whatever state write() returns, not the raw next it was given — this is how server-assigned data (e.g. version numbers) reaches the next push's base", async () => {
    let workspace: { version: number } | null = { version: 0 };
    let confirmed = "A:v0";
    const bases: string[] = [];

    const queue = createSyncQueue<string, { version: number }>({
      getWorkspace: () => workspace,
      setWorkspace: (w) => {
        workspace = w;
      },
      getConfirmed: () => confirmed,
      setConfirmed: (s) => {
        confirmed = s;
      },
      write: async (ws, base, next) => {
        bases.push(base);
        // Simulate the server patching the locally-authored "next" with an
        // assigned version before it's confirmed — analogous to
        // applyConfirmedVersions() merging server versions into nextState.
        const serverPatched = `${next}:server-assigned`;
        return { workspace: { version: ws.version + 1 }, state: serverPatched };
      },
      onError: () => undefined,
    });

    await queue.push("B");
    expect(confirmed).toBe("B:server-assigned");

    await queue.push("C");
    // The second push's base must be the server-patched value from the first
    // write, proving the patched data actually reached the next write's base.
    expect(bases).toEqual(["A:v0", "B:server-assigned"]);
    expect(confirmed).toBe("C:server-assigned");
  });

  it("calls onError and keeps the queue alive after a failure", async () => {
    const onError = vi.fn();
    let workspace: { version: number } | null = { version: 0 };
    let confirmed = "A";

    const queue = createSyncQueue<string, { version: number }>({
      getWorkspace: () => workspace,
      setWorkspace: (w) => {
        workspace = w;
      },
      getConfirmed: () => confirmed,
      setConfirmed: (s) => {
        confirmed = s;
      },
      write: async (ws, _base, next) => {
        if (next === "B") throw new Error("boom");
        return { workspace: { version: ws.version + 1 }, state: next };
      },
      onError,
    });

    await queue.push("B");
    expect(onError).toHaveBeenCalledTimes(1);

    await queue.push("C");
    expect(confirmed).toBe("C");
  });

  it("does NOT limit how many pushes can be queued while one is still in flight — only execution is serialized, not queuing (see P0-02B conflict-refresh risk note in FinanceContext.tsx)", async () => {
    let resolveFirstWrite: (() => void) | undefined;
    const writeCalls: string[] = [];
    let workspace: { version: number } | null = { version: 0 };
    let confirmed = "A";

    const queue = createSyncQueue<string, { version: number }>({
      getWorkspace: () => workspace,
      setWorkspace: (w) => {
        workspace = w;
      },
      getConfirmed: () => confirmed,
      setConfirmed: (s) => {
        confirmed = s;
      },
      write: async (ws, _base, next) => {
        writeCalls.push(next);
        if (next === "B") {
          await new Promise<void>((resolve) => {
            resolveFirstWrite = resolve;
          });
        }
        return { workspace: { version: ws.version + 1 }, state: next };
      },
      onError: () => undefined,
    });

    const pushB = queue.push("B"); // starts executing right away and hangs mid-write
    await Promise.resolve(); // flush the microtask so write("B") actually runs and blocks
    expect(writeCalls).toEqual(["B"]);

    const pushC = queue.push("C"); // queued while "B" is still unresolved — push() never rejects/blocks this
    await Promise.resolve(); // give "C" a chance to (incorrectly) start too, if queuing were broken

    // "C" must not have started yet: execution IS serialized, just not queuing.
    expect(writeCalls).toEqual(["B"]);

    resolveFirstWrite?.();
    await pushB;
    await pushC;

    expect(writeCalls).toEqual(["B", "C"]);
    expect(confirmed).toBe("C");
  });

  it("does nothing when there is no workspace yet", async () => {
    let confirmed = "A";
    const write = vi.fn();

    const queue = createSyncQueue<string, { version: number }>({
      getWorkspace: () => null,
      setWorkspace: () => undefined,
      getConfirmed: () => confirmed,
      setConfirmed: (s) => {
        confirmed = s;
      },
      write,
      onError: () => undefined,
    });

    await queue.push("B");
    expect(write).not.toHaveBeenCalled();
    expect(confirmed).toBe("A");
  });
});
