import "server-only";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function databaseUserIdForActor(actorId: string): string | null {
  return UUID_PATTERN.test(actorId) ? actorId : null;
}
