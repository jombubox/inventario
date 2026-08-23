import {
  normalizeBrand,
  normalizeComponentType,
} from "@/features/products/domain/product-normalization";

export type AliasDefinition = {
  alias: string;
  target: string;
};

function resolveAlias(
  value: string,
  aliases: readonly AliasDefinition[],
  normalize: (input: string) => string,
): string {
  const normalizedValue = normalize(value);
  const match = aliases.find((entry) => normalize(entry.alias) === normalizedValue);

  return match ? normalize(match.target) : normalizedValue;
}

export function resolveBrandAlias(value: string, aliases: readonly AliasDefinition[]): string {
  return resolveAlias(value, aliases, normalizeBrand);
}

export function resolveComponentTypeAlias(
  value: string,
  aliases: readonly AliasDefinition[],
): string {
  return resolveAlias(value, aliases, normalizeComponentType);
}
