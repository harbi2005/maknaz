import { SIMULATION_NOTICE_AR } from '@maknaz/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { db, lockRow, transaction } from '../../db.js';
import { auth, requireActiveOrg, requireOrg } from '../../lib/context.js';
import { addHours, now } from '../../lib/clock.js';
import { idempotent } from '../../lib/idempotency.js';
import { AppError, notFound } from '../../lib/errors.js';
import { nextReference } from '../../lib/references.js';
import { money, qty } from '../../lib/serialize.js';
import { idParam, parse } from '../../lib/validate.js';
import { actorFromRequest, audit } from '../audit/audit.js';
import { notifyOrgs } from '../notifications/notify.js';
import { policyById } from '../policy/policy.js';
import { scheduleDeadline, skipDeadlines } from '../scheduler/deadlines.js';
import { shipmentEvent } from '../trading/deals.service.js';

export const billingRouter = Router();

const INVOICE_INCLUDE = { items: { orderBy: { created_at: 'asc' as const } }, payments: true, refunds: true, deal: true } satisfies Prisma.InvoiceInclude;
type InvoiceFull = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

function invoiceDto(i: InvoiceFull, viewerOrgId: string | null) {
  const paid = i.payments.filter((p) => p.status === 'COMPLETED').reduce((s, p) => s + p.amount_halalas, 0n);
  const refunded = i.refunds.reduce((s, r) => s + r.amount_halalas, 0n);
  const adjustments = i.items.filter((x) => x.item_type === 'ADJUSTMENT');
  const unpaidAdjustment = adjustments.find((x) => x.line_total_halalas > 0n && !i.payments.some((p) => p.invoice_item_id === x.id && p.status === 'COMPLETED'));
  return {
    id: i.id,
    reference: i.reference,
    deal: { id: i.deal_id, reference: i.deal.reference, status: i.deal.status },
    parties: i.snapshot,
    items: i.items.map((x) => ({
      id: x.id,
      item_type: x.item_type,
      description_ar: x.description_ar,
      quantity: x.quantity ? qty(x.quantity) : null,
      unit_amount: x.unit_amount_halalas != null ? money(x.unit_amount_halalas) : null,
      line_total: money(x.line_total_halalas),
    })),
    material_total: money(i.material_total_halalas),
    transport_total: money(i.transport_total_halalas),
    additional_charges: money(i.additional_charges_halalas),
    grand_total: money(i.grand_total_halalas),
    adjustments_total: money(adjustments.reduce((s, x) => s + x.line_total_halalas, 0n)),
    paid_total: money(paid),
    refunded_total: money(refunded),
    payment_status: i.payment_status,
    issued_at: i.issued_at.toISOString(),
    payment_deadline_at: i.payment_deadline_at.toISOString(),
    payments: i.payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      amount: money(p.amount_halalas),
      status: p.status,
      simulated_reference: p.simulated_reference,
      created_at: p.created_at.toISOString(),
      is_simulated: true,
    })),
    refunds: i.refunds.map((r) => ({
      id: r.id,
      amount: money(r.amount_halalas),
      status: r.status,
      source_type: r.source_type,
      reason: r.reason,
      simulated_reference: r.simulated_reference,
      initiated_at: r.initiated_at.toISOString(),
      completed_at: r.completed_at?.toISOString() ?? null,
      is_simulated: true,
    })),
    pending_adjustment: unpaidAdjustment ? { invoice_item_id: unpaidAdjustment.id, amount: money(unpaidAdjustment.line_total_halalas) } : null,
    can_pay: viewerOrgId === i.buyer_org_id && i.deal.status === 'AWAITING_PAYMENT' && i.payment_status === 'PAYMENT_PENDING' && i.payment_deadline_at > now(),
    is_simulated: true,
    simulation_label: i.simulation_label,
    tax_note: 'لا تمثل فاتورة ضريبية ولا تُحتسب فيها ضريبة.',
  };
}

async function loadInvoice(req: Request, id: string) {
  const a = auth(req);
  const i = await db().invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  if (!i) throw notFound();
  // P-50 / SEC-14: the three parties (carrier: the one on the invoice) and the admin only.
  const party = a.isPlatformAdmin || [i.buyer_org_id, i.mine_org_id, i.carrier_org_id].includes(a.org?.id ?? '');
  if (!party) throw notFound();
  return { i, a };
}

billingRouter.get('/invoices', async (req, res) => {
  const org = requireOrg(req);
  const where: Prisma.InvoiceWhereInput =
    org.type === 'FACTORY' ? { buyer_org_id: org.id } : org.type === 'MINE' ? { mine_org_id: org.id } : { carrier_org_id: org.id };
  const rows = await db().invoice.findMany({ where, include: INVOICE_INCLUDE, orderBy: { issued_at: 'desc' }, take: 200 });
  res.json({ data: rows.map((i) => invoiceDto(i, org.id)) });
});

billingRouter.get('/invoices/:id', async (req, res) => {
  const { i, a } = await loadInvoice(req, idParam(req.params.id));
  res.json(invoiceDto(i, a.org?.id ?? null));
});

billingRouter.get('/invoices/:id/simulated-payments', async (req, res) => {
  const { i, a } = await loadInvoice(req, idParam(req.params.id));
  if (a.org?.type === 'CARRIER') throw notFound();
  res.json({ data: invoiceDto(i, a.org?.id ?? null).payments });
});

billingRouter.get('/deals/:id/refunds', async (req, res) => {
  const a = auth(req);
  const deal = await db().deal.findUnique({ where: { id: idParam(req.params.id) }, include: { invoice: { include: { refunds: true } } } });
  if (!deal || (!a.isPlatformAdmin && a.org?.id !== deal.factory_org_id && a.org?.id !== deal.mine_org_id)) throw notFound();
  res.json({
    data: (deal.invoice?.refunds ?? []).map((r) => ({
      id: r.id,
      amount: money(r.amount_halalas),
      status: r.status,
      source_type: r.source_type,
      reason: r.reason,
      simulated_reference: r.simulated_reference,
      is_simulated: true,
    })),
  });
});

const payBody = z.object({
  kind: z.enum(['PRIMARY', 'ADJUSTMENT']).default('PRIMARY'),
  invoice_item_id: z.uuid().optional(),
});

/**
 * P-52 / BR-041..043: simulated payment. No money moves. Lock order deal → invoice
 * (TRANSACTION_STATE_MACHINE §6) settles the race with the payment-deadline job.
 * Any amount sent by the client is ignored; the amount comes from the invoice (SEC-06).
 */
billingRouter.post('/invoices/:id/simulated-payments', idempotent(async (req) => {
  const org = requireActiveOrg(req, 'FACTORY');
  const id = idParam(req.params.id);
  const input = parse(payBody, req.body);
  const key = req.get('idempotency-key')!;
  const paymentId = await transaction(async (tx) => {
    const peek = await tx.invoice.findUnique({ where: { id } });
    if (!peek || peek.buyer_org_id !== org.id) throw notFound();
    await lockRow(tx, 'deals', peek.deal_id);
    await lockRow(tx, 'invoices', id);
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { deal: { include: { shipment: true } }, payments: true, items: true } });
    const deal = invoice.deal;
    const actor = actorFromRequest(req);

    if (input.kind === 'ADJUSTMENT') {
      const item = invoice.items.find((x) => x.id === input.invoice_item_id && x.item_type === 'ADJUSTMENT' && x.line_total_halalas > 0n);
      if (!item) throw notFound();
      if (invoice.payments.some((p) => p.invoice_item_id === item.id && p.status === 'COMPLETED')) {
        throw new AppError(409, 'ALREADY_PAID', 'دُفع فرق السعر من قبل.');
      }
      const p = await tx.simulatedPayment.create({
        data: {
          invoice_id: id,
          invoice_item_id: item.id,
          kind: 'ADJUSTMENT',
          amount_halalas: item.line_total_halalas,
          status: 'COMPLETED',
          idempotency_key: key,
          paid_by_user_id: auth(req).userId,
          simulated_reference: await nextReference(tx, 'SIM-PAY'),
        },
      });
      await audit(tx, actor, { action: 'SIMULATED_ADJUSTMENT_PAYMENT', entityType: 'INVOICE', entityId: id, after: { payment_id: p.id, amount_halalas: p.amount_halalas } });
      return p.id;
    }

    if (deal.status === 'PENDING_CARRIER' || deal.status === 'PENDING_CARRIER_RETRY') {
      throw new AppError(409, 'THREE_PARTY_CONFIRMATION_REQUIRED', 'لا دفع قبل اكتمال تأكيد الأطراف الثلاثة.');
    }
    if (invoice.payment_status !== 'PAYMENT_PENDING' || ['PAID', 'IN_FULFILLMENT', 'COMPLETED'].includes(deal.status)) {
      if (invoice.payment_status === 'PAYMENT_EXPIRED') throw new AppError(409, 'PAYMENT_EXPIRED', 'انتهت مهلة الدفع وأُلغيت الصفقة.');
      throw new AppError(409, 'ALREADY_PAID', 'دُفعت هذه الفاتورة بالفعل.');
    }
    if (deal.status !== 'AWAITING_PAYMENT') throw new AppError(409, 'INVALID_STATE', 'لا تسمح حالة الصفقة بالدفع.');
    if (now() >= invoice.payment_deadline_at) throw new AppError(409, 'PAYMENT_EXPIRED', 'انتهت مهلة الدفع.');

    const p = await tx.simulatedPayment.create({
      data: {
        invoice_id: id,
        kind: 'PRIMARY',
        amount_halalas: invoice.grand_total_halalas,
        status: 'COMPLETED',
        idempotency_key: key,
        paid_by_user_id: auth(req).userId,
        simulated_reference: await nextReference(tx, 'SIM-PAY'),
      },
    });
    const policy = await policyById(tx, deal.policy_version_id);
    const shipment = deal.shipment!;
    const pickupDeadline = shipment.planned_pickup_at!;
    await tx.invoice.update({ where: { id }, data: { payment_status: 'SIMULATED_PAYMENT_COMPLETED' } });
    await tx.deal.update({ where: { id: deal.id }, data: { status: 'PAID', paid_at: now(), version: { increment: 1 } } });
    // BR-052: after payment the pickup deadline is the selected quote's proposed pickup time.
    await tx.shipment.update({
      where: { id: shipment.id },
      data: { status: 'SCHEDULED', pickup_deadline_at: pickupDeadline, original_pickup_deadline_at: pickupDeadline, version: { increment: 1 } },
    });
    await shipmentEvent(tx, shipment.id, shipment.status, 'SCHEDULED', actor, 'اكتمل الدفع المحاكى وجُدولت الشحنة');
    await skipDeadlines(tx, 'DEAL', deal.id, ['PAYMENT', 'PAYMENT_REMINDER'], 'paid');
    await scheduleDeadline(tx, 'SHIPMENT', shipment.id, 'PICKUP_DEADLINE', addHours(pickupDeadline, policy.pickup_grace_period_hours));
    await audit(tx, actor, {
      action: 'SIMULATED_PAYMENT_COMPLETED',
      entityType: 'INVOICE',
      entityId: id,
      before: { payment_status: 'PAYMENT_PENDING', deal_status: deal.status },
      after: { payment_status: 'SIMULATED_PAYMENT_COMPLETED', deal_status: 'PAID', payment_id: p.id, amount_halalas: p.amount_halalas },
    });
    await notifyOrgs(tx, [deal.factory_org_id, deal.mine_org_id, shipment.carrier_org_id], {
      eventType: 'PAYMENT_COMPLETED',
      titleAr: `اكتمل الدفع المحاكى ${deal.reference}`,
      bodyAr: `جُدولت الشحنة. موعد الاستلام ${pickupDeadline.toISOString()}. ${SIMULATION_NOTICE_AR}`,
      entityType: 'DEAL',
      entityId: deal.id,
      linkPath: `/deals/${deal.id}`,
    });
    return p.id;
  });
  const payment = await db().simulatedPayment.findUniqueOrThrow({ where: { id: paymentId } });
  const inv = await db().invoice.findUniqueOrThrow({ where: { id }, include: { deal: { include: { shipment: true } } } });
  return {
    status: 201,
    body: {
      payment: {
        id: payment.id,
        kind: payment.kind,
        simulated_reference: payment.simulated_reference,
        status: payment.status,
        amount: money(payment.amount_halalas),
        is_simulated: true,
      },
      invoice: { id: inv.id, payment_status: inv.payment_status },
      deal: { id: inv.deal_id, status: inv.deal.status },
      shipment: { id: inv.deal.shipment!.id, status: inv.deal.shipment!.status, pickup_deadline_at: inv.deal.shipment!.pickup_deadline_at?.toISOString() ?? null },
      notice_ar: SIMULATION_NOTICE_AR,
    },
  };
}));
