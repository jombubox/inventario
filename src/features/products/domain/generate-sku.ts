import { InvalidSkuInputError } from "@/features/products/domain/domain-errors";
import { normalizeSkuToken } from "@/features/products/domain/product-normalization";

export type GenerateSkuInput = {
  brandCode: string;
  componentCode: string;
  partNumber?: string | null;
  compatibleModel?: string | null;
  controlledFallback?: string | null;
};

function requireSkuToken(value: string, label: string, minimumLength: number): string {
  const token = normalizeSkuToken(value);

  if (token.length < minimumLength) {
    throw new InvalidSkuInputError(`${label} does not contain a usable SKU token.`);
  }

  return token;
}

export function generateSku(input: GenerateSkuInput): string {
  const brandCode = requireSkuToken(input.brandCode, "Brand code", 2);
  const componentCode = requireSkuToken(input.componentCode, "Component code", 2);
  const source = input.partNumber || input.compatibleModel || input.controlledFallback;

  if (!source) {
    throw new InvalidSkuInputError(
      "A part number, compatible model, or controlled fallback is required to generate a SKU.",
    );
  }

  const identifier = requireSkuToken(source, "Product identifier", 3);

  return `${brandCode}-${componentCode}-${identifier}`;
}

export function resolveStableSku(
  existingSku: string | null | undefined,
  generationInput: GenerateSkuInput,
): string {
  return existingSku && existingSku.length > 0 ? existingSku : generateSku(generationInput);
}

export function appendSkuCollisionSuffix(baseSku: string, ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 2) {
    throw new InvalidSkuInputError("A SKU collision suffix must be an integer greater than one.");
  }

  return `${baseSku}-${String(ordinal).padStart(2, "0")}`;
}

type SkuCollision = {
  productId: string;
  sameProductIdentity: boolean;
};

export type SkuCollisionAssessment =
  | { action: "CREATE"; sku: string }
  | { action: "REUSE"; sku: string; productId: string }
  | { action: "REVIEW"; baseSku: string; candidateSku: string; collidedProductId: string };

export function assessSkuCollision({
  baseSku,
  collision,
  nextOrdinal = 2,
}: {
  baseSku: string;
  collision?: SkuCollision | null;
  nextOrdinal?: number;
}): SkuCollisionAssessment {
  if (!collision) {
    return { action: "CREATE", sku: baseSku };
  }

  if (collision.sameProductIdentity) {
    return { action: "REUSE", sku: baseSku, productId: collision.productId };
  }

  return {
    action: "REVIEW",
    baseSku,
    candidateSku: appendSkuCollisionSuffix(baseSku, nextOrdinal),
    collidedProductId: collision.productId,
  };
}
