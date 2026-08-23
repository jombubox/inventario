import { describe, expect, it } from "vitest";

import { safeSpreadsheetText } from "@/features/exports/domain/spreadsheet-safety";

describe("spreadsheet text safety", () => {
  it.each(["=1+1", "+cmd", "-10+20", "@SUM(A1:A2)", "\t=1", "\r=1"])(
    "neutralizes formula-like value %j",
    (value) => expect(safeSpreadsheetText(value)).toBe(`'${value}`),
  );

  it("removes illegal XML controls without altering ordinary text", () => {
    expect(safeSpreadsheetText("Samsung\u0000 BN94")).toBe("Samsung BN94");
    expect(safeSpreadsheetText("Texto normal")).toBe("Texto normal");
  });
});
