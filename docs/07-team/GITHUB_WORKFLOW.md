# سير العمل على GitHub

[← فهرس الوثائق](../README.md)

> توصيات تشغيلية للفريق. إعداد المستودع البعيد (الإنشاء، الصلاحيات، حماية الفروع، الدعوات) **لا يتم إلا بموافقة قائد الفريق** (TL-006). لا أسماء مستخدمين في هذا الملف حتى يزودنا بها الأعضاء.

## 1. الفروع

| البادئة | الاستخدام | مثال |
|---|---|---|
| `feature/` | وظيفة جديدة | `feature/fr-071-pricing-rule-versions` |
| `fix/` | إصلاح عيب | `fix/bug-42-double-refund` |
| `docs/` | وثائق فقط | `docs/payment-simulation-states` |
| `test/` | اختبارات فقط | `test/ts-110-extension-limits` |
| `refactor/` | إعادة هيكلة دون تغيير السلوك | `refactor/pricing-engine-modules` |

القواعد: أحرف إنجليزية صغيرة وشرطات · المعرف المرجعي في الاسم ما أمكن · فرع قصير العمر يُحذف بعد الدمج · `main` محمي: لا دفع مباشر، دمج عبر PR فقط بعد نجاح الفحوص والمراجعة.

## 2. الإيداعات (Commits)

صيغة مقترحة مستوحاة من Conventional Commits:

```
<type>(<scope>): <وصف قصير بالإنجليزية أو العربية>

refs: FR-071, BR-034
```

`type` ∈ `feat` `fix` `docs` `test` `refactor` `chore` `data` `design`. إيداع واحد = تغيير منطقي واحد.

## 3. Pull Requests

1. افتح PR مبكرًا كـ Draft إن أردت ملاحظات.
2. املأ القالب ([PULL_REQUEST_TEMPLATE](../../.github/PULL_REQUEST_TEMPLATE.md)).
3. المراجعون يُحددون آليًا من [CODEOWNERS](../../.github/CODEOWNERS) بعد تعبئته.
4. الدمج بـ **Squash and merge** للحفاظ على سجل نظيف.

## 4. Issues

قوالب أربعة في `.github/ISSUE_TEMPLATE/`: طلب ميزة، بلاغ عيب، مهمة توثيق، مهمة بحث. كل Issue: وسم نوع + وسم تخصص + أولوية. معرفات مهام الفريق (SE-xxx…) تُذكر في العنوان.

## 5. الوسوم (Labels)

معرّفة في [`.github/labels.yml`](../../.github/labels.yml):

| المجموعة | الوسوم |
|---|---|
| النوع | `type: feature` `type: bug` `type: docs` `type: research` `type: test` `type: refactor` |
| التخصص | `area: engineering` `area: business` `area: data` `area: design` `area: qa` `area: leadership` |
| النطاق | `domain: pricing` `domain: payment-sim` `domain: shipment` `domain: rbac` `domain: matching` |
| الأولوية (MoSCoW) | `priority: must` `priority: should` `priority: could` |
| الحالة | `decision-needed` `blocked` `needs-review` `good first issue` |
| الشدة (للعيوب) | `severity: S1` … `severity: S4` |

## 6. GitHub Projects (توصية)

لوحة واحدة باسم «MAKNAZ MVP» بعرض Board وأعمدة:

`Backlog` ← `Ready` ← `In progress` ← `In review` ← `Done`

حقول مخصصة: **Owner role** (SE/BD/DA/UX/QA/TL) · **Priority** (Must/Should/Could) · **Ref** (نص للمعرفات). عرض Table إضافي مجمّع حسب Owner role. **دون حقول تواريخ** التزامًا بقرار عدم تحديد مواعيد في الوثائق.

## 7. الأتمتة (Actions)

| Workflow | الحالة |
|---|---|
| `docs-validation.yml` — فحص الروابط والمراسي ومخططات Mermaid والأسرار | مفعل في المستودع المحلي |
| اختبارات التطبيق | لاحقًا بعد اعتماد التقنيات (OD-18، ADR-003) |
| النشر الآلي | **غير مفعل**؛ يتطلب موافقة صريحة |

## 8. إعدادات مقترحة عند الإنشاء (بموافقة)

- الاسم: `maknaz` على **الحساب الشخصي لقائد الفريق** (لا منظمة) — قرار معتمد
- الرؤية: **خاص (Private)** — قرار معتمد
- الترخيص: **لا ترخيص مفتوح** (كل الحقوق محفوظة) — قرار معتمد؛ يمكن إضافة ترخيص لاحقًا بقرار جديد
- حماية `main`: PR إلزامي، موافقة واحدة، نجاح `docs-validation`، منع الدفع القسري
- تفعيل Private vulnerability reporting (انظر [SECURITY.md](../../SECURITY.md))
- Secret scanning وPush protection
- الأصول الكبيرة (الفيلم) عبر Releases لا داخل Git
