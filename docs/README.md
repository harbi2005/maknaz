# فهرس وثائق مَكْنَز

[← الصفحة الرئيسية للمستودع](../README.md)

> الوثائق هي المرجع قبل الكود. ابدأ بـ **نظرة عامة ← نطاق النسخة الأولى ← SRS ← قواعد العمل**، ثم انتقل إلى ما يخص تخصصك.

## مفتاح تصنيف المعلومات

كل وثيقة تميّز بين خمس فئات، ولا تُخلط ببعضها:

| الوسم | المعنى | مثال |
|---|---|---|
| **موثّق** | معلومة من مصدر رسمي برابط وتاريخ | إحصاءات الهيئة العامة للإحصاء في [OFFICIAL_STATISTICS](../data/reference/OFFICIAL_STATISTICS.md) |
| **متطلب معتمد** | قرار منتج اعتمده الفريق | مهلة الدفع 24 ساعة، التمديد للمنجم حصرًا |
| **توصية هندسية (REC)** | اقتراح تقني بانتظار الاعتماد | Django + PostgreSQL، نطاقات المسافة |
| **بيانات افتراضية** | أرقام للعرض والمحاكاة فقط | 600 طن × 42 ر.س، أسعار النقل في الأمثلة |
| **قرار مفتوح (OD)** | لم يُحسم بعد | [OPEN_DECISIONS](08-planning/OPEN_DECISIONS.md) |

## خريطة الموضوعات الخمسة والثلاثين

| # | الموضوع | الوثيقة |
|---|---|---|
| 1 | نظرة عامة على المشروع | [PROJECT_OVERVIEW](00-product/PROJECT_OVERVIEW.md) |
| 2 | بيان المشكلة | [PROBLEM_STATEMENT](00-product/PROBLEM_STATEMENT.md) |
| 3 | تحديات مخلفات التعدين | [PROBLEM_STATEMENT §3](00-product/PROBLEM_STATEMENT.md#3-تحديات-مخلفات-التعدين-المحاور-السبعة) |
| 4 | الحل المقترح | [PROPOSED_SOLUTION](00-product/PROPOSED_SOLUTION.md) |
| 5 | نموذج الأعمال | [BUSINESS_MODEL](01-business/BUSINESS_MODEL.md) |
| 6 | دراسة السوق | [MARKET_RESEARCH](01-business/MARKET_RESEARCH.md) |
| 7 | عرض القيمة | [VALUE_PROPOSITION](00-product/VALUE_PROPOSITION.md) |
| 8 | العملاء المستهدفون | [TARGET_CUSTOMERS](00-product/TARGET_CUSTOMERS.md) |
| 9 | نطاق النسخة الأولى | [MVP_SCOPE](00-product/MVP_SCOPE.md) |
| 10 | مواصفة متطلبات البرمجيات | [MAKNAZ_SRS](02-requirements/MAKNAZ_SRS.md) |
| 11 | المتطلبات الوظيفية | [SRS §4](02-requirements/MAKNAZ_SRS.md#4-المتطلبات-الوظيفية) (FR-001–150) |
| 12 | المتطلبات غير الوظيفية | [SRS §5](02-requirements/MAKNAZ_SRS.md#5-المتطلبات-غير-الوظيفية) (NFR-001–045) |
| 13 | قصص المستخدم | [USER_STORIES](02-requirements/USER_STORIES.md) |
| 14 | حالات الاستخدام | [USE_CASES](02-requirements/USE_CASES.md) (UC-001–025) |
| 15 | مصفوفة الصلاحيات | [RBAC_MATRIX](03-architecture/RBAC_MATRIX.md) |
| 16 | معمارية النظام | [ARCHITECTURE](03-architecture/ARCHITECTURE.md) |
| 17 | تصميم قاعدة البيانات | [DATABASE_DESIGN](03-architecture/DATABASE_DESIGN.md) |
| 18 | مخطط الكيانات والعلاقات | [DATABASE_DESIGN §2](03-architecture/DATABASE_DESIGN.md#2-مخطط-erd) |
| 19 | مواصفة الواجهات البرمجية | [API_SPECIFICATION](03-architecture/API_SPECIFICATION.md) |
| 20 | آلة حالة المعاملة | [TRANSACTION_STATE_MACHINE](03-architecture/TRANSACTION_STATE_MACHINE.md) |
| 21 | قواعد العمل | [BUSINESS_RULES](02-requirements/BUSINESS_RULES.md) (BR-001–078) |
| 22 | محرك تسعير النقل | [LOGISTICS_PRICING_ENGINE](04-domain/LOGISTICS_PRICING_ENGINE.md) |
| 23 | محاكاة الدفع | [PAYMENT_SIMULATION](04-domain/PAYMENT_SIMULATION.md) |
| 24 | الفاتورة المحاكاة | [INVOICE_SIMULATION](04-domain/INVOICE_SIMULATION.md) |
| 25 | جدولة الشحن | [SHIPMENT_SCHEDULING](04-domain/SHIPMENT_SCHEDULING.md) |
| 26 | تمديد موعد الشحن | [SHIPMENT_EXTENSIONS](04-domain/SHIPMENT_EXTENSIONS.md) |
| 27 | قواعد الإلغاء | [CANCELLATION_RULES](04-domain/CANCELLATION_RULES.md) |
| 28 | متطلبات الأمن | [SECURITY_REQUIREMENTS](02-requirements/SECURITY_REQUIREMENTS.md) |
| 29 | متطلبات الواجهة والتجربة | [UI_UX_REQUIREMENTS](05-design/UI_UX_REQUIREMENTS.md) |
| 30 | استراتيجية الاختبار | [TEST_STRATEGY](06-quality/TEST_STRATEGY.md) |
| 31 | معايير القبول | [ACCEPTANCE_CRITERIA](02-requirements/ACCEPTANCE_CRITERIA.md) |
| 32 | متطلبات البيانات | [DATA_REQUIREMENTS](02-requirements/DATA_REQUIREMENTS.md) |
| 33 | مسؤوليات الفريق | [TEAM_RESPONSIBILITIES](07-team/TEAM_RESPONSIBILITIES.md) |
| 34 | القرارات التقنية | [TECHNICAL_DECISIONS](03-architecture/TECHNICAL_DECISIONS.md) (ADR) |
| 35 | الأسئلة المفتوحة | [OPEN_DECISIONS](08-planning/OPEN_DECISIONS.md) (OD-01–24) |

## وثائق مساندة

| الوثيقة | الغرض |
|---|---|
| [CODE_REVIEW_GUIDELINES](07-team/CODE_REVIEW_GUIDELINES.md) | قواعد المراجعة وقائمة الأمن |
| [DEFINITION_OF_DONE](07-team/DEFINITION_OF_DONE.md) | متى تُعد المهمة منجزة، حسب التخصص |
| [GITHUB_WORKFLOW](07-team/GITHUB_WORKFLOW.md) | الفروع والإيداعات والوسوم ولوحة المشروع |
| [MVP_ROADMAP](08-planning/MVP_ROADMAP.md) | ترتيب البناء بالاعتماديات، دون مواعيد |
| [OFFICIAL_STATISTICS](../data/reference/OFFICIAL_STATISTICS.md) | الإحصاءات الموثقة بمصادرها |
| [sources/](sources/README.md) | الموجّهات الأصلية التي بُنيت عليها الوثائق |
| [exports/](exports/README.md) | نسخ PDF المصدّرة وحالتها |

## الهيكل

```
docs/
├── 00-product/        المنتج: المشكلة، الحل، القيمة، العملاء، النطاق
├── 01-business/       نموذج الأعمال ودراسة السوق
├── 02-requirements/   SRS، قواعد العمل، الحالات، القصص، القبول، البيانات، الأمن
├── 03-architecture/   المعمارية، قاعدة البيانات، API، آلات الحالة، RBAC، ADR
├── 04-domain/         التسعير، الدفع والفاتورة، الشحن، التمديد، الإلغاء
├── 05-design/         متطلبات الواجهة والتجربة
├── 06-quality/        استراتيجية الاختبار
├── 07-team/           المسؤوليات، المراجعة، تعريف الإنجاز، سير GitHub
├── 08-planning/       خارطة البناء والقرارات المفتوحة
├── sources/           الموجّهات الأصلية (للمرجع، لا تُعدل)
└── exports/           ملفات PDF المصدّرة
```

## تحديث الوثائق

عدّل ملف Markdown في فرع `docs/…` وافتح PR. أعد توليد PDF الوثائق الهندسية عند الحاجة بـ `python3 tools/docs-pdf/build_docs.py` (انظر [tools/README.md](../tools/README.md)).
