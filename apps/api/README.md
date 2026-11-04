# apps/api — الخادم

> ⛔ لم يبدأ التنفيذ. هذا الملف يثبّت حدود الوحدات المتفق عليها حتى يبدأ البناء عليها مباشرة.

**التقنية المقترحة (REC، بانتظار OD-18):** Django 5 + Django REST Framework + PostgreSQL 16، ومعالج مهل دوري (Procrastinate أو cron) — [ADR-003](../../docs/03-architecture/TECHNICAL_DECISIONS.md#adr-003--django--drf-و-nextjs).

## الوحدات المخططة

| الوحدة | المسؤولية |
|---|---|
| `accounts` | المستخدمون، الجهات، العضوية، التراخيص المصرّحة، المصادقة |
| `sites` | المناجم ومواقع المصانع |
| `catalog` | فئات المواد، العروض، المواصفات الموسومة، الوثائق، المخزون |
| `trading` | عروض الشراء، جولات التفاوض، الصفقات، الحجز الذري |
| `carriers` | ملف الناقل، المواقع التشغيلية، مناطق الخدمة، الخدمات |
| `pricing` | قواعد التسعير وإصداراتها، والحاسبة النقية |
| `matching` | الأهلية، المسافة المباشرة، النطاقات B1–B4 |
| `logistics` | عروض النقل، الشحنات، التمديدات، الأحداث |
| `billing` | الفاتورة والدفع والاسترجاع المحاكاة |
| `scheduler` | المهل والإلغاء التلقائي |
| `notifications` | إشعارات داخلية وصندوق بريد صادر |
| `audit` | سجل تدقيق إلحاقي فقط |
| `policy` | قراءة إصدار السياسة الزمنية الساري |
| `admin` | الاعتمادات والإشراف |

## قواعد ملزمة عند البدء

- الوصول بين الوحدات عبر دوال الخدمة لا عبر الجداول مباشرة.
- المال بالهللة (`bigint`)، الوقت UTC، المعرفات UUIDv7.
- لا ثوابت مهل في الكود؛ تُقرأ من `policy`.
- الاختبارات على PostgreSQL حقيقي.
- الإعدادات من متغيرات البيئة (انظر [`.env.example`](../../.env.example)).

المراجع: [DATABASE_DESIGN](../../docs/03-architecture/DATABASE_DESIGN.md) · [API_SPECIFICATION](../../docs/03-architecture/API_SPECIFICATION.md) · [TRANSACTION_STATE_MACHINE](../../docs/03-architecture/TRANSACTION_STATE_MACHINE.md) · [RBAC_MATRIX](../../docs/03-architecture/RBAC_MATRIX.md)
