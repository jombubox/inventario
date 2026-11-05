import { describe, expect, it } from "vitest";
import { assertReturnQuantity, balance, calculateTotals, moneyInput, parseMoney, saleFolio } from "./sales";
import { createSaleSchema, customerSchema, deliverySchema, paymentSchema, salesQuerySchema, salesValidationMessage } from "./validation";

describe("MXN arithmetic and sales validation", () => {
  it.each([["0.01", 1], ["1250.99", 125099], ["1.1", 110], ["0", 0], ["20000000.00", 2000000000]])("parses %s exactly", (input, cents) => { expect(parseMoney(input)).toBe(cents); expect(parseMoney(moneyInput(cents))).toBe(cents); });
  it.each(["-1", "NaN", "1e3", "0.001", "1,000", "20000000.01", "Infinity", " 1"]) ("rejects invalid money %s", input => expect(() => parseMoney(input)).toThrow());
  it("calculates line discounts, order discount, shipping and explicit taxes", () => expect(calculateTotals([{ quantity: 3, unitPriceCents: 1999, discountCents: 100 }], 200, 1000, 50)).toEqual({ subtotalCents: 5997, itemDiscountCents: 100, orderDiscountCents: 200, shippingCents: 1000, taxCents: 50, totalCents: 6747 }));
  it("rejects negative totals, invalid quantities and overflow", () => { for (const item of [{ quantity: 1, unitPriceCents: 10, discountCents: 11 }, { quantity: 0, unitPriceCents: 10, discountCents: 0 }, { quantity: 10000, unitPriceCents: 2000000000, discountCents: 0 }]) expect(() => calculateTotals([item], 0, 0, 0)).toThrow(); expect(() => calculateTotals([{ quantity: 1, unitPriceCents: 100, discountCents: 50 }], 51, 0, 0)).toThrow(); });
  it("separates credits from cash refunds without double counting", () => {
    expect(balance(10000, 0, 3000, 0)).toMatchObject({ paymentStatus: "PARTIAL", collectedCents: 3000, outstandingCents: 7000 });
    expect(balance(10000, 4000, 10000, 0)).toMatchObject({ refundDueCents: 4000, outstandingCents: 0 });
    expect(balance(10000, 4000, 10000, 4000)).toMatchObject({ collectedCents: 6000, outstandingCents: 0, refundDueCents: 0, paymentStatus: "PAID" });
    expect(balance(10000, 10000, 10000, 10000).paymentStatus).toBe("REFUNDED");
    expect(moneyInput(-1)).toBe("-0.01");
  });
  it("uses the entire UUID for a deterministic unique folio", () => { expect(saleFolio("f0000000-0000-4000-8000-000000000001")).toBe("JB-F0000000000040008000000000000001"); });
  it("bounds returns by sold less previous returns", () => { expect(() => assertReturnQuantity(3, 1, 2)).not.toThrow(); expect(() => assertReturnQuantity(3, 2, 2)).toThrow(); expect(() => assertReturnQuantity(3, 0, -1)).toThrow(); });
  it("accepts one-time walk-in customers and Mexican mobile numbers", () => { expect(customerSchema.parse({}).name).toBe(""); expect(customerSchema.parse({ phone: "+52 (55) 1234-5678" }).email).toBe(""); expect(customerSchema.safeParse({ phone: "123" }).success).toBe(false); });
  it("requires a complete shipping address but no tracking number", () => { expect(deliverySchema.safeParse({ method: "SHIPPING" }).success).toBe(false); expect(deliverySchema.safeParse({ method: "PICKUP" }).success).toBe(true); expect(deliverySchema.safeParse({ method: "PICKUP", estimatedDate: "2026-02-30" }).success).toBe(false); });
  it("rejects negative, fractional payments and invalid filter dates", () => { expect(paymentSchema.safeParse({ key: crypto.randomUUID(), kind: "PAYMENT", method: "CASH", amountCents: -1, occurredAt: new Date().toISOString() }).success).toBe(false); expect(salesQuerySchema.safeParse({ from: "2026-12-31", to: "2026-01-01" }).success).toBe(false); expect(createSaleSchema.safeParse({}).success).toBe(false); });
  it("shows Spanish field names and messages for malformed sale input", () => { const parsed = paymentSchema.safeParse({ amountCents: -1 }); if (parsed.success) throw new Error("Expected invalid input"); expect(salesValidationMessage(parsed.error)).toContain("Importe: Revisa este dato"); expect(salesValidationMessage(parsed.error)).not.toMatch(/amountCents|Invalid|Too small/u); });
});
