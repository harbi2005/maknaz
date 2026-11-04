# مواصفات واجهات REST — مَكْنَز | MAKNAZ

[← فهرس الوثائق](../README.md) · [SRS](../02-requirements/MAKNAZ_SRS.md)

## 1. الاصطلاحات

| البند | القاعدة |
|---|---|
| الأساس | `/api/v1` |
| الصيغة | JSON (`application/json; charset=utf-8`)؛ الرفع `multipart/form-data` |
| التسمية | المسارات بصيغة kebab-case وجمع الموارد؛ الحقول snake_case؛ الإجراءات غير CRUD كمسار فرعي فعل: `POST /offers/{id}/accept` |
| المعرفات | UUIDv7 نصية |
| الوقت | ISO 8601 بتوقيت UTC (`2026-11-04T09:00:00Z`)؛ الواجهة تحول إلى `Asia/Riyadh` |
| المال | `{ "amount_halalas": 2520000, "currency": "SAR", "display": "25,200.00" }`؛ العميل لا يرسل مبالغ محسوبة أبدًا |
| المصادقة | جلسة في ملف تعريف `HttpOnly; Secure; SameSite=Lax` + رمز CSRF في `X-CSRF-Token` لطلبات الكتابة. (بديل: JWT قصير + refresh؛ OD-18) |
| سياق الجهة | من الجلسة فقط؛ أي `organization_id` في الجسم يُتجاهل (SEC-03) |
| Idempotency | ترويسة `Idempotency-Key` (UUID) **إلزامية** للإجراءات الموسومة 🔑؛ تُحفظ 24 ساعة |
| التزامن المتفائل | تعديل الموارد القابلة للتحرير يرسل `If-Match: "<version>"`؛ عدم التطابق ← `412` |
| معرف الطلب | كل استجابة تحمل `X-Request-Id` |

### 1.1 الترقيم والتصفية والترتيب

```
GET /api/v1/material-listings?page[cursor]=eyJpZCI6Ii4uLiJ9&page[size]=20
    &filter[category]=SLAG&filter[region]=MAKKAH&filter[min_available]=100
    &filter[max_price_halalas]=5000&q=خبث&sort=-published_at
```

```json
{
  "data": [ ... ],
  "page": { "next_cursor": "eyJpZCI6Ii4uLiJ9", "size": 20, "has_more": true }
}
```

- `page[size]` افتراضي 20، أقصى 100. الترقيم بالمؤشر (cursor) لثبات النتائج.
- `sort`: حقل واحد أو أكثر مفصول بفواصل؛ `-` للتنازلي؛ الحقول المسموحة موثقة لكل مورد؛ غيرها ← `400 INVALID_SORT`.

### 1.2 صيغة الأخطاء

```json
{
  "error": {
    "code": "INSUFFICIENT_QUANTITY",
    "message": "الكمية المتاحة لا تكفي لقبول هذا العرض.",
    "details": { "requested": "600.000", "available": "420.000" },
    "field_errors": [],
    "request_id": "01JBX4...",
    "retryable": false
  }
}
```

| HTTP | الرموز النموذجية |
|---|---|
| 400 | `VALIDATION_FAILED`, `INVALID_SORT`, `IDEMPOTENCY_KEY_REQUIRED` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN_ROLE`, `ORG_NOT_ACTIVE`, `MEMBERSHIP_REQUIRED` |
| 404 | `NOT_FOUND` (يشمل غياب الملكية) |
| 405 | `METHOD_NOT_ALLOWED` |
| 409 | `INVALID_STATE`, `STATE_CONFLICT`, `INSUFFICIENT_QUANTITY`, `ROUND_EXPIRED`, `OPEN_OFFER_EXISTS`, `QUOTE_NOT_AVAILABLE`, `THREE_PARTY_CONFIRMATION_REQUIRED`, `PAYMENT_EXPIRED`, `ALREADY_PAID`, `IDEMPOTENCY_KEY_REUSED`, `SHIPMENT_ALREADY_PICKED_UP`, `DEADLINE_PASSED`, `CANCELLATION_REQUIRES_ADMIN`, `NO_ACTIVE_PRICING` |
| 412 | `VERSION_MISMATCH` |
| 413 / 415 | `FILE_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `QUANTITY_EXCEEDS_AVAILABLE`, `LAB_DOCUMENT_REQUIRED`, `COUNTER_PRICE_UNCHANGED`, `CAPACITY_MISMATCH`, `PICKUP_OUTSIDE_WINDOW`, `ROUTE_DISTANCE_TOO_SHORT`, `EXTENSION_LIMIT_REACHED`, `EXTENSION_TOO_LONG`, `REASON_REQUIRED`, `QUANTITY_BELOW_COMMITTED`, `PRICE_DIFFERENCE_NOT_ACCEPTED` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` (`retryable: true`) |

### 1.3 مفتاح الجداول

**الدور:** F مصنع · M منجم · C ناقل · A إدارة · * أي مستخدم مصادق · — عام. **الملكية:** O مالك · P طرف في الصفقة · E مؤهل. 🔑 Idempotency-Key إلزامي.

---

## 2. المصادقة

| الطريقة | المسار | الغرض | الدور | ملاحظات |
|---|---|---|---|---|
| POST | `/auth/register` | إنشاء مستخدم | — | `{full_name, email, password}` ← `201`؛ رسالة عامة إن وُجد البريد |
| POST | `/auth/verify-email` | تحقق البريد | — | `{token}` |
| POST | `/auth/login` | دخول | — | `{email, password}` ← جلسة؛ حد معدل |
| POST | `/auth/logout` | خروج | * | — |
| POST | `/auth/password-reset` / `/auth/password-reset/confirm` | إعادة تعيين | — | Should |
| GET | `/me` | المستخدم وجهته ودوره | * | `{user, organization:{id,type,status}, membership_role, is_platform_admin}` |

## 3. الجهات

| الطريقة | المسار | الغرض | الدور | الملكية | الحالة |
|---|---|---|---|---|---|
| POST | `/organizations` | إنشاء جهة | * (متحقق، بلا جهة) | — | ← `PENDING_REVIEW` |
| GET | `/organizations/{id}` | الملف الكامل | F/M/C/A | O | — |
| GET | `/organizations/{id}/public` | ملف عام مختصر | * | — | الهدف `ACTIVE` |
| PATCH | `/organizations/{id}` | تعديل | OWNER | O | ليست `REJECTED` |
| GET/POST | `/organizations/{id}/members` | الأعضاء/دعوة | OWNER | O | `ACTIVE` |
| GET/POST | `/organizations/{id}/licenses` | التراخيص المصرّحة | M/C | O | — |

**`POST /organizations`**

```json
{
  "type": "MINE",
  "legal_name_ar": "منجم تجريبي أ",
  "legal_name_en": "Demo Mine A",
  "commercial_registration_no": "DEMO-0001",
  "city": "Taif", "region_code": "MAKKAH",
  "contact_email": "ops@example.com", "contact_phone": "+966500000000"
}
```
← `201 { "id": "...", "status": "PENDING_REVIEW", ... }`. أخطاء: `409 DUPLICATE_REGISTRATION`، `409 ALREADY_MEMBER`.

## 4. المناجم ومواقع المصانع

| الطريقة | المسار | الغرض | الدور | الملكية |
|---|---|---|---|---|
| POST | `/mines` | إنشاء منجم | M | O |
| GET | `/mines` | قائمة/خريطة (`filter[region]`, `filter[org]`, `near=lat,lng&radius_km=`) | * | — |
| GET | `/mines/{id}` | تفاصيل + الإحداثيات للجهات النشطة | * | — |
| PATCH | `/mines/{id}` | تعديل/إيقاف | M | O |
| GET | `/carrier/nearby-mines` | مناجم قريبة من مواقع الناقل مع النطاقات | C | O |
| POST/GET/PATCH | `/factory-sites[/{id}]` | مواقع المصنع | F | O |

**`POST /mines`**: `{name, primary_activity, region_code, address_text, lat, lng}`. تحقق: النطاقات الجغرافية، المنطقة من القائمة. ← `201`. خطأ `422 INVALID_COORDINATES`.

## 5. المواد

| الطريقة | المسار | الغرض | الدور | الملكية | الحالة |
|---|---|---|---|---|---|
| GET | `/material-categories` | الفئات وأصناف الحمولة | * | — | — |
| POST | `/material-listings` | إنشاء (`DRAFT`) | M | O (المنجم) | جهة `ACTIVE` |
| GET | `/material-listings` | بحث (`q`, `filter[category|region|min_available|max_available|min_price_halalas|max_price_halalas|has_lab_report]`, `sort=published_at|asking_price_halalas|available_quantity|distance`, `from_site_id` للمسافة) | * | — | `ACTIVE` (المالك يرى كل حالاته) |
| GET | `/material-listings/{id}` | التفاصيل | * | — | — |
| PATCH | `/material-listings/{id}` | تعديل الحقول الوصفية والسعر | M | O | ليس `ARCHIVED`؛ `If-Match` |
| PATCH | `/material-listings/{id}/quantity` | الكمية الكلية | M | O | ≥ reserved+sold |
| POST | `/material-listings/{id}/publish` | نشر | M | O | `DRAFT`/`INACTIVE` ← `ACTIVE` |
| POST | `/material-listings/{id}/deactivate` | إيقاف | M/A | O | `ACTIVE` ← `INACTIVE` |
| POST | `/material-listings/{id}/archive` | أرشفة | M | O | لا صفقات نشطة |
| PUT | `/material-listings/{id}/specifications` | استبدال قائمة المواصفات | M | O | — |

**`GET /material-listings/{id}`** ← `200`

```json
{
  "id": "01JBX...",
  "title": "خبث معدني — دفعة تجريبية",
  "category": { "code": "SLAG", "name_ar": "خبث", "cargo_class": "BULK_SOLID" },
  "mine": { "id": "...", "name": "منجم تجريبي أ", "region_code": "MAKKAH", "lat": 21.43, "lng": 40.51 },
  "quantity": { "total": "2000.000", "reserved": "600.000", "sold": "0.000", "available": "1400.000", "unit": "TON" },
  "asking_price": { "amount_halalas": 4500, "currency": "SAR", "display": "45.00", "per": "TON" },
  "is_negotiable": true,
  "specifications": [
    { "property_name": "Fe", "value_numeric": "40.0", "unit": "%", "verification_status": "LAB_REPORTED", "document_id": "..." },
    { "property_name": "SiO2", "value_numeric": null, "unit": "%", "verification_status": "UNKNOWN" }
  ],
  "documents": [ { "id": "...", "title": "تقرير مختبر", "visibility": "ON_REQUEST", "can_download": false } ],
  "distance_from_site": { "straight_line_km": "142.6", "label": "مسافة مباشرة تقريبية" },
  "status": "ACTIVE", "version": 3
}
```

**`PATCH /material-listings/{id}/quantity`**: `{ "total_quantity": "2500.000" }` + `If-Match`. خطأ `422 QUANTITY_BELOW_COMMITTED`.

## 6. الوثائق

| الطريقة | المسار | الغرض | الدور | الملكية |
|---|---|---|---|---|
| POST | `/material-listings/{id}/documents` | رفع (multipart: `file`, `doc_type`, `title`, `visibility`, `lab_name?`, `issued_on?`) | M | O |
| PATCH | `/documents/{id}` | تعديل الإتاحة/العنوان | M | O |
| GET | `/documents/{id}/download` | ← `200 { "url": "<signed>", "expires_in": 300 }` | حسب الإتاحة (P-26–28) | — |

تحقق: MIME الفعلي من محتوى الملف، الحجم ≤ 20MB، SHA-256. الوصول لـ `ON_REQUEST`/`PRIVATE` يُسجل في التدقيق. غير المصرح ← `404`.

## 7. العروض والتفاوض

| الطريقة | المسار | الغرض | الدور | الملكية | الحالة | 🔑 |
|---|---|---|---|---|---|---|
| POST | `/offers` | تقديم عرض | F | موقع التسليم O | المادة `ACTIVE` | 🔑 |
| GET | `/offers` | عروضي (`filter[status]`, `filter[role]=sent|received`) | F/M | O | — | |
| GET | `/offers/{id}` | العرض وجولاته | F/M | O | — | |
| POST | `/offers/{id}/withdraw` | سحب | F | O | `SUBMITTED` | 🔑 |
| POST | `/offers/{id}/accept` | قبول المنجم لجولة المصنع | M | O | `SUBMITTED` | 🔑 |
| POST | `/offers/{id}/reject` | رفض المنجم | M | O | `SUBMITTED` | 🔑 |
| POST | `/offers/{id}/counter` | عرض مقابل | M | O | `SUBMITTED` | 🔑 |
| POST | `/offers/{id}/counter/accept` | قبول المصنع | F | O | `COUNTERED` | 🔑 |
| POST | `/offers/{id}/counter/reject` | رفض المصنع | F | O | `COUNTERED` | 🔑 |

**`POST /offers`**

```json
{
  "listing_id": "01JBX...",
  "quantity_tons": "600.000",
  "unit_price_halalas": 4000,
  "delivery_site_id": "01JBY...",
  "message": "نحتاج الكمية خلال هذا الشهر"
}
```
تحقق: الكمية > 0 و≤ المتاح؛ السعر > 0 وعدد صحيح؛ الموقع لجهة المستخدم. ← `201`

```json
{
  "id": "01JC0...", "reference": "MKZ-OFR-2026-000014", "status": "SUBMITTED",
  "current_round": { "round_no": 1, "proposed_by": "FACTORY", "quantity_tons": "600.000",
    "unit_price": { "amount_halalas": 4000, "currency": "SAR", "display": "40.00" },
    "expires_at": "2026-11-06T09:00:00Z", "status": "PENDING" },
  "material_value_estimate": { "amount_halalas": 2400000, "currency": "SAR", "display": "24,000.00" }
}
```
أخطاء: `422 QUANTITY_EXCEEDS_AVAILABLE`، `409 OPEN_OFFER_EXISTS`، `403 ORG_NOT_ACTIVE`.

**`POST /offers/{id}/accept`** (المنجم)

```json
{ "loading_window_start": "2026-11-10T05:00:00Z", "loading_window_end": "2026-11-14T15:00:00Z" }
```
تحقق: النافذة إلزامية، `start ≥ now + 48h` (يسمح بمهلة الناقل والدفع؛ REC)، `end > start`. ← `201 { "deal": { "id": "...", "status": "PENDING_CARRIER", "carrier_deadline_at": "..." } }`. أخطاء: `409 INSUFFICIENT_QUANTITY`، `409 ROUND_EXPIRED`، `409 STATE_CONFLICT`.

**`POST /offers/{id}/counter`** (المنجم)

```json
{ "unit_price_halalas": 4200, "quantity_tons": "600.000",
  "loading_window_start": "2026-11-10T05:00:00Z", "loading_window_end": "2026-11-14T15:00:00Z",
  "message": "السعر النهائي" }
```
← `201` الجولة 2. أخطاء: `422 COUNTER_PRICE_UNCHANGED`، `422 QUANTITY_EXCEEDS_ORIGINAL`، `409 COUNTER_ALREADY_SENT`.

**`POST /offers/{id}/counter/accept`** (المصنع) ← `201 { "deal": {...} }` (نافذة التحميل من الجولة 2).

## 8. الصفقات

| الطريقة | المسار | الغرض | الدور | الملكية | 🔑 |
|---|---|---|---|---|---|
| GET | `/deals` | صفقاتي (`filter[status]`) | F/M/C | P | |
| GET | `/deals/{id}` | التفاصيل والتكاليف والمهل | F/M/C(المسند)/A | P | |
| POST | `/deals/{id}/cancel` | إلغاء يدوي `{reason_text}` | F/M (قبل `PAID`)، A | P | 🔑 |

**`GET /deals/{id}`** ← `200`

```json
{
  "id": "...", "reference": "MKZ-DEAL-2026-000007", "status": "AWAITING_PAYMENT",
  "parties": { "factory": {...}, "mine": {...}, "carrier": {...} },
  "commercial": { "quantity_tons": "600.000", "unit_price": {"amount_halalas": 4200, "display": "42.00"},
                  "material_total": {"amount_halalas": 2520000, "display": "25,200.00"} },
  "transport": { "total": {"amount_halalas": 2160000, "display": "21,600.00"}, "quote_id": "..." },
  "grand_total": { "amount_halalas": 4680000, "display": "46,800.00", "currency": "SAR" },
  "deadlines": { "carrier_deadline_at": "...", "payment_deadline_at": "2026-11-05T12:00:00Z" },
  "simulation": true
}
```

## 9. الناقلون والتسعير

| الطريقة | المسار | الغرض | الدور | الملكية |
|---|---|---|---|---|
| GET/POST/PATCH | `/carrier/operating-locations[/{id}]` | المواقع التشغيلية | C | O |
| GET/POST/DELETE | `/carrier/service-areas[/{id}]` | مناطق الخدمة | C | O |
| GET/POST/PATCH | `/carrier/services[/{id}]` | الخدمات | C | O |
| GET/POST | `/carrier/pricing-rules` | القواعد | C | O |
| POST | `/carrier/pricing-rules/{id}/versions` | إصدار `DRAFT` جديد | C | O |
| PATCH | `/carrier/pricing-rules/{id}/versions/{vid}` | تعديل المسودة | C | O، `DRAFT` فقط |
| POST | `/carrier/pricing-rules/{id}/versions/{vid}/activate` | تفعيل | C | O |
| POST | `/carrier/pricing-rules/{id}/versions/{vid}/preview` | معاينة السعر | C | O |

**`POST /carrier/pricing-rules/{id}/versions`**

```json
{
  "pricing_model": "PER_TON_KM",
  "rate_per_ton_km": "0.2000",
  "base_fee_halalas": 0,
  "distance_basis": "PER_SHIPMENT",
  "loading_fee_halalas": 0, "unloading_fee_halalas": 0, "handling_fee_halalas": 0, "fee_basis": "FLAT",
  "waiting_fee_per_hour_halalas": 15000, "free_waiting_hours": "2.0",
  "minimum_charge_halalas": 300000,
  "valid_from": "2026-11-05T00:00:00Z", "valid_to": null
}
```
تحقق: حقول النموذج الإلزامية، المعدلات ≥ 0، لا تداخل صلاحية عند التفعيل. خطأ `422 PRICING_PARAMS_INVALID`، `409 VALIDITY_OVERLAP`.

**`POST .../preview`**: `{ "quantity_tons": "600", "route_distance_km": "180", "trips": 18 }` ← تفصيل السعر بنفس صيغة `pricing_snapshot` (انظر [ARCHITECTURE §5](ARCHITECTURE.md#5-مواصفات-محرك-التسعير)).

## 10. المطابقة الجغرافية

| الطريقة | المسار | الغرض | الدور | الملكية |
|---|---|---|---|---|
| GET | `/deals/{id}/eligible-carriers` | المؤهلون مرتبين (`sort=band,distance`) | F/M/A | P |
| GET | `/carrier/opportunities` | فرص الشحن المؤهل لها (`filter[region]`, `filter[band]=B1,B2`, `filter[cargo_class]`) | C | E |
| GET | `/carrier/opportunities/{deal_id}` | تفاصيل الفرصة (دون أسعار المنافسين أو سعر المادة) | C | E |

**`GET /deals/{id}/eligible-carriers`** ← `200`

```json
{
  "data": [
    { "carrier": {"id": "...", "name_ar": "ناقل تجريبي 1"},
      "nearest_location": {"id": "...", "name": "ساحة الأسطول"},
      "straight_line_km_to_mine": "38.4", "distance_band": "B1",
      "distance_label": "مسافة مباشرة تقريبية",
      "services": [{"vehicle_type": "DUMP_TRUCK", "payload_tons_per_vehicle": "34.000"}],
      "indicative_price": {"amount_halalas": 2160000, "display": "21,600.00", "label": "تقدير من قاعدة الناقل — غير ملزم"},
      "has_submitted_quote": true }
  ],
  "matching_scope": { "bands": ["B1","B2","B3"], "is_retry_window": false }
}
```

## 11. عروض النقل والتأكيد الثلاثي

| الطريقة | المسار | الغرض | الدور | الملكية | الحالة | 🔑 |
|---|---|---|---|---|---|---|
| POST | `/deals/{id}/quotes` | تقديم عرض نقل | C | E + خدمة O | `PENDING_CARRIER*` أو إعادة إسناد | 🔑 |
| GET | `/deals/{id}/quotes` | عروض الصفقة | F/A (كلها)، M (ملخص)، C (عرضه) | P/E | — | |
| POST | `/quotes/{id}/withdraw` | سحب | C | O | `SUBMITTED` | 🔑 |
| POST | `/deals/{id}/quotes/{qid}/select` | اختيار ← التأكيد الثلاثي | F | P | BR-039 | 🔑 |

**`POST /deals/{id}/quotes`** — لا يقبل أي حقل سعر (SEC-07)

```json
{
  "service_id": "01JC...",
  "operating_location_id": "01JC...",
  "route_distance_km": "180.0",
  "proposed_pickup_at": "2026-11-11T06:00:00Z",
  "estimated_transit_hours": "6.0",
  "terms": "يشمل التحميل والتفريغ"
}
```
← `201`

```json
{
  "id": "01JD...", "status": "SUBMITTED", "expires_at": "2026-11-05T09:00:00Z",
  "trips": 18, "distance_band": "B1",
  "price_breakdown": {
    "model": "PER_TON_KM", "pricing_rule_version_id": "01JC...",
    "lines": [
      { "code": "BASE", "label_ar": "النقل: 600 طن × 180 كم × 0.20", "amount_halalas": 2160000 },
      { "code": "MINIMUM_CHARGE_ADJUSTMENT", "amount_halalas": 0 }
    ],
    "conditional": [ { "code": "WAITING", "label_ar": "انتظار بعد ساعتين مجانيتين", "rate_halalas_per_hour": 15000 } ],
    "total": { "amount_halalas": 2160000, "currency": "SAR", "display": "21,600.00" }
  }
}
```
أخطاء: `403` غير مؤهل، `409 QUOTE_ALREADY_SUBMITTED`، `422 CAPACITY_MISMATCH`، `422 PICKUP_OUTSIDE_WINDOW`، `422 ROUTE_DISTANCE_TOO_SHORT`، `409 NO_ACTIVE_PRICING`، `409 INVALID_STATE`.

**`POST /deals/{id}/quotes/{qid}/select`**

```json
{ "accept_price_difference": false }
```
`accept_price_difference` يُستخدم فقط في إعادة الإسناد بسعر أعلى. ← `200`

```json
{
  "deal": { "id": "...", "status": "AWAITING_PAYMENT", "confirmed_at": "...", "payment_deadline_at": "..." },
  "shipment": { "id": "...", "status": "CARRIER_CONFIRMED", "planned_pickup_at": "..." },
  "invoice": { "id": "...", "reference": "MKZ-INV-2026-000005", "grand_total": {...}, "simulation": true }
}
```
أخطاء: `409 QUOTE_NOT_AVAILABLE`، `409 STATE_CONFLICT`، `409 CARRIER_NOT_ACTIVE`، `422 PRICE_DIFFERENCE_NOT_ACCEPTED` (إعادة إسناد بسعر أعلى دون موافقة).

## 12. الشحنات

| الطريقة | المسار | الغرض | الدور | الملكية | الحالة | 🔑 |
|---|---|---|---|---|---|---|
| GET | `/shipments` | شحناتي | F/M/C | P | — | |
| GET | `/shipments/{id}` | التفاصيل والمواعيد | F/M/C/A | P | — | |
| GET | `/shipments/{id}/events` | الخط الزمني | F/M/C/A | P | — | |
| POST | `/shipments/{id}/ready` | جاهز للاستلام | M | P | `SCHEDULED` | 🔑 |
| POST | `/shipments/{id}/pickup` | تم الاستلام `{loaded_tons?, vehicles_count?, note?}` | C | المسند | `SCHEDULED`/`READY_FOR_PICKUP` | 🔑 |
| POST | `/shipments/{id}/handover-confirm` | تأكيد المناولة | M | P | `PICKED_UP`+ | 🔑 |
| POST | `/shipments/{id}/in-transit` | في الطريق | C | المسند | `PICKED_UP` | 🔑 |
| POST | `/shipments/{id}/deliver` | تم التسليم `{note?}` | C | المسند | `IN_TRANSIT`/`DELAYED` | 🔑 |
| POST | `/shipments/{id}/confirm-receipt` | تأكيد الاستلام `{received_tons?, note?}` | F | P | `DELIVERED` | 🔑 |

## 13. التمديد وإعادة التأكيد

| الطريقة | المسار | الغرض | الدور | الملكية | الحالة | 🔑 |
|---|---|---|---|---|---|---|
| POST | `/shipments/{id}/extensions` | تمديد | **M حصرًا** | P (البائع) | BR-062 | 🔑 |
| GET | `/shipments/{id}/extensions` | سجل التمديدات | F/M/C/A | P | — | |
| POST | `/shipments/{id}/reconfirm` | تأكيد/اعتذار | C | المسند | `RECONFIRM_REQUIRED` | 🔑 |

**`POST /shipments/{id}/extensions`**

```json
{ "new_pickup_deadline_at": "2026-11-13T06:00:00Z", "reason_code": "MATERIAL_NOT_READY",
  "reason_text": "تأخر تجهيز الدفعة بسبب صيانة الكسارة" }
```
تحقق: `extension_count < 2`؛ `0 < new − current ≤ 72h`؛ `now < current + 2h`؛ الحالة مسموحة؛ السبب 10–500 حرف. ← `201`

```json
{
  "extension": { "sequence_no": 1, "previous_deadline_at": "2026-11-11T06:00:00Z",
                 "new_deadline_at": "2026-11-13T06:00:00Z", "reconfirmation_status": "PENDING",
                 "reconfirm_deadline_at": "2026-11-04T21:00:00Z" },
  "shipment": { "status": "RECONFIRM_REQUIRED", "extensions_remaining": 1 }
}
```
أخطاء: `403 FORBIDDEN_ROLE` (مصنع/ناقل)، `404` (منجم آخر)، `422 EXTENSION_LIMIT_REACHED`، `422 EXTENSION_TOO_LONG`، `422 REASON_REQUIRED`، `409 SHIPMENT_ALREADY_PICKED_UP`، `409 DEADLINE_PASSED`.

**`POST /shipments/{id}/reconfirm`**: `{ "decision": "CONFIRM" }` أو `{ "decision": "DECLINE", "reason": "..." }` ← `200` بحالة الشحنة الجديدة (`SCHEDULED` أو `PENDING_CARRIER`). خطأ `409 RECONFIRM_WINDOW_CLOSED`.

## 14. الفواتير والمدفوعات المحاكاة

| الطريقة | المسار | الغرض | الدور | الملكية | الحالة | 🔑 |
|---|---|---|---|---|---|---|
| GET | `/invoices` | فواتيري | F/M/C | P | — | |
| GET | `/invoices/{id}` | الفاتورة | F/M/C/A | P | — | |
| GET | `/invoices/{id}/pdf` | PDF موسوم بالمحاكاة | F/M/C/A | P | — | |
| POST | `/invoices/{id}/simulated-payments` | دفع محاكى (جسم فارغ أو `{ "kind": "ADJUSTMENT", "invoice_item_id": "..." }`) | F | P (المشتري) | `AWAITING_PAYMENT` / تسوية معلقة | 🔑 |
| GET | `/invoices/{id}/simulated-payments` | المدفوعات | F/M/A | P | — | |
| GET | `/deals/{id}/refunds` | الاستردادات | F/M/A | P | — | |

**`POST /invoices/{id}/simulated-payments`** — `Idempotency-Key: 6f1c...` ← `201`

```json
{
  "payment": { "id": "...", "simulated_reference": "SIM-PAY-2026-000005", "status": "COMPLETED",
               "amount": { "amount_halalas": 4680000, "currency": "SAR", "display": "46,800.00" } },
  "invoice": { "payment_status": "SIMULATED_PAYMENT_COMPLETED" },
  "deal": { "status": "PAID" },
  "shipment": { "status": "SCHEDULED", "pickup_deadline_at": "2026-11-11T06:00:00Z" },
  "notice_ar": "عملية محاكاة — لم يتم تحويل أي أموال."
}
```
إعادة الطلب بنفس المفتاح والجسم ← الاستجابة نفسها `201` مع `Idempotent-Replayed: true`. أخطاء: `400 IDEMPOTENCY_KEY_REQUIRED`، `409 THREE_PARTY_CONFIRMATION_REQUIRED`، `409 PAYMENT_EXPIRED`، `409 ALREADY_PAID`، `409 IDEMPOTENCY_KEY_REUSED`.

## 15. الإشعارات

| الطريقة | المسار | الغرض | الدور |
|---|---|---|---|
| GET | `/notifications?filter[unread]=true` | قائمة | * |
| GET | `/notifications/unread-count` | العداد | * |
| POST | `/notifications/{id}/read` | تعليم مقروء | * (المستلم) |
| POST | `/notifications/read-all` | الكل مقروء | * |

## 16. الإدارة

| الطريقة | المسار | الغرض | الدور |
|---|---|---|---|
| GET | `/admin/organizations?filter[status]=PENDING_REVIEW` | طابور الاعتماد | A |
| POST | `/admin/organizations/{id}/approve` | اعتماد | A |
| POST | `/admin/organizations/{id}/reject` | رفض `{reason}` | A |
| POST | `/admin/organizations/{id}/suspend` | تعليق `{reason}` | A |
| PATCH | `/admin/licenses/{id}` | حالة مراجعة الترخيص | A |
| GET | `/admin/deals`, `/admin/shipments`, `/admin/invoices` | إشراف بالتصفية | A |
| GET | `/admin/attention` | صفقات تحتاج معالجة (تعليق، `DELAYED`، تسليم غير مؤكد، مهام `FAILED`) | A |
| POST | `/admin/deals/{id}/cancel` | إلغاء إداري `{reason_text, fault_party}` 🔑 | A |
| GET/POST/PATCH | `/admin/material-categories` | الفئات | A |
| GET | `/admin/audit-logs?filter[entity_type]=&filter[entity_id]=&filter[actor_org]=` | التدقيق | A |
| GET | `/policies/current` | السياسة السارية (قراءة) | * |

لا توجد نقطة لتعديل السياسات في MVP (BR-075).

## 17. الحدود الداخلية (ليست API عامة)

| الوظيفة | التنفيذ |
|---|---|
| معالجة المهل والإلغاء التلقائي | مهمة خلفية كل دقيقة (UC-023) |
| الاسترجاع المحاكى | خدمة داخلية تستدعيها انتقالات الإلغاء |
| إرسال الإشعارات والبريد | معالج outbox بعد الالتزام |
| فحص الصحة | `GET /health` (عام، دون بيانات) |
