import { describe, expect, it } from "vitest";

import {
  formatPublicPrice,
  getPublicAvailability,
  LOW_STOCK_THRESHOLD,
} from "@/features/catalog/domain/catalog";

describe("public catalog availability", () => {
  it("uses only the centralized low-stock boundary", () => {
    expect(LOW_STOCK_THRESHOLD).toBe(2);
    expect(getPublicAvailability(0)).toEqual({ key: "OUT_OF_STOCK", label: "Agotado" });
    expect(getPublicAvailability(1)).toEqual({ key: "LOW_STOCK", label: "Pocas piezas" });
    expect(getPublicAvailability(2)).toEqual({ key: "LOW_STOCK", label: "Pocas piezas" });
    expect(getPublicAvailability(3)).toEqual({ key: "IN_STOCK", label: "Disponible" });
  });

  it("formats real prices and does not invent one when absent", () => {
    expect(formatPublicPrice(null, "MXN")).toBe("Consultar precio");
    expect(formatPublicPrice("1250.50", "MXN")).toContain("1,250.50");
  });
});

