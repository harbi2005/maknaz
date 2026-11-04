# Content blocks spliced into build.py (simulation section, official figures, market, sources).
EXTRA_CSS = """
.sim { display:inline-block; font-size:7.2pt; padding:.2mm 2.4mm; border-radius:3mm; border:.3mm dashed var(--cu); color:var(--cu); background:rgba(184,115,79,.06); }
.off { display:inline-block; font-size:7.2pt; padding:.2mm 2.4mm; border-radius:3mm; background:var(--ch); color:var(--sa); }
.der { display:inline-block; font-size:7.2pt; padding:.2mm 2.4mm; border-radius:3mm; border:.3mm solid var(--gr); color:var(--gr); }
.disc { border:.35mm dashed var(--cu); border-radius:2mm; padding:2.6mm 4mm; font-size:8.6pt; line-height:1.75; margin:0 0 4mm; background:rgba(184,115,79,.05); }
.stats { display:grid; gap:3mm; margin:2mm 0 3mm; }
.s3 { grid-template-columns: repeat(3,1fr);} .s4 { grid-template-columns: repeat(4,1fr);} .s6 { grid-template-columns: repeat(6,1fr);}
.stat { background:var(--card); border:.3mm solid var(--line); border-radius:2.6mm; padding:2.8mm 3mm 2.4mm; }
.stat .v { font-family:'La'; font-weight:500; font-size:16pt; line-height:1.2; color:var(--ch); direction:ltr; text-align:right; }
.stat .v small { font-family:'Ar'; font-size:8pt; font-weight:400; color:var(--gr); }
.stat .t { font-size:7.8pt; line-height:1.55; color:var(--ch); margin-top:.8mm; }
.stat .x { font-size:6.9pt; color:var(--gr); line-height:1.5; margin-top:.6mm; }
.stat.dk { background:var(--ch); border:none; } .stat.dk .v, .stat.dk .t { color:var(--sa); } .stat.dk .v small, .stat.dk .x { color:#a9aeb0; }
.stat .lb { margin-bottom:1.2mm; }
table.sm { font-size:7.9pt; line-height:1.55; } table.sm td, table.sm th { padding:1.6mm 2.2mm; }
td.num { font-family:'La'; direction:ltr; text-align:right; white-space:nowrap; }
td.pos { color:var(--cu); font-weight:700; }
.bar { display:flex; height:9mm; border-radius:1.6mm; overflow:hidden; margin:1.5mm 0 1mm; font-size:7.8pt; }
.bar div { display:flex; align-items:center; justify-content:center; color:var(--sa); }
.bar .m { background:var(--gr); } .bar .tr { background:var(--cu); }
.formula { background:var(--ch); color:var(--sa); border-radius:2.4mm; padding:3mm 4mm; font-size:8.4pt; line-height:1.85; margin:2mm 0 3mm; }
.formula b { color:#d9a183; }
.eq { direction:ltr; unicode-bidi:isolate; display:inline-block; font-family:'La'; }
.refs { margin:4mm 0; }
.ref { display:flex; gap:3.5mm; background:var(--card); border:.3mm solid var(--line); border-radius:2.6mm; padding:3.4mm 4mm; margin-bottom:3mm; font-size:8.6pt; line-height:1.7; }
.ref .rn { flex:none; width:7mm; height:7mm; border-radius:50%; background:var(--cu); color:var(--sa); font-family:'La'; font-weight:500; display:flex; align-items:center; justify-content:center; }
.ref .rm { font-size:7.8pt; color:var(--gr); margin:.6mm 0 1.2mm; }
.ref a { display:block; color:var(--cu); text-decoration:underline; font-family:'La'; font-size:7.6pt; direction:ltr; text-align:left; unicode-bidi:isolate; word-break:break-all; }
.src { font-size:7.9pt; line-height:1.6; }
.src li { margin-bottom:2.2mm; }
.src a { color:var(--cu); text-decoration:none; word-break:break-all; font-family:'La'; direction:ltr; unicode-bidi:isolate; font-size:7.2pt; }
"""

SIM_DISC = ('<div class="disc"><b class="cu">تنبيه:</b> الأرقام التالية افتراضات توضيحية لاختبار أثر الحل، '
            'ولا تمثل نتائج تشغيل فعلية أو إحصاءات عن السوق.</div>')


def sim_pages(page, head, ico):
    # ------------------------------------------------------------ SIM 1: scenario + baseline
    page(0, "المشكلة والأثر بالأرقام", head("SIMULATION SCENARIO", "المشكلة والأثر بالأرقام — سيناريو محاكاة") + SIM_DISC + f"""
<p>لتصوّر حجم التعقيد في اكتشاف المخلفات المناسبة وتأمين نقلها، نبني حالة افتراضية واحدة ونستخدمها في جميع الحسابات التالية.
<b>يفترض المثال أن المصنع راجع مواصفات المادة وقبلها مبدئيًا</b>، ولا يفترض صلاحية المخلفات للاستخدام الصناعي بشكل عام.</p>
<h2 style="margin-top:3mm">{ico("layers", 22)}السيناريو المرجعي <span class="sim">محاكاة</span></h2>
<div class="stats s3">
  <div class="stat"><div class="v">2,000 <small>طن</small></div><div class="t">مادة ثانوية موصوفة يعرضها منجم (أ) — مثال: خبث معدني</div><div class="x">سعر معروض 45 ر.س/طن · المتفق عليه 42 ر.س/طن</div></div>
  <div class="stat"><div class="v">600 <small>طن</small></div><div class="t">الكمية التي يطلبها مصنع (ب) — مصنع مواد بناء</div><div class="x">نافذة تحميل: 7 أيام</div></div>
  <div class="stat"><div class="v">180 <small>كم</small></div><div class="t">المسافة بين موقع المنجم والمصنع</div><div class="x">حمولة صافية 34 طنًا للرحلة ← 18 رحلة</div></div>
</div>
<div class="stats s3">
  <div class="stat"><div class="t"><b>ناقل (1)</b></div><div class="v">21,600 <small>ر.س</small></div><div class="x">يشمل التحميل والتفريغ · 3 أيام</div></div>
  <div class="stat"><div class="t"><b>ناقل (2)</b></div><div class="v">19,800 <small>ر.س</small></div><div class="x">لا يشمل التحميل والتفريغ · 5 أيام</div></div>
  <div class="stat"><div class="t"><b>ناقل (3)</b></div><div class="v">23,400 <small>ر.س</small></div><div class="x">يشمل التحميل والتفريغ · يومان</div></div>
</div>

<h2>{ico("flag", 22)}التحديات قبل المنصة <span class="sim">محاكاة</span></h2>
<table class="sm">
<tr><th>المؤشر</th><th>القيمة المفترضة</th><th>الوحدة</th><th>العينة والفترة</th></tr>
<tr><td class="k">زمن العثور على مادة مناسبة ومراجعة معلوماتها</td><td class="num">15</td><td>يوم عمل</td><td>صفقة السيناريو</td></tr>
<tr><td class="k">مرات طلب معلومات إضافية عن المادة</td><td class="num">6</td><td>طلب</td><td>صفقة السيناريو</td></tr>
<tr><td class="k">الاتصالات والمراسلات للتنسيق بين الأطراف</td><td class="num">40</td><td>مكالمة/رسالة</td><td>صفقة السيناريو</td></tr>
<tr><td class="k">الحصول على 3 عروض نقل قابلة للمقارنة</td><td class="num">7</td><td>يوم عمل</td><td>صفقة السيناريو</td></tr>
<tr><td class="k">تكلفة المادة / تكلفة النقل</td><td class="num">25,200 / 21,600</td><td>ريال</td><td>صفقة السيناريو</td></tr>
<tr><td class="k">حصة النقل من إجمالي تكلفة الوصول</td><td class="num">46.2%</td><td>نسبة</td><td>صفقة السيناريو</td></tr>
<tr><td class="k">الطلبات المكتملة</td><td class="num">12 / 20 (60%)</td><td>طلب</td><td>20 طلبًا افتراضيًا خلال 6 أشهر</td></tr>
<tr><td class="k">الطلبات المتعثرة وأسبابها</td><td>8: لم يتوفر ناقل في المهلة (3)، تكلفة وصول أعلى من المتوقع (3)، بيانات ناقصة (2)</td><td>طلب</td><td>نفس العينة</td></tr>
</table>
<p class="small muted">قيم حالة واحدة وعينة افتراضية صغيرة؛ لا يُستنتج منها وضع القطاع كاملًا.</p>
""")

    # ------------------------------------------------------------ SIM 2: transport decides feasibility
    page(0, "المشكلة والأثر بالأرقام", head("SIMULATION · TRANSPORT", "النقل يحدد جدوى الصفقة") + SIM_DISC + f"""
<p>سعر المادة المنخفض وحده لا يكفي للحكم على جدوى الشراء؛ القرار يعتمد على <b>تكلفة وصول الطن إلى المصنع</b>.</p>
<h2 style="margin-top:2mm">{ico("truck", 22)}مقارنة عروض النقل على أساس موحد <span class="sim">محاكاة</span></h2>
<p class="small">الأساس الموحد: 600 طن · المسار نفسه (180 كم) · 18 رحلة · شامل التحميل والتفريغ. أضفنا لعرض الناقل (2) تكلفة تحميل وتفريغ مفترضة قدرها 150 ر.س للرحلة.</p>
<table class="sm">
<tr><th>العرض</th><th>السعر المعلن</th><th>بنود غير مشمولة</th><th>الإجمالي الموحد</th><th>للطن</th><th>المدة</th></tr>
<tr><td class="k">ناقل (1)</td><td class="num">21,600</td><td>—</td><td class="num pos">21,600</td><td class="num">36.0</td><td>3 أيام</td></tr>
<tr><td class="k">ناقل (2)</td><td class="num">19,800</td><td class="num">+ 2,700 (18 × 150)</td><td class="num">22,500</td><td class="num">37.5</td><td>5 أيام</td></tr>
<tr><td class="k">ناقل (3)</td><td class="num">23,400</td><td>—</td><td class="num">23,400</td><td class="num">39.0</td><td>يومان</td></tr>
</table>
<div class="note"><b>القراءة:</b> العرض الأقل سعرًا في الظاهر (ناقل 2) ليس الأقل بعد توحيد البنود. والفرق بين ناقل (1) وناقل (2) — 900 ر.س — فرق افتراضي بين خيارين بعد توحيد أساس المقارنة، وليس توفيرًا حققته المنصة.
وقد يختار المصنع ناقل (3) الأعلى سعرًا إذا كانت مدة اليومين أهم له.</div>

<h2>{ico("coins", 22)}مكونات تكلفة الوصول (مع ناقل 1) <span class="sim">محاكاة</span></h2>
<div class="bar"><div class="m" style="width:53.8%">قيمة المادة 25,200 ر.س · <span class="eq">⁦53.8%⁩</span></div><div class="tr" style="width:46.2%">النقل 21,600 ر.س · <span class="eq">⁦46.2%⁩</span></div></div>
<div class="formula">حصة النقل من الإجمالي = تكلفة النقل ÷ إجمالي تكلفة الوصول × 100
= <b><span class="eq">⁦21,600 ÷ 46,800 × 100 = 46.2%⁩</span></b><br>تكلفة الطن واصلًا: <b><span class="eq">⁦46,800 ÷ 600 = 78⁩</span> ر.س/طن</b>، رغم أن سعر المادة نفسها 42 ر.س/طن.</div>

<h2>{ico("eval", 22)}أثر المسافة في القرار <span class="sim">محاكاة</span></h2>
<p class="small">نفترض أن المصنع يستخدم حاليًا مادة بديلة تصله بـ 85 ر.س/طن. نقارن الحالة نفسها على مسافتين:</p>
<table class="sm">
<tr><th>المسافة</th><th>النقل (18 رحلة)</th><th>قيمة المادة</th><th>الإجمالي</th><th>الطن واصلًا</th><th>مقارنة بالبديل (85)</th></tr>
<tr><td class="k">180 كم</td><td class="num">21,600 (1,200/رحلة)</td><td class="num">25,200</td><td class="num">46,800</td><td class="num pos">78</td><td>أقل بـ 7 ر.س/طن — تستحق التقييم</td></tr>
<tr><td class="k">360 كم</td><td class="num">39,600 (2,200/رحلة)</td><td class="num">25,200</td><td class="num">64,800</td><td class="num">108</td><td>أعلى بـ 23 ر.س/طن — غير مجدية بهذه الشروط</td></tr>
</table>
<p class="small muted">المادة وسعرها لم يتغيرا؛ تغيّرت المسافة وتكلفة النقل فقط. لهذا تعرض مَكنَز تكلفة الوصول قبل تأكيد الطلب.</p>
""")

    # ------------------------------------------------------------ SIM 3: before/after + hypotheses
    page(0, "المشكلة والأثر بالأرقام", head("SIMULATION · IMPACT", "قبل مَكنَز وبعدها") + SIM_DISC + f"""
<table class="sm">
<tr><th>المؤشر</th><th>دون المنصة</th><th>باستخدام مَكنَز</th><th>الفرق</th><th>نسبة التغير</th><th>سبب التحسن المفترض</th></tr>
<tr><td class="k">العثور على مادة ومراجعة معلوماتها (يوم عمل)</td><td class="num">15</td><td class="num">9</td><td class="num">−6</td><td class="num pos">−40%</td><td>البحث والتصفية وتوحيد بيانات العرض</td></tr>
<tr><td class="k">طلبات المعلومات الإضافية (طلب/صفقة)</td><td class="num">6</td><td class="num">4</td><td class="num">−2</td><td class="num pos">−33.3%</td><td>حقول موحدة وإظهار البيانات الناقصة مسبقًا</td></tr>
<tr><td class="k">الاتصالات والمراسلات (لكل صفقة)</td><td class="num">40</td><td class="num">26</td><td class="num">−14</td><td class="num pos">−35%</td><td>الطلب والعروض والحالة في قناة واحدة</td></tr>
<tr><td class="k">3 عروض نقل قابلة للمقارنة (يوم عمل)</td><td class="num">7</td><td class="num">4</td><td class="num">−3</td><td class="num pos">−42.9%</td><td>طلب نقل موحد يصل للناقلين المؤهلين</td></tr>
<tr><td class="k">تكلفة النقل للشحنة (ريال)</td><td class="num">21,600</td><td class="num">21,600</td><td class="num">0</td><td class="num">0%</td><td>لا نفترض خفض الأسعار؛ القيمة في وضوح المقارنة وسرعتها</td></tr>
<tr><td class="k">الطلبات المكتملة (من 20 خلال 6 أشهر)</td><td class="num">12 (60%)</td><td class="num">15 (75%)</td><td class="num">+3 طلبات</td><td class="num pos">+15 نقطة مئوية</td><td>مهلة تأمين الناقل وتتبع الحالة وإظهار تكلفة الوصول مبكرًا</td></tr>
</table>
<div class="formula">
نسبة الانخفاض = (القيمة قبل − القيمة بعد) ÷ القيمة قبل × 100 ← مثال: <b><span class="eq">⁦(15 − 9) ÷ 15 × 100 = 40%⁩</span></b><br>
نسبة الطلبات المكتملة = المكتملة ÷ الإجمالي × 100 ← <b><span class="eq">⁦12 ÷ 20 = 60%⁩</span></b> قبل، و<b><span class="eq">⁦15 ÷ 20 = 75%⁩</span></b> بعد<br>
الانتقال من 60% إلى 75% = زيادة <b>15 نقطة مئوية</b>، أو تحسن نسبي قدره <b><span class="eq">⁦(75 − 60) ÷ 60 × 100 = 25%⁩</span></b>
</div>
<p class="small muted">لا نجمع نسب التغير في مؤشرات مختلفة لإنتاج «أثر إجمالي»؛ كل مؤشر يُقاس بوحدته.</p>

<h2>{ico("check", 22)}أثر متوقع يمكن التحقق منه</h2>
<table class="sm">
<tr><th>الفرضية</th><th>البيانات المطلوبة للتحقق</th><th>طريقة القياس</th></tr>
<tr><td class="k">تقليل زمن تأمين الناقل</td><td>وقت فتح طلب النقل ووقت قبول العرض</td><td>متوسط المدة بينهما لكل طلب</td></tr>
<tr><td class="k">تحسين اكتمال الطلبات</td><td>حالة كل طلب وسبب الإلغاء</td><td>المكتمل ÷ الإجمالي خلال فترة محددة، مع تصنيف الأسباب</td></tr>
<tr><td class="k">تحسين وضوح التكلفة</td><td>السعر الأولي والمبلغ النهائي لكل صفقة</td><td>الفرق بينهما وأسبابه</td></tr>
<tr><td class="k">تقليل تكرار طلب المعلومات</td><td>طلبات استكمال البيانات لكل طلب شراء</td><td>عددها لكل طلب قبل الاتفاق</td></tr>
<tr><td class="k">جدوى أوضح للمشتري</td><td>تكلفة الطن واصلًا للمادة البديلة والحالية</td><td>المقارنة لكل صفقة مكتملة</td></tr>
</table>
<p class="small muted">لا يدّعي الملف خفض الانبعاثات أو زيادة إعادة الاستخدام بنسبة محددة؛ والكمية المعروضة للبيع لا تعني أنها نُقلت أو أُعيد استخدامها فعليًا.</p>
""")


def official_page(page, head, ico):
    page(0, "حجم المجال", head("THE CONTEXT · OFFICIAL DATA", "حجم المجال بالأرقام الرسمية") + f"""
<p>تبيّن المؤشرات الرسمية التالية اتساع المجال الذي يعمل فيه المشروع. وهي <b>مؤشرات عامة للنشاط</b>،
ولا تحدد كمية المخلفات المناسبة لمَكنَز أو نسبة القابل للاستفادة منها.</p>
<h2 style="margin-top:2mm">{ico("layers", 22)}مخلفات القطاع الصناعي</h2>
<div class="stats s4">
  <div class="stat dk"><div class="lb"><span class="off">مصدر رسمي</span></div><div class="v">26.7 <small>مليون طن</small></div><div class="t">نفايات القطاع الصناعي في المملكة عام 2024</div><div class="x">مقابل 22.1 مليون طن في 2023 [1]</div></div>
  <div class="stat dk"><div class="lb"><span class="off">مصدر رسمي</span></div><div class="v">26.4%</div><div class="t">حصة نشاط التعدين واستغلال المحاجر منها في 2024</div><div class="x">ثاني أكبر نشاط بعد الصناعة التحويلية [1]</div></div>
  <div class="stat"><div class="lb"><span class="der">حساب مشتق</span></div><div class="v">≈ 7.05 <small>مليون طن</small></div><div class="t">ما تعادله حصة التعدين والمحاجر</div><div class="x"><span class="eq">⁦26.7 × 26.4%⁩</span> مليون طن</div></div>
  <div class="stat"><div class="lb"><span class="der">حساب مشتق</span></div><div class="v">≈ 20.8%</div><div class="t">نمو إجمالي نفايات القطاع الصناعي 2023–2024</div><div class="x"><span class="eq">⁦(26.7 − 22.1) ÷ 22.1⁩</span> — لا يخص التعدين وحده</div></div>
</div>
<div class="note"><b>حدود الرقم:</b> التصنيف الإحصائي يجمع التعدين واستغلال المحاجر في نشاط واحد. لذلك لا نقول إن «المناجم تنتج 7 ملايين طن قابلة للبيع»؛
بل تستهدف مَكنَز تحديد الجزء الملائم للاستفادة الصناعية من مخلفات المناجم والمحاجر، وربطه بطلب المصانع وخيارات النقل المجدية.</div>

<h2>{ico("mine", 22)}جانب العرض: الرخص التعدينية السارية (نهاية 2025) <span class="off">مصدر رسمي</span></h2>
<table class="sm">
<tr><th>نوع الرخصة</th><th>العدد [2]</th><th>علاقتها بمَكنَز</th></tr>
<tr><td class="k">محاجر مواد البناء</td><td class="num">1,553</td><td>قاعدة أولية للبحث عن مواد ومخلفات متاحة</td></tr>
<tr><td class="k">استغلال تعدين ومنجم صغير</td><td class="num">275</td><td>قاعدة أولية لمصادر مخلفات التعدين</td></tr>
<tr><td class="k">الكشف</td><td class="num">1,018</td><td>ليست دليلًا على وجود إنتاج ومخلفات قابلة للتوريد</td></tr>
<tr><td class="k">الاستطلاع</td><td class="num">67</td><td>خارج شريحة التشغيل الأولية</td></tr>
<tr><td class="k">فائض الخامات المعدنية</td><td class="num">12</td><td>تحتاج دراسة طبيعة المواد والحقوق المرتبطة بها</td></tr>
<tr class="tot"><td>الإجمالي</td><td class="num">2,925</td><td>منها 1,828 رخصة في الفئتين الأوليين كنقطة انطلاق لحصر العرض</td></tr>
</table>
<p class="small muted">هذا عدد رخص لا عدد شركات أو مناجم عاملة؛ قد تمتلك الشركة الواحدة عدة رخص، وقد لا تتوفر لدى بعض المواقع مواد مناسبة.</p>

<h2>{ico("factory", 22)}جانب الطلب <span class="off">مصدر رسمي</span></h2>
<p>بلغ إجمالي المصانع المرخصة في المملكة حتى نهاية 2025 نحو <b>12,946 مصنعًا</b> [3]. يوضح الرقم اتساع القاعدة الصناعية،
ولا يعني أن جميعها عملاء محتملون لمَكنَز؛ الشريحة المستهدفة محددة في صفحة الفئات المستهدفة.</p>
<p class="small muted">المراجع [1]–[3] مدرجة بروابطها وتواريخها في صفحة المراجع بنهاية الملف.</p>
""")


SEGMENTS = """
<h2>{users}الشرائح المقترحة للبداية</h2>
<table class="sm">
<tr><th>الشريحة</th><th>احتياجها</th><th>الأولوية المقترحة</th></tr>
<tr><td class="k">مشغلو المحاجر والمناجم أصحاب المواد الموصوفة</td><td>إيجاد مشترين لمواد لا يستخدمونها وتنظيم تصريفها</td><td>مصادر التوريد الأولى</td></tr>
<tr><td class="k">مصانع الأسمنت والمنتجات الخرسانية</td><td>تقييم مواد بديلة أو إضافية تحقق متطلبات الإنتاج</td><td>مشترون محتملون للتحقق</td></tr>
<tr><td class="k">مصانع الطوب والسيراميك</td><td>تقييم مواد ذات تركيب وخواص مناسبة</td><td>مشترون محتملون للتحقق</td></tr>
<tr><td class="k">منشآت معالجة واسترداد المواد</td><td>شراء مواد تحتاج تجهيزًا قبل الاستخدام</td><td>شركاء أو مشترون محتملون</td></tr>
<tr><td class="k">ناقلو المواد السائبة المؤهلون</td><td>فرص شحن محددة بالوزن والمسار والموعد</td><td>شركاء التنفيذ</td></tr>
</table>
<p class="small muted">البدء بصناعات مواد البناء اقتراح للاستهداف؛ ملاءمة أي مادة تختلف حسب تركيبها ومعالجتها واختباراتها، ولا تُعد مخلفات التعدين بديلًا جاهزًا لهذه الصناعات.
لم يُحصر بعد عدد شركات النقل المؤهلة لنقل المواد المستهدفة؛ يتم الحصر حسب المنطقة ونوع الحمولة.</p>
<h2>{chart}طبقات السوق</h2>
<table class="sm">
<tr><th>الطبقة</th><th>ما نعرضه</th></tr>
<tr><td class="k">السوق العام</td><td>مؤشرات المخلفات والرخص والمنشآت الصناعية الرسمية</td></tr>
<tr><td class="k">السوق القابل للخدمة</td><td>مواد ومواقع ومصانع وناقلون اجتازوا التحقق</td></tr>
<tr><td class="k">السوق المستهدف أوليًا</td><td>نطاق جغرافي محدود وحالة توريد واحدة قابلة للتجربة</td></tr>
</table>
<div class="note"><b>لا قيمة مالية للسوق بعد:</b> قيمة معاملات المواد السنوية = الأطنان المتداولة فعليًا × متوسط سعر الطن، وتُحسب معاملات النقل منفصلة.
وقيمة المعاملات ليست إيرادات مَكنَز؛ الإيرادات تعتمد على نموذج دخل يُعتمد لاحقًا.</div>
"""

CARRIER_NOTE = """<div class="note"><b>التأهيل النظامي:</b> لا يكفي امتلاك الشاحنات لتأهيل الناقل؛ إذ يشترط نظام إدارة النفايات الحصول على رخصة أو تصريح
من المركز الوطني لإدارة النفايات لممارسة أنشطة إدارة النفايات، ومنها الجمع والنقل [4]. ويتحدد المطلوب لكل حالة وفق تصنيف المادة ولائحة النظام التنفيذية،
ويُعد التحقق منه جزءًا من تأهيل الناقلين.</div>
"""

SOURCES = """
<p>المراجع الخارجية المستخدمة في صفحة «حجم المجال بالأرقام الرسمية» وصفحة «تجربة شركة النقل». جميع الروابط قابلة للنقر، وتاريخ الاطلاع عليها: 2 نوفمبر 2026.
أما أرقام «سيناريو المحاكاة» والأمثلة الافتراضية فمن إعداد الفريق، ولا تستند إلى هذه المراجع.</p>
<div class="refs">
  <div class="ref"><span class="rn">1</span><div><b>الهيئة العامة للإحصاء — «الإحصاء: تنشر إحصاءات النفايات في المملكة خلال عام 2024م»</b>
    <div class="rm">تاريخ النشر: 30 ديسمبر 2025 · استُخدم في: نفايات القطاع الصناعي (26.7 و22.1 مليون طن) وحصة التعدين واستغلال المحاجر (26.4%)</div>
    <a href="https://stats.gov.sa/ar/w/news/148">https://stats.gov.sa/ar/w/news/148</a></div></div>
  <div class="ref"><span class="rn">2</span><div><b>صحيفة الاقتصادية، نقلًا عن وزارة الصناعة والثروة المعدنية — «2925 رخصة تعدين سارية في السعودية حتى نهاية العام الماضي»</b>
    <div class="rm">تاريخ النشر: 10 مارس 2026 · استُخدم في: عدد الرخص التعدينية السارية وتوزيعها حسب النوع</div>
    <a href="https://www.aleqt.com/الأخبار/2925-رخصة-تعدين-سارية-في-السعودية-حتى-نهاية-العام-الماضي-7645">https://www.aleqt.com/…-7645</a><div class="rm" style="margin:.4mm 0 0">الرابط مختصر في العرض، ويفتح الخبر كاملًا عند النقر</div></div></div>
  <div class="ref"><span class="rn">3</span><div><b>صحيفة الوطن، نقلًا عن وزارة الصناعة والثروة المعدنية — «45.3% من المصانع المنتجة للمنشآت الصغيرة»</b>
    <div class="rm">تاريخ النشر: 11 مايو 2026 · استُخدم في: إجمالي المصانع المرخصة حتى نهاية 2025 (12,946 مصنعًا)</div>
    <a href="https://www.alwatan.com.sa/article/1180558">https://www.alwatan.com.sa/article/1180558</a></div></div>
  <div class="ref"><span class="rn">4</span><div><b>أرقام — «تعرف على نظام إدارة النفايات» (المادة الرابعة من النظام)</b>
    <div class="rm">تاريخ النشر: 17 سبتمبر 2021 · استُخدم في: اشتراط الرخصة أو التصريح لأنشطة إدارة النفايات ومنها النقل</div>
    <a href="https://www.argaam.com/ar/article/articledetail/id/1496877">https://www.argaam.com/ar/article/articledetail/id/1496877</a></div></div>
</div>
<div class="note"><b>ملاحظة منهجية:</b> القيم الموسومة «حساب مشتق» ناتجة عن عمليات حسابية على الأرقام المنشورة، وليست أرقامًا منشورة بذاتها.</div>
"""
