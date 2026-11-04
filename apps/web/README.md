# apps/web — واجهة الويب

> ⛔ لم يبدأ التنفيذ. تنفيذ كل شاشة يبدأ بعد تصميمها المعتمد (UX).

**التقنية المقترحة (REC، بانتظار OD-18):** Next.js + TypeScript + Tailwind CSS بإعداد RTL، مع التوكنز من [`packages/design-tokens`](../../packages/design-tokens/README.md).

## الالتزامات

| البند | المرجع |
|---|---|
| عربية أولًا، `dir="rtl"`، متجاوبة | UI_UX §1 |
| الخط IBM Plex Sans Arabic من `brand/fonts/` | [ADR-013](../../docs/03-architecture/TECHNICAL_DECISIONS.md#adr-013--الخط) |
| أربع حالات لكل شاشة: تحميل، فارغ، خطأ، نجاح | [DEFINITION_OF_DONE](../../docs/07-team/DEFINITION_OF_DONE.md#3-التصميم-ux) |
| شارة `SimulationBadge` في كل شاشة مالية | [PAYMENT_SIMULATION](../../docs/04-domain/PAYMENT_SIMULATION.md#7-الواجهة) |
| المسافة المباشرة موسومة «تقريبية» | [LOGISTICS_PRICING_ENGINE §8](../../docs/04-domain/LOGISTICS_PRICING_ENGINE.md#8-المسافة-والمطابقة) |
| لا مبالغ تُحسب أو تُرسل من الواجهة | SR-07 |
| المواعيد بتوقيت الرياض مع ذكر المنطقة | ADR-005 |

## لوحات الأدوار

المنجم · المصنع · الناقل · الإدارة — قائمة الشاشات `SCR-*` في [UI_UX_REQUIREMENTS](../../docs/05-design/UI_UX_REQUIREMENTS.md).
