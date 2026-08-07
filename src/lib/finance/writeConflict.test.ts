import { describe, expect, it } from "vitest";

import { WriteNotAppliedError } from "./concurrency";
import { classifySyncError } from "./writeConflict";

describe("classifySyncError", () => {
  it("classifies WriteNotAppliedError as a conflict, carrying table and id", () => {
    const error = new WriteNotAppliedError("expenses", "e1");
    expect(classifySyncError(error)).toEqual({ table: "expenses", id: "e1" });
  });

  it("does not classify a generic Error as a conflict", () => {
    expect(classifySyncError(new Error("network down"))).toBeNull();
  });

  it("does not classify a non-Error thrown value as a conflict", () => {
    expect(classifySyncError("boom")).toBeNull();
    expect(classifySyncError(undefined)).toBeNull();
  });
});
