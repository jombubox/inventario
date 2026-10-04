import { createLocationBreadcrumbResolver } from "@/features/locations/domain/location-hierarchy";
import type { locationTypeValues } from "@/db/schema/enums";

type PlacementNode = { id: string; name: string; parentId: string | null; type: (typeof locationTypeValues)[number] };

function label(prefix: string, value: string) {
  return new RegExp(`^${prefix}\\b`, "iu").test(value) ? value : `${prefix} ${value}`;
}

export function createInventoryPlacementResolver(nodes: readonly PlacementNode[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const breadcrumb = createLocationBreadcrumbResolver(nodes);
  return (locationId: string | null, bagLabel: string | null) => {
    // Validate the same hierarchy used by breadcrumbs before walking its ancestors.
    const fullPath = locationId ? breadcrumb(locationId) : null;
    let node = locationId ? byId.get(locationId) : undefined;
    let box: PlacementNode | undefined;
    let bag: PlacementNode | undefined;
    while (node) {
      if (!bag && node.type === "BAG") bag = node;
      if (node.type === "BOX") { box = node; break; }
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
    const actualBag = bagLabel?.trim() || bag?.name;
    return {
      boxLabel: box ? label("Caja", box.name) : "Sin caja",
      bagLabel: actualBag ? label("Bolsa", actualBag) : "Sin bolsa",
      parentLocation: box ? box.parentId ? breadcrumb(box.parentId) : "Sin ubicación padre" : fullPath ?? "Sin ubicación",
    };
  };
}
