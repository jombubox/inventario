export function formatDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export function formatMoney(value: string | null, currency = "MXN"): string {
  if (value === null) return "Sin precio";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(Number(value));
}

const productStatuses: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  ARCHIVED: "Archivado",
};

const inventoryStatuses: Record<string, string> = {
  AVAILABLE: "Disponible",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  DAMAGED: "Dañado",
  SCRAPPED: "Desechado",
};

const inventoryConditions: Record<string, string> = {
  NEW: "Nuevo",
  USED_EXCELLENT: "Usado excelente",
  USED_GOOD: "Usado bueno",
  USED_FAIR: "Usado regular",
  FOR_PARTS: "Para piezas",
  UNKNOWN: "Sin especificar",
};

const movementTypes: Record<string, string> = {
  INITIAL: "Registro inicial",
  IN: "Entrada",
  OUT: "Salida",
  MOVE: "Cambio de ubicación",
  ADJUSTMENT: "Ajuste",
  SALE: "Venta",
  RETURN: "Devolución",
};

const importStatuses: Record<string, string> = {
  PENDING: "Pendiente",
  PREVIEWED: "Revisado",
  PROCESSING: "Procesando",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

const auditActions: Record<string, string> = {
  PRODUCT_CREATED: "Producto creado",
  PRODUCT_UPDATED: "Producto actualizado",
  PRODUCT_ARCHIVED: "Producto archivado",
  INVENTORY_CREATED: "Inventario creado",
  INVENTORY_UPDATED: "Inventario actualizado",
  INVENTORY_ADJUSTED: "Cantidad ajustada",
  INVENTORY_MOVED: "Inventario reubicado",
  LOCATION_CREATED: "Ubicación creada",
  LOCATION_UPDATED: "Ubicación actualizada",
  LOCATION_ARCHIVED: "Ubicación desactivada",
  LOCATION_DELETED: "Ubicación eliminada",
  IMPORT_PREVIEWED: "Importación revisada",
  IMPORT_STARTED: "Importación iniciada",
  IMPORT_COMPLETED: "Importación completada",
  IMPORT_FAILED: "Importación fallida",
  PRODUCT_IMAGE_ADDED: "Foto agregada",
  PRODUCT_IMAGE_REMOVED: "Foto eliminada",
  PRODUCT_IMAGE_REORDERED: "Fotos reordenadas",
  PRODUCT_PRIMARY_IMAGE_CHANGED: "Foto principal cambiada",
  PRODUCT_IMAGE_ALT_UPDATED: "Descripción de foto actualizada",
  INVENTORY_IN: "Entrada de inventario",
  INVENTORY_OUT: "Salida de inventario",
  INVENTORY_SALE: "Venta registrada",
  INVENTORY_RETURN: "Devolución registrada",
  INVENTORY_EXPORTED: "Inventario exportado",
  BRAND_CREATED: "Marca creada",
  BRAND_UPDATED: "Marca actualizada",
  BRAND_ARCHIVED: "Marca desactivada",
  COMPONENT_TYPE_CREATED: "Tipo de pieza creado",
  COMPONENT_TYPE_UPDATED: "Tipo de pieza actualizado",
  COMPONENT_TYPE_ARCHIVED: "Tipo de pieza desactivado",
};

const auditEntityTypes: Record<string, string> = {
  PRODUCT: "Producto",
  PRODUCT_IMAGE: "Foto de producto",
  INVENTORY_ITEM: "Registro de inventario",
  LOCATION: "Ubicación",
  IMPORT_JOB: "Importación",
  BRAND: "Marca",
  COMPONENT_TYPE: "Tipo de pieza",
};

function labelFor(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

export const formatProductStatus = (value: string) => labelFor(productStatuses, value);
export const formatInventoryStatus = (value: string) => labelFor(inventoryStatuses, value);
export const formatInventoryCondition = (value: string) => labelFor(inventoryConditions, value);
export const formatMovementType = (value: string) => labelFor(movementTypes, value);
export const formatImportStatus = (value: string) => labelFor(importStatuses, value);
export const formatAuditAction = (value: string) => labelFor(auditActions, value);
export const formatAuditEntityType = (value: string) => labelFor(auditEntityTypes, value);
