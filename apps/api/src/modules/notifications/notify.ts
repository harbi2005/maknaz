import type { Tx } from '../../db.js';
import { now } from '../../lib/clock.js';

export interface NotificationInput {
  eventType: string;
  titleAr: string;
  bodyAr: string;
  entityType?: string;
  entityId?: string;
  linkPath?: string;
}

/**
 * Writes in-app notifications inside the transition's transaction (outbox principle,
 * TRANSACTION_STATE_MACHINE §0.3). Organization recipients expand to their active members.
 */
export async function notifyOrgs(tx: Tx, orgIds: (string | null | undefined)[], n: NotificationInput) {
  const ids = [...new Set(orgIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  const members = await tx.organizationMember.findMany({
    where: { organization_id: { in: ids }, status: 'ACTIVE' },
    select: { user_id: true },
  });
  await notifyUsers(tx, members.map((m) => m.user_id), n);
}

export async function notifyAdmins(tx: Tx, n: NotificationInput) {
  const admins = await tx.user.findMany({ where: { is_platform_admin: true, status: 'ACTIVE' }, select: { id: true } });
  await notifyUsers(tx, admins.map((a) => a.id), n);
}

export async function notifyUsers(tx: Tx, userIds: string[], n: NotificationInput) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const created_at = now();
  await tx.notification.createMany({
    data: unique.map((uid) => ({
      recipient_user_id: uid,
      event_type: n.eventType,
      title_ar: n.titleAr,
      body_ar: n.bodyAr,
      entity_type: n.entityType ?? null,
      entity_id: n.entityId ?? null,
      link_path: n.linkPath ?? null,
      created_at,
    })),
  });
}
