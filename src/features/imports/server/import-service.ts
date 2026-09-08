import "server-only";

import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  importJobRows,
  importJobs,
  productCompatibilities,
  products,
} from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { assertPermission } from "@/features/auth/domain/permissions";
import { databaseUserIdForActor } from "@/features/auth/server/actor-attribution";
import type { AuthenticatedUser } from "@/features/auth/server/authorization";
import type {
  AnalyzedImportRow,
  ImportCorrection,
  ImportDefaults,
  ImportMapping,
  ImportPreview,
} from "@/features/imports/domain/import-types";
import { assertSafeXlsxFile, sha256Hex } from "@/features/imports/domain/xlsx-security";
import { analyzeImportRows } from "@/features/imports/server/import-analyzer";
import { parseXlsxWorkbook } from "@/features/imports/server/xlsx-parser";
import { createInventoryItemInTransaction } from "@/features/inventory/server/inventory-service";
import { createProductInTransaction } from "@/features/products/server/product-service";
import { InvalidOperationError } from "@/features/shared/domain/service-errors";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type AnalyzeImportInput = {
  file: File;
  jobId?: string;
  mapping?: ImportMapping;
  defaults: ImportDefaults;
  corrections?: Record<number, ImportCorrection>;
};

export type ConfirmImportInput = AnalyzeImportInput & {
  jobId: string;
  forceDuplicateFile: boolean;
  includeDuplicateRows: boolean;
  includePreviouslyImported: boolean;
};

function summarize(rows: AnalyzedImportRow[]): ImportPreview["summary"] {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === "VALID").length,
    warningRows: rows.filter((row) => row.status === "WARNING").length,
    errorRows: rows.filter((row) => row.status === "ERROR").length,
    newProducts: new Set(
      rows
        .filter((row) => row.importable && row.matchKind === "NEW")
        .map((row) =>
          [
            row.normalized.brandId,
            row.normalized.componentTypeId,
            row.normalized.normalizedPartNumber ?? row.normalized.normalizedModel,
          ].join(":"),
        ),
    ).size,
    existingProducts: rows.filter(
      (row) => row.importable && row.matchKind === "EXACT_MATCH",
    ).length,
    inventoryItems: rows.filter((row) => row.importable).length,
    omittedRows: rows.filter(
      (row) => !row.importable || row.duplicateInFile || row.previouslyImported,
    ).length,
  };
}

async function fileBytesAndHash(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertSafeXlsxFile(file, bytes);
  return { bytes, fileHash: await sha256Hex(bytes) };
}

async function assertOwnedPreviewJob(
  db: Database,
  actor: AuthenticatedUser,
  jobId: string,
) {
  const job = await db.query.importJobs.findFirst({ where: eq(importJobs.id, jobId) });
  if (!job || (actor.role !== "ADMIN" && job.createdBy !== actor.id)) {
    throw new InvalidOperationError("La importación no existe o pertenece a otro usuario.");
  }
  return job;
}

export async function analyzeImportFile(
  db: Database,
  actor: AuthenticatedUser,
  input: AnalyzeImportInput,
): Promise<ImportPreview> {
  assertPermission(actor.role, "IMPORT_EXECUTE");
  const { bytes, fileHash } = await fileBytesAndHash(input.file);
  const parsed = await parseXlsxWorkbook(bytes, input.mapping);
  const rows = await analyzeImportRows(db, parsed.rows, input.defaults, input.corrections);
  const summary = summarize(rows);
  const duplicate = await db.query.importJobs.findFirst({
    columns: { id: true },
    where: and(eq(importJobs.fileHash, fileHash), eq(importJobs.status, "COMPLETED")),
  });

  let jobId = input.jobId;
  if (jobId) {
    const existing = await assertOwnedPreviewJob(db, actor, jobId);
    if (!["PENDING", "PREVIEWED", "FAILED"].includes(existing.status)) {
      throw new InvalidOperationError("Esta importación ya no puede volver a previsualizarse.");
    }
    await db
      .update(importJobs)
      .set({
        filename: input.file.name,
        fileHash,
        status: "PREVIEWED",
        totalRows: summary.totalRows,
        successfulRows: summary.validRows,
        warningRows: summary.warningRows,
        failedRows: summary.errorRows,
        errors: rows
          .filter((row) => row.status === "ERROR")
          .slice(0, 200)
          .map((row) => ({ rowNumber: row.rowNumber, messages: row.messages })),
        metadata: {
          sheetName: parsed.sheetName,
          headerRow: parsed.headerRow,
          mapping: parsed.mapping,
          defaults: input.defaults,
          duplicateFile: Boolean(duplicate && duplicate.id !== jobId),
          summary,
        },
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId));
  } else {
    const [created] = await db
      .insert(importJobs)
      .values({
        filename: input.file.name,
        fileHash,
        status: "PREVIEWED",
        totalRows: summary.totalRows,
        successfulRows: summary.validRows,
        warningRows: summary.warningRows,
        failedRows: summary.errorRows,
        createdBy: databaseUserIdForActor(actor.id),
        errors: rows
          .filter((row) => row.status === "ERROR")
          .slice(0, 200)
          .map((row) => ({ rowNumber: row.rowNumber, messages: row.messages })),
        metadata: {
          sheetName: parsed.sheetName,
          headerRow: parsed.headerRow,
          mapping: parsed.mapping,
          defaults: input.defaults,
          duplicateFile: Boolean(duplicate),
          summary,
        },
      })
      .returning({ id: importJobs.id });
    if (!created) throw new Error("ImportJob insert did not return a row.");
    jobId = created.id;
  }

  await createAuditLog(db, {
    userId: actor.id,
    action: "IMPORT_PREVIEWED",
    entityType: "IMPORT_JOB",
    entityId: jobId,
    after: { filename: input.file.name, status: "PREVIEWED", ...summary },
    metadata: { duplicateFile: Boolean(duplicate), fileHashPrefix: fileHash.slice(0, 12) },
  });

  return {
    jobId,
    filename: input.file.name,
    fileHash,
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRow,
    headers: parsed.headers,
    mapping: parsed.mapping,
    duplicateFile: Boolean(duplicate && duplicate.id !== jobId),
    rows,
    summary,
  };
}

function importProductKey(row: AnalyzedImportRow): string {
  return [
    row.normalized.brandId,
    row.normalized.componentTypeId,
    row.normalized.normalizedPartNumber ?? row.normalized.normalizedModel,
  ].join(":");
}

async function resolveOrCreateProduct(
  tx: Transaction,
  actor: AuthenticatedUser,
  row: AnalyzedImportRow,
  knownProductId?: string,
) {
  if (knownProductId) {
    const product = await tx.query.products.findFirst({
      where: and(eq(products.id, knownProductId), isNull(products.deletedAt)),
    });
    if (product) return { product, created: false };
  }
  if (row.normalized.matchedProductId) {
    const product = await tx.query.products.findFirst({
      where: and(
        eq(products.id, row.normalized.matchedProductId),
        isNull(products.deletedAt),
      ),
    });
    if (!product) throw new InvalidOperationError("El producto coincidente ya no existe.");
    return { product, created: false };
  }
  if (
    row.normalized.brandId &&
    row.normalized.componentTypeId &&
    row.normalized.normalizedPartNumber
  ) {
    const candidates = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.brandId, row.normalized.brandId),
          eq(products.componentTypeId, row.normalized.componentTypeId),
          eq(products.normalizedPartNumber, row.normalized.normalizedPartNumber),
          isNull(products.deletedAt),
        ),
      )
      .limit(2);
    if (candidates.length === 1) return { product: candidates[0]!, created: false };
    if (candidates.length > 1) throw new InvalidOperationError("La identidad del producto dejó de ser inequívoca.");
  }
  if (!row.normalized.brandId || !row.normalized.componentTypeId || !row.normalized.title) {
    throw new InvalidOperationError("La fila no contiene datos suficientes para crear el producto.");
  }
  const product = await createProductInTransaction(tx, actor, {
    brandId: row.normalized.brandId,
    componentTypeId: row.normalized.componentTypeId,
    partNumber: row.normalized.partNumber,
    title: row.normalized.title,
    description: row.normalized.description,
    salePrice: row.normalized.salePrice,
    currency: row.normalized.currency,
    status: row.normalized.isPublic ? "ACTIVE" : "DRAFT",
    isPublic: row.normalized.isPublic,
    compatibilities:
      row.normalized.compatibleModel && row.normalized.brandId
        ? [
            {
              brandId: row.normalized.brandId,
              model: row.normalized.compatibleModel,
              notes: row.normalized.legacyTitle
                ? `Título legacy: ${row.normalized.legacyTitle}`
                : null,
            },
          ]
        : [],
  });
  return { product, created: true };
}

async function importOneRow(
  db: Database,
  actor: AuthenticatedUser,
  jobId: string,
  row: AnalyzedImportRow,
  knownProductId?: string,
) {
  return db.transaction(async (tx) => {
    const resolved = await resolveOrCreateProduct(tx, actor, row, knownProductId);
    let compatibilityAdded = false;
    if (
      !resolved.created &&
      row.normalized.compatibleModel &&
      row.normalized.normalizedModel &&
      row.normalized.brandId
    ) {
      const [compatibility] = await tx
        .insert(productCompatibilities)
        .values({
          productId: resolved.product.id,
          brandId: row.normalized.brandId,
          model: row.normalized.compatibleModel,
          normalizedModel: row.normalized.normalizedModel,
          notes: null,
        })
        .onConflictDoNothing()
        .returning({ id: productCompatibilities.id });
      compatibilityAdded = Boolean(compatibility);
    }
    const inventory = await createInventoryItemInTransaction(tx, actor, {
      productId: resolved.product.id,
      locationId: row.normalized.locationId,
      quantity: row.normalized.quantity,
      condition: row.normalized.condition,
      status: row.normalized.inventoryStatus,
      acquiredAt: row.normalized.acquiredAt
        ? new Date(`${row.normalized.acquiredAt}T00:00:00.000Z`)
        : null,
      acquisitionSource: row.normalized.acquisitionSource,
      purchaseCost: row.normalized.purchaseCost,
      notes: row.normalized.internalNotes,
      legacyBagNumber: row.normalized.legacyBagNumber,
      legacyLocationCode: row.normalized.legacyLocationCode,
    });
    await tx.insert(importJobRows).values({
      importJobId: jobId,
      rowNumber: row.rowNumber,
      fingerprint: row.fingerprint,
      status: "IMPORTED",
      action: resolved.created ? "CREATE_PRODUCT_AND_INVENTORY" : "ADD_INVENTORY",
      messages: row.messages.map((message) => `${message.level}: ${message.message}`),
      rawData: row.raw,
      normalizedData: row.normalized,
      productId: resolved.product.id,
      inventoryItemId: inventory.id,
    });
    return {
      productId: resolved.product.id,
      inventoryItemId: inventory.id,
      productCreated: resolved.created,
      compatibilityAdded,
    };
  });
}

export async function confirmImportFile(
  db: Database,
  actor: AuthenticatedUser,
  input: ConfirmImportInput,
) {
  assertPermission(actor.role, "IMPORT_EXECUTE");
  assertPermission(actor.role, "PRODUCT_CREATE");
  assertPermission(actor.role, "INVENTORY_CREATE");
  const previewJob = await assertOwnedPreviewJob(db, actor, input.jobId);
  const { bytes, fileHash } = await fileBytesAndHash(input.file);
  if (previewJob.fileHash !== fileHash) {
    throw new InvalidOperationError("El archivo cambió desde la previsualización.");
  }
  const job = await db.transaction(async (tx) => {
    const [lockedJob] = await tx
      .select()
      .from(importJobs)
      .where(eq(importJobs.id, input.jobId))
      .for("update")
      .limit(1);
    if (!lockedJob || (actor.role !== "ADMIN" && lockedJob.createdBy !== actor.id)) {
      throw new InvalidOperationError("La importación no existe o pertenece a otro usuario.");
    }
    if (!["PREVIEWED", "FAILED"].includes(lockedJob.status)) {
      throw new InvalidOperationError("La importación no está lista para confirmarse.");
    }
    if (lockedJob.fileHash !== fileHash) {
      throw new InvalidOperationError("El archivo cambió desde la previsualización.");
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${fileHash}, 0))`);
    const duplicateJob = await tx.query.importJobs.findFirst({
      columns: { id: true },
      where: and(
        eq(importJobs.fileHash, fileHash),
        inArray(importJobs.status, ["PROCESSING", "COMPLETED"]),
        ne(importJobs.id, lockedJob.id),
      ),
    });
    if (duplicateJob && !input.forceDuplicateFile) {
      throw new InvalidOperationError("Este archivo ya se está procesando o fue importado; confirma explícitamente la reimportación.");
    }
    await tx
      .update(importJobs)
      .set({
        status: "PROCESSING",
        startedAt: new Date(),
        completedAt: null,
        forceDuplicate: input.forceDuplicateFile,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, lockedJob.id));
    return lockedJob;
  });
  await createAuditLog(db, {
    userId: actor.id,
    action: "IMPORT_STARTED",
    entityType: "IMPORT_JOB",
    entityId: job.id,
    after: { filename: job.filename, status: "PROCESSING" },
  });

  try {
    const parsed = await parseXlsxWorkbook(bytes, input.mapping);
    const analyzed = await analyzeImportRows(
      db,
      parsed.rows,
      input.defaults,
      input.corrections,
    );
    const previouslyCompletedRows = await db
      .select({
        rowNumber: importJobRows.rowNumber,
        productId: importJobRows.productId,
        inventoryItemId: importJobRows.inventoryItemId,
        messages: importJobRows.messages,
      })
      .from(importJobRows)
      .where(
        and(
          eq(importJobRows.importJobId, job.id),
          isNotNull(importJobRows.inventoryItemId),
        ),
      );
    const completedByRow = new Map(previouslyCompletedRows.map((row) => [row.rowNumber, row]));
    await db
      .delete(importJobRows)
      .where(
        and(
          eq(importJobRows.importJobId, job.id),
          isNull(importJobRows.inventoryItemId),
        ),
      );

    const knownProducts = new Map<string, string>();
    const results: Array<{
      rowNumber: number;
      status: "IMPORTED" | "SKIPPED" | "ERROR";
      message?: string;
    }> = [];
    let productsCreated = 0;
    let inventoryItemsCreated = 0;
    let compatibilitiesAdded = 0;
    let validImported = 0;
    let warningImported = 0;

    for (const row of analyzed) {
      const completedEarlier = completedByRow.get(row.rowNumber);
      if (completedEarlier?.productId && completedEarlier.inventoryItemId) {
        knownProducts.set(importProductKey(row), completedEarlier.productId);
        inventoryItemsCreated += 1;
        if (completedEarlier.messages.some((message) => message.startsWith("WARNING:"))) {
          warningImported += 1;
        } else {
          validImported += 1;
        }
        results.push({
          rowNumber: row.rowNumber,
          status: "IMPORTED",
          message: "Conservada de un intento anterior del mismo trabajo.",
        });
        continue;
      }
      const skipReason = !row.importable
        ? "La fila contiene errores o una coincidencia que requiere revisión."
        : row.duplicateInFile && !input.includeDuplicateRows
          ? "Fila repetida omitida."
          : row.previouslyImported && !input.includePreviouslyImported
            ? "Fila importada anteriormente omitida."
            : null;
      if (skipReason) {
        await db.insert(importJobRows).values({
          importJobId: job.id,
          rowNumber: row.rowNumber,
          fingerprint: row.fingerprint,
          status: "SKIPPED",
          action: "SKIP",
          messages: [...row.messages.map((message) => `${message.level}: ${message.message}`), skipReason],
          rawData: row.raw,
          normalizedData: row.normalized,
        });
        results.push({ rowNumber: row.rowNumber, status: "SKIPPED", message: skipReason });
        continue;
      }

      try {
        const productKey = importProductKey(row);
        const imported = await importOneRow(
          db,
          actor,
          job.id,
          row,
          knownProducts.get(productKey),
        );
        knownProducts.set(productKey, imported.productId);
        productsCreated += Number(imported.productCreated);
        inventoryItemsCreated += 1;
        compatibilitiesAdded += Number(imported.compatibilityAdded);
        if (row.status === "WARNING") warningImported += 1;
        else validImported += 1;
        results.push({ rowNumber: row.rowNumber, status: "IMPORTED" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido en la fila.";
        await db.insert(importJobRows).values({
          importJobId: job.id,
          rowNumber: row.rowNumber,
          fingerprint: row.fingerprint,
          status: "ERROR",
          action: "SKIP",
          messages: [...row.messages.map((entry) => `${entry.level}: ${entry.message}`), message],
          rawData: row.raw,
          normalizedData: row.normalized,
        });
        results.push({ rowNumber: row.rowNumber, status: "ERROR", message });
      }
    }

    const failedRows = analyzed.length - validImported - warningImported;
    const completedAt = new Date();
    await db
      .update(importJobs)
      .set({
        status: "COMPLETED",
        totalRows: analyzed.length,
        successfulRows: validImported,
        warningRows: warningImported,
        failedRows,
        completedAt,
        errors: results.filter((result) => result.status !== "IMPORTED").slice(0, 500),
        metadata: {
          ...(job.metadata ?? {}),
          productsCreated,
          inventoryItemsCreated,
          compatibilitiesAdded,
          omittedRows: failedRows,
        },
        updatedAt: completedAt,
      })
      .where(eq(importJobs.id, job.id));
    await createAuditLog(db, {
      userId: actor.id,
      action: "IMPORT_COMPLETED",
      entityType: "IMPORT_JOB",
      entityId: job.id,
      after: {
        filename: job.filename,
        status: "COMPLETED",
        productsCreated,
        inventoryItemsCreated,
        compatibilitiesAdded,
        omittedRows: failedRows,
      },
    });
    return {
      jobId: job.id,
      productsCreated,
      inventoryItemsCreated,
      compatibilitiesAdded,
      omittedRows: failedRows,
      results,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido de importación.";
    const completedAt = new Date();
    await db
      .update(importJobs)
      .set({
        status: "FAILED",
        completedAt,
        errors: [{ message }],
        updatedAt: completedAt,
      })
      .where(eq(importJobs.id, job.id));
    await createAuditLog(db, {
      userId: actor.id,
      action: "IMPORT_FAILED",
      entityType: "IMPORT_JOB",
      entityId: job.id,
      after: { filename: job.filename, status: "FAILED" },
      metadata: { error: message.slice(0, 300) },
    });
    throw error;
  }
}
