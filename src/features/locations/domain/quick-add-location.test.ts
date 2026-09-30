import { describe, expect, it } from "vitest";

import {
  isQuickAddBox,
  isQuickAddContainer,
  isUnparentedQuickAddBox,
} from "@/features/locations/domain/quick-add-location";

const base = {
  id: "location-1",
  parentId: null,
  active: true,
} as const;

describe("quick add location roles", () => {
  it("keeps active physical containers separate from boxes and bags", () => {
    expect(isQuickAddContainer({ ...base, type: "WAREHOUSE" })).toBe(true);
    expect(isQuickAddContainer({ ...base, type: "ZONE" })).toBe(true);
    expect(isQuickAddContainer({ ...base, type: "BOX" })).toBe(false);
    expect(isQuickAddContainer({ ...base, type: "BAG" })).toBe(false);
    expect(isQuickAddContainer({ ...base, type: "WAREHOUSE", active: false })).toBe(false);
  });

  it("distinguishes regular child boxes from legacy root boxes", () => {
    expect(
      isQuickAddBox({ ...base, type: "BOX", parentId: "location-parent" }),
    ).toBe(true);
    expect(isQuickAddBox({ ...base, type: "BOX" })).toBe(false);
    expect(isUnparentedQuickAddBox({ ...base, type: "BOX" })).toBe(true);
    expect(
      isUnparentedQuickAddBox({ ...base, type: "BOX", parentId: "location-parent" }),
    ).toBe(false);
  });
});
