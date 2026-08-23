export class EntityNotFoundError extends Error {
  override readonly name = "EntityNotFoundError";
}

export class DuplicateEntityError extends Error {
  override readonly name = "DuplicateEntityError";
}

export class ConcurrentModificationError extends Error {
  override readonly name = "ConcurrentModificationError";
}

export class InvalidOperationError extends Error {
  override readonly name = "InvalidOperationError";
}

export class FeatureDisabledError extends Error {
  override readonly name = "FeatureDisabledError";
}

export class RateLimitExceededError extends Error {
  override readonly name = "RateLimitExceededError";

  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}
