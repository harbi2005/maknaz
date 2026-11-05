import { NOT_TAX_INVOICE_AR } from '@maknaz/shared';
import type { Deal, Invoice, TransportQuote } from '../../generated/prisma/client.js';
import { lockRow, type Tx } from '../../db.js';
import { addHours, now } from '../../lib/clock.js';
import { nextReference } from '../../lib/references.js';
import { audit, type Actor } from '../audit/audit.js';
import { notifyOrgs } from '../notifications/notify.js';
import type { PricingSnapshot } from '../pricing/engine.js';

/**
 * BR-040 / INVOICE_SIMULATION §1: the simulated invoice is created inside the three-party
 * confirmation transaction. One invoice per deal; amounts and snapshot are immutable.
 */
export async function createInvoiceForDeal(tx: Tx, deal: Deal, quote: TransportQuote, paymentWindowHours: number) {
  const issuedAt = now();
  const snap = quote.pricing_snapshot as unknown as PricingSnapshot;
  const orgs = await tx.organization.findMany({
    where: { id: { in: [deal.factory_org_id, deal.mine_org_id, quote.carrier_org_id] } },
  });
  const party = (id: string) => {
    const o = orgs.find((x) => x.id === id)!;
    return { id: o.id, legal_name_ar: o.legal_name_ar, legal_name_en: o.legal_name_en, commercial_registration_no: o.commercial_registration_no, city: o.city };
  };
  const commercial = deal.commercial_snapshot as { listing: { title: string }; category: { name_ar: string } };
  // Fees inside the quote total (loading/unloading/handling) are shown as their own lines;
  // the TRANSPORT line carries the rest so that line totals always sum to the quote total.
  const feeLines = snap.lines.filter((l) => ['LOADING', 'UNLOADING', 'HANDLING'].includes(l.code));
  const feesTotal = feeLines.reduce((s, l) => s + BigInt(l.amount_halalas), 0n);
  const transportTotal = quote.transport_total_halalas - feesTotal;

  const invoice = await tx.invoice.create({
    data: {
      reference: await nextReference(tx, 'INV'),
      deal_id: deal.id,
      buyer_org_id: deal.factory_org_id,
      mine_org_id: deal.mine_org_id,
      carrier_org_id: quote.carrier_org_id,
      snapshot: {
        buyer: party(deal.factory_org_id),
        mine: party(deal.mine_org_id),
        carrier: party(quote.carrier_org_id),
        material: { title: commercial.listing.title, category: commercial.category.name_ar },
        quantity_tons: deal.quantity_tons.toFixed(3),
        unit_price_halalas: Number(deal.unit_price_halalas),
        deal_reference: deal.reference,
        quote_id: quote.id,
        pricing_rule_version_id: quote.pricing_rule_version_id,
        conditional_charges: snap.conditional,
        tax_note: 'لا تُحتسب ضريبة في الفاتورة المحاكاة (OD-12).',
      },
      material_total_halalas: deal.material_total_halalas,
      transport_total_halalas: transportTotal,
      additional_charges_halalas: feesTotal,
      grand_total_halalas: deal.material_total_halalas + quote.transport_total_halalas,
      issued_at: issuedAt,
      payment_deadline_at: addHours(issuedAt, paymentWindowHours),
      simulation_label: NOT_TAX_INVOICE_AR,
    },
  });
  await tx.invoiceItem.createMany({
    data: [
      {
        invoice_id: invoice.id,
        item_type: 'MATERIAL',
        description_ar: `${commercial.listing.title}: ${deal.quantity_tons.toFixed(3)} طن`,
        quantity: deal.quantity_tons,
        unit_amount_halalas: deal.unit_price_halalas,
        line_total_halalas: deal.material_total_halalas,
      },
      {
        invoice_id: invoice.id,
        item_type: 'TRANSPORT',
        description_ar: 'النقل حسب عرض الناقل المختار',
        line_total_halalas: transportTotal,
        source_quote_id: quote.id,
      },
      ...feeLines.map((l) => ({
        invoice_id: invoice.id,
        item_type: l.code,
        description_ar: l.label_ar,
        line_total_halalas: BigInt(l.amount_halalas),
        source_quote_id: quote.id,
      })),
    ],
  });
  return invoice;
}

export type RefundSource = 'DEAL_CANCELLATION' | 'REASSIGNMENT_PRICE_DIFFERENCE';

/**
 * Simulated refund (BR-046..048). Locks the invoice, caps the amount at what remains paid,
 * and completes immediately (INITIATED → COMPLETED in the same job, recorded for audit).
 */
export async function simulatedRefund(
  tx: Tx,
  invoiceId: string,
  amountRequested: bigint | 'FULL_REMAINING',
  source: RefundSource,
  sourceId: string,
  reason: string,
  actor: Actor,
) {
  await lockRow(tx, 'invoices', invoiceId);
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true, refunds: true } });
  const paid = invoice.payments.filter((p) => p.status === 'COMPLETED').reduce((s, p) => s + p.amount_halalas, 0n);
  const refunded = invoice.refunds.reduce((s, r) => s + r.amount_halalas, 0n);
  const remaining = paid - refunded;
  const amount = amountRequested === 'FULL_REMAINING' ? remaining : amountRequested < remaining ? amountRequested : remaining;
  if (amount <= 0n) return null;
  const existing = invoice.refunds.find((r) => r.source_type === source && r.source_id === sourceId);
  if (existing) return existing;

  const at = now();
  const refund = await tx.simulatedRefund.create({
    data: {
      invoice_id: invoiceId,
      amount_halalas: amount,
      status: 'SIMULATED_REFUND_INITIATED',
      source_type: source,
      source_id: sourceId,
      reason,
      simulated_reference: await nextReference(tx, 'SIM-REF'),
      initiated_at: at,
    },
  });
  await tx.invoice.update({ where: { id: invoiceId }, data: { payment_status: 'SIMULATED_REFUND_INITIATED' } });
  await audit(tx, actor, {
    action: 'SIMULATED_REFUND_INITIATED',
    entityType: 'INVOICE',
    entityId: invoiceId,
    after: { refund_id: refund.id, amount_halalas: amount, source, reason },
  });
  const completed = await tx.simulatedRefund.update({ where: { id: refund.id }, data: { status: 'SIMULATED_REFUND_COMPLETED', completed_at: now() } });
  await tx.invoice.update({ where: { id: invoiceId }, data: { payment_status: 'SIMULATED_REFUND_COMPLETED' } });
  await audit(tx, actor, {
    action: 'SIMULATED_REFUND_COMPLETED',
    entityType: 'INVOICE',
    entityId: invoiceId,
    after: { refund_id: refund.id, amount_halalas: amount },
  });
  await notifyOrgs(tx, [invoice.buyer_org_id, invoice.mine_org_id], {
    eventType: 'SIMULATED_REFUND',
    titleAr: `استرجاع محاكى للفاتورة ${invoice.reference}`,
    bodyAr: `${reason} — عملية محاكاة، لم يتم تحويل أي أموال.`,
    entityType: 'INVOICE',
    entityId: invoiceId,
    linkPath: `/invoices/${invoiceId}`,
  });
  return completed;
}

export function invoicePaidAmount(inv: Invoice & { payments: { status: string; amount_halalas: bigint }[] }) {
  return inv.payments.filter((p) => p.status === 'COMPLETED').reduce((s, p) => s + p.amount_halalas, 0n);
}
