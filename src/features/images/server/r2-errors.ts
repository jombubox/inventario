import "server-only";

export class R2ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2ConfigurationError";
  }
}

export class R2StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2StorageError";
  }
}
