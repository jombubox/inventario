import {
  inventoryConditionValues,
  inventoryStatusValues,
} from "@/db/schema/enums";
import type {
  ImportCondition,
  ImportInventoryStatus,
} from "@/features/imports/domain/import-types";
import { normalizeWhitespace } from "@/features/shared/domain/text-normalization";

export function importString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = normalizeWhitespace(value instanceof Date ? value.toISOString() : String(value));
  return text === "" ? null : text;
}

export function parseImportInteger(
  value: unknown,
  fallback: number,
): { value: number; error?: string } {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { value: fallback };
  }
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return { value: fallback, error: "La cantidad debe ser un entero mayor que cero." };
  }
  return { value: parsed };
}

export function parseImportMoney(value: unknown): {
  value: string | null;
  ambiguous?: string;
  error?: string;
} {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { value: null };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return { value: null, error: "El importe no puede ser negativo." };
    return { value: (Math.round(value * 100) / 100).toFixed(2) };
  }

  const raw = normalizeWhitespace(String(value));
  const normalized = raw
    .replace(/^MXN\s*/iu, "")
    .replace(/^\$\s*/u, "")
    .replace(/,/gu, "");
  if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) {
    return { value: null, ambiguous: raw };
  }
  const [whole, decimals = ""] = normalized.split(".");
  return { value: `${whole}.${decimals.padEnd(2, "0")}` };
}

export function parseImportDate(value: unknown): {
  value: string | null;
  warning?: string;
} {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { value: null };
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { value: value.toISOString().slice(0, 10) };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000));
    if (date.getUTCFullYear() >= 1990 && date.getUTCFullYear() <= 2100) {
      return { value: date.toISOString().slice(0, 10) };
    }
    return { value: null, warning: `Fecha serial fuera de rango: ${value}` };
  }

  const raw = normalizeWhitespace(String(value));
  if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number) as [number, number, number];
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
      ? { value: null, warning: `Fecha ilegible: ${raw}` }
      : { value: raw };
  }
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u.exec(raw);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return { value: date.toISOString().slice(0, 10) };
    }
  }
  return { value: null, warning: `Fecha ilegible: ${raw}` };
}

export function parseImportBoolean(value: unknown, fallback: boolean): {
  value: boolean;
  error?: string;
} {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { value: fallback };
  }
  if (typeof value === "boolean") return { value };
  const normalized = normalizeWhitespace(String(value)).toUpperCase();
  if (["TRUE", "SI", "SÍ", "1"].includes(normalized)) return { value: true };
  if (["FALSE", "NO", "0"].includes(normalized)) return { value: false };
  return { value: fallback, error: "IsPublic debe ser TRUE/FALSE, Sí/No o 1/0." };
}

export function parseImportCondition(
  value: unknown,
  fallback: ImportCondition,
): { value: ImportCondition; error?: string } {
  const raw = importString(value)?.toUpperCase();
  if (!raw) return { value: fallback };
  if (inventoryConditionValues.includes(raw as ImportCondition)) {
    return { value: raw as ImportCondition };
  }
  return { value: fallback, error: `Condición inválida: ${raw}.` };
}

export function parseImportStatus(
  value: unknown,
  fallback: ImportInventoryStatus,
): { value: ImportInventoryStatus; error?: string } {
  const raw = importString(value)?.toUpperCase();
  if (!raw) return { value: fallback };
  if (inventoryStatusValues.includes(raw as ImportInventoryStatus)) {
    return { value: raw as ImportInventoryStatus };
  }
  return { value: fallback, error: `Estado de inventario inválido: ${raw}.` };
}

export function appendInternalNote(current: string | null, note: string): string {
  return current ? `${current}\n${note}` : note;
}
