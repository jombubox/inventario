import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { auditLogs, user } from "@/db/schema";
import type { AuditListQuery } from "@/validators/admin-query";

export async function listAuditLogs(db: Database, query: AuditListQuery) {
  const conditions: SQL[] = [];
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(or(ilike(auditLogs.action, pattern), ilike(auditLogs.entityType, pattern), sql`${auditLogs.entityId}::text ilike ${pattern}`, ilike(user.name, pattern), ilike(user.email, pattern))!);
  }
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  if (query.userId) conditions.push(eq(auditLogs.userId, query.userId));
  if (query.from) conditions.push(sql`${auditLogs.createdAt} >= (${query.from}::date::timestamp at time zone 'America/Mexico_City')`);
  if (query.to) conditions.push(sql`${auditLogs.createdAt} < ((${query.to}::date + 1)::timestamp at time zone 'America/Mexico_City')`);
  const where = conditions.length ? and(...conditions) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const [rows, totalResult, users] = await Promise.all([
    db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, before: auditLogs.before, after: auditLogs.after, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, userName: user.name, userEmail: user.email }).from(auditLogs).leftJoin(user, eq(auditLogs.userId, user.id)).where(where).orderBy(desc(auditLogs.createdAt)).limit(query.pageSize).offset(offset),
    db.select({ value: count() }).from(auditLogs).leftJoin(user, eq(auditLogs.userId, user.id)).where(where),
    db.select({ id: user.id, name: user.name, email: user.email }).from(user).orderBy(asc(user.name)),
  ]);
  const total = totalResult[0]?.value ?? 0;
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / query.pageSize)), users };
}
