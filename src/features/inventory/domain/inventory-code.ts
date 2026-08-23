export class InvalidInventorySequenceError extends Error {
  override readonly name = "InvalidInventorySequenceError";
}

export function formatInventoryCode(sequenceValue: number | bigint): string {
  if (
    typeof sequenceValue === "number" &&
    (!Number.isSafeInteger(sequenceValue) || sequenceValue < 1)
  ) {
    throw new InvalidInventorySequenceError(
      "Inventory sequence values must be positive safe integers.",
    );
  }

  const value = typeof sequenceValue === "bigint" ? sequenceValue : BigInt(sequenceValue);

  if (value < 1n) {
    throw new InvalidInventorySequenceError("Inventory sequence values must be positive integers.");
  }

  return `INV-${value.toString().padStart(6, "0")}`;
}
