import { db } from '../db.js';
import { ensurePolicyV1 } from '../modules/policy/policy.js';

/** Reference data required by every environment (DATABASE_DESIGN §5). Idempotent. */
export async function ensureReferenceData(): Promise<void> {
  const modes = [
    { code: 'ROAD', name_ar: 'بري', name_en: 'Road', is_enabled: true },
    // OD-16: modelled but disabled in the MVP.
    { code: 'RAIL', name_ar: 'سكك حديدية', name_en: 'Rail', is_enabled: false },
    { code: 'SEA', name_ar: 'بحري', name_en: 'Sea', is_enabled: false },
    { code: 'MULTIMODAL', name_ar: 'متعدد الأنماط', name_en: 'Multimodal', is_enabled: false },
  ];
  for (const m of modes) await db().transportationMode.upsert({ where: { code: m.code }, create: m, update: {} });

  const vehicles = [
    { code: 'DUMP_TRUCK', mode_code: 'ROAD', name_ar: 'قلاب', name_en: 'Dump truck' },
    { code: 'BULK_TRAILER', mode_code: 'ROAD', name_ar: 'مقطورة سائبة', name_en: 'Bulk trailer' },
    { code: 'FLATBED', mode_code: 'ROAD', name_ar: 'سطحة', name_en: 'Flatbed' },
    { code: 'CONTAINER_TRUCK', mode_code: 'ROAD', name_ar: 'شاحنة حاويات', name_en: 'Container truck' },
    { code: 'SPECIALIZED_INDUSTRIAL', mode_code: 'ROAD', name_ar: 'مركبة صناعية متخصصة', name_en: 'Specialized industrial' },
    { code: 'RAIL_WAGON', mode_code: 'RAIL', name_ar: 'عربة قطار', name_en: 'Rail wagon' },
    { code: 'BULK_VESSEL', mode_code: 'SEA', name_ar: 'سفينة بضائع سائبة', name_en: 'Bulk vessel' },
  ];
  for (const v of vehicles) await db().vehicleType.upsert({ where: { code: v.code }, create: v, update: {} });

  // Generic categories without company names (DATABASE_DESIGN §5, data/templates/material_categories.csv).
  const categories = [
    { code: 'SLAG', name_ar: 'خبث', name_en: 'Slag', cargo_class: 'BULK_SOLID' },
    { code: 'TAILINGS', name_ar: 'مخلفات معالجة (Tailings)', name_en: 'Tailings', cargo_class: 'SLURRY' },
    { code: 'WASTE_ROCK', name_ar: 'صخور مستبعدة', name_en: 'Waste rock', cargo_class: 'BULK_SOLID' },
    { code: 'QUARRY_FINES', name_ar: 'نواعم المحاجر', name_en: 'Quarry fines', cargo_class: 'FINE_POWDER' },
    { code: 'OVERBURDEN', name_ar: 'طبقات غطائية', name_en: 'Overburden', cargo_class: 'BULK_SOLID' },
  ];
  for (const c of categories) await db().materialCategory.upsert({ where: { code: c.code }, create: c, update: {} });

  await ensurePolicyV1();
}
