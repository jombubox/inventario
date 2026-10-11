import { describe, expect, it } from "vitest";
import { warrantyMutationSchema } from "./warranty";
import { readWarrantySubmission, warrantyDraft, warrantySubmission, WARRANTY_MONTH_DIGITS } from "@/features/products/domain/warranty";

describe("months warranty and legacy persistence", () => {
  it.each(["3", "6", "12", "24"])("stores %s months and reloads the editor", (months) => {
    const value = warrantyMutationSchema.parse({ months, noWarranty: false });
    expect(value).toBe(`${months} meses`);
    expect(warrantyDraft(value)).toEqual({ months, noWarranty: false, legacy: null });
  });
  it.each(["0", "-3", "1.5", "6 meses", "abc", "1e2", " 3 ", "+3"])("rejects %s", (months) => {
    expect(warrantyMutationSchema.safeParse({ months, noWarranty: false }).success).toBe(false);
  });
  it("keeps unspecified and explicit no warranty distinct, excluding the draft duration", () => {
    const draft = { months: "6", noWarranty: true, legacy: null };
    expect(warrantySubmission(draft)).toEqual({ months: "", noWarranty: true });
    expect(warrantyMutationSchema.parse(warrantySubmission(draft))).toBe("Sin garantía");
    expect(warrantyMutationSchema.parse(warrantySubmission({ ...draft, noWarranty: false }))).toBe("6 meses");
    expect(warrantyMutationSchema.parse({ months: "", noWarranty: false })).toBeNull();
    expect(warrantyMutationSchema.parse({ months: "invalid ignored draft", noWarranty: true })).toBe("Sin garantía");
  });
  it("uses the existing column's bound without integer precision loss", () => {
    expect(warrantyMutationSchema.parse({ months: "9".repeat(WARRANTY_MONTH_DIGITS), noWarranty: false })).toHaveLength(240);
    expect(warrantyMutationSchema.safeParse({ months: "9".repeat(WARRANTY_MONTH_DIGITS + 1), noWarranty: false }).success).toBe(false);
    expect(warrantyMutationSchema.parse({ months: "006", noWarranty: false })).toBe("6 meses");
  });
  it.each(["30 días", "1 año", "Garantía del proveedor", "sin garantía"])("does not interpret legacy %s as months", (legacy) => {
    expect(warrantyDraft(legacy)).toEqual({ months: "", noWarranty: false, legacy });
    expect(warrantySubmission(warrantyDraft(legacy))).toBe(legacy);
  });
  it("validates structured submissions on the server and preserves old callers", () => {
    const form = new FormData(); form.set("warrantyInput", JSON.stringify({ months: "12", noWarranty: false }));
    expect(warrantyMutationSchema.parse(readWarrantySubmission(form))).toBe("12 meses");
    form.set("warrantyInput", "invalid JSON");
    expect(warrantyMutationSchema.safeParse(readWarrantySubmission(form)).success).toBe(false);
    form.delete("warrantyInput");
    expect(readWarrantySubmission(form)).toBeUndefined();
    form.set("warranty", "30 días");
    expect(warrantyMutationSchema.parse(readWarrantySubmission(form))).toBe("30 días");
  });
});
