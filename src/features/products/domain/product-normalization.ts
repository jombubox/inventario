import {
  normalizeComparableText,
  normalizeIdentifier,
} from "@/features/shared/domain/text-normalization";

export function normalizeBrand(value: string): string {
  return normalizeComparableText(value);
}

export function normalizeComponentType(value: string): string {
  return normalizeComparableText(value);
}

export function normalizePartNumber(value: string): string {
  return normalizeIdentifier(value);
}

export function normalizeModel(value: string): string {
  return normalizeIdentifier(value);
}

export function normalizeSkuToken(value: string): string {
  return normalizeIdentifier(value);
}
