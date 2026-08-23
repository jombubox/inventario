import "server-only";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { session, user } from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { LastActiveAdminError } from "@/features/auth/domain/auth-errors";
import { assertPermission, type UserRole } from "@/features/auth/domain/permissions";
import type { AuthenticatedUser } from "@/features/auth/server/authorization";
import { EntityNotFoundError } from "@/features/shared/domain/service-errors";
import type { createUserInputSchema } from "@/validators/auth";
import type { z } from "zod";

type AuthInstance = (typeof import("@/lib/auth"))["auth"];

async function assertAdminCanLoseAccess(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  target: { role: string; active: boolean },
): Promise<void> {
  if (target.role !== "ADMIN" || !target.active) return;

  const activeAdmins = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "ADMIN"), eq(user.active, true)))
    .for("update");
  if (activeAdmins.length <= 1) {
    throw new LastActiveAdminError("JombuBox must keep at least one active ADMIN.");
  }
}

export async function createAdministrativeUser(
  db: Database,
  actor: AuthenticatedUser,
  input: z.infer<typeof createUserInputSchema>,
  authInstance?: AuthInstance,
) {
  assertPermission(actor.role, "USER_MANAGE");
  const serviceAuth = authInstance ?? (await import("@/lib/auth")).auth;
  const result = await serviceAuth.api.createUser({ body: input });
  const created = await db.query.user.findFirst({
    where: eq(user.id, result.user.id),
  });
  if (!created) throw new Error("Created user could not be loaded.");

  await createAuditLog(db, {
    userId: actor.id,
    action: "USER_CREATED",
    entityType: "USER",
    entityId: result.user.id,
    after: {
      name: created.name,
      email: created.email,
      role: created.role,
      active: created.active,
    },
  });

  return created;
}

export async function updateUserRole(
  db: Database,
  actor: AuthenticatedUser,
  input: { userId: string; role: UserRole },
) {
  assertPermission(actor.role, "USER_MANAGE");
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(user)
      .where(eq(user.id, input.userId))
      .for("update")
      .limit(1);
    if (!target) throw new EntityNotFoundError("User not found.");
    if (target.role === input.role) return target;
    if (input.role !== "ADMIN") await assertAdminCanLoseAccess(tx, target);

    const [updated] = await tx
      .update(user)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(user.id, input.userId))
      .returning();
    if (!updated) throw new Error("User role update did not return a row.");

    await createAuditLog(tx, {
      userId: actor.id,
      action: "USER_ROLE_CHANGED",
      entityType: "USER",
      entityId: input.userId,
      before: { role: target.role },
      after: { role: updated.role },
    });
    return updated;
  });
}

export async function deactivateUser(
  db: Database,
  actor: AuthenticatedUser,
  targetUserId: string,
) {
  assertPermission(actor.role, "USER_MANAGE");
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(user)
      .where(eq(user.id, targetUserId))
      .for("update")
      .limit(1);
    if (!target) throw new EntityNotFoundError("User not found.");
    if (!target.active) return target;
    await assertAdminCanLoseAccess(tx, target);

    const [updated] = await tx
      .update(user)
      .set({
        active: false,
        banned: true,
        banReason: "Cuenta desactivada por un administrador",
        updatedAt: new Date(),
      })
      .where(eq(user.id, targetUserId))
      .returning();
    if (!updated) throw new Error("User deactivation did not return a row.");

    await tx.delete(session).where(eq(session.userId, targetUserId));
    await createAuditLog(tx, {
      userId: actor.id,
      action: "USER_DEACTIVATED",
      entityType: "USER",
      entityId: targetUserId,
      before: { active: target.active, banned: target.banned },
      after: { active: updated.active, banned: updated.banned },
    });
    return updated;
  });
}
