/**
 * Seed: reference data, the platform admin, and (optionally) a clearly-labelled demo dataset.
 * BR-091: no real companies or real prices — every demo name says «تجريبي» and is_demo = true.
 * Run: npm run db:seed (idempotent; re-running does not duplicate rows).
 */
import { Prisma } from '../src/generated/prisma/client.js';
import { db, disconnectDb } from '../src/db.js';
import { now } from '../src/lib/clock.js';
import { hashPassword } from '../src/lib/crypto.js';
import { ensureReferenceData } from '../src/seed/reference.js';

const D = (v: string | number) => new Prisma.Decimal(v);

async function user(email: string, full_name: string, password: string, admin = false) {
  const existing = await db().user.findUnique({ where: { email } });
  if (existing) return existing;
  return db().user.create({ data: { email, full_name, password_hash: await hashPassword(password), is_platform_admin: admin } });
}

async function org(ownerId: string, data: { type: string; legal_name_ar: string; legal_name_en: string; cr: string; city: string; region: string }) {
  const existing = await db().organization.findFirst({ where: { type: data.type, commercial_registration_no: data.cr } });
  if (existing) return existing;
  const o = await db().organization.create({
    data: {
      type: data.type,
      legal_name_ar: data.legal_name_ar,
      legal_name_en: data.legal_name_en,
      commercial_registration_no: data.cr,
      city: data.city,
      region_code: data.region,
      contact_email: 'demo@example.invalid',
      contact_phone: '+966500000000',
      status: 'ACTIVE',
      reviewed_at: now(),
      is_demo: true,
    },
  });
  await db().organizationMember.create({ data: { organization_id: o.id, user_id: ownerId, role: 'OWNER' } });
  if (data.type === 'CARRIER') await db().carrierProfile.create({ data: { organization_id: o.id, fleet_size_total: 20 } });
  return o;
}

async function main() {
  await ensureReferenceData();
  console.log('✔ reference data and policy v1');

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await user(adminEmail, 'إدارة المنصة', adminPassword, true);
    console.log(`✔ platform admin ${adminEmail}`);
  } else {
    console.log('… SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: admin skipped');
  }

  if (process.env.DEMO_DATA_ENABLED !== 'true') return;
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (!demoPassword) throw new Error('SEED_DEMO_PASSWORD is required when DEMO_DATA_ENABLED=true');
  const pw: string = demoPassword;
  if (await db().organization.findFirst({ where: { is_demo: true } })) {
    console.log('… demo data already present');
    return;
  }

  // ── Mines ──────────────────────────────────────────────────────────────
  const mineUser = await user('mine@demo.maknaz.local', 'مسؤول منجم تجريبي', pw);
  const mineOrg = await org(mineUser.id, { type: 'MINE', legal_name_ar: 'شركة تعدين تجريبية أ', legal_name_en: 'Demo Mining Co. A', cr: 'DEMO-M-0001', city: 'الطائف', region: 'MAKKAH' });
  const mineA = await db().mine.create({ data: { organization_id: mineOrg.id, name: 'منجم تجريبي أ', primary_activity: 'ذهب ونحاس', region_code: 'MAKKAH', address_text: 'موقع افتراضي قرب الطائف', lat: D('21.430000'), lng: D('40.510000') } });
  const mineB = await db().mine.create({ data: { organization_id: mineOrg.id, name: 'منجم تجريبي ب', primary_activity: 'فوسفات', region_code: 'MADINAH', address_text: 'موقع افتراضي', lat: D('24.950000'), lng: D('39.900000') } });

  // ── Factories ──────────────────────────────────────────────────────────
  const factoryUser = await user('factory@demo.maknaz.local', 'مسؤول مشتريات مصنع تجريبي', pw);
  const factoryOrg = await org(factoryUser.id, { type: 'FACTORY', legal_name_ar: 'مصنع إسمنت تجريبي 1', legal_name_en: 'Demo Cement Plant 1', cr: 'DEMO-F-0001', city: 'جدة', region: 'MAKKAH' });
  await db().factorySite.create({ data: { organization_id: factoryOrg.id, name: 'مصنع جدة التجريبي', region_code: 'MAKKAH', address_text: 'منطقة صناعية افتراضية', lat: D('21.540000'), lng: D('39.170000') } });
  await db().factorySite.create({ data: { organization_id: factoryOrg.id, name: 'فرع رابغ التجريبي', region_code: 'MAKKAH', lat: D('22.800000'), lng: D('39.030000') } });

  // ── Carriers (one incompatible on purpose, data/README) ───────────────
  const regions = ['MAKKAH', 'MADINAH', 'RIYADH'];
  async function carrier(
    email: string,
    name: string,
    cr: string,
    loc: { name: string; lat: string; lng: string; region: string },
    svc: { vehicle: string; cargo: string[]; payload: string; min: string; max: string; loading: boolean },
    version: Partial<Prisma.CarrierPricingRuleVersionUncheckedCreateInput> & { pricing_model: string },
  ) {
    const u = await user(email, `مسؤول ${name}`, pw);
    const o = await org(u.id, { type: 'CARRIER', legal_name_ar: name, legal_name_en: `Demo ${cr}`, cr, city: 'جدة', region: loc.region });
    await db().carrierOperatingLocation.create({ data: { organization_id: o.id, name: loc.name, location_kind: 'FLEET_YARD', region_code: loc.region, lat: D(loc.lat), lng: D(loc.lng) } });
    await db().carrierServiceArea.createMany({ data: regions.map((r) => ({ organization_id: o.id, area_type: 'REGION', region_code: r })) });
    const service = await db().carrierService.create({
      data: {
        organization_id: o.id,
        name: 'نقل سائب بالقلابات',
        mode_code: 'ROAD',
        vehicle_type_code: svc.vehicle,
        supported_cargo_classes: svc.cargo,
        payload_tons_per_vehicle: D(svc.payload),
        vehicles_available: 12,
        min_shipment_tons: D(svc.min),
        max_shipment_tons: D(svc.max),
        includes_loading: svc.loading,
        includes_unloading: svc.loading,
      },
    });
    const rule = await db().carrierPricingRule.create({ data: { organization_id: o.id, service_id: service.id, name: 'التسعير الأساسي' } });
    await db().carrierPricingRuleVersion.create({
      data: { rule_id: rule.id, version_no: 1, valid_from: new Date('2026-11-01T00:00:00Z'), status: 'ACTIVE', activated_at: now(), ...version } as Prisma.CarrierPricingRuleVersionUncheckedCreateInput,
    });
    return o;
  }
  // Prices below are HYPOTHETICAL, matching the worked examples in LOGISTICS_PRICING_ENGINE §5.
  await carrier('carrier1@demo.maknaz.local', 'ناقل تجريبي 1', 'DEMO-C-0001', { name: 'ساحة أسطول الطائف التجريبية', lat: '21.300000', lng: '40.400000', region: 'MAKKAH' },
    { vehicle: 'DUMP_TRUCK', cargo: ['BULK_SOLID', 'FINE_POWDER'], payload: '34', min: '20', max: '5000', loading: true },
    { pricing_model: 'PER_TON_KM', rate_per_ton_km: D('0.2000'), minimum_charge_halalas: 300000n, waiting_fee_per_hour_halalas: 15000n, free_waiting_hours: D('2.0') });
  await carrier('carrier2@demo.maknaz.local', 'ناقل تجريبي 2', 'DEMO-C-0002', { name: 'ساحة أسطول جدة التجريبية', lat: '21.600000', lng: '39.300000', region: 'MAKKAH' },
    { vehicle: 'BULK_TRAILER', cargo: ['BULK_SOLID'], payload: '34', min: '50', max: '3000', loading: false },
    { pricing_model: 'PER_KM', rate_per_km: D('12.0000'), distance_basis: 'PER_TRIP', loading_fee_halalas: 270000n });
  await carrier('carrier3@demo.maknaz.local', 'ناقل تجريبي 3 (صهاريج)', 'DEMO-C-0003', { name: 'مستودع ينبع التجريبي', lat: '24.090000', lng: '38.060000', region: 'MADINAH' },
    { vehicle: 'SPECIALIZED_INDUSTRIAL', cargo: ['SLURRY'], payload: '25', min: '10', max: '800', loading: false },
    { pricing_model: 'PER_TON', rate_per_ton: D('40.0000'), minimum_charge_halalas: 3000000n });

  // ── Listings (published) ───────────────────────────────────────────────
  const cat = async (code: string) => (await db().materialCategory.findUniqueOrThrow({ where: { code } })).id;
  const l1 = await db().materialListing.create({
    data: {
      mine_id: mineA.id, organization_id: mineOrg.id, category_id: await cat('SLAG'), title: 'خبث معدني — دفعة تجريبية',
      description: 'بيانات تجريبية للعرض فقط. خبث ناتج عن عمليات صهر افتراضية.', physical_state: 'GRANULAR', total_quantity: D('2000'),
      asking_price_halalas: 4500n, loading_conditions: 'التحميل من ساحة المنجم بمعدات المنجم، من 6 صباحًا حتى 4 مساءً.', status: 'ACTIVE', published_at: now(),
    },
  });
  await db().materialSpecification.createMany({
    data: [
      { listing_id: l1.id, property_name: 'نسبة الحديد Fe', value_numeric: D('40'), unit: '%', verification_status: 'DECLARED', sort_order: 0 },
      { listing_id: l1.id, property_name: 'حجم الحبيبات', value_text: '0–25', unit: 'mm', verification_status: 'ESTIMATED', sort_order: 1 },
      { listing_id: l1.id, property_name: 'SiO2', verification_status: 'UNKNOWN', sort_order: 2 },
    ],
  });
  const l2 = await db().materialListing.create({
    data: {
      mine_id: mineA.id, organization_id: mineOrg.id, category_id: await cat('QUARRY_FINES'), title: 'نواعم محاجر — بيانات تجريبية',
      physical_state: 'POWDER', total_quantity: D('900'), asking_price_halalas: 2500n, loading_conditions: 'تحميل بالشيول، يلزم تغطية الحمولة.', status: 'ACTIVE', published_at: now(),
    },
  });
  await db().materialSpecification.create({ data: { listing_id: l2.id, property_name: 'الرطوبة', value_numeric: D('6'), unit: '%', verification_status: 'DECLARED' } });
  await db().materialListing.create({
    data: {
      mine_id: mineB.id, organization_id: mineOrg.id, category_id: await cat('TAILINGS'), title: 'مخلفات معالجة رطبة — تجريبية',
      physical_state: 'SLURRY', total_quantity: D('500'), asking_price_halalas: 1500n, loading_conditions: 'تتطلب صهاريج مخصصة.', status: 'ACTIVE', published_at: now(),
    },
  });

  // A second, pending organization so the admin approval queue is not empty.
  const pendingUser = await user('pending@demo.maknaz.local', 'مستخدم جهة قيد المراجعة', pw);
  const pending = await db().organization.create({
    data: { type: 'FACTORY', legal_name_ar: 'مصنع تجريبي قيد المراجعة', legal_name_en: 'Demo Pending Plant', commercial_registration_no: 'DEMO-F-0002', city: 'ينبع', region_code: 'MADINAH', contact_email: 'demo@example.invalid', contact_phone: '+966500000000', is_demo: true },
  });
  await db().organizationMember.create({ data: { organization_id: pending.id, user_id: pendingUser.id, role: 'OWNER' } });

  console.log('✔ demo data (password for all demo accounts = SEED_DEMO_PASSWORD)');
  console.log('  mine@demo.maknaz.local · factory@demo.maknaz.local · carrier1..3@demo.maknaz.local · pending@demo.maknaz.local');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
