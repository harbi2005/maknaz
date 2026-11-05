# الاختبارات

حالات الاختبار TS-001–TS-1xx معرّفة في [TEST_STRATEGY](../docs/06-quality/TEST_STRATEGY.md)، ومعايير القبول في [ACCEPTANCE_CRITERIA](../docs/02-requirements/ACCEPTANCE_CRITERIA.md).

| الموقع | النوع | التشغيل |
|---|---|---|
| `packages/shared/test/` | وحدات: المال، مخططات التحقق | `npm test -w @maknaz/shared` |
| `apps/web/src/**/*.test.ts` | وحدات الواجهة: التوقيت وتحويل المبالغ | `npm test -w @maknaz/web` |
| `apps/api/test/pricing.test.ts` | محرك التسعير مع الحالات المرجعية `data/templates/pricing_reference_cases.csv` | `npm test -w @maknaz/api` |
| `apps/api/test/accounts.test.ts` | المصادقة، الجهات، الصلاحيات SEC-03/04/05، التدقيق | على PostgreSQL حقيقي |
| `apps/api/test/lifecycle.test.ts` | المسار الكامل، الرفض، الانتهاء، الإلغاء، التمديد، إعادة الإسناد، التزامن، Idempotency، SEC-01/02/07/09/10/11/14 | على PostgreSQL حقيقي |
| `tests/e2e/` | المسار الكامل عبر الواجهة (Playwright في Edge المثبت) | `npm run test:e2e` بعد `db:start` و`db:seed` و`dev` |

اختبارات الخادم تستخدم ساعة قابلة للحقن (`advanceClock`) لاختبار المهل دون انتظار، وتعمل على قاعدة اختبار منفصلة (`TEST_DATABASE_URL`) بترحيلات `migrate deploy` غير الهدامة.
