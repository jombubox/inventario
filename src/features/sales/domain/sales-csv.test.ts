import { expect, it } from "vitest";
import { encodeSalesCsv } from "./sales-csv";
it("neutralizes formulas, including whitespace prefixes, and escapes customer CSV text", () => {
  expect(encodeSalesCsv([["=HYPERLINK(\"evil\")", " \n +CMD", "@SUM(1)", "-42", "Ana, \"Cliente\"", 123]])).toBe('\uFEFF"\'=HYPERLINK(""evil"")","\'+CMD","\'@SUM(1)","\'-42","Ana, ""Cliente""","123"');
});
