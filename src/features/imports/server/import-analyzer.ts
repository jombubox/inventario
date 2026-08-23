import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  brandAliases,
  brands,
  componentTypeAliases,
  componentTypes,
  importJobRows,
  locations,
  productCompatibilities,
  products,
} from "@/db/schema";
import {
  type AnalyzedImportRow,
  type ImportCorrection,
  type ImportDefaults,
  type ImportRowMessage,
  type RawImportRow,
} from "@/features/imports/domain/import-types";
import {
  appendInternalNote,
  importString,
  parseImportBoolean,
  parseImportCondition,
  parseImportDate,
  parseImportInteger,
  parseImportMoney,
  parseImportStatus,
} from "@/features/imports/domain/import-normalization";
import { sha256Hex } from "@/features/imports/domain/xlsx-security";
import { isInventoryQuantityStatusValid } from "@/features/inventory/domain/inventory-state";
import { buildLocationBreadcrumb } from "@/features/locations/domain/location-hierarchy";
import { buildProductTitle } from "@/features/products/domain/build-product-title";
import { generateSku } from "@/features/products/domain/generate-sku";
import {
  normalizeBrand,
  normalizeComponentType,
  normalizeModel,
  normalizePartNumber,
} from "@/features/products/domain/product-normalization";
import {
  normalizeComparableText,
  normalizeWhitespace,
} from "@/features/shared/domain/text-normalization";

type CatalogEntity = { id: string; name: string; code: string; normalizedName: string };
type ProductCandidate = {
  id: string;
  sku: string;
  brandId: string;
  componentTypeId: string;
  partNumber: string | null;
  normalizedPartNumber: string | null;
  title: string;
};

type ProvisionalRow = {
  source: RawImportRow;
  correction: ImportCorrection;
  messages: ImportRowMessage[];
  legacyBagNumber: string | null;
  legacyLocationCode: string | null;
  existingSku: string | null;
  brandRaw: string | null;
  brand: CatalogEntity | null;
  brandResolvedByAlias: boolean;
  compatibleModel: string | null;
  normalizedModel: string | null;
  componentTypeRaw: string | null;
  componentType: CatalogEntity | null;
  componentTypeResolvedByAlias: boolean;
  partNumber: string | null;
  normalizedPartNumber: string | null;
  condition: AnalyzedImportRow["normalized"]["condition"];
  quantity: number;
  inventoryStatus: AnalyzedImportRow["normalized"]["inventoryStatus"];
  salePrice: string | null;
  currency: string;
  acquiredAt: string | null;
  acquisitionSource: string | null;
  purchaseCost: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationBreadcrumb: string | null;
  isPublic: boolean;
  titleOverride: string | null;
  description: string | null;
  internalNotes: string | null;
  legacyTitle: string | null;
};

function chunks<T>(items: readonly T[], size = 400): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function addMessage(
  row: ProvisionalRow,
  level: ImportRowMessage["level"],
  code: string,
  message: string,
) {
  row.messages.push({ level, code, message });
}

function jsonPrimitive(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (["string", "number", "boolean"].includes(typeof value)) {
    return value as string | number | boolean;
  }
  return String(value);
}

function rowRawSnapshot(row: RawImportRow): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(row.values).map(([key, value]) => [key, jsonPrimitive(value)]),
  );
}

function resolveCatalog(
  raw: string | null,
  normalizer: (value: string) => string,
  direct: Map<string, CatalogEntity>,
  aliases: Map<string, CatalogEntity>,
): { entity: CatalogEntity | null; byAlias: boolean } {
  if (!raw) return { entity: null, byAlias: false };
  const key = normalizer(raw);
  const directEntity = direct.get(key);
  if (directEntity) return { entity: directEntity, byAlias: false };
  return { entity: aliases.get(key) ?? null, byAlias: aliases.has(key) };
}

function productPartKey(row: {
  brandId: string;
  componentTypeId: string;
  normalizedPartNumber: string;
}) {
  return `${row.brandId}:${row.componentTypeId}:${row.normalizedPartNumber}`;
}

function productModelKey(row: {
  brandId: string;
  componentTypeId: string;
  normalizedModel: string;
}) {
  return `${row.brandId}:${row.componentTypeId}:${row.normalizedModel}`;
}

function pushCandidate(
  map: Map<string, Map<string, ProductCandidate>>,
  key: string,
  candidate: ProductCandidate,
) {
  const current = map.get(key) ?? new Map<string, ProductCandidate>();
  current.set(candidate.id, candidate);
  map.set(key, current);
}

export async function analyzeImportRows(
  db: Database,
  rows: RawImportRow[],
  defaults: ImportDefaults,
  corrections: Record<number, ImportCorrection> = {},
): Promise<AnalyzedImportRow[]> {
  const [brandRows, brandAliasRows, typeRows, typeAliasRows, locationRows] =
    await Promise.all([
      db.select().from(brands).where(eq(brands.active, true)),
      db
        .select({ alias: brandAliases.normalizedAlias, brand: brands })
        .from(brandAliases)
        .innerJoin(brands, eq(brandAliases.brandId, brands.id))
        .where(and(eq(brandAliases.active, true), eq(brands.active, true))),
      db.select().from(componentTypes).where(eq(componentTypes.active, true)),
      db
        .select({ alias: componentTypeAliases.normalizedAlias, componentType: componentTypes })
        .from(componentTypeAliases)
        .innerJoin(
          componentTypes,
          eq(componentTypeAliases.componentTypeId, componentTypes.id),
        )
        .where(and(eq(componentTypeAliases.active, true), eq(componentTypes.active, true))),
      db.select().from(locations),
    ]);

  const brandDirect = new Map(
    brandRows.map((brand) => [brand.normalizedName, brand as CatalogEntity]),
  );
  const brandAliasMap = new Map(
    brandAliasRows.map((entry) => [entry.alias, entry.brand as CatalogEntity]),
  );
  const typeDirect = new Map(
    typeRows.map((type) => [type.normalizedName, type as CatalogEntity]),
  );
  const typeAliasMap = new Map(
    typeAliasRows.map((entry) => [entry.alias, entry.componentType as CatalogEntity]),
  );
  const locationByCode = new Map(
    locationRows.map((location) => [normalizeComparableText(location.code), location]),
  );
  const locationNodes = locationRows.map(({ id, name, parentId }) => ({ id, name, parentId }));

  const provisionalRows: ProvisionalRow[] = rows.map((source) => {
    const correction = corrections[source.rowNumber] ?? {};
    const values = source.values;
    const existingSku = importString(correction.existingSku ?? values.existingSku)?.toUpperCase() ?? null;
    const brandRaw = importString(correction.brand ?? values.brand);
    const componentTypeRaw = importString(correction.componentType ?? values.componentType);
    const compatibleModel = importString(correction.compatibleModel ?? values.compatibleModel);
    const partNumberRaw = importString(correction.partNumber ?? values.partNumber);
    const partNumber = partNumberRaw ? normalizeWhitespace(partNumberRaw).toUpperCase() : null;
    const brandResolution = resolveCatalog(
      brandRaw,
      normalizeBrand,
      brandDirect,
      brandAliasMap,
    );
    const typeResolution = resolveCatalog(
      componentTypeRaw,
      normalizeComponentType,
      typeDirect,
      typeAliasMap,
    );
    const quantity = parseImportInteger(values.quantity, 1);
    const condition = parseImportCondition(values.condition, defaults.condition);
    const inventoryStatus = parseImportStatus(
      values.inventoryStatus,
      defaults.inventoryStatus,
    );
    const salePrice = parseImportMoney(values.salePrice);
    const purchaseCost = parseImportMoney(
      correction.purchaseCost ?? values.purchaseCost,
    );
    const acquiredAt = parseImportDate(values.acquiredAt);
    const isPublic = parseImportBoolean(values.isPublic, defaults.isPublic);
    const requestedLocationCode =
      importString(values.locationCode) ?? importString(values.boxCode);
    const resolvedLocation = requestedLocationCode
      ? locationByCode.get(normalizeComparableText(requestedLocationCode)) ?? null
      : null;

    const row: ProvisionalRow = {
      source,
      correction,
      messages: [],
      legacyBagNumber: importString(values.legacyBagNumber),
      legacyLocationCode: importString(values.legacyLocationCode),
      existingSku,
      brandRaw,
      brand: brandResolution.entity,
      brandResolvedByAlias: brandResolution.byAlias,
      compatibleModel,
      normalizedModel: compatibleModel ? normalizeModel(compatibleModel) : null,
      componentTypeRaw,
      componentType: typeResolution.entity,
      componentTypeResolvedByAlias: typeResolution.byAlias,
      partNumber,
      normalizedPartNumber: partNumber ? normalizePartNumber(partNumber) : null,
      condition: condition.value,
      quantity: quantity.value,
      inventoryStatus: inventoryStatus.value,
      salePrice: salePrice.value,
      currency: (importString(values.currency) ?? defaults.currency).toUpperCase(),
      acquiredAt: acquiredAt.value,
      acquisitionSource: importString(values.acquisitionSource),
      purchaseCost: purchaseCost.value,
      locationId: resolvedLocation?.id ?? null,
      locationCode: resolvedLocation?.code ?? requestedLocationCode,
      locationBreadcrumb: resolvedLocation
        ? buildLocationBreadcrumb(resolvedLocation.id, locationNodes)
        : null,
      isPublic: isPublic.value,
      titleOverride: importString(values.titleOverride),
      description: importString(values.description),
      internalNotes: importString(values.internalNotes),
      legacyTitle: importString(values.legacyTitle),
    };

    if (brandResolution.byAlias) {
      addMessage(row, "WARNING", "BRAND_ALIAS", `Marca corregida mediante alias a ${row.brand?.name}.`);
    }
    if (typeResolution.byAlias) {
      addMessage(row, "WARNING", "TYPE_ALIAS", `Tipo corregido mediante alias a ${row.componentType?.name}.`);
    }
    if (!row.brand && !existingSku) addMessage(row, "ERROR", "BRAND_UNRESOLVED", "No se pudo resolver la marca.");
    if (!row.componentType && !existingSku) addMessage(row, "ERROR", "TYPE_UNRESOLVED", "No se pudo resolver el tipo de componente.");
    if (!row.partNumber) addMessage(row, "WARNING", "PART_NUMBER_MISSING", "Número de parte ausente.");
    if (!row.compatibleModel) addMessage(row, "WARNING", "MODEL_MISSING", "Modelo compatible ausente.");
    if (quantity.error) addMessage(row, "ERROR", "QUANTITY_INVALID", quantity.error);
    if (condition.error) addMessage(row, "ERROR", "CONDITION_INVALID", condition.error);
    if (inventoryStatus.error) addMessage(row, "ERROR", "STATUS_INVALID", inventoryStatus.error);
    if (!isInventoryQuantityStatusValid(row.quantity, row.inventoryStatus)) {
      addMessage(row, "ERROR", "QUANTITY_STATUS_INVALID", "La cantidad y el estado no representan inventario físico válido.");
    }
    if (salePrice.error) addMessage(row, "ERROR", "SALE_PRICE_INVALID", salePrice.error);
    if (salePrice.ambiguous) addMessage(row, "WARNING", "SALE_PRICE_AMBIGUOUS", `Precio ambiguo conservado en notas: ${salePrice.ambiguous}`);
    if (purchaseCost.error) addMessage(row, "ERROR", "PURCHASE_COST_INVALID", purchaseCost.error);
    if (purchaseCost.ambiguous) {
      row.internalNotes = appendInternalNote(row.internalNotes, `Costo original: ${purchaseCost.ambiguous}`);
      addMessage(row, "WARNING", "PURCHASE_COST_AMBIGUOUS", "El costo contiene texto y se conservó en notas internas.");
    }
    if (acquiredAt.warning) {
      row.internalNotes = appendInternalNote(row.internalNotes, `Fecha original: ${importString(values.acquiredAt)}`);
      addMessage(row, "WARNING", "DATE_UNREADABLE", acquiredAt.warning);
    }
    if (isPublic.error) addMessage(row, "ERROR", "BOOLEAN_INVALID", isPublic.error);
    if (!/^[A-Z]{3}$/u.test(row.currency)) addMessage(row, "ERROR", "CURRENCY_INVALID", "La moneda debe usar tres letras, por ejemplo MXN.");
    if (requestedLocationCode && !resolvedLocation) {
      addMessage(row, "WARNING", "LOCATION_UNKNOWN", `La ubicación ${requestedLocationCode} no existe; quedará pendiente.`);
    } else if (!requestedLocationCode) {
      addMessage(row, "WARNING", "LOCATION_MISSING", "Ubicación pendiente.");
    }

    const legacyExtra = importString(values.legacyExtra);
    if (legacyExtra) {
      const parsedExtra = parseImportMoney(legacyExtra);
      if (!row.purchaseCost && parsedExtra.value) {
        row.purchaseCost = parsedExtra.value;
        addMessage(row, "WARNING", "LEGACY_COST_INFERRED", "La última columna se interpretó conservadoramente como costo.");
      } else {
        row.internalNotes = appendInternalNote(row.internalNotes, `Valor legacy adicional: ${legacyExtra}`);
        addMessage(row, "WARNING", "LEGACY_EXTRA_RETAINED", "La última columna era ambigua y se conservó en notas.");
      }
    }

    return row;
  });

  const skuValues = [...new Set(provisionalRows.map((row) => row.existingSku).filter((value): value is string => Boolean(value)))];
  const partTokens = [...new Set(provisionalRows.map((row) => row.normalizedPartNumber).filter((value): value is string => Boolean(value)))];
  const modelTokens = [...new Set(provisionalRows.map((row) => row.normalizedModel).filter((value): value is string => Boolean(value)))];
  const skuCandidates: ProductCandidate[] = [];
  const partCandidates: ProductCandidate[] = [];
  const modelCandidates: Array<ProductCandidate & { normalizedModel: string }> = [];

  for (const group of chunks(skuValues)) {
    skuCandidates.push(
      ...(await db
        .select({
          id: products.id,
          sku: products.sku,
          brandId: products.brandId,
          componentTypeId: products.componentTypeId,
          partNumber: products.partNumber,
          normalizedPartNumber: products.normalizedPartNumber,
          title: products.title,
        })
        .from(products)
        .where(inArray(products.sku, group))),
    );
  }
  for (const group of chunks(partTokens)) {
    partCandidates.push(
      ...(await db
        .select({
          id: products.id,
          sku: products.sku,
          brandId: products.brandId,
          componentTypeId: products.componentTypeId,
          partNumber: products.partNumber,
          normalizedPartNumber: products.normalizedPartNumber,
          title: products.title,
        })
        .from(products)
        .where(inArray(products.normalizedPartNumber, group))),
    );
  }
  for (const group of chunks(modelTokens)) {
    modelCandidates.push(
      ...(await db
        .select({
          id: products.id,
          sku: products.sku,
          brandId: products.brandId,
          componentTypeId: products.componentTypeId,
          partNumber: products.partNumber,
          normalizedPartNumber: products.normalizedPartNumber,
          title: products.title,
          normalizedModel: productCompatibilities.normalizedModel,
        })
        .from(productCompatibilities)
        .innerJoin(products, eq(productCompatibilities.productId, products.id))
        .where(inArray(productCompatibilities.normalizedModel, group))),
    );
  }

  const productBySku = new Map(skuCandidates.map((product) => [product.sku, product]));
  const productsByPart = new Map<string, Map<string, ProductCandidate>>();
  for (const product of partCandidates) {
    if (!product.normalizedPartNumber) continue;
    pushCandidate(
      productsByPart,
      productPartKey({
        brandId: product.brandId,
        componentTypeId: product.componentTypeId,
        normalizedPartNumber: product.normalizedPartNumber,
      }),
      product,
    );
  }
  const productsByModel = new Map<string, Map<string, ProductCandidate>>();
  for (const product of modelCandidates) {
    pushCandidate(
      productsByModel,
      productModelKey({
        brandId: product.brandId,
        componentTypeId: product.componentTypeId,
        normalizedModel: product.normalizedModel,
      }),
      product,
    );
  }

  const brandById = new Map(brandRows.map((brand) => [brand.id, brand as CatalogEntity]));
  const typeById = new Map(typeRows.map((type) => [type.id, type as CatalogEntity]));
  const textEncoder = new TextEncoder();
  const analyzed = await Promise.all(
    provisionalRows.map(async (row): Promise<AnalyzedImportRow> => {
      let matchKind: AnalyzedImportRow["matchKind"] = "NEW";
      let matchedProduct: ProductCandidate | null = null;

      if (row.existingSku) {
        matchedProduct = productBySku.get(row.existingSku) ?? null;
        if (!matchedProduct) {
          matchKind = "CONFLICT";
          addMessage(row, "ERROR", "EXISTING_SKU_NOT_FOUND", `No existe el SKU ${row.existingSku}.`);
        } else {
          matchKind = "EXACT_MATCH";
          if (row.brand && row.brand.id !== matchedProduct.brandId) {
            matchKind = "CONFLICT";
            addMessage(row, "ERROR", "EXISTING_SKU_BRAND_CONFLICT", "ExistingSKU pertenece a otra marca.");
          }
          if (row.componentType && row.componentType.id !== matchedProduct.componentTypeId) {
            matchKind = "CONFLICT";
            addMessage(row, "ERROR", "EXISTING_SKU_TYPE_CONFLICT", "ExistingSKU pertenece a otro tipo.");
          }
          if (
            row.normalizedPartNumber &&
            row.normalizedPartNumber !== matchedProduct.normalizedPartNumber
          ) {
            matchKind = "CONFLICT";
            addMessage(row, "ERROR", "EXISTING_SKU_PART_CONFLICT", "ExistingSKU tiene otro número de parte.");
          }
          row.brand ??= brandById.get(matchedProduct.brandId) ?? null;
          row.componentType ??= typeById.get(matchedProduct.componentTypeId) ?? null;
        }
      } else if (row.brand && row.componentType && row.normalizedPartNumber) {
        const candidates = productsByPart.get(
          productPartKey({
            brandId: row.brand.id,
            componentTypeId: row.componentType.id,
            normalizedPartNumber: row.normalizedPartNumber,
          }),
        );
        if (candidates?.size === 1) {
          matchedProduct = [...candidates.values()][0] ?? null;
          matchKind = "EXACT_MATCH";
        } else if (candidates && candidates.size > 1) {
          matchKind = "CONFLICT";
          addMessage(row, "ERROR", "MULTIPLE_EXACT_MATCHES", "Existen varios productos con la misma identidad fuerte.");
        }
      } else if (row.brand && row.componentType && row.normalizedModel) {
        const candidates = productsByModel.get(
          productModelKey({
            brandId: row.brand.id,
            componentTypeId: row.componentType.id,
            normalizedModel: row.normalizedModel,
          }),
        );
        if (candidates?.size) {
          matchKind = "POSSIBLE_MATCH";
          matchedProduct = candidates.size === 1 ? [...candidates.values()][0] ?? null : null;
          addMessage(row, "WARNING", "POSSIBLE_MATCH", "Existe una coincidencia por modelo; indica ExistingSKU o confirma producto nuevo.");
          if (row.correction.forceNew) {
            matchKind = "NEW";
            matchedProduct = null;
          }
        }
      }

      let title: string | null = matchedProduct?.title ?? null;
      let proposedSku: string | null = matchedProduct?.sku ?? null;
      if (matchKind === "NEW" && row.brand && row.componentType) {
        try {
          proposedSku = generateSku({
            brandCode: row.brand.code,
            componentCode: row.componentType.code,
            partNumber: row.partNumber,
            compatibleModel: row.compatibleModel,
          });
          title = row.titleOverride ?? buildProductTitle({
            componentType: row.componentType.name.toUpperCase(),
            partNumber: row.partNumber,
            brand: row.brand.name.toUpperCase(),
            compatibleModel: row.compatibleModel,
          });
        } catch {
          addMessage(row, "ERROR", "PRODUCT_IDENTIFIER_MISSING", "Se requiere número de parte o modelo para generar el SKU.");
        }
      }

      if (
        row.legacyTitle &&
        title &&
        normalizeComparableText(row.legacyTitle) !== normalizeComparableText(title)
      ) {
        addMessage(row, "WARNING", "LEGACY_TITLE_DIFFERENT", "El título legacy difiere del título estructurado.");
      }

      const identity = [
        row.existingSku ?? "",
        matchedProduct?.id ?? "",
        row.brand?.id ?? "",
        row.componentType?.id ?? "",
        row.normalizedPartNumber ?? "",
        row.normalizedModel ?? "",
        row.legacyBagNumber ?? "",
        row.legacyLocationCode ?? "",
        row.locationId ?? "",
        row.locationCode ?? "",
        row.quantity,
        row.condition,
        row.inventoryStatus,
        row.acquiredAt ?? "",
        row.acquisitionSource ?? "",
        row.purchaseCost ?? "",
        row.internalNotes ?? "",
      ].join("|");
      const fingerprint = await sha256Hex(textEncoder.encode(identity));
      const hasError = row.messages.some((message) => message.level === "ERROR");
      const needsReview = matchKind === "POSSIBLE_MATCH" && !row.correction.forceNew;
      const status = hasError
        ? "ERROR"
        : row.messages.some((message) => message.level === "WARNING")
          ? "WARNING"
          : "VALID";
      const action = hasError
        ? "SKIP"
        : needsReview
          ? "REVIEW"
          : matchKind === "EXACT_MATCH"
            ? "ADD_INVENTORY"
            : "CREATE_PRODUCT_AND_INVENTORY";

      return {
        rowNumber: row.source.rowNumber,
        fingerprint,
        status,
        matchKind,
        action,
        importable: !hasError && !needsReview,
        duplicateInFile: false,
        previouslyImported: false,
        messages: row.messages,
        raw: rowRawSnapshot(row.source),
        normalized: {
          legacyBagNumber: row.legacyBagNumber,
          legacyLocationCode: row.legacyLocationCode,
          existingSku: row.existingSku,
          brandRaw: row.brandRaw,
          brandId: row.brand?.id ?? null,
          brandName: row.brand?.name ?? null,
          brandCode: row.brand?.code ?? null,
          brandResolvedByAlias: row.brandResolvedByAlias,
          compatibleModel: row.compatibleModel,
          normalizedModel: row.normalizedModel,
          componentTypeRaw: row.componentTypeRaw,
          componentTypeId: row.componentType?.id ?? null,
          componentTypeName: row.componentType?.name ?? null,
          componentTypeCode: row.componentType?.code ?? null,
          componentTypeResolvedByAlias: row.componentTypeResolvedByAlias,
          partNumber: row.partNumber,
          normalizedPartNumber: row.normalizedPartNumber,
          condition: row.condition,
          quantity: row.quantity,
          inventoryStatus: row.inventoryStatus,
          salePrice: row.salePrice,
          currency: row.currency,
          acquiredAt: row.acquiredAt,
          acquisitionSource: row.acquisitionSource,
          purchaseCost: row.purchaseCost,
          locationId: row.locationId,
          locationCode: row.locationCode,
          locationBreadcrumb: row.locationBreadcrumb,
          isPublic: row.isPublic,
          title,
          description: row.description,
          internalNotes: row.internalNotes,
          legacyTitle: row.legacyTitle,
          proposedSku,
          matchedProductId: matchedProduct?.id ?? null,
          matchedSku: matchedProduct?.sku ?? null,
        },
      };
    }),
  );

  const duplicateCounts = new Map<string, number>();
  for (const row of analyzed) duplicateCounts.set(row.fingerprint, (duplicateCounts.get(row.fingerprint) ?? 0) + 1);
  const fingerprints = [...duplicateCounts.keys()];
  const previouslyImported = new Set<string>();
  for (const group of chunks(fingerprints)) {
    const records = await db
      .select({ fingerprint: importJobRows.fingerprint })
      .from(importJobRows)
      .where(
        and(
          inArray(importJobRows.fingerprint, group),
          isNotNull(importJobRows.inventoryItemId),
        ),
      );
    records.forEach((record) => previouslyImported.add(record.fingerprint));
  }

  const seen = new Set<string>();
  for (const row of analyzed) {
    if ((duplicateCounts.get(row.fingerprint) ?? 0) > 1 && seen.has(row.fingerprint)) {
      row.duplicateInFile = true;
      row.status = row.status === "ERROR" ? "ERROR" : "WARNING";
      row.messages.push({
        level: "WARNING",
        code: "DUPLICATE_IN_FILE",
        message: "La misma fila física ya apareció antes en este archivo.",
      });
    }
    seen.add(row.fingerprint);
    if (previouslyImported.has(row.fingerprint)) {
      row.previouslyImported = true;
      row.status = row.status === "ERROR" ? "ERROR" : "WARNING";
      row.messages.push({
        level: "WARNING",
        code: "PREVIOUSLY_IMPORTED",
        message: "Una fila con la misma huella ya creó inventario anteriormente.",
      });
    }
  }

  return analyzed;
}
