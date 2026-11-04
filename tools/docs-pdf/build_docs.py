"""Build MAKNAZ engineering documentation PDF (Arabic RTL, A4) from docs/*.md.
Two passes: render body, locate document start pages, render TOC with page numbers, merge cover."""
import base64
import html
import pathlib
import re

import markdown
import pdfplumber
from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter

import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]                                   # repository root
DOCS = ROOT / "docs"
OUT = HERE / "out"                                       # git-ignored build output
OUT.mkdir(exist_ok=True)
ASSETS = HERE.parent / "project-brief-pdf" / "assets"
A = ASSETS.as_uri()
MMD = pathlib.Path(tempfile.mkdtemp(prefix="maknaz-mmd-"))
FB = ROOT / "brand" / "fonts"
F_AR, F_LA, F_MO = [(FB / d).as_uri() for d in ("ibm-plex-sans-arabic", "ibm-plex-sans", "ibm-plex-mono")]

ORDER = [
    ("02-requirements/MAKNAZ_SRS.md", "مواصفات متطلبات البرمجيات", "SOFTWARE REQUIREMENTS SPECIFICATION"),
    ("02-requirements/BUSINESS_RULES.md", "قواعد العمل", "BUSINESS RULES"),
    ("02-requirements/USE_CASES.md", "حالات الاستخدام", "USE CASES"),
    ("03-architecture/RBAC_MATRIX.md", "مصفوفة الصلاحيات", "RBAC MATRIX"),
    ("03-architecture/TRANSACTION_STATE_MACHINE.md", "آلات الحالة", "STATE MACHINES"),
    ("03-architecture/DATABASE_DESIGN.md", "تصميم قاعدة البيانات", "DATABASE DESIGN"),
    ("03-architecture/API_SPECIFICATION.md", "مواصفات الواجهات البرمجية", "API SPECIFICATION"),
    ("03-architecture/ARCHITECTURE.md", "المعمارية", "ARCHITECTURE"),
    ("03-architecture/TECHNICAL_DECISIONS.md", "سجل القرارات التقنية", "TECHNICAL DECISIONS (ADR)"),
    ("04-domain/LOGISTICS_PRICING_ENGINE.md", "محرك تسعير النقل", "LOGISTICS PRICING ENGINE"),
    ("04-domain/PAYMENT_SIMULATION.md", "محاكاة الدفع والاسترجاع", "PAYMENT SIMULATION"),
    ("04-domain/INVOICE_SIMULATION.md", "الفاتورة المحاكاة", "INVOICE SIMULATION"),
    ("04-domain/SHIPMENT_SCHEDULING.md", "جدولة الشحن", "SHIPMENT SCHEDULING"),
    ("04-domain/SHIPMENT_EXTENSIONS.md", "تمديد موعد الشحن", "SHIPMENT EXTENSIONS"),
    ("04-domain/CANCELLATION_RULES.md", "قواعد الإلغاء والمهل", "CANCELLATION RULES"),
    ("05-design/UI_UX_REQUIREMENTS.md", "متطلبات الواجهة وتجربة المستخدم", "UI / UX REQUIREMENTS"),
    ("06-quality/TEST_STRATEGY.md", "استراتيجية الاختبار", "TEST STRATEGY"),
    ("08-planning/MVP_ROADMAP.md", "خطة تنفيذ النسخة الأولى", "MVP ROADMAP"),
    ("08-planning/OPEN_DECISIONS.md", "القرارات المفتوحة", "OPEN DECISIONS"),
    ("07-team/TEAM_RESPONSIBILITIES.md", "توزيع المهام والمسؤوليات", "TEAM RESPONSIBILITIES"),
]
DOC_ID = {f: f"doc-{i + 1:02d}" for i, (f, _, _) in enumerate(ORDER)}
BASENAME = {pathlib.Path(f).name: f for f, _, _ in ORDER}

CSS = f"""
@font-face {{ font-family:'PlexAr'; src:url('{F_AR}/IBMPlexSansArabic-Light.ttf'); font-weight:300; }}
@font-face {{ font-family:'PlexAr'; src:url('{F_AR}/IBMPlexSansArabic-Regular.ttf'); font-weight:400; }}
@font-face {{ font-family:'PlexAr'; src:url('{F_AR}/IBMPlexSansArabic-Medium.ttf'); font-weight:500; }}
@font-face {{ font-family:'PlexAr'; src:url('{F_AR}/IBMPlexSansArabic-SemiBold.ttf'); font-weight:600; }}
@font-face {{ font-family:'PlexAr'; src:url('{F_AR}/IBMPlexSansArabic-Bold.ttf'); font-weight:700; }}
@font-face {{ font-family:'PlexLa'; src:url('{F_LA}/IBMPlexSans%5Bwdth,wght%5D.ttf'); font-weight:100 700; }}
@font-face {{ font-family:'PlexMono'; src:url('{F_MO}/IBMPlexMono-Regular.ttf'); font-weight:400; }}
@font-face {{ font-family:'PlexMono'; src:url('{F_MO}/IBMPlexMono-Medium.ttf'); font-weight:500; }}
:root {{ --ch:#1A1E1F; --gr:#6B7073; --cu:#B8734F; --sa:#E8E3D9; --off:#F7F6F1; --line:rgba(107,112,115,.30); }}
@page {{ size:A4; margin:21mm 0 17mm 0; }}
* {{ box-sizing:border-box; }}
html, body {{ margin:0; background:var(--sa); }}
body {{ font-family:'PlexAr','PlexLa',sans-serif; color:var(--ch); font-size:9.3pt; line-height:1.75;
        direction:rtl; padding:0 16mm; -webkit-print-color-adjust:exact; print-color-adjust:exact;
        font-feature-settings:"kern","liga"; }}
.doc {{ break-before:page; }}
.doc-head {{ background:var(--ch); color:var(--sa); border-radius:3mm; padding:9mm 9mm 8mm; margin:0 0 7mm;
             position:relative; overflow:hidden; }}
.doc-head .pat {{ position:absolute; inset:0; opacity:.35; }}
.doc-head .num {{ font-family:'PlexMono'; font-size:9pt; color:var(--cu); letter-spacing:.2em; direction:ltr; text-align:right; position:relative; }}
.doc-head h1 {{ font-size:22pt; line-height:1.35; margin:2mm 0 1mm; font-weight:700; position:relative; color:var(--off); border:none; }}
.doc-head .en {{ font-family:'PlexLa'; font-size:8pt; letter-spacing:.3em; color:#a9adae; direction:ltr; text-align:right; position:relative; }}
.doc-head .file {{ font-family:'PlexMono'; font-size:7.5pt; color:#8f9496; direction:ltr; text-align:right; margin-top:3mm; position:relative; }}
h1 {{ font-size:17pt; font-weight:700; margin:6mm 0 3mm; }}
h2 {{ font-size:13pt; font-weight:700; margin:7mm 0 2.5mm; padding-bottom:1.4mm; border-bottom:.4mm solid var(--cu);
      break-after:avoid; }}
h3 {{ font-size:11pt; font-weight:600; margin:5mm 0 2mm; color:var(--ch); break-after:avoid; }}
h4 {{ font-size:10pt; font-weight:600; margin:4mm 0 1.5mm; color:var(--cu); break-after:avoid; }}
p {{ margin:0 0 2.2mm; }}
ul, ol {{ margin:0 0 2.5mm; padding-inline-start:6mm; }}
li {{ margin-bottom:.6mm; }}
li::marker {{ color:var(--cu); }}
strong {{ font-weight:600; }}
a {{ color:var(--cu); text-decoration:none; }}
blockquote {{ margin:3mm 0; padding:2.6mm 4mm; background:rgba(255,255,255,.45); border-inline-start:1mm solid var(--cu);
              border-radius:1.5mm; color:var(--ch); }}
blockquote p {{ margin:0; }}
code {{ font-family:'PlexMono','PlexAr'; font-size:.86em; background:rgba(26,30,31,.07); padding:.1mm 1.2mm;
        border-radius:1mm; direction:ltr; unicode-bidi:isolate; white-space:nowrap; }}
td code {{ white-space:normal; word-break:break-word; }}
pre {{ direction:ltr; text-align:left; background:var(--ch); color:#e9e5dd; border-radius:2mm; padding:3.5mm 4mm;
       font-size:7.6pt; line-height:1.55; white-space:pre-wrap; word-break:break-word; break-inside:avoid; margin:2mm 0 3.5mm; }}
pre code {{ background:none; padding:0; color:inherit; white-space:pre-wrap; font-size:inherit; }}
table {{ width:100%; border-collapse:collapse; margin:2mm 0 4mm; font-size:7.9pt; line-height:1.55; }}
thead {{ display:table-header-group; }}
tr {{ break-inside:avoid; }}
th {{ background:var(--ch); color:var(--sa); font-weight:600; text-align:right; padding:1.7mm 2mm; vertical-align:bottom; }}
td {{ padding:1.5mm 2mm; border-bottom:.25mm solid var(--line); background:rgba(255,255,255,.42); vertical-align:top;
      overflow-wrap:break-word; }}
.nw {{ white-space:nowrap; direction:ltr; unicode-bidi:isolate; font-family:'PlexMono'; font-size:.92em; }}
tbody tr:nth-child(even) td {{ background:rgba(255,255,255,.25); }}
.dia {{ margin:3mm 0 4mm; background:var(--off); border:.3mm solid var(--line); border-radius:2.5mm; padding:3mm;
        text-align:center; break-inside:avoid; }}
.dia img {{ max-width:100%; max-height:225mm; }}
.chk {{ list-style:none; padding-inline-start:1mm; }}
.chk li::before {{ content:"☐"; color:var(--cu); margin-inline-end:2mm; }}
hr {{ border:none; border-top:.3mm solid var(--line); margin:5mm 0; }}
.marker {{ font-size:1px; color:var(--sa); line-height:0; height:0; overflow:hidden; display:block; direction:ltr; }}
/* TOC */
.toc h1 {{ font-size:20pt; margin:0 0 2mm; }}
.toc .rule {{ width:16mm; height:.8mm; background:var(--cu); margin:0 0 6mm; }}
.toc table td {{ font-size:8.5pt; padding:1mm 3mm; line-height:1.3; }}
.toc .n {{ font-family:'PlexMono'; color:var(--cu); width:10mm; }}
.toc .pg {{ font-family:'PlexMono'; text-align:left; width:16mm; direction:ltr; }}
.toc .en {{ font-family:'PlexLa'; font-size:7pt; letter-spacing:.18em; color:var(--gr); display:block; direction:ltr; text-align:right; }}
.note {{ background:rgba(255,255,255,.45); border-inline-start:1mm solid var(--cu); border-radius:1.5mm; padding:3mm 4mm; font-size:8.8pt; }}
"""

PATTERN = ('<svg class="pat" width="100%" height="100%" viewBox="0 0 600 140" preserveAspectRatio="none">' +
           "".join(f'<line x1="{x}" y1="140" x2="{x + 120}" y2="0" stroke="{"#B8734F" if i % 9 == 4 else "#6B7073"}" '
                   f'stroke-width="{0.9 if i % 9 == 4 else 0.4}"/>' for i, x in enumerate(range(-120, 620, 16))) + "</svg>")


COVER_PAT = ('<svg class="pat" width="100%" height="100%" viewBox="0 0 595 842" preserveAspectRatio="none">' +
             "".join(f'<line x1="{x}" y1="842" x2="{x + 560}" y2="0" stroke="{"#B8734F" if i % 9 == 4 else "#6B7073"}" '
                     f'stroke-width="{0.9 if i % 9 == 4 else 0.35}" opacity="{0.55 if i % 9 == 4 else 0.35}"/>'
                     for i, x in enumerate(range(-560, 600, 22))) + "</svg>")


def b64(path):
    return "data:image/png;base64," + base64.b64encode(pathlib.Path(path).read_bytes()).decode()


MMD_CONFIG = {"theme": "base", "themeVariables": {
    "fontFamily": "IBM Plex Sans Arabic, IBM Plex Sans, sans-serif", "fontSize": "15px",
    "primaryColor": "#F7F6F1", "primaryBorderColor": "#B8734F", "primaryTextColor": "#1A1E1F",
    "lineColor": "#6B7073", "secondaryColor": "#E8E3D9", "tertiaryColor": "#ffffff", "clusterBkg": "#F7F6F1",
    "clusterBorder": "#B8734F", "noteBkgColor": "#E8E3D9", "actorBkg": "#F7F6F1", "actorBorder": "#B8734F",
    "signalColor": "#1A1E1F", "labelBoxBkgColor": "#E8E3D9"}, "flowchart": {"htmlLabels": True, "curve": "basis"}}


def render_mermaid(fname, src):
    """Render each mermaid block to a branded PNG with mermaid-cli (mmdc must be on PATH)."""
    import json
    from PIL import Image
    cfg = MMD / "config.json"
    cfg.write_text(json.dumps(MMD_CONFIG))
    stem = pathlib.Path(fname).stem
    for i, block in enumerate(re.findall(r"```mermaid\n(.*?)```", src, flags=re.S)):
        mmd, png = MMD / f"{stem}_{i}.mmd", MMD / f"{stem}_{i}.png"
        mmd.write_text(block, encoding="utf-8")
        subprocess.run(["mmdc", "-i", str(mmd), "-o", str(png), "-c", str(cfg), "-s", "2.5", "-b", "#F7F6F1", "-q"],
                       check=True, capture_output=True)
        Image.open(png).convert("RGB").quantize(colors=48, dither=Image.Dither.NONE).save(png, optimize=True)


def convert(fname):
    src = (DOCS / fname).read_text(encoding="utf-8")
    render_mermaid(fname, src)
    src = re.sub(r"^\[← العودة إلى SRS\]\(\./MAKNAZ_SRS\.md\)\s*$", "", src, flags=re.M)
    # first H1 is replaced by the document header band
    src = re.sub(r"^# .*\n", "", src, count=1)
    # mermaid -> rendered PNG
    idx = {"i": 0}
    stem = fname[:-3]  # path relative to docs/

    def mer(m):
        p = MMD / f"{pathlib.Path(stem).name}_{idx['i']}.png"
        idx["i"] += 1
        return f'\n<div class="dia"><img src="{b64(p)}"></div>\n'

    src = re.sub(r"```mermaid\n.*?```", mer, src, flags=re.S)
    # task-list checkboxes
    src = re.sub(r"^- \[ \] ", "- ", src, flags=re.M)
    # cross-document links -> internal anchors at document start
    src = re.sub(r"\]\(((?:\.\./)*[\w./-]*?([A-Za-z_]+\.md))(#[^)]*)?\)",
                 lambda m: f"](#{DOC_ID.get(BASENAME.get(m.group(2), ''), 'top')})", src)
    src = re.sub(r"\]\(#(?!doc-)[^)]*\)", "](#top)", src)
    body = markdown.markdown(src, extensions=["tables", "fenced_code", "sane_lists"])
    # checklists: lists that came from "- [ ]"
    if "## 8. قوائم التحقق" in (DOCS / fname).read_text(encoding="utf-8") or "قائمة قبول" in src:
        pass
    body = body.replace("<table>", '<table dir="rtl">')
    # keep requirement IDs unbroken (outside tags / code)
    def ids(seg):
        return re.sub(r'(?<![\w/#-])((?:FR|NFR|BR|UC|TS|OD|SEC|SE|BD|DA|UX|QA|TL|SCR|P|R|A|Q|AC|E|ADR|PRC)-[A-Z0-9]{1,3}(?:[-–][A-Z0-9]{1,3})?)(?![\w-])', r'<span class="nw">\1</span>', seg)
    parts = re.split(r'(<[^>]+>|<code>.*?</code>|<pre>.*?</pre>)', body, flags=re.S)
    inside_code = False
    out = []
    for seg in parts:
        if seg.startswith('<code') or seg.startswith('<pre'):
            inside_code = True
        if seg.startswith('</code') or seg.startswith('</pre'):
            inside_code = False
        out.append(seg if (seg.startswith('<') or inside_code) else ids(seg))
    body = ''.join(out)
    return body


def build_html(toc_pages=None):
    cover_toc = []
    for i, (f, ar, en) in enumerate(ORDER):
        pg = toc_pages[i] if toc_pages else "—"
        cover_toc.append(f'<tr><td class="n">{i + 1:02d}</td><td><a href="#{DOC_ID[f]}" style="color:inherit"><b>{ar}</b></a><span class="en">{en}</span></td>'
                         f'<td class="pg">{pg}</td></tr>')
    parts = [f"""
<section class="toc" id="top">
  <h1>المحتويات</h1><div class="rule"></div>
  <p>تضم هذه الحزمة الوثائق الهندسية للنسخة الأولى من منصة مَكْنَز، وهي مرجع لفرق التطوير والتصميم والبيانات والاختبار وتطوير الأعمال.
  الوثيقة الرئيسية هي مواصفات المتطلبات (SRS)، وبقية الوثائق تفصّل أقسامها دون أن تتعارض معها.</p>
  <table><thead><tr><th>#</th><th>الوثيقة</th><th style="text-align:left">الصفحة</th></tr></thead><tbody>{''.join(cover_toc)}</tbody></table>
  <div class="note"><b>طريقة القراءة:</b> المتطلبات مرقمة بمعرفات ثابتة (FR · NFR · BR · UC · TS · OD · SE/BD/DA/UX/QA).
  الوسوم: <b>APPROVED</b> معتمد · <b>REC</b> توصية هندسية · <b>ASSUMPTION</b> افتراض · <b>OPEN</b> قرار مفتوح · <b>FUTURE</b> مستقبلي.
  كل العمليات المالية في النسخة الأولى <b>محاكاة</b>.</div>
</section>"""]
    for i, (f, ar, en) in enumerate(ORDER):
        parts.append(f"""
<section class="doc" id="{DOC_ID[f]}">
  <span class="marker">@@DOCSTART{i + 1:02d}@@</span>
  <div class="doc-head">{PATTERN}
    <div class="num">DOCUMENT {i + 1:02d} / {len(ORDER):02d}</div>
    <h1>{ar}</h1>
    <div class="en">{en}</div>
    <div class="file">docs/{f}</div>
  </div>
  {convert(f)}
</section>""")
    return f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>مَكْنَز | MAKNAZ — الوثائق الهندسية للنسخة الأولى</title><style>{CSS}</style></head>
<body>{''.join(parts)}</body></html>"""


HEADER = f"""<style>html,body{{margin:0 !important;padding:0 !important;}} #header{{padding:0 !important;}}</style>
<div style="width:100%;height:21mm;margin:0;padding:0 16mm;box-sizing:border-box;background:#E8E3D9;
  -webkit-print-color-adjust:exact;display:flex;align-items:center;justify-content:space-between;direction:rtl;
  font-family:'IBM Plex Sans Arabic';font-size:7.5pt;color:#6B7073;border:none">
  <div style="display:flex;align-items:center;gap:2mm;padding-top:3mm">
    <img src="{b64(ASSETS / 'icon_hdr.png')}" style="height:7mm">
    <img src="{b64(ASSETS / 'wordmark_dark_hdr.png')}" style="height:5.6mm">
  </div>
  <div style="padding-top:3mm">الوثائق الهندسية للنسخة الأولى (MVP) · مسودة للمراجعة</div>
</div>"""

FOOTER = """<style>html,body{margin:0 !important;padding:0 !important;} #footer{padding:0 !important;}</style>
<div style="width:100%;height:17mm;margin:0;padding:0 16mm;box-sizing:border-box;background:#E8E3D9;
  -webkit-print-color-adjust:exact;display:flex;align-items:center;justify-content:space-between;direction:rtl;
  font-family:'IBM Plex Sans Arabic';font-size:7.3pt;color:#6B7073">
  <div style="border-top:0.3mm solid rgba(107,112,115,.35);padding-top:2mm;width:100%;display:flex;justify-content:space-between">
    <span>مَكْنَز | MAKNAZ — الإصدار 1.1 · 4 نوفمبر 2026</span>
    <span style="font-family:'IBM Plex Mono';color:#1A1E1F" dir="ltr"><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
</div>"""

COVER = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face {{ font-family:'PlexAr'; src:url('{F_AR}/IBMPlexSansArabic-Regular.ttf'); font-weight:400; }}
@font-face {{ font-family:'PlexAr'; src:url('{F_AR}/IBMPlexSansArabic-Bold.ttf'); font-weight:700; }}
@font-face {{ font-family:'PlexAr'; src:url('{F_AR}/IBMPlexSansArabic-Light.ttf'); font-weight:300; }}
@font-face {{ font-family:'PlexLa'; src:url('{F_LA}/IBMPlexSans%5Bwdth,wght%5D.ttf'); font-weight:100 700; }}
@page {{ size:A4; margin:0; }}
html,body {{ margin:0; }}
body {{ width:210mm; height:297mm; position:relative; overflow:hidden; background:#1A1E1F; color:#E8E3D9;
        font-family:'PlexAr'; direction:rtl; -webkit-print-color-adjust:exact; }}
.bg {{ position:absolute; inset:0; background:url('{A}/cover.jpg') center/cover; opacity:.9; }}
.sh {{ position:absolute; inset:0; background:linear-gradient(180deg,rgba(26,30,31,.2) 0%,rgba(26,30,31,.55) 40%,rgba(26,30,31,.97) 68%); }}
.pat {{ position:absolute; inset:0; opacity:.45; }}
.in {{ position:absolute; right:19mm; left:19mm; bottom:24mm; }}
.logo {{ display:flex; align-items:center; gap:5mm; margin-bottom:11mm; }}
.logo .i {{ height:28mm; }} .logo .w {{ height:20mm; }}
.k {{ font-family:'PlexLa'; letter-spacing:.32em; font-size:8pt; color:#B8734F; direction:ltr; text-align:right; margin-bottom:3mm; }}
h1 {{ font-size:27pt; line-height:1.3; margin:0 0 3mm; font-weight:700; }}
.d {{ font-size:11pt; line-height:1.85; color:#cfcac0; font-weight:300; max-width:155mm; margin-bottom:8mm; }}
.chips {{ display:flex; flex-wrap:wrap; gap:2mm; margin-bottom:9mm; }}
.chips span {{ font-size:8pt; border:.3mm solid rgba(232,227,217,.35); border-radius:4mm; padding:.6mm 3mm; color:#d9d4ca; }}
.tl {{ border-top:.35mm solid rgba(232,227,217,.25); padding-top:4mm; display:flex; justify-content:space-between; align-items:flex-end; }}
.tl .en {{ font-family:'PlexLa'; font-size:8pt; letter-spacing:.3em; }}
.tl .dt {{ font-size:8.6pt; color:#b9b4aa; }}
</style></head><body><div class="bg"></div><div class="sh"></div>
{COVER_PAT}
<div class="in">
  <div class="logo"><img class="i" src="{A}/icon.png"><img class="w" src="{A}/wordmark_light.png"></div>
  <div class="k">ENGINEERING DOCUMENTATION · MVP</div>
  <h1>الوثائق الهندسية للنسخة الأولى</h1>
  <div class="d">مواصفات المتطلبات، وقواعد العمل، وحالات الاستخدام، والصلاحيات، وآلات الحالة، وقاعدة البيانات،
  والواجهات البرمجية، والمعمارية، وتجربة المستخدم، والاختبار، وخطة التنفيذ، وتوزيع مسؤوليات الفريق.</div>
  <div class="chips"><span>150 متطلبًا وظيفيًا</span><span>45 متطلبًا غير وظيفي</span><span>75 قاعدة عمل</span><span>25 حالة استخدام</span><span>123 حالة اختبار</span><span>100 مهمة للفريق</span></div>
  <div class="tl"><span class="en">HIDDEN RESOURCES. NEW VALUE.</span><span class="dt">الإصدار 1.1 · مسودة للمراجعة · 4 نوفمبر 2026</span></div>
</div></body></html>"""


def render(pw_page, html_text, path, header=True):
    tmp = OUT / "_docs_tmp.html"
    tmp.write_text(html_text, encoding="utf-8")
    pw_page.goto(tmp.as_uri(), wait_until="networkidle")
    pw_page.evaluate("document.fonts.ready")
    kw = dict(path=str(path), format="A4", print_background=True, prefer_css_page_size=True)
    if header:
        kw.update(display_header_footer=True, header_template=HEADER, footer_template=FOOTER)
    pw_page.pdf(**kw)


def find_starts(pdf_path):
    """Resolve the TOC links (first two pages) to the page index of each document's anchor."""
    r = PdfReader(str(pdf_path))
    page_ids = {p.indirect_reference.idnum: i for i, p in enumerate(r.pages)}
    named = r.named_destinations
    found = {}
    toc_annots = [a for pg in r.pages[:2] for a in (pg.get("/Annots", []) or [])]
    for annot in toc_annots:
        a = annot.get_object()
        dest = a.get("/Dest")
        if dest is None and "/A" in a:
            dest = a["/A"].get("/D")
        if dest is None:
            continue
        name = None
        if isinstance(dest, (str,)) or hasattr(dest, "original_bytes"):
            name = str(dest)
            d = named.get(name)
            page_ref = d.page if d is not None else None
        else:
            page_ref = dest[0]
        if page_ref is None:
            continue
        idx = page_ids.get(page_ref.idnum if hasattr(page_ref, "idnum") else page_ref.indirect_reference.idnum)
        if name is None:
            continue
        found[name.lstrip('/')] = idx + 1
    return [found.get(DOC_ID[f], "—") for f, _, _ in ORDER]


def main():
    body_pdf = OUT / "_body.pdf"
    cover_pdf = OUT / "_cover.pdf"
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page()
        render(pg, build_html(), body_pdf)
        starts = find_starts(body_pdf)
        pages = starts   # numbering follows the footer (cover unnumbered)
        render(pg, build_html(pages), body_pdf)
        assert find_starts(body_pdf) == starts, "TOC changed pagination"
        cover_html = OUT / "_cover.html"
        cover_html.write_text(COVER, encoding="utf-8")
        pg.goto(cover_html.as_uri(), wait_until="networkidle")
        pg.evaluate("document.fonts.ready")
        pg.pdf(path=str(cover_pdf), format="A4", print_background=True, prefer_css_page_size=True)
        b.close()
    w = PdfWriter()
    for p in list(PdfReader(str(cover_pdf)).pages) + list(PdfReader(str(body_pdf)).pages):
        w.add_page(p)
    w.add_metadata({"/Title": "MAKNAZ — Engineering Documentation (MVP) v1.1", "/Author": "MAKNAZ Team",
                    "/Subject": "SRS and supporting engineering documents"})
    out = OUT / "MAKNAZ_Engineering_Docs_AR.pdf"   # copy to docs/exports/ after review
    with open(out, "wb") as fh:
        w.write(fh)
    print("pages", len(w.pages), "starts", pages)


if __name__ == "__main__":
    main()
