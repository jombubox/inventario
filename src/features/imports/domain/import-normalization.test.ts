import { describe, expect, it } from "vitest";

import {
  parseImportBoolean,
  parseImportDate,
  parseImportInteger,
  parseImportMoney,
} from "@/features/imports/domain/import-normalization";

describe("import normalization", () => {
  it("normalizes Mexican legacy and ISO dates without accepting rollover dates", () => {
    expect(parseImportDate("31/01/2025")).toEqual({ value: "2025-01-31" });
    expect(parseImportDate("2025-01-31")).toEqual({ value: "2025-01-31" });
    expect(parseImportDate("2025-02-31")).toMatchObject({ value: null });
    expect(parseImportDate("13/31/2025")).toMatchObject({ value: null });
  });

  it("normalizes numeric money and retains ambiguous text for review", () => {
    expect(parseImportMoney("MXN $1,234.5")).toEqual({ value: "1234.50" });
    expect(parseImportMoney(99.999)).toEqual({ value: "100.00" });
    expect(parseImportMoney("aprox. 200")).toEqual({ value: null, ambiguous: "aprox. 200" });
    expect(parseImportMoney(-1)).toMatchObject({ value: null, error: expect.any(String) });
  });

  it("accepts explicit booleans and rejects unsafe quantity coercion", () => {
    expect(parseImportBoolean("Sí", false)).toEqual({ value: true });
    expect(parseImportBoolean("0", true)).toEqual({ value: false });
    expect(parseImportBoolean("quizá", false)).toMatchObject({ value: false, error: expect.any(String) });
    expect(parseImportInteger("2.5", 1)).toMatchObject({ value: 1, error: expect.any(String) });
  });
});
