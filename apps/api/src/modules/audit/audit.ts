import type { Request } from 'express';
import type { Tx } from '../../db.js';
import { now } from '../../lib/clock.js';
import { jsonSafe } from '../../lib/serialize.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export interface Actor {
  type: 'USER' | 'SYSTEM' | 'ADMIN';
  userId: string | null;
  orgId: string | null;
  requestId?: string | null;
  ip?: string | null;
  jobId?: string | null;
}

export function actorFromRequest(req: Request): Actor {
  const a = req.auth;
  return {
    type: a?.isPlatformAdmin ? 'ADMIN' : 'USER',
    userId: a?.userId ?? null,
    orgId: a?.org?.id ?? null,
    requestId: req.requestId,
    ip: req.ip ?? null,
  };
}

export const systemActor = (jobId: string | null = null): Actor => ({ type: 'SYSTEM', userId: null, orgId: null, jobId });

/** BR-080/081: append-only audit entry, written inside the caller's transaction. */
export async function audit(tx: Tx, actor: Actor, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      occurred_at: now(),
      actor_type: actor.type,
      actor_user_id: actor.userId,
      actor_org_id: actor.orgId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      before: entry.before === undefined ? undefined : jsonSafe(entry.before),
      after: entry.after === undefined ? undefined : jsonSafe(entry.after),
      request_id: actor.requestId ?? null,
      ip: actor.ip ?? null,
      job_id: actor.jobId ?? null,
    },
  });
}
