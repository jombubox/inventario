import { normalizeWhitespace } from "@/features/shared/domain/text-normalization";

const MAX_LOCATION_DEPTH = 64;

export type LocationNode = {
  id: string;
  name: string;
  parentId: string | null;
};

export class InvalidLocationHierarchyError extends Error {
  override readonly name = "InvalidLocationHierarchyError";
}

function indexLocations(locations: readonly LocationNode[]): Map<string, LocationNode> {
  const byId = new Map<string, LocationNode>();

  for (const location of locations) {
    if (byId.has(location.id)) {
      throw new InvalidLocationHierarchyError(`Duplicate location id: ${location.id}`);
    }

    byId.set(location.id, location);
  }

  return byId;
}

export function buildLocationBreadcrumb(
  targetId: string,
  locations: readonly LocationNode[],
): string {
  const byId = indexLocations(locations);
  const path: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(targetId);
  let depth = 0;

  if (!current) {
    throw new InvalidLocationHierarchyError(`Location not found: ${targetId}`);
  }

  while (current) {
    if (visited.has(current.id)) {
      throw new InvalidLocationHierarchyError(`Cycle detected at location: ${current.id}`);
    }

    if (depth >= MAX_LOCATION_DEPTH) {
      throw new InvalidLocationHierarchyError(
        `Location hierarchy exceeds ${MAX_LOCATION_DEPTH} levels.`,
      );
    }

    const name = normalizeWhitespace(current.name);
    if (!name) {
      throw new InvalidLocationHierarchyError(`Location ${current.id} has an empty name.`);
    }

    visited.add(current.id);
    path.unshift(name);
    depth += 1;

    if (!current.parentId) {
      break;
    }

    const parent = byId.get(current.parentId);
    if (!parent) {
      throw new InvalidLocationHierarchyError(
        `Parent location not found: ${current.parentId}`,
      );
    }
    current = parent;
  }

  return path.join(" > ");
}

export function assertValidLocationParent({
  locationId,
  nextParentId,
  locations,
}: {
  locationId: string;
  nextParentId: string | null;
  locations: readonly LocationNode[];
}): void {
  if (!nextParentId) {
    return;
  }

  const byId = indexLocations(locations);
  const visited = new Set<string>();
  let currentId: string | null = nextParentId;
  let depth = 0;

  while (currentId) {
    if (currentId === locationId || visited.has(currentId)) {
      throw new InvalidLocationHierarchyError("The selected parent would create a cycle.");
    }

    if (depth >= MAX_LOCATION_DEPTH) {
      throw new InvalidLocationHierarchyError(
        `Location hierarchy exceeds ${MAX_LOCATION_DEPTH} levels.`,
      );
    }

    const current = byId.get(currentId);
    if (!current) {
      throw new InvalidLocationHierarchyError(`Parent location not found: ${currentId}`);
    }

    visited.add(currentId);
    currentId = current.parentId;
    depth += 1;
  }
}
