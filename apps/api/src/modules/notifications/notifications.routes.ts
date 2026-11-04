import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db.js';
import { auth } from '../../lib/context.js';
import { now } from '../../lib/clock.js';
import { notFound } from '../../lib/errors.js';
import { idParam, parse } from '../../lib/validate.js';

export const notificationsRouter = Router();

const listQuery = z.object({ 'filter[unread]': z.enum(['true', 'false']).optional() });

notificationsRouter.get('/notifications', async (req, res) => {
  const a = auth(req);
  const q = parse(listQuery, req.query);
  const rows = await db().notification.findMany({
    where: { recipient_user_id: a.userId, ...(q['filter[unread]'] === 'true' ? { is_read: false } : {}) },
    orderBy: { created_at: 'desc' },
    take: 100,
  });
  res.json({
    data: rows.map((n) => ({
      id: n.id,
      event_type: n.event_type,
      title_ar: n.title_ar,
      body_ar: n.body_ar,
      entity_type: n.entity_type,
      entity_id: n.entity_id,
      link_path: n.link_path,
      is_read: n.is_read,
      created_at: n.created_at.toISOString(),
    })),
  });
});

notificationsRouter.get('/notifications/unread-count', async (req, res) => {
  const count = await db().notification.count({ where: { recipient_user_id: auth(req).userId, is_read: false } });
  res.json({ count });
});

notificationsRouter.post('/notifications/read-all', async (req, res) => {
  await db().notification.updateMany({
    where: { recipient_user_id: auth(req).userId, is_read: false },
    data: { is_read: true, read_at: now() },
  });
  res.status(204).end();
});

notificationsRouter.post('/notifications/:id/read', async (req, res) => {
  const r = await db().notification.updateMany({
    where: { id: idParam(req.params.id), recipient_user_id: auth(req).userId },
    data: { is_read: true, read_at: now() },
  });
  if (r.count === 0) throw notFound();
  res.status(204).end();
});
