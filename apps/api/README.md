# apps/api — الخادم

Node.js 22 + Express 5 + Zod + Prisma 7 + PostgreSQL 16 ([ADR-015](../../docs/03-architecture/TECHNICAL_DECISIONS.md#adr-015--typescript-كاملًا-يحسم-od-18)). الأساس `/api/v1`، والعقود في [API_SPECIFICATION](../../docs/03-architecture/API_SPECIFICATION.md).

## التشغيل

```bash
cp .env.example .env        # قيم محلية؛ الملف غير متتبع في Git
npm run db:start            # PostgreSQL 16 محلي في var/pgdata (أو أي PostgreSQL 16 عبر DATABASE_URL)
npm run db:migrate          # تطبيق الترحيلات
npm run db:seed             # المرجعيات + السياسة v1 + حساب الإدارة + بيانات عرض موسومة «تجريبي»
npm run dev                 # http://localhost:4000 مع معالج المهل كل دقيقة
npm test                    # اختبارات على قاعدة PostgreSQL حقيقية (TEST_DATABASE_URL)
```

## الوحدات (`src/modules`)

| الوحدة | المسؤولية |
|---|---|
| `accounts` | التسجيل والدخول بجلسة `HttpOnly` + CSRF، الجهات، الأعضاء، التراخيص المصرّحة |
| `sites` | المناجم، مواقع المصانع، المواقع التشغيلية للناقلين |
| `catalog` | الفئات، العروض، المواصفات الموسومة، الوثائق بروابط موقعة (5 دقائق) |
| `trading` | عروض الشراء، جولة مقابلة واحدة، الحجز الذري، الصفقات والإلغاء |
| `carriers` | الخدمات، مناطق الخدمة، قواعد التسعير بإصدارات، الفرص |
| `pricing` | حاسبة نقية بلا آثار جانبية (`engine.ts`) |
| `matching` | الأهلية BR-031 والنطاقات B1–B4 بالمسافة المباشرة |
| `logistics` | عروض النقل، التأكيد الثلاثي، الشحنات، التمديد وإعادة التأكيد وإعادة الإسناد |
| `billing` | الفاتورة والدفع والاسترجاع **بالمحاكاة فقط** |
| `scheduler` | المهل كصفوف في قاعدة البيانات، `SKIP LOCKED`، catch-up |
| `notifications` | إشعارات داخل التطبيق تُكتب في معاملة الانتقال |
| `audit` | سجل تدقيق إلحاقي (trigger يمنع التعديل والحذف) |
| `policy` | قراءة إصدار السياسة الزمنية الساري |
| `admin` | الاعتماد والتعليق والإشراف |

## قواعد ملزمة

- الوصول بين الوحدات عبر دوال الخدمة؛ كل انتقال حالة في معاملة مع تحديث مشروط أو قفل صف، وترتيب الأقفال: صفقة ← شحنة ← فاتورة ← مادة.
- المال بالهللة (`bigint`)، الكميات `numeric(12,3)`، الوقت UTC، المعرفات UUIDv7.
- لا ثوابت مهل في الكود؛ تُقرأ من `system_policy_versions` المحفوظ مع كل صفقة.
- قيود CHECK والفهارس الجزئية وقيود عدم التعديل في `prisma/migrations/*_domain_constraints`.
- الأسرار في متغيرات البيئة فقط ([`.env.example`](.env.example)).
