# المساهمة في مَكْنَز

شكرًا لمساهمتك. هذا الدليل مختصر عمدًا؛ التفاصيل في الوثائق المرتبطة.

## قبل أن تبدأ

1. اقرأ [نظرة عامة](docs/00-product/PROJECT_OVERVIEW.md) و[نطاق النسخة الأولى](docs/00-product/MVP_SCOPE.md).
2. اعرف مهامك ومخرجاتك في [TEAM_RESPONSIBILITIES](docs/07-team/TEAM_RESPONSIBILITIES.md).
3. التزم بـ[ميثاق السلوك](CODE_OF_CONDUCT.md).

## خطوات المساهمة

1. **Issue أولًا:** افتح Issue بالقالب المناسب (ميزة، عيب، توثيق، بحث) أو اختر Issue قائمًا، واذكر معرف المهمة (مثل `DA-008`).
2. **فرع:** من `main` باسم `feature/…` أو `fix/…` أو `docs/…` أو `test/…` أو `refactor/…` — [التفاصيل](docs/07-team/GITHUB_WORKFLOW.md#1-الفروع).
3. **العمل:** تغيير واحد متماسك. اربط كل شيء بمعرفات المتطلبات (FR/BR/UC/TS/AC).
4. **الفحص المحلي:** `python3 tools/scripts/validate_docs.py`
5. **Pull Request:** املأ القالب، واطلب مراجعة من التخصص المتلقي.
6. **المراجعة:** وفق [CODE_REVIEW_GUIDELINES](docs/07-team/CODE_REVIEW_GUIDELINES.md)؛ الدمج بعد الموافقة ونجاح الفحوص.
7. **الإنجاز:** تحقق من [DEFINITION_OF_DONE](docs/07-team/DEFINITION_OF_DONE.md).

## قواعد لا استثناء فيها

| القاعدة | لماذا |
|---|---|
| **لا أرقام سوق أو إحصاءات دون مصدر وتاريخ** | المصداقية؛ المصادر المعتمدة في [OFFICIAL_STATISTICS](data/reference/OFFICIAL_STATISTICS.md) |
| **لا ادعاء عملاء أو شراكات أو اتفاقيات** غير موثقة كتابيًا | قد تُعرض الوثائق خارجيًا |
| **لا ادعاء توافق صناعي لمادة** ولا أسعار نقل «موثقة» | المنصة لا تحكم بصلاحية المواد؛ الأسعار في الأمثلة افتراضية |
| **وسم كل معلومة:** موثّق / متطلب معتمد / توصية هندسية / افتراضي / قرار مفتوح | انظر [مفتاح التصنيف](docs/README.md#مفتاح-تصنيف-المعلومات) |
| **لا مواعيد أو تقديرات زمنية** في الوثائق | قرار الفريق |
| **لا أسرار** في المستودع (`.env` مستبعد؛ استخدم `.env.example`) | [SECURITY.md](SECURITY.md) |
| **لا تحسم قرارًا مفتوحًا منفردًا** | يُرفع إلى [OPEN_DECISIONS](docs/08-planning/OPEN_DECISIONS.md) ويحسمه قائد الفريق |
| **لا تعدّل `docs/sources/`** ولا نسخة PDF سبق إرسالها | أرشيف للتتبع |

## كتابة الوثائق

- العربية مع المصطلحات التقنية بالإنجليزية (`PENDING_CARRIER`، `Idempotency-Key`).
- رابط `[← فهرس الوثائق](../README.md)` في رأس كل وثيقة تحت `docs/`، وإدراج الوثيقة الجديدة في [docs/README.md](docs/README.md).
- مخططات Mermaid بدل الصور حين يمكن؛ تجنب `;` داخل رسائل `sequenceDiagram`.
- الأرقام بأرقام 0–9 والمبالغ بفاصل آلاف (`25,200.00 ر.س`).

## الإيداعات

```
docs(pricing): add worked minimum-charge example

refs: TS-073, BR-034
```

الأنواع: `feat` `fix` `docs` `test` `refactor` `chore` `data` `design`.

## أسئلة

افتح Issue بوسم `question` أو `decision-needed`.
