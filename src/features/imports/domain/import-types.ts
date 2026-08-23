import type {
  inventoryConditionValues,
  inventoryStatusValues,
} from "@/db/schema/enums";

export const importFieldValues = [
  "legacyBagNumber",
  "existingSku",
  "brand",
  "compatibleModel",
  "componentType",
  "partNumber",
  "condition",
  "quantity",
  "inventoryStatus",
  "salePrice",
  "currency",
  "acquiredAt",
  "acquisitionSource",
  "purchaseCost",
  "boxCode",
  "locationCode",
  "isPublic",
  "titleOverride",
  "description",
  "internalNotes",
  "legacyTitle",
  "legacyLocationCode",
  "legacyExtra",
] as const;

export type ImportField = (typeof importFieldValues)[number];
export type ImportMapping = Partial<Record<ImportField, string>>;
export type ImportCondition = (typeof inventoryConditionValues)[number];
export type ImportInventoryStatus = (typeof inventoryStatusValues)[number];

export type ImportDefaults = {
  condition: ImportCondition;
  inventoryStatus: ImportInventoryStatus;
  currency: string;
  isPublic: boolean;
};

export type ImportCorrection = {
  brand?: string;
  componentType?: string;
  partNumber?: string | null;
  compatibleModel?: string | null;
  purchaseCost?: string | null;
  existingSku?: string | null;
  forceNew?: boolean;
};

export type ImportRowMessage = {
  level: "WARNING" | "ERROR";
  code: string;
  message: string;
};

export type ImportRowStatus = "VALID" | "WARNING" | "ERROR";
export type ImportMatchKind = "NEW" | "EXACT_MATCH" | "POSSIBLE_MATCH" | "CONFLICT";
export type ImportAction =
  | "CREATE_PRODUCT_AND_INVENTORY"
  | "ADD_INVENTORY"
  | "REVIEW"
  | "SKIP";

export type RawImportRow = {
  rowNumber: number;
  values: Partial<Record<ImportField, unknown>>;
};

export type AnalyzedImportRow = {
  rowNumber: number;
  fingerprint: string;
  status: ImportRowStatus;
  matchKind: ImportMatchKind;
  action: ImportAction;
  importable: boolean;
  duplicateInFile: boolean;
  previouslyImported: boolean;
  messages: ImportRowMessage[];
  raw: Record<string, string | number | boolean | null>;
  normalized: {
    legacyBagNumber: string | null;
    legacyLocationCode: string | null;
    existingSku: string | null;
    brandRaw: string | null;
    brandId: string | null;
    brandName: string | null;
    brandCode: string | null;
    brandResolvedByAlias: boolean;
    compatibleModel: string | null;
    normalizedModel: string | null;
    componentTypeRaw: string | null;
    componentTypeId: string | null;
    componentTypeName: string | null;
    componentTypeCode: string | null;
    componentTypeResolvedByAlias: boolean;
    partNumber: string | null;
    normalizedPartNumber: string | null;
    condition: ImportCondition;
    quantity: number;
    inventoryStatus: ImportInventoryStatus;
    salePrice: string | null;
    currency: string;
    acquiredAt: string | null;
    acquisitionSource: string | null;
    purchaseCost: string | null;
    locationId: string | null;
    locationCode: string | null;
    locationBreadcrumb: string | null;
    isPublic: boolean;
    title: string | null;
    description: string | null;
    internalNotes: string | null;
    legacyTitle: string | null;
    proposedSku: string | null;
    matchedProductId: string | null;
    matchedSku: string | null;
  };
};

export type ImportPreview = {
  jobId: string;
  filename: string;
  fileHash: string;
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: ImportMapping;
  duplicateFile: boolean;
  rows: AnalyzedImportRow[];
  summary: {
    totalRows: number;
    validRows: number;
    warningRows: number;
    errorRows: number;
    newProducts: number;
    existingProducts: number;
    inventoryItems: number;
    omittedRows: number;
  };
};

export const templateInventoryHeaders = [
  "LegacyBagNumber",
  "ExistingSKU",
  "Brand",
  "CompatibleModel",
  "ComponentType",
  "PartNumber",
  "Condition",
  "Quantity",
  "InventoryStatus",
  "SalePrice",
  "Currency",
  "AcquiredAt",
  "AcquisitionSource",
  "PurchaseCost",
  "BoxCode",
  "LocationCode",
  "IsPublic",
  "TitleOverride",
  "Description",
  "InternalNotes",
] as const;

export const defaultImportDefaults: ImportDefaults = {
  condition: "UNKNOWN",
  inventoryStatus: "AVAILABLE",
  currency: "MXN",
  isPublic: false,
};
