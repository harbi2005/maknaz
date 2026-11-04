"""MAKNAZ project overview (Arabic, A4, RTL) — HTML → PDF via Chromium.
Brand: identity board palette + supplied logo. Run: python3 build.py"""
import pathlib
from playwright.sync_api import sync_playwright
import additions as AD

HERE = pathlib.Path(__file__).parent
A = (HERE / "assets").as_uri()
FONTS = HERE.parents[1] / "brand" / "fonts"
AR = (FONTS / "ibm-plex-sans-arabic").as_uri()
LA = (FONTS / "ibm-plex-sans").as_uri()

# ----------------------------------------------------------------- icons (thin line, board style)
def ico(kind, size=28, stroke="currentColor", sw=1.6):
    p = {
        "mine": '<path d="M6 21 L12 6 L18 21"/><path d="M8.5 15 H15.5"/><circle cx="12" cy="4.5" r="2"/><path d="M3 21 H21"/>',
        "factory": '<path d="M3 20 V10 L8 7 V10 L13 7 V10 L18 7 V3 H21 V20 Z"/><path d="M6 14 h2 M11 14 h2 M16 14 h2"/>',
        "truck": '<rect x="2" y="7" width="12" height="9" rx="1"/><path d="M14 10 H18 L21 13 V16 H14"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
        "layers": '<path d="M12 3 L21 8 L12 13 L3 8 Z"/><path d="M3 12 L12 17 L21 12"/><path d="M3 16 L12 21 L21 16"/>',
        "data": '<path d="M5 17 L12 5 L19 15 Z"/><circle cx="5" cy="17" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="15" r="2"/>',
        "eval": '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 L20 20"/><path d="M7 11 L9.5 8.5 L11 10 L13 7.5"/>',
        "link": '<rect x="2.5" y="8.5" width="10" height="7" rx="3.5"/><rect x="11.5" y="8.5" width="10" height="7" rx="3.5"/>',
        "doc": '<path d="M6 3 H15 L19 7 V21 H6 Z"/><path d="M9 11 H16 M9 14.5 H16 M9 18 H13"/>',
        "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7 V12 L15.5 14"/>',
        "check": '<circle cx="12" cy="12" r="8.5"/><path d="M8 12 L11 15 L16.5 9"/>',
        "coins": '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7 V12 C5 13.7 8.1 15 12 15 S19 13.7 19 12 V7"/><path d="M5 12 V17 C5 18.7 8.1 20 12 20 S19 18.7 19 17 V12"/>',
        "flag": '<path d="M6 21 V4"/><path d="M6 4 H17 L15 8 L17 12 H6"/>',
        "users": '<circle cx="9" cy="8" r="3.2"/><path d="M3 20 C3 15.5 6 13.5 9 13.5 S15 15.5 15 20"/><circle cx="17" cy="9" r="2.5"/><path d="M16 13.6 C19 13.8 21 15.8 21 19"/>',
        "chart": '<path d="M4 20 V4"/><path d="M4 20 H20"/><path d="M7 16 L11 11 L14 13 L19 7"/>',
        "x": '<circle cx="12" cy="12" r="8.5"/><path d="M9 9 L15 15 M15 9 L9 15"/>',
    }[kind]
    return (f'<svg class="ico" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{stroke}" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{p}</svg>')


CSS = """
@font-face { font-family: 'Ar'; src: url('ARF/IBMPlexSansArabic-Regular.ttf'); font-weight: 400; }
@font-face { font-family: 'Ar'; src: url('ARF/IBMPlexSansArabic-Bold.ttf'); font-weight: 700; }
@font-face { font-family: 'La'; src: url('LAF/IBMPlexSans%5Bwdth,wght%5D.ttf'); font-weight: 100 700; }
:root { --ch:#1A1E1F; --gr:#6B7073; --cu:#B8734F; --sa:#E8E3D9; --card: rgba(255,255,255,.42); --line: rgba(107,112,115,.28); }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--sa); }
body { font-family: 'Ar', sans-serif; color: var(--ch); font-size: 9.6pt; line-height: 1.85; direction: rtl;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.en { font-family: 'La', sans-serif; direction: ltr; unicode-bidi: isolate; }
.page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always;
        padding: 30mm 19mm 22mm 19mm; background: var(--sa); }
.page:last-child { page-break-after: auto; }
/* header & footer */
.hd { position: absolute; top: 11mm; right: 19mm; left: 19mm; display: flex; align-items: center;
      justify-content: space-between; padding-bottom: 3.2mm; border-bottom: .35mm solid var(--line); }
.hd .brand { display: flex; align-items: center; gap: 2.4mm; }
.hd .brand img.i { height: 8.2mm; } .hd .brand img.w { height: 6.6mm; }
.hd .sec { font-size: 8pt; color: var(--gr); }
.hd .sec b { color: var(--cu); font-family: 'La'; font-weight: 500; margin-left: 1.6mm; }
.ft { position: absolute; bottom: 10mm; right: 19mm; left: 19mm; display: flex; justify-content: space-between;
      font-size: 7.4pt; color: var(--gr); border-top: .35mm solid var(--line); padding-top: 2.6mm; }
.ft .n { font-family: 'La'; font-weight: 500; color: var(--ch); }
/* type */
.kicker { font-family: 'La'; font-size: 7.6pt; letter-spacing: .28em; color: var(--cu); font-weight: 500;
          direction: ltr; text-align: right; margin-bottom: 1.4mm; }
h1 { font-size: 21pt; line-height: 1.35; font-weight: 700; margin-bottom: 2.2mm; }
h1 + .rule { width: 16mm; height: .8mm; background: var(--cu); margin: 2.6mm 0 6mm; }
h2 { font-size: 12pt; font-weight: 700; margin: 5.5mm 0 2mm; display: flex; align-items: center; gap: 2.4mm; }
h2 .ico { color: var(--cu); }
h3 { font-size: 10.2pt; font-weight: 700; margin-bottom: 1.2mm; }
p { margin-bottom: 2.6mm; text-align: justify; }
p.lead { font-size: 11pt; line-height: 1.9; }
.muted { color: var(--gr); }
.small { font-size: 8.2pt; line-height: 1.75; }
.cu { color: var(--cu); }
ul.l { list-style: none; margin: 0 0 2.6mm; }
ul.l li { position: relative; padding-right: 5mm; margin-bottom: 1.1mm; }
ul.l li::before { content: ''; position: absolute; right: .4mm; top: 2.6mm; width: 1.8mm; height: 1.8mm;
                  border: .35mm solid var(--cu); transform: rotate(45deg); }
ul.l.tight li { margin-bottom: .5mm; }
/* boxes */
.grid { display: grid; gap: 4mm; }
.g2 { grid-template-columns: 1fr 1fr; } .g3 { grid-template-columns: 1fr 1fr 1fr; }
.card { background: var(--card); border: .3mm solid var(--line); border-radius: 3mm; padding: 4.2mm 4.6mm; }
.card.dark { background: var(--ch); color: var(--sa); border: none; }
.card.dark .muted { color: #9a9fa1; }
.card .top { display: flex; align-items: center; gap: 2.6mm; margin-bottom: 2mm; }
.card .top .ico { color: var(--cu); flex: none; }
.tag { display: inline-block; font-size: 7.6pt; padding: .4mm 2.6mm; border-radius: 4mm; border: .3mm solid var(--cu);
       color: var(--cu); margin-bottom: 1.6mm; }
.note { border-right: 1mm solid var(--cu); background: var(--card); padding: 3.2mm 4.4mm; border-radius: 1.5mm;
        font-size: 8.8pt; line-height: 1.8; margin: 3mm 0; }
.note b { color: var(--cu); }
/* tables */
table { width: 100%; border-collapse: collapse; font-size: 8.6pt; line-height: 1.7; margin: 2mm 0 3mm; }
th { background: var(--ch); color: var(--sa); font-weight: 700; text-align: right; padding: 2.2mm 3mm; }
th:first-child { border-radius: 0 2mm 0 0; } th:last-child { border-radius: 2mm 0 0 0; }
td { padding: 2.1mm 3mm; border-bottom: .3mm solid var(--line); vertical-align: top; background: var(--card); }
td.k { font-weight: 700; white-space: nowrap; }
tr.tot td { background: rgba(184,115,79,.14); font-weight: 700; }
/* journey */
.phases { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-top: 2mm; }
.ph { background: var(--card); border: .3mm solid var(--line); border-radius: 3mm; padding: 3.4mm 3.2mm; }
.ph .pt { font-weight: 700; font-size: 9.2pt; margin-bottom: 2mm; padding-bottom: 1.6mm; border-bottom: .3mm solid var(--line); }
.ph .pt small { display: block; font-family: 'La'; font-size: 6.6pt; letter-spacing: .2em; color: var(--cu); direction: ltr; text-align: right; }
.st { display: flex; gap: 2mm; font-size: 8.1pt; line-height: 1.6; margin-bottom: 1.8mm; }
.st .num { flex: none; width: 5.2mm; height: 5.2mm; border-radius: 50%; border: .3mm solid var(--cu); color: var(--cu);
           font-family: 'La'; font-size: 7pt; display: flex; align-items: center; justify-content: center; margin-top: .3mm; }
.who { font-size: 6.9pt; color: var(--gr); display: block; }
.gates { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 4mm; }
.gate { display: flex; gap: 3mm; align-items: flex-start; }
.gate .dot { flex: none; width: 9mm; height: 9mm; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.gate .dot.o { border: .5mm solid var(--cu); color: var(--cu); } .gate .dot.f { background: var(--cu); color: var(--sa); }
/* three-party diagram */
.tri { display: flex; align-items: center; justify-content: space-between; margin: 3mm 0 4mm; }
.party { width: 40mm; text-align: center; }
.party .c { width: 20mm; height: 20mm; border-radius: 50%; margin: 0 auto 2mm; border: .5mm solid var(--cu);
            display: flex; align-items: center; justify-content: center; color: var(--cu); background: var(--card); }
.party b { display: block; font-size: 10pt; } .party span { font-size: 7.8pt; color: var(--gr); }
.arrow { flex: 1; height: .4mm; background: var(--cu); position: relative; margin: 0 2mm 10mm; }
.arrow::after { content: ''; position: absolute; left: -.4mm; top: -1.3mm; border: 1.5mm solid transparent; border-right: 2.2mm solid var(--cu); border-left: none; }
.arrow span { position: absolute; top: -6mm; width: 100%; text-align: center; font-size: 7.6pt; color: var(--gr); }
/* cover */
.cover { padding: 0; background: var(--ch); color: var(--sa); }
.cover .bg { position: absolute; inset: 0; background: url('ASSETS/cover.jpg') center/cover; opacity: .9; }
.cover .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(26,30,31,.25) 0%, rgba(26,30,31,.55) 45%, rgba(26,30,31,.97) 72%); }
.cover .pat { position: absolute; inset: 0; opacity: .5; }
.cover .in { position: absolute; right: 19mm; left: 19mm; bottom: 26mm; }
.cover .logo { display: flex; align-items: center; gap: 5mm; margin-bottom: 12mm; }
.cover .logo img.i { height: 30mm; } .cover .logo img.w { height: 21mm; }
.cover .title { font-size: 24pt; font-weight: 700; line-height: 1.4; margin-bottom: 3mm; }
.cover .desc { font-size: 11pt; line-height: 1.9; color: #cfcac0; max-width: 150mm; margin-bottom: 9mm; }
.cover .tl { border-top: .35mm solid rgba(232,227,217,.25); padding-top: 4mm; display: flex; justify-content: space-between; align-items: flex-end; }
.cover .tl .en { font-size: 8pt; letter-spacing: .3em; color: var(--sa); }
.cover .tl .d { font-size: 8.6pt; color: #b9b4aa; }
/* team */
.team { display: grid; grid-template-columns: 1fr 1fr; gap: 4.5mm; margin-top: 4mm; }
.mem { background: var(--card); border: .3mm solid var(--line); border-radius: 3mm; padding: 6mm 5mm; display: flex; align-items: center; gap: 4mm; }
.mem .av { flex: none; width: 13mm; height: 13mm; border-radius: 50%; border: .4mm solid var(--gr); color: var(--gr);
           display: flex; align-items: center; justify-content: center; }
.mem b { font-size: 11pt; display: block; }
.mem span { font-size: 8.4pt; color: var(--gr); }
.mem.lead { grid-column: 1 / -1; background: var(--ch); color: var(--sa); border: none; }
.mem.lead .av { border-color: var(--cu); color: var(--cu); }
.mem.lead span { color: var(--cu); }
.kpi { display: grid; grid-template-columns: 1fr 1fr; gap: 2.4mm 5mm; }
.kpi div { display: flex; gap: 2.4mm; align-items: flex-start; font-size: 8.8pt; line-height: 1.7; }
.kpi .ico { color: var(--cu); flex: none; margin-top: .6mm; }
.endmark { position: absolute; bottom: 30mm; right: 19mm; left: 19mm; text-align: center; }
.endmark img.i { height: 15mm; } .endmark .en { font-size: 7.6pt; letter-spacing: .3em; color: var(--gr); margin-top: 2mm; display: block; }
""".replace("ASSETS", A).replace("ARF", AR).replace("LAF", LA)

CSS += AD.EXTRA_CSS

PATTERN = ('<svg class="pat" width="100%" height="100%" viewBox="0 0 595 842" preserveAspectRatio="none">' +
           "".join(f'<line x1="{x}" y1="842" x2="{x + 560}" y2="0" stroke="{"#B8734F" if i % 9 == 4 else "#6B7073"}" '
                   f'stroke-width="{0.9 if i % 9 == 4 else 0.35}" opacity="{0.55 if i % 9 == 4 else 0.35}"/>'
                   for i, x in enumerate(range(-560, 600, 22))) + "</svg>")

pages = []
TOTAL = "{TOTAL}"


def page(sec_no, sec_title, body):
    n = len(pages) + 1
    sec_no = len(pages)
    pages.append(f"""
<section class="page">
  <div class="hd"><div class="brand"><img class="i" src="{A}/icon.png"><img class="w" src="{A}/wordmark_dark.png"></div>
    <div class="sec"><b>{sec_no:02d}</b>{sec_title}</div></div>
  {body}
  <div class="ft"><span>مَكنَز | <span class="en">MAKNAZ</span> — ملف تعريفي بالمشروع · الإصدار الأول</span>
    <span class="n">{n} / {TOTAL}</span></div>
</section>""")


def head(kicker, title):
    return f'<div class="kicker">{kicker}</div><h1>{title}</h1><div class="rule"></div>'


# =============================================================== 1. COVER
pages.append(f"""
<section class="page cover">
  <div class="bg"></div><div class="shade"></div>{PATTERN}
  <div class="in">
    <div class="logo"><img class="i" src="{A}/icon.png"><img class="w" src="{A}/wordmark_light.png"></div>
    <div class="title">ملف تعريفي بالمشروع</div>
    <div class="desc">منصة رقمية تربط المناجم بالمصانع وشركات النقل، لعرض المخلفات والمواد الثانوية الناتجة عن التعدين
      والبحث عنها وتقييمها وشرائها، ثم ترتيب نقلها من موقع المنجم إلى المصنع.</div>
    <div class="tl"><span class="en">HIDDEN RESOURCES. NEW VALUE.</span><span class="d">الإصدار الأول · نوفمبر 2026</span></div>
  </div>
</section>""")

# =============================================================== 2. EXECUTIVE SUMMARY
page(1, "الملخص التنفيذي", head("EXECUTIVE SUMMARY", "الملخص التنفيذي") + f"""
<p class="lead">مَكنَز سوق رقمي متخصص يجمع ثلاثة أطراف في مسار واحد: <b>المنجم</b> الذي لديه مخلفات ومواد ثانوية متاحة،
و<b>المصنع</b> الذي يبحث عن مواد قد تناسب احتياجاته، و<b>شركة النقل</b> التي تنفذ نقل المادة بين الموقعين.</p>

<div class="tri">
  <div class="party"><div class="c">{ico("mine", 40)}</div><b>المنجم</b><span>بائع المادة</span></div>
  <div class="arrow"><span>طلب شراء واتفاق</span></div>
  <div class="party"><div class="c">{ico("factory", 40)}</div><b>المصنع</b><span>مشتري المادة</span></div>
  <div class="arrow"><span>عروض النقل</span></div>
  <div class="party"><div class="c">{ico("truck", 40)}</div><b>شركة النقل</b><span>مقدّم الخدمة اللوجستية</span></div>
</div>

<div class="grid g3">
  <div class="card"><div class="top">{ico("flag", 24)}<h3>المشكلة</h3></div>
    <p class="small">قد تتوفر لدى بعض المناجم مواد قابلة للاستخدام الصناعي، لكن الوصول إليها غير منظم: بيانات المواد متفاوتة،
    واكتشافها صعب على المصانع، ورحلة الشراء والنقل موزعة على قنوات متفرقة يصعب توثيقها.</p></div>
  <div class="card"><div class="top">{ico("link", 24)}<h3>الحل</h3></div>
    <p class="small">منصة تتيح للمنجم عرض المادة ببياناتها، وللمصنع البحث وتقديم طلب شراء والتفاوض على السعر،
    ولشركات النقل المؤهلة تقديم عروضها، ثم متابعة التنفيذ وحفظ مستندات الصفقة.</p></div>
  <div class="card"><div class="top">{ico("coins", 24)}<h3>ما يميّزه</h3></div>
    <p class="small">يرى المصنع <b>التكلفة الكاملة لوصول المادة</b> (قيمة المادة + النقل والبنود الأخرى) قبل تأكيد الطلب،
    ويُوثَّق كل قرار وموعد وحالة في مكان واحد.</p></div>
</div>

<h2>{ico("eval", 22)}نطاق المشروع الحالي</h2>
<p>تبدأ المنصة بمعالجة التحدي الأول: <b>نقص البيانات المنظمة</b> عن المخلفات ومواصفاتها واحتياجات المصانع وفرص نقلها.
لذلك يركّز الإصدار الأول على جمع البيانات وإدخالها بصورة منظمة، وتمكين البحث والمقارنة وتنفيذ المعاملات وتوثيقها.</p>
<div class="note"><b>تنبيه حول الاستخدام الصناعي:</b> لا تفترض المنصة أن جميع مخلفات المناجم قابلة للبيع أو مناسبة للاستخدام الصناعي؛
فصلاحية كل مادة تتوقف على خصائصها ومتطلبات المصنع والتحاليل والاشتراطات ذات العلاقة.
والذكاء الاصطناعي ليس جزءًا من الحل الحالي.</div>
<p class="small muted">المشروع في مرحلة تطوير الفكرة، والمحاور الواردة في هذا الملف فرضيات يستهدف الفريق التحقق منها ميدانيًا مع مناجم ومصانع وناقلين.</p>
""")

AD.sim_pages(page, head, ico)
AD.official_page(page, head, ico)

# =============================================================== 3. PROBLEM
page(2, "المشكلة الحالية", head("THE PROBLEM", "المشكلة الحالية: بيانات متفرقة ورحلة مجزأة") + f"""
<p>يستهدف المشروع سبعة محاور مترابطة، تبدأ من ضعف وضوح المعلومات وتنتهي بصعوبة إتمام الصفقة ومتابعتها.
تبيّن المؤشرات الرسمية في الصفحة السابقة اتساع المجال، أما هذه المحاور فهي فرضيات يسعى الفريق إلى معالجتها والتحقق منها ميدانيًا.</p>

<h2>{ico("data", 22)}أولًا: الاكتشاف والبيانات</h2>
<table>
<tr><th style="width:8mm">#</th><th>المحور</th><th>كيف يظهر</th></tr>
<tr><td class="cu">1</td><td class="k">وصول غير منظم</td><td>توجد لدى بعض المناجم مخلفات ومواد ثانوية قد تناسب استخدامات صناعية أخرى، لكن الوصول إلى الجهات المستفيدة ليس واضحًا أو منظمًا.</td></tr>
<tr><td class="cu">2</td><td class="k">صعوبة الاكتشاف</td><td>يصعب على المصانع معرفة المخلفات المتاحة ومواقعها وكمياتها ومواصفاتها وأسعارها.</td></tr>
<tr><td class="cu">3</td><td class="k">تفاوت البيانات</td><td>تتفاوت المعلومات المتاحة عن المواد، وتنقص أحيانًا التحاليل اللازمة لتقييم ملاءمتها.</td></tr>
</table>

<h2>{ico("truck", 22)}ثانيًا: الصفقة والنقل</h2>
<table>
<tr><th style="width:8mm">#</th><th>المحور</th><th>كيف يظهر</th></tr>
<tr><td class="cu">4</td><td class="k">رحلة مشتتة</td><td>يتوزع التعامل بين البحث عن المادة والتفاوض على بيعها والبحث عن ناقل وترتيب مواعيد التحميل والتسليم.</td></tr>
<tr><td class="cu">5</td><td class="k">أثر النقل في الجدوى</td><td>تؤثر تكلفة النقل والمسافة والوزن وطبيعة الحمولة في الجدوى الاقتصادية للشراء.</td></tr>
<tr><td class="cu">6</td><td class="k">فرص شحن غير واضحة</td><td>يصعب على شركات النقل الوصول إلى فرص شحن تتوافق مع تغطيتها الجغرافية وقدراتها وخدماتها.</td></tr>
</table>

<h2>{ico("doc", 22)}ثالثًا: التوثيق والمتابعة</h2>
<table>
<tr><th style="width:8mm">#</th><th>المحور</th><th>كيف يظهر</th></tr>
<tr><td class="cu">7</td><td class="k">غياب التوثيق</td><td>تُتخذ قرارات الأطراف والمواعيد وحالة الطلب عبر تواصل متفرق يصعب تتبعه والرجوع إليه.</td></tr>
</table>

<div class="note"><b>العلاقة بين المحاور:</b> نقص البيانات (1–3) يجعل قرار الشراء غير واضح من البداية، وتشتت الرحلة وتكلفة النقل (4–6)
قد يُفشلان صفقة مناسبة فنيًا، وغياب التوثيق (7) يرفع صعوبة المتابعة وحل الخلافات. لذلك تعالج مَكنَز المحاور معًا في مسار واحد، لا كلًّا على حدة.</div>
""")

# =============================================================== 4. TARGET SEGMENTS
page(3, "الفئات المستهدفة", head("WHO IT SERVES", "الفئات المستهدفة واحتياجاتها") + f"""
<p>تخدم المنصة ثلاث فئات، لكل منها دور محدد في الصفقة: المنجم يبيع، والمصنع يشتري، والناقل يقدّم خدمة النقل.</p>
<div class="grid g3" style="margin-top:4mm">
  <div class="card"><div class="top">{ico("mine", 30)}<div><h3>المنجم</h3><span class="tag">بائع المادة</span></div></div>
    <p class="small"><b>الاحتياج:</b></p>
    <ul class="l tight small"><li>إظهار المخلفات المتاحة لعملاء محتملين.</li><li>تنظيم العروض والطلبات والكميات.</li><li>رد واضح على الأسعار المقترحة.</li><li>جدولة التحميل وتوثيق التسليم.</li></ul>
    <p class="small"><b>يقدّم للمنصة:</b> بيانات المادة وكمياتها وسعرها وموقعها وتحاليلها إن توفرت.</p></div>
  <div class="card"><div class="top">{ico("factory", 30)}<div><h3>المصنع</h3><span class="tag">مشتري المادة</span></div></div>
    <p class="small"><b>الاحتياج:</b></p>
    <ul class="l tight small"><li>اكتشاف مصادر مواد محتملة.</li><li>مقارنة المواصفات والأسعار.</li><li>معرفة تكلفة النقل قبل الالتزام.</li><li>متابعة الشحنة وتأكيد الاستلام.</li></ul>
    <p class="small"><b>يقدّم للمنصة:</b> طلبات الشراء، وموقع التسليم، ومتطلبات الجودة والكمية عند الحاجة.</p></div>
  <div class="card"><div class="top">{ico("truck", 30)}<div><h3>شركة النقل</h3><span class="tag">مقدّم الخدمة</span></div></div>
    <p class="small"><b>الاحتياج:</b></p>
    <ul class="l tight small"><li>فرص شحن واضحة المواقع والحمولة والموعد.</li><li>فرص تناسب التغطية والسعة.</li><li>تقديم عروض بتسعيرها الخاص.</li><li>تحديث حالة التنفيذ بسهولة.</li></ul>
    <p class="small"><b>يقدّم للمنصة:</b> مناطق التغطية، والمركبات وسعاتها، والخدمات، وعروض النقل.</p></div>
</div>
<h2>{ico("users", 22)}مستخدمون داخل كل جهة</h2>
<p>يُتوقع أن يتعامل مع المنصة داخل كل جهة أكثر من دور، مثل مسؤول المبيعات أو المشتريات، ومسؤول العمليات أو المستودع،
ومسؤول الجودة عند مراجعة المواصفات. تحديد هذه الأدوار وصلاحياتها بدقة جزء من التحقق الميداني.</p>
""")

page(0, "العملاء والسوق", head("CUSTOMERS & MARKET", "العملاء والسوق: من نستهدف أولًا") + f"""
<p>تقسّم مَكنَز قاعدتي العرض والطلب الرسميتين إلى شرائح أضيق، تبدأ بها التحقق الميداني.</p>
""" + AD.SEGMENTS.format(users=ico("users", 22), chart=ico("chart", 22)))

# =============================================================== 5. SOLUTION & LIMITS
page(4, "الحل المقترح وحدوده", head("THE SOLUTION", "الحل المقترح: سوق رقمي متخصص") + f"""
<p class="lead">تجمع مَكنَز اكتشاف المواد، والتواصل التجاري، وطلب الشراء، وترتيب النقل، ومتابعة الصفقة في مسار واحد،
بدل توزيعها على مكالمات ورسائل وجداول منفصلة.</p>
<div class="grid g2" style="margin-top:3mm">
  <div class="card"><div class="top">{ico("check", 24)}<h3>ما تقوم به المنصة</h3></div>
    <ul class="l small">
      <li>عرض المخلفات والمواد الثانوية ببياناتها وكمياتها وأسعارها ومواقعها.</li>
      <li>البحث والتصفية حسب نوع المادة والمنطقة والكمية والسعر.</li>
      <li>إرسال طلبات الشراء والأسعار المقترحة والعروض المقابلة.</li>
      <li>الحجز المبدئي للكمية وتحديد نافذة التحميل.</li>
      <li>استقبال عروض النقل من شركات مؤهلة ومقارنتها.</li>
      <li>عرض التكلفة الكاملة للوصول قبل تأكيد الطلب.</li>
      <li>تتبع حالة التنفيذ وحفظ مستندات الصفقة.</li>
    </ul></div>
  <div class="card"><div class="top">{ico("x", 24)}<h3>حدود الحل</h3></div>
    <ul class="l small">
      <li>لا تحكم المنصة على صلاحية المادة فنيًا؛ القرار للمصنع بناءً على البيانات والتحاليل.</li>
      <li>لا تُجري تحليلًا آليًا للمواد ولا تستخدم تسعيرًا تنبؤيًا.</li>
      <li>الذكاء الاصطناعي ليس جزءًا من الحل الحالي.</li>
      <li>لا تحدد أسعار النقل؛ كل شركة نقل تسعّر خدماتها بصورة مستقلة.</li>
      <li>لا تضمن إعادة الاستخدام أو الأثر البيئي لأي مادة.</li>
      <li>الدفع داخل المنصة خدمة اختيارية تعتمد على تفعيل تكامل مالي.</li>
    </ul></div>
</div>
<h2>{ico("eval", 22)}نسب المطابقة — إن وُجدت</h2>
<p>يمكن للمصنع تسجيل احتياجاته ومتطلبات الجودة والكمية والخصائص، واشتراط التحليل عند الحاجة. وعندها قد تعرض المنصة
<b>نسبة مطابقة</b> ناتجة عن مقارنة الحقول المسجلة بالمتطلبات وفق قواعد واضحة ومعلنة، مع إظهار البيانات الناقصة بشكل مستقل.</p>
<div class="note"><b>مهم:</b> نسبة المطابقة أداة مساعدة للبحث والمقارنة، ولا تمثّل اعتمادًا فنيًا نهائيًا، وليست شرطًا لبدء الشراء.</div>
""")

# =============================================================== 6. DEAL JOURNEY
def step(n, txt, who):
    return f'<div class="st"><span class="num">{n}</span><div>{txt}<span class="who">{who}</span></div></div>'


page(5, "كيف تعمل المنصة", head("HOW IT WORKS", "رحلة الصفقة في 12 خطوة") + f"""
<p>تمر كل صفقة بأربع مراحل. ويفرّق المسار بين <b>القبول المبدئي للبيع</b> بعد اتفاق المنجم والمصنع،
و<b>تأكيد الطلب</b> الذي لا يتم إلا بعد تأمين النقل.</p>
<div class="phases">
  <div class="ph"><div class="pt"><small>01 · SETUP</small>التسجيل والنشر</div>
    {step(1, "يسجل المنجم والمصنع والناقل بياناتهم ومواقعهم.", "جميع الأطراف")}
    {step(2, "ينشر المنجم المخلفات المتاحة ومواصفاتها وكمياتها وأسعارها.", "المنجم")}</div>
  <div class="ph"><div class="pt"><small>02 · AGREE</small>الطلب والاتفاق</div>
    {step(3, "يتصفح المصنع العروض ويختار مادة ويحدد الكمية وموقع التسليم.", "المصنع")}
    {step(4, "يرسل طلب شراء بالسعر المعروض أو بسعر مقترح.", "المصنع")}
    {step(5, "يقبل المنجم الطلب أو يرفضه أو يقدّم عرضًا مقابلًا.", "المنجم")}
    {step(6, "عند الاتفاق تُحجز الكمية مبدئيًا وتُحدد نافذة تحميل.", "المنجم والمصنع")}</div>
  <div class="ph"><div class="pt"><small>03 · TRANSPORT</small>النقل والتأكيد</div>
    {step(7, "تقدم شركات النقل المؤهلة عروضها، أو تؤكد السعر الأولي وفق تفاصيل الشحنة.", "شركات النقل")}
    {step(8, "يقارن المصنع العروض ويختار الناقل.", "المصنع")}
    {step(9, "تؤكد الأطراف السعر والموعد وتفاصيل التنفيذ.", "جميع الأطراف")}
    {step(10, "تُستكمل إجراءات الدفع إذا كانت الخدمة مفعلة.", "المصنع")}</div>
  <div class="ph"><div class="pt"><small>04 · DELIVER</small>التنفيذ والإغلاق</div>
    {step(11, "يتم التحميل والنقل والتسليم مع تحديث الحالة.", "المنجم والناقل")}
    {step(12, "يؤكد المصنع الاستلام وتُغلق الصفقة مع حفظ مستنداتها.", "المصنع")}</div>
</div>
<div class="gates">
  <div class="card gate"><div class="dot o">{ico("clock", 20)}</div><div><h3>قبول مبدئي (بعد الخطوة 6)</h3>
    <p class="small">اتفاق المنجم والمصنع على المادة والسعر والكمية، مع حجز مؤقت مرتبط بمهلة لتأمين النقل. ليس طلبًا مؤكدًا بعد.</p></div></div>
  <div class="card gate"><div class="dot f">{ico("check", 20)}</div><div><h3>تأكيد الطلب (بعد الخطوة 9)</h3>
    <p class="small">يتم بعد اختيار الناقل وتأكيد الأطراف للسعر الإجمالي والموعد وتفاصيل التنفيذ، وعندها تبدأ مرحلة التنفيذ.</p></div></div>
</div>
""")

# =============================================================== 7. MINE
page(6, "تجربة المنجم", head("MINE EXPERIENCE", "تجربة المنجم: مصدر المادة") + f"""
<p>المنجم هو بائع المادة. يحصل على واجهة لعرض ما لديه من مخلفات ومواد ثانوية وإدارة الطلبات الواردة عليها حتى تسليمها للناقل.</p>
<div class="grid g2">
  <div class="card"><div class="top">{ico("layers", 24)}<h3>ما يضيفه المنجم</h3></div>
    <ul class="l small">
      <li>معلومات المنجم ونشاطه وموقعه الجغرافي.</li>
      <li>المواد التي يستخرجها، بوصفها معلومات تعريفية.</li>
      <li>المخلفات والمواد الثانوية المتاحة للبيع.</li>
      <li>نوع كل مادة ووصفها وحالتها الفيزيائية.</li>
      <li>الكمية المتاحة ووحدة القياس.</li>
      <li>المواصفات والخصائص المتوفرة.</li>
      <li>التحاليل والتقارير إن توفرت.</li>
      <li>السعر المعروض للوحدة، وإمكانية التفاوض عليه.</li>
      <li>شروط التحميل ومواعيد الجاهزية.</li>
    </ul></div>
  <div class="card"><div class="top">{ico("check", 24)}<h3>ما يستطيع المنجم فعله</h3></div>
    <ul class="l small">
      <li>استقبال طلبات الشراء من المصانع.</li>
      <li>مراجعة الكميات والأسعار المقترحة.</li>
      <li>قبول الطلب أو رفضه أو تقديم عرض مقابل.</li>
      <li>حجز الكمية المتفق عليها مبدئيًا.</li>
      <li>تحديد نافذة زمنية للتحميل.</li>
      <li>متابعة اختيار الناقل وتنفيذ الصفقة.</li>
      <li>توثيق تسليم المادة للناقل.</li>
    </ul></div>
</div>
<h2>{ico("data", 22)}جودة بيانات العرض</h2>
<p>كلما اكتملت بيانات المادة، سهُل على المصنع تقييمها. لذلك تُظهر المنصة للمنجم الحقول المكتملة والناقصة في كل عرض،
وتميّز بين البيانات المدعومة بتحليل أو تقرير مرفق والبيانات الوصفية المقدّمة من المنجم دون مستند.</p>
<div class="note"><b>تحت المراجعة الميدانية:</b> الحقول الإلزامية لكل نوع من المواد، وصيغ التحاليل الشائعة، وكيفية التعامل مع المواد التي لا تتوفر لها تحاليل.</div>
""")

# =============================================================== 8. FACTORY
page(7, "تجربة المصنع", head("FACTORY EXPERIENCE", "تجربة المصنع: مشتري المادة") + f"""
<p>المصنع هو مشتري المادة. يبحث عن مواد قد تناسب احتياجاته، ويتفاوض على السعر، ويرى تكلفة النقل قبل تأكيد الشراء.</p>
<div class="grid g2">
  <div class="card"><div class="top">{ico("eval", 24)}<h3>ما يستعرضه المصنع</h3></div>
    <ul class="l small">
      <li>المناجم ومواقعها.</li>
      <li>المخلفات المتاحة لدى كل منجم.</li>
      <li>مواصفات المواد وكمياتها وتحاليلها المتاحة.</li>
      <li>الأسعار المعروضة ووحداتها.</li>
      <li>شركات النقل التي تخدم موقع المنجم والوجهة المطلوبة.</li>
    </ul>
    <h3 style="margin-top:3mm">وظيفة مساندة</h3>
    <p class="small">تسجيل الاحتياجات ومتطلبات الجودة والكمية والخصائص، واشتراط التحليل إذا لزم. تساعد هذه الوظيفة في البحث والمقارنة، وليست شرطًا لبدء الشراء.</p></div>
  <div class="card"><div class="top">{ico("check", 24)}<h3>ما يستطيع المصنع فعله</h3></div>
    <ul class="l small">
      <li>البحث حسب نوع المخلفات والمنطقة والكمية والسعر.</li>
      <li>تحديد الكمية المطلوبة وموقع التسليم.</li>
      <li>قبول السعر المعروض أو إرسال سعر مقترح للمنجم.</li>
      <li>مراجعة رد المنجم والاتفاق على الصفقة.</li>
      <li>الاطلاع على خيارات النقل وأسعارها الأولية أو المؤكدة.</li>
      <li>مقارنة عروض النقل وفق الإجمالي والمدة والخدمات والشروط.</li>
      <li>اختيار الناقل وتأكيد الطلب.</li>
      <li>متابعة الشحنة وتأكيد الاستلام.</li>
    </ul></div>
</div>
<h2>{ico("coins", 22)}مقارنة عروض النقل</h2>
<p>تعرض المنصة عروض النقل جنبًا إلى جنب بعناصر قابلة للمقارنة:</p>
<table>
<tr><th>عنصر المقارنة</th><th>ما يوضحه للمصنع</th></tr>
<tr><td class="k">إجمالي السعر</td><td>تكلفة النقل الكاملة للشحنة وفق البنود المعلنة في العرض.</td></tr>
<tr><td class="k">المدة وعدد الرحلات</td><td>الزمن المتوقع للتنفيذ وعدد الرحلات اللازمة للكمية.</td></tr>
<tr><td class="k">الخدمات المشمولة</td><td>هل يشمل العرض التحميل أو التفريغ أو المناولة.</td></tr>
<tr><td class="k">الشروط والصلاحية</td><td>شروط الناقل ومدة صلاحية العرض.</td></tr>
</table>
""")

# =============================================================== 9. CARRIER
page(8, "تجربة شركة النقل", head("CARRIER EXPERIENCE", "تجربة شركة النقل والتسعير اللوجستي") + f"""
<p>شركة النقل هي منفّذ الخدمة اللوجستية. تصل إلى فرص شحن واضحة التفاصيل، وتقدّم عروضها بتسعيرها الخاص، ثم تحدّث حالة التنفيذ.</p>
<div class="grid g2">
  <div class="card"><div class="top">{ico("truck", 24)}<h3>ما تضيفه الشركة</h3></div>
    <ul class="l small">
      <li>موقع الشركة.</li><li>مناطق التغطية ومسارات الخدمة.</li><li>أنواع المركبات وسعاتها.</li>
      <li>أنواع المواد والحمولات التي تستطيع نقلها.</li><li>خدمات التحميل والتفريغ والمناولة إن كانت تقدمها.</li>
      <li>قواعد التسعير والشروط الخاصة بها.</li>
    </ul></div>
  <div class="card"><div class="top">{ico("check", 24)}<h3>ما تستطيع الشركة فعله</h3></div>
    <ul class="l small">
      <li>استعراض طلبات البيع المقبولة مبدئيًا والمنتظرة لتأمين النقل.</li>
      <li>مشاهدة الفرص المتناسبة مع تغطيتها وقدراتها.</li>
      <li>مراجعة موقعي التحميل والتسليم والوزن ونوع المادة والموعد.</li>
      <li>تقديم عرض يشمل السعر والمدة وعدد الرحلات والشروط وصلاحية العرض.</li>
      <li>تنفيذ المهمة بعد اختيارها.</li>
      <li>تحديث مراحل التحميل والنقل والوصول والتسليم.</li>
    </ul></div>
</div>
<h2>{ico("coins", 22)}دور التسعير اللوجستي</h2>
<p>تحدد كل شركة نقل تسعيرتها بصورة مستقلة، ولا تفرض المنصة أسعارًا موحدة. ويمكن أن تعرض المنصة <b>سعرًا أوليًا</b>
مبنيًا على قواعد التسعير التي سجّلتها الشركة، ثم تؤكده الشركة أو تعدّله وفق تفاصيل الشحنة الفعلية.</p>
<table>
<tr><th>عامل الأهلية</th><th>لماذا يهم</th></tr>
<tr><td class="k">الموقع والقرب</td><td>عامل مساعد في ترشيح الشركات، لكنه لا يكفي وحده.</td></tr>
<tr><td class="k">المسار والتغطية</td><td>أن تخدم الشركة مسار التحميل والتسليم المطلوب.</td></tr>
<tr><td class="k">نوع المادة</td><td>أن تكون المركبات والتجهيزات مناسبة لطبيعة الحمولة.</td></tr>
<tr><td class="k">السعة والتوافر</td><td>أن تتوفر المركبات اللازمة للكمية ضمن نافذة التحميل.</td></tr>
</table>
""" + AD.CARRIER_NOTE)

# =============================================================== 10. PRICING & FEASIBILITY
page(9, "التسعير والجدوى", head("PRICING", "التسعير والجدوى: تكلفة الوصول أولًا") + f"""
<p>يعتمد قرار الشراء على <b>تكلفة وصول المادة إلى المصنع</b>، لا على سعر المخلفات وحده؛ فمادة منخفضة السعر قد تصبح غير مجدية إذا ارتفعت تكلفة نقلها.</p>
<div class="grid g2">
  <div>
    <h2 style="margin-top:0">{ico("layers", 22)}عناصر التكلفة</h2>
    <ul class="l small">
      <li>قيمة المادة حسب الكمية وسعر الوحدة.</li>
      <li>التجهيز أو المناولة إذا كانت ضمن الاتفاق.</li>
      <li>تكلفة النقل وعدد الرحلات.</li>
      <li>التحميل والتفريغ إذا لم يكونا مشمولين.</li>
      <li>أي رسوم أو بنود إضافية معلنة.</li>
    </ul>
    <p class="small muted">لا يتضمن الملف نسبًا ضريبية أو رسومًا ثابتة؛ تُحتسب البنود وفق ما تعلنه الأطراف ويُتفق عليه.</p>
  </div>
  <div class="card">
    <span class="tag">مثال افتراضي للتوضيح فقط</span>
    <p class="small muted" style="margin:0">600 طن بسعر متفق عليه 42 ر.س للطن</p>
    <table style="margin:1mm 0 0">
      <tr><td style="white-space:nowrap">قيمة المادة</td><td class="k">25,200 ر.س</td></tr>
      <tr><td style="white-space:nowrap">النقل</td><td class="k">21,600 ر.س</td></tr>
      <tr><td style="white-space:nowrap">التحميل والتفريغ</td><td class="k">مشمول</td></tr>
      <tr class="tot"><td style="white-space:nowrap">الإجمالي</td><td style="white-space:nowrap">46,800 ر.س</td></tr>
    </table>
    <p class="small muted" style="margin-top:2mm">جميع الأرقام افتراضية ولا تمثل أسعارًا فعلية.</p>
  </div>
</div>
<h2>{ico("doc", 22)}مراحل السعر في الصفقة</h2>
<table>
<tr><th>المرحلة</th><th>المعنى</th><th>من يحدده</th></tr>
<tr><td class="k">السعر المعروض</td><td>سعر الوحدة الذي ينشره المنجم مع المادة.</td><td>المنجم</td></tr>
<tr><td class="k">السعر المقترح</td><td>سعر يرسله المصنع مع طلب الشراء إن لم يقبل السعر المعروض.</td><td>المصنع</td></tr>
<tr><td class="k">السعر المتفق عليه</td><td>سعر المادة بعد قبول الطلب أو العرض المقابل.</td><td>المنجم والمصنع</td></tr>
<tr><td class="k">تكلفة النقل الأولية</td><td>تقدير مبني على قواعد تسعير الناقل قبل تأكيده.</td><td>قواعد الناقل</td></tr>
<tr><td class="k">عرض النقل المؤكد</td><td>سعر يلتزم به الناقل وفق تفاصيل الشحنة وصلاحية العرض.</td><td>شركة النقل</td></tr>
<tr><td class="k">الإجمالي النهائي</td><td>مجموع البنود المتفق عليها كما يظهر عند تأكيد الطلب.</td><td>جميع الأطراف</td></tr>
</table>
""")

# =============================================================== 11. TIMING, CANCELLATION, DOCUMENTS
page(10, "المواعيد والإلغاء والمستندات", head("TIMING & DOCUMENTS", "المواعيد والإلغاء والمستندات") + f"""
<p>تنظم المنصة الجوانب الزمنية للصفقة، وتربط معالجة أي تأخير أو إلغاء <b>بحالة التنفيذ والسياسة المتفق عليها</b>، لا بمرور الوقت وحده.</p>
<table>
<tr><th>الموقف</th><th>المعالجة في المنصة</th></tr>
<tr><td class="k">مهلة تأمين الناقل</td><td>بعد القبول المبدئي تبدأ مهلة محددة لاختيار ناقل وتأكيد الطلب.</td></tr>
<tr><td class="k">لم يتوفر ناقل ضمن المهلة</td><td>يمكن إنهاء الطلب وإطلاق حجز المادة لتعود متاحة لعملاء آخرين.</td></tr>
<tr><td class="k">نافذة التحميل</td><td>فترة يتفق عليها المنجم والمصنع ويلتزم بها الناقل المختار.</td></tr>
<tr><td class="k">التأخير أو التعثر</td><td>تسجيل التأخير وسببه وإشعار الأطراف المعنية لمتابعته.</td></tr>
<tr><td class="k">إعادة الجدولة</td><td>تتم بموافقة الأطراف المعنية، مع حفظ الموعد السابق والجديد.</td></tr>
<tr><td class="k">بعد الدفع أو بدء التحميل</td><td>لا إلغاء تلقائي لمجرد تجاوز الوقت؛ تُعالج الحالة وفق ما نُفّذ فعلًا والبنود المتفق عليها.</td></tr>
<tr><td class="k">مبالغ محصّلة مسبقًا</td><td>يُعالج الاسترجاع وفق حالة الدفع والبنود المتفق عليها، ويعتمد تنفيذه الفعلي على وجود تكامل مالي.</td></tr>
</table>
<h2>{ico("doc", 22)}مستندات الصفقة</h2>
<p>تفرّق المنصة بين أنواع المستندات، وتحفظها مرتبطة بالصفقة:</p>
<div class="grid g2">
  <div class="card"><h3>مستندات تصدرها المنصة</h3><ul class="l small tight">
    <li>تأكيد الطلب.</li><li>عرض النقل المعتمد.</li><li>إثبات التحميل.</li><li>إثبات التسليم وتأكيد الاستلام.</li></ul></div>
  <div class="card"><h3>مستندات تصدرها الجهات المعنية</h3><ul class="l small tight">
    <li>الفواتير الصادرة من البائع أو الناقل.</li><li>التحاليل والتقارير الفنية.</li><li>أي تصاريح أو مستندات نظامية مطلوبة.</li></ul></div>
</div>
<div class="note"><b>توضيح:</b> المستندات التي تُنشئها المنصة مستندات تنظيمية للمتابعة، وليست فواتير ضريبية معتمدة.</div>
""")

# =============================================================== 12. VALUE
page(11, "القيمة المقدمة", head("VALUE", "القيمة المقدمة والتميّز في تجربة الاستخدام") + f"""
<p>تستهدف المنصة تقديم قيمة مختلفة لكل طرف، وتُقاس هذه القيمة فعليًا خلال التحقق الميداني والتشغيل التجريبي.</p>
<div class="grid g2">
  <div class="card"><div class="top">{ico("mine", 28)}<h3>للمنجم</h3></div>
    <p class="small">إظهار المخلفات لعملاء محتملين، وتنظيم عروضها وطلباتها وكمياتها، وإتاحة فرص الاستفادة منها عند ملاءمتها.</p></div>
  <div class="card"><div class="top">{ico("factory", 28)}<h3>للمصنع</h3></div>
    <p class="small">تسهيل اكتشاف مصادر مواد محتملة، ومقارنة المواصفات والأسعار، وفهم تكلفة النقل قبل تأكيد الشراء.</p></div>
  <div class="card"><div class="top">{ico("truck", 28)}<h3>لشركة النقل</h3></div>
    <p class="small">الوصول إلى فرص شحن أوضح من حيث المواقع والحمولة والموعد، وتقديم عروض تتناسب مع خدماتها.</p></div>
  <div class="card dark"><div class="top">{ico("link", 28)}<h3>للمنظومة</h3></div>
    <p class="small">يمكن أن تسهم المنصة في تحسين وضوح المعلومات والتنسيق بين الأطراف، ودعم فرص إعادة الاستخدام الصناعي للمواد التي تثبت ملاءمتها.</p></div>
</div>
<h2>{ico("check", 22)}مبادئ تجربة الاستخدام</h2>
<table>
<tr><th>المبدأ</th><th>كيف يظهر في المنصة</th></tr>
<tr><td class="k">مسار واحد</td><td>كل خطوة من العرض إلى الاستلام في مكان واحد، مع حالة واضحة للطلب في كل لحظة.</td></tr>
<tr><td class="k">وضوح الدور</td><td>كل طرف يرى ما يخصه من إجراءات، ويعرف من ينتظر من.</td></tr>
<tr><td class="k">شفافية التكلفة</td><td>عرض الإجمالي وعناصره قبل التأكيد، والتفريق بين الأولي والمؤكد.</td></tr>
<tr><td class="k">صدق البيانات</td><td>تمييز البيانات المدعومة بمستند عن الوصفية، وإظهار الناقص بوضوح.</td></tr>
<tr><td class="k">توثيق تلقائي</td><td>حفظ القرارات والمواعيد والمستندات دون جهد إضافي من الأطراف.</td></tr>
</table>
""")

# =============================================================== 13. MVP & VALIDATION
page(12, "النسخة الأولى والتحقق", head("MVP & VALIDATION", "نطاق النسخة الأولى وخطة التحقق الميداني") + f"""
<div class="grid g2">
  <div class="card"><div class="top">{ico("check", 24)}<h3>ضمن النسخة الأولى (مقترح)</h3></div>
    <ul class="l small tight">
      <li>تسجيل المناجم والمصانع وشركات النقل ومواقعهم.</li>
      <li>نشر عروض المواد بالحقول الأساسية والمرفقات.</li>
      <li>البحث والتصفية والمقارنة.</li>
      <li>طلب الشراء والسعر المقترح والعرض المقابل.</li>
      <li>الحجز المبدئي ونافذة التحميل.</li>
      <li>تقديم عروض النقل ومقارنتها.</li>
      <li>تأكيد الطلب وتتبع الحالة وحفظ المستندات.</li>
    </ul></div>
  <div class="card"><div class="top">{ico("clock", 24)}<h3>مؤجل لمراحل لاحقة</h3></div>
    <ul class="l small tight">
      <li>الدفع الإلكتروني داخل المنصة والاسترجاع الفعلي.</li>
      <li>التكامل مع أنظمة خارجية.</li>
      <li>أي وظائف معتمدة على الذكاء الاصطناعي.</li>
    </ul>
    <p class="small muted" style="margin-top:2mm">في النسخة الأولى يمكن أن يتم الدفع خارج المنصة مع توثيق حالته فيها.</p></div>
</div>
<h2>{ico("flag", 22)}ما يحتاج إلى تحقق ميداني</h2>
<p>يحتاج المشروع إلى بيانات وردود فعل من مناجم ومصانع وناقلين للتحقق من:</p>
<ul class="l">
  <li>أنواع المخلفات وكمياتها وخصائصها.</li>
  <li>متطلبات المصانع وقبولها المحتمل للمواد.</li>
  <li>تكاليف ومسارات النقل وإمكانات الخدمة.</li>
  <li>ملاءمة تسلسل الشراء والتعاقد للأطراف.</li>
  <li>الجدوى الفعلية لكل حالة، دون افتراضها مسبقًا.</li>
  <li>الاشتراطات النظامية والبيئية المرتبطة ببيع المواد ونقلها.</li>
</ul>
<h2>{ico("chart", 22)}مراحل التحقق المقترحة</h2>
<div class="grid g3">
  <div class="card"><span class="tag">المرحلة 1</span><h3>المقابلات الاستكشافية</h3><p class="small">مقابلات مع ممثلين من الفئات الثلاث لفهم الواقع الحالي واختبار المحاور.</p></div>
  <div class="card"><span class="tag">المرحلة 2</span><h3>اختبار النموذج</h3><p class="small">عرض نموذج أولي للرحلة على المستخدمين وتعديله وفق ملاحظاتهم.</p></div>
  <div class="card"><span class="tag">المرحلة 3</span><h3>تشغيل تجريبي محدود</h3><p class="small">تنفيذ صفقات فعلية محدودة لنوع مواد ومنطقة محددين، وقياس النتائج.</p></div>
</div>
""")

# =============================================================== 14. FUTURE, KPIs, BUSINESS MODEL OPTIONS
page(13, "التطوير المستقبلي والمؤشرات", head("NEXT", "التطوير المستقبلي ومؤشرات قياس النجاح") + f"""
<h2 style="margin-top:0">{ico("chart", 22)}مؤشرات مقترحة للقياس</h2>
<p class="small muted">مؤشرات تُقاس عند بدء التشغيل، دون قيم حالية أو أهداف معتمدة بعد.</p>
<div class="kpi">
  <div>{ico("layers", 18)}عدد عروض المواد المكتملة البيانات.</div>
  <div>{ico("users", 18)}عدد المؤسسات المسجلة والمعتمدة.</div>
  <div>{ico("doc", 18)}عدد طلبات الشراء وعروض النقل.</div>
  <div>{ico("clock", 18)}الزمن اللازم لتأمين ناقل.</div>
  <div>{ico("check", 18)}نسبة الطلبات التي تكتمل.</div>
  <div>{ico("x", 18)}أسباب الإلغاء والتعثر.</div>
  <div>{ico("truck", 18)}الأطنان التي تم توريدها وقبولها فعليًا (المؤشر الأهم).</div>
  <div>{ico("coins", 18)}تكلفة الطن واصلًا إلى المصنع.</div>
  <div>{ico("layers", 18)}نسبة الكميات المتداولة من الكميات المؤهلة المعروضة.</div>
</div>
<div class="note"><b>ملاحظة:</b> عدد المستخدمين المسجلين وحده لا يكفي دليلًا على الجدوى التجارية؛ المؤشر الأهم هو كمية المخلفات التي وصلت إلى استخدام صناعي مؤكد. ويمكن وضع أهداف تجريبية معلنة عند بدء التشغيل بدل نتائج غير محققة.</div>

<h2>{ico("coins", 22)}خيارات نموذج العمل المقترحة</h2>
<p class="small">خيارات للدراسة والتحقق، وليست قرارًا معتمدًا:</p>
<table>
<tr><th>الخيار</th><th>الفكرة</th></tr>
<tr><td class="k">عمولة على الصفقة</td><td>نسبة أو رسم على الصفقات المكتملة فقط.</td></tr>
<tr><td class="k">اشتراك للمؤسسات</td><td>اشتراك دوري للمناجم أو المصانع أو الناقلين مقابل مزايا محددة.</td></tr>
<tr><td class="k">رسوم حجز النقل</td><td>رسم على عروض النقل المؤكدة عبر المنصة.</td></tr>
<tr><td class="k">خدمات مساندة</td><td>تنسيق التحاليل أو الفحص مع جهات متخصصة عند الطلب.</td></tr>
</table>

<h2>{ico("flag", 22)}التطوير المستقبلي</h2>
<ul class="l small">
  <li>تفعيل الدفع الإلكتروني والاسترجاع عبر تكامل مالي.</li>
  <li>التكامل مع المختبرات لاستقبال نتائج التحاليل مباشرة.</li>
  <li>تقييمات الأداء بين الأطراف بعد إغلاق الصفقات.</li>
  <li>بعد توافر بيانات فعلية كافية: دراسة أدوات تحليلية أو ذكاء اصطناعي للمساعدة في البحث والمقارنة.</li>
</ul>
""")

# =============================================================== 15. TEAM
page(14, "فريق المشروع", head("THE TEAM", "فريق المشروع") + f"""
<p>يعمل على مَكنَز فريق من ستة أعضاء:</p>
<div class="team">
  <div class="mem lead"><div class="av">{ico("users", 26)}</div><div><b>حربي بن محمد الناصري</b><span>قائد الفريق</span></div></div>
  <div class="mem"><div class="av">{ico("users", 24)}</div><div><b>حمود سهيل العتيبي</b><span>عضو الفريق</span></div></div>
  <div class="mem"><div class="av">{ico("users", 24)}</div><div><b>محسن سراج الغامدي</b><span>عضو الفريق</span></div></div>
  <div class="mem"><div class="av">{ico("users", 24)}</div><div><b>لمى العمير</b><span>عضو الفريق</span></div></div>
  <div class="mem"><div class="av">{ico("users", 24)}</div><div><b>رنيم المالكي</b><span>عضو الفريق</span></div></div>
  <div class="mem"><div class="av">{ico("users", 24)}</div><div><b>لمى منصور</b><span>عضو الفريق</span></div></div>
</div>
<h2>{ico("doc", 22)}عن هذا الملف</h2>
<ul class="l small">
  <li>أُعد هذا الملف لتعريف الشركاء المحتملين ولجان التقييم والجهات الصناعية واللوجستية بالمشروع.</li>
  <li>الأرقام الرسمية موسومة «مصدر رسمي» ومراجعها بروابطها في صفحة المراجع، والحسابات المشتقة منها موسومة «حساب مشتق».</li>
  <li>أرقام سيناريو المحاكاة والأمثلة افتراضات توضيحية موسومة «محاكاة»، وليست نتائج تشغيل فعلية.</li>
  <li>لا يدّعي الملف وجود شراكات أو عملاء أو صفقات منفذة؛ ومحاور المشكلة فرضيات قيد التحقق الميداني.</li>
</ul>
<div class="endmark"><img class="i" src="{A}/icon.png"><span class="en">HIDDEN RESOURCES. NEW VALUE.</span>
<p class="small muted" style="text-align:center;margin-top:1.5mm">من الموارد غير المستغلة، إلى فرص صناعية قابلة للتقييم.</p></div>
""")

page(0, "المراجع", head("REFERENCES", "المراجع") + AD.SOURCES)

html = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مَكنَز | MAKNAZ — ملف تعريفي</title>
<style>{CSS}</style></head><body>{''.join(pages).replace(TOTAL, str(len(pages)))}</body></html>"""
OUT = HERE / "out"   # git-ignored; copy the PDF to docs/exports/ after review
OUT.mkdir(exist_ok=True)
(OUT / "overview.html").write_text(html, encoding="utf-8")

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page()
    pg.goto((OUT / "overview.html").as_uri(), wait_until="networkidle")
    pg.evaluate("document.fonts.ready")
    over = pg.evaluate("""() => [...document.querySelectorAll('.page')].map((p,i)=>{
        const ft=p.querySelector('.ft'); const lim = ft ? ft.getBoundingClientRect().top : p.getBoundingClientRect().bottom;
        let mx=0; p.querySelectorAll('.page > *:not(.ft):not(.hd):not(.bg):not(.shade):not(.pat):not(.endmark)').forEach(e=>{mx=Math.max(mx,e.getBoundingClientRect().bottom)});
        return [i+1, Math.round(lim-mx)] })""")
    print("space before footer (px):", over)
    pg.pdf(path=str(OUT / "MAKNAZ_Project_Brief_Updated.pdf"), format="A4", print_background=True,
           margin={"top": "0", "bottom": "0", "left": "0", "right": "0"}, prefer_css_page_size=True)
    b.close()
print("pages:", len(pages))
