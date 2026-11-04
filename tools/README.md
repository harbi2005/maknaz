# الأدوات

أدوات تولّد مخرجات المشروع من مصادره في المستودع. كل أداة تكتب مخرجاتها في مجلد `out/` خاص بها (مستبعد من Git)، ثم يُنسخ المخرج المعتمد يدويًا إلى مكانه بعد المراجعة.

| الأداة | تولّد | المتطلبات |
|---|---|---|
| [`scripts/validate_docs.py`](scripts/README.md) | تقرير فحص الوثائق (يستخدمه CI) | Python 3.10+ فقط؛ `mmdc` اختياري لفحص المخططات |
| [`docs-pdf/`](docs-pdf/README.md) | `MAKNAZ_Engineering_Docs_AR.pdf` | Python: `playwright` `pypdf` `Pillow` `markdown`؛ Chromium؛ `mmdc` |
| [`project-brief-pdf/`](project-brief-pdf/README.md) | `MAKNAZ_Project_Brief_Updated.pdf` | Python: `playwright`؛ Chromium |
| [`brand-film/`](brand-film/README.md) | الفيلم التعريفي (60 ثانية) | Python: `numpy` `opencv-python` `scipy` `Pillow`؛ `ffmpeg` |

## الإعداد

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install playwright pypdf Pillow markdown numpy opencv-python scipy
python -m playwright install chromium
npm install -g @mermaid-js/mermaid-cli       # يوفر mmdc
```

> لم تُثبّت إصدارات الحزم في ملف متطلبات بعد؛ يُضاف `requirements.txt` بإصدارات مثبتة عند اعتماد بيئة الفريق (سؤال مفتوح).
