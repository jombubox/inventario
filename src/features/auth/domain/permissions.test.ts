import { describe, expect, it } from "vitest";

import {
  assertPermission,
  hasPermission,
  permissionValues,
} from "@/features/auth/domain/permissions";
import { ForbiddenError } from "@/features/auth/domain/auth-errors";

describe("role permission matrix", () => {
  it("allows VIEWER to read without mutating", () => {
    expect(hasPermission("VIEWER", "PRODUCT_READ")).toBe(true);
    expect(hasPermission("VIEWER", "INVENTORY_READ")).toBe(true);
    expect(hasPermission("VIEWER", "MOVEMENT_READ")).toBe(true);
    expect(hasPermission("VIEWER", "IMPORT_READ")).toBe(true);
    expect(hasPermission("VIEWER", "PRODUCT_CREATE")).toBe(false);
    expect(hasPermission("VIEWER", "INVENTORY_MOVE")).toBe(false);
    expect(hasPermission("VIEWER", "IMPORT_EXECUTE")).toBe(false);
    expect(hasPermission("VIEWER", "IMAGE_MANAGE")).toBe(false);
    expect(hasPermission("VIEWER", "INVENTORY_EXPORT")).toBe(false);
    expect(() => assertPermission("VIEWER", "PRODUCT_CREATE")).toThrow(ForbiddenError);
  });

  it("allows EDITOR to operate inventory but not users", () => {
    expect(hasPermission("EDITOR", "PRODUCT_CREATE")).toBe(true);
    expect(hasPermission("EDITOR", "INVENTORY_MOVE")).toBe(true);
    expect(hasPermission("EDITOR", "INVENTORY_IN")).toBe(true);
    expect(hasPermission("EDITOR", "INVENTORY_OUT")).toBe(true);
    expect(hasPermission("EDITOR", "IMPORT_EXECUTE")).toBe(true);
    expect(hasPermission("EDITOR", "IMAGE_MANAGE")).toBe(true);
    expect(hasPermission("EDITOR", "INVENTORY_EXPORT")).toBe(true);
    expect(hasPermission("EDITOR", "AUDIT_READ")).toBe(false);
    expect(hasPermission("EDITOR", "USER_MANAGE")).toBe(false);
  });

  it("gives ADMIN every declared permission", () => {
    for (const permission of permissionValues) {
      expect(hasPermission("ADMIN", permission)).toBe(true);
    }
  });
});
