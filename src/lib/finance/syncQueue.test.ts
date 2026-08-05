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
        return { version: ws.version + 1 };
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
        return { version: ws.version + 1 };
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
        return { version: ws.version + 1 };
      },
      onError,
    });

    await queue.push("B");
    expect(onError).toHaveBeenCalledTimes(1);

    await queue.push("C");
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
