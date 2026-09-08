export class UnauthorizedError extends Error {
  override readonly name = "UnauthorizedError";
}

export class ForbiddenError extends Error {
  override readonly name = "ForbiddenError";
}
