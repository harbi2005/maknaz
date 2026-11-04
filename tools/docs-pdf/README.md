# docs-pdf — حزمة الوثائق الهندسية PDF

يجمع وثائق Markdown المدرجة في `ORDER` داخل [`build_docs.py`](build_docs.py) في ملف PDF واحد: غلاف، فهرس بأرقام صفحات مستخرجة من الوجهات المسماة، رأس وتذييل بالهوية، مخططات Mermaid محوّلة إلى صور، وروابط داخلية بين الوثائق.

```bash
python3 tools/docs-pdf/build_docs.py
# المخرج: tools/docs-pdf/out/MAKNAZ_Engineering_Docs_AR.pdf
cp tools/docs-pdf/out/MAKNAZ_Engineering_Docs_AR.pdf docs/exports/
```

| الملاحظة | التفصيل |
|---|---|
| الخطوط | من `brand/fonts/` (IBM Plex Sans Arabic / Sans / Mono) |
| الصور | رأس الصفحة من `../project-brief-pdf/assets/` (نسخ مصغرة `*_hdr.png` لتقليل الحجم) |
| إضافة وثيقة | أضف سطرًا إلى `ORDER` بالمسار النسبي من `docs/` والعنوانين العربي والإنجليزي |
| الروابط | الروابط بين الوثائق المدرجة تتحول إلى روابط داخلية؛ غير المدرجة تشير إلى الفهرس |
| التحقق الذاتي | يتأكد أن إدراج أرقام الصفحات لم يغيّر الترقيم (assert) |
