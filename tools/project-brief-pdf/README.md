# project-brief-pdf — الملف التعريفي

يولد الملف التعريفي للمشروع (المشكلة، الحل، الفريق، المحاكاة، الإحصاءات، المراجع) من HTML مضمن في [`build.py`](build.py) والأقسام الإضافية في [`additions.py`](additions.py).

```bash
python3 tools/project-brief-pdf/build.py
# المخرج: tools/project-brief-pdf/out/MAKNAZ_Project_Brief_Updated.pdf
```

> ⚠️ المحتوى الحالي يتبع صياغات تخالف بعض القرارات المعتمدة لاحقًا (التمديد، الدفع، الإلغاء). التفاصيل في [docs/exports/README.md](../../docs/exports/README.md#تعارضات-معروفة-مع-القرارات-المعتمدة). أي نسخة جديدة تُصحح هذه الصياغات وتحمل رقم إصدار جديد، ولا تُستبدل نسخة سبق إرسالها.

- الإحصاءات في الملف من [OFFICIAL_STATISTICS](../../data/reference/OFFICIAL_STATISTICS.md) فقط.
- أرقام المحاكاة (600 طن، 180 كم، 42 ر.س/طن…) **افتراضية** وموسومة بذلك في الملف.
- `assets/`: الغلاف والشعارات المستخدمة في الصفحات (والنسخ المصغرة للرأس تستخدمها `docs-pdf` أيضًا).
