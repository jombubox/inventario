import { describe, expect, it } from "vitest";

import {
  cleanSerialNumber,
  findDuplicateSerialNumber,
  normalizeSerialNumber,
} from "@/features/products/domain/serial-number";

describe("product serial number normalization", () => {
  it("trims and applies Unicode compatibility normalization", () => {
    expect(cleanSerialNumber("  ＡＢＣ-１２３  ")).toBe("ABC-123");
  });

  it("compares case-insensitively without removing separators", () => {
    expect(normalizeSerialNumber("abc-123")).toBe("ABC-123");
    expect(normalizeSerialNumber("ABC123")).not.toBe(normalizeSerialNumber("ABC-123"));
    expect(normalizeSerialNumber("ABC 123")).not.toBe(normalizeSerialNumber("ABC-123"));
  });

  it("detects duplicates across primary and secondary serials", () => {
    expect(findDuplicateSerialNumber("ABC-123", ["abc-123"])).toBe("abc-123");
    expect(findDuplicateSerialNumber(null, ["XYZ-9", " xyz-9 "])).toBe("xyz-9");
    expect(findDuplicateSerialNumber("ABC-123", ["ABC123", "ABC 123"])).toBeNull();
  });
});
