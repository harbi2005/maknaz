# scripts

| السكربت | الغرض |
|---|---|
| [`validate_docs.py`](validate_docs.py) | يفحص الوثائق: الروابط النسبية، المراسي (بقواعد GitHub)، رابط الفهرس في كل وثيقة، مخططات Mermaid (اختياري)، الأسرار، والادعاءات الممنوعة |

```bash
python3 tools/scripts/validate_docs.py             # بلا اعتماديات خارجية
python3 tools/scripts/validate_docs.py --mermaid   # يتطلب mmdc
```

رمز الخروج `0` = نجاح، `1` = توجد مشكلات (يستخدمه CI في `.github/workflows/docs-validation.yml`).

**حدود الفحص:** فحص الادعاءات نمطي (كلمات مفتاحية مع استثناء الجمل المنفية)، فلا يغني عن المراجعة البشرية في [CODE_REVIEW_GUIDELINES](../../docs/07-team/CODE_REVIEW_GUIDELINES.md). الروابط الخارجية (http) لا تُفحص.
