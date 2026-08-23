import { describe, expect, it } from "vitest";

import {
  formatInventoryCode,
  InvalidInventorySequenceError,
} from "@/features/inventory/domain/inventory-code";

describe("formatInventoryCode", () => {
  it("pads a PostgreSQL sequence value", () => {
    expect(formatInventoryCode(1)).toBe("INV-000001");
    expect(formatInventoryCode(42n)).toBe("INV-000042");
  });

  it("does not truncate values beyond six digits", () => {
    expect(formatInventoryCode(1_000_000)).toBe("INV-1000000");
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid in-memory formatter input: %s",
    (value) => expect(() => formatInventoryCode(value)).toThrow(InvalidInventorySequenceError),
  );
});
