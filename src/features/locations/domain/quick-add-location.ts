import type { locationTypeValues } from "@/db/schema/enums";

export const UNPARENTED_BOXES_LOCATION_ID = "unparented-boxes";

type LocationType = (typeof locationTypeValues)[number];

export type QuickAddLocationNode = {
  id: string;
  type: LocationType;
  parentId: string | null;
  active: boolean;
};

export function isQuickAddContainer(location: QuickAddLocationNode): boolean {
  return location.active && location.type !== "BOX" && location.type !== "BAG";
}

export function isQuickAddBox(location: QuickAddLocationNode): boolean {
  return location.active && location.type === "BOX" && location.parentId !== null;
}

export function isUnparentedQuickAddBox(location: QuickAddLocationNode): boolean {
  return location.active && location.type === "BOX" && location.parentId === null;
}
