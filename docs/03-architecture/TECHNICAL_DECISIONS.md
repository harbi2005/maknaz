# سجل القرارات التقنية (ADR)

[← فهرس الوثائق](../README.md)

> كل قرار بحالة: **Accepted** (معتمد أو تابع لقرار عمل معتمد) · **Proposed** (توصية هندسية بانتظار اعتماد قائد الفريق) · **Superseded**. القرارات المفتوحة على مستوى العمل في [OPEN_DECISIONS.md](../08-planning/OPEN_DECISIONS.md). قرار جديد = قسم جديد برقم تسلسلي، ولا يُحذف قرار سابق بل يُعلَّم Superseded.

| ADR | القرار | الحالة | مرتبط بـ |
|---|---|---|---|
| ADR-001 | Modular Monolith | Proposed | ARCHITECTURE §1 |
| ADR-002 | PostgreSQL مرجعًا للبيانات | Proposed | DATABASE §1 |
| ADR-003 | Django + DRF للخلفية، Next.js للواجهة | Superseded بـ ADR-015 | ARCHITECTURE §7 |
| ADR-004 | المال بالهللة كأعداد صحيحة | Accepted | NFR-022 |
| ADR-005 | UTC للتخزين وAsia/Riyadh للعرض | Accepted | BR-070 |
| ADR-006 | المهل صفوف في قاعدة البيانات ومعالج دوري | Proposed | BR-073 |
| ADR-007 | الحجز الذري بتحديث مشروط | Accepted (يتبع BR-028) | DATABASE §4.1 |
| ADR-008 | Idempotency-Key للإجراءات الحرجة | Accepted | NFR-045 |
| ADR-009 | لقطات ثابتة للتسعير والصفقة والفاتورة | Accepted | BR-078 |
| ADR-010 | سياسات زمنية بإصدارات دون واجهة تعديل في MVP | Accepted | BR-074, BR-075 |
| ADR-011 | Haversine دون PostGIS ودون خدمة توجيه في MVP | Proposed (OD-10) | ARCHITECTURE §6 |
| ADR-012 | UUIDv7 للمعرفات | Proposed | SEC-16 |
| ADR-013 | IBM Plex Sans Arabic للواجهة والوثائق التقنية | Proposed | UI_UX §1.1 |
| ADR-014 | CI للوثائق فقط حتى اعتماد التقنيات | Superseded بـ ADR-016 | .github/workflows |
| ADR-015 | TypeScript كاملًا: React + Vite، وExpress + Prisma + PostgreSQL 16 | Accepted (يحسم OD-18) | ARCHITECTURE §7 |
| ADR-016 | CI لاختبارات التطبيق بجانب فحص الوثائق، دون نشر آلي | Accepted | .github/workflows |

---

## ADR-001 — Modular Monolith
**السياق:** فريق بمهندس واحد، نسخة أولى قصيرة، معاملات تمتد عبر الحجز والتأكيد الثلاثي والدفع. **القرار:** تطبيق خلفي واحد بوحدات نطاق ذات حدود صريحة وقاعدة بيانات واحدة. **العواقب:** ذرية بسيطة وتشغيل منخفض الكلفة؛ يتطلب انضباطًا في حدود الوحدات (الوصول عبر دوال الخدمة) لتسهيل الفصل لاحقًا.

## ADR-002 — PostgreSQL
**القرار:** PostgreSQL 16. **السبب:** قيود CHECK وEXCLUDE وفهارس فريدة جزئية و`SELECT … FOR UPDATE SKIP LOCKED` وjsonb للقطات. **العواقب:** الاختبارات تعمل على PostgreSQL حقيقي لا SQLite.

## ADR-003 — Django + DRF و Next.js
**القرار المقترح:** Django 5 + DRF، Procrastinate أو cron للمهام، Next.js + TypeScript + Tailwind للواجهة. **السبب:** لوحة إدارة جاهزة تقلل العمل على مهندس واحد، ORM يدعم القيود والأقفال. **البديل:** NestJS + Prisma مع SQL يدوي للقيود الجزئية. **المحدد:** خبرة مهندس البرمجيات (OD-18). **العواقب عند الاعتماد:** إضافة workflow اختبارات التطبيق في CI.

## ADR-004 — المال بالهللة
`bigint` بالهللة، الحساب بـ Decimal، تقريب ROUND_HALF_UP لكل سطر. لا `float` في أي مسار مالي.

## ADR-005 — الوقت
`timestamptz` UTC، العرض `Asia/Riyadh` مع ذكر المنطقة، الساعة قابلة للحقن في الاختبارات.

## ADR-006 — المهل
جدول `scheduled_deadlines` بمفتاح فريد ومعالج كل دقيقة بـ `SKIP LOCKED` وتحديث مشروط بالحالة؛ catch-up عند إعادة التشغيل. **السبب:** لا تضيع المهل ولا تتكرر، ولا حاجة لخدمة طوابير إضافية.

## ADR-007 — الحجز الذري
تحديث مشروط واحد `WHERE total - reserved - sold >= :qty` داخل معاملة القبول، مع قيد CHECK كحارس أخير.

## ADR-008 — Idempotency
جدول `idempotency_records (user_id, endpoint, key)` بحفظ 24 ساعة، وتجزئة الطلب لكشف إعادة استخدام المفتاح بجسم مختلف.

## ADR-009 — اللقطات
`deals.commercial_snapshot`، `transport_quotes.pricing_snapshot`، `invoices.snapshot` غير قابلة للتعديل (طبقة الخدمة + triggers). أي تغيير لاحق = بند تسوية جديد.

## ADR-010 — السياسات الزمنية
`system_policy_versions` بإصدار نشط واحد؛ كل صفقة تحفظ `policy_version_id`. التعديل في MVP عبر ترحيل بيانات فقط. واجهة الإدارة لاحقًا تكتب إصدارًا جديدًا دون تغيير منطق الانتقالات.

## ADR-011 — المسافات
Haversine في SQL مع مربع إحداثي، والمسافة موسومة «مباشرة تقريبية». مسافة المسار يؤكدها الناقل. PostGIS وOSRM لاحقًا.

## ADR-012 — المعرفات
UUIDv7 مولدة في التطبيق: ترتيب زمني للفهرسة، ولا تعداد.

## ADR-013 — الخط
IBM Plex Sans Arabic (OFL) للواجهة والوثائق لوضوح الجداول والأرقام، Tajawal للمواد التسويقية، والخطوط مضمنة في `brand/fonts/` مع تراخيصها.

## ADR-014 — CI
**السياق:** لا كود تطبيق والتقنيات غير معتمدة. **القرار:** workflow واحد يتحقق من الوثائق (الروابط، المراسي، المخططات، الأسرار). **ممنوع:** أي نشر آلي دون اعتماد صريح.

## ADR-015 — TypeScript كاملًا (يحسم OD-18)
**السياق:** ADR-003 كان مقترحًا بانتظار خبرة الفريق، ونص على بديل NestJS + Prisma إن كانت الخبرة في TypeScript أعمق. وجّه قائد الفريق ببناء النسخة الأولى بـ React وTypeScript. **القرار:** الواجهة React 19 + Vite + Tailwind CSS 4 + React Router؛ الخلفية Node.js 22 + Express 5 + Zod؛ قاعدة البيانات PostgreSQL 16 عبر Prisma 7 مع ترحيلات SQL يدوية للقيود التي لا يعبر عنها Prisma (CHECK، الفهارس الجزئية، EXCLUDE، triggers)؛ الاختبارات Vitest وPlaywright؛ حزمة `packages/shared` للأنواع ومخططات التحقق المشتركة؛ npm Workspaces. **العواقب:** لغة واحدة للفريق ومخططات تحقق مشتركة بين الواجهة والخادم؛ لا لوحة إدارة جاهزة فبُنيت شاشات الإدارة؛ الجلسة بملف تعريف `HttpOnly` + رمز CSRF كما في API_SPECIFICATION §1؛ ADR-001/002/004–013 تبقى سارية دون تغيير. **التطوير المحلي:** خادم PostgreSQL 16 مضمن (`embedded-postgres`) للأجهزة بلا Docker، وأي PostgreSQL 16 آخر يعمل بتغيير `DATABASE_URL`.

## ADR-016 — CI للتطبيق
**القرار:** workflow `app-tests.yml` يشغل فحص الأنواع واختبارات الوحدة والتكامل على PostgreSQL 16 حقيقي (خدمة في GitHub Actions) وبناء الواجهة، بجانب `docs-validation.yml`. **ممنوع:** أي نشر آلي دون اعتماد صريح (يبقى من ADR-014).
