import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Required E2E demonstration (task brief §9, AC-01..18):
 * mine lists → factory browses and offers → mine counter-offers → agreement → carrier quotes →
 * factory selects (three-party confirmation) → simulated payment + invoice → mine schedules →
 * shipment progresses through authorised status changes → factory confirms receipt.
 */
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? '';
const MINE = 'mine@demo.maknaz.local';
const FACTORY = 'factory@demo.maknaz.local';
const CARRIER = 'carrier1@demo.maknaz.local';

async function loginAs(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel(/^البريد الإلكتروني/).fill(email);
  await page.getByLabel(/^كلمة المرور/).fill(PASSWORD);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return page;
}

const dialog = (page: Page) => page.getByRole('dialog');

test('complete three-party transaction lifecycle through the UI', async ({ browser }) => {
  test.skip(!PASSWORD, 'SEED_DEMO_PASSWORD is not configured (apps/api/.env)');
  const title = `خبث اختبار شامل ${Date.now()}`;

  // 1. Mine publishes a material listing.
  const mine = await loginAs(browser, MINE);
  await mine.goto('/listings/new');
  await mine.getByLabel(/^المنجم/).selectOption({ label: 'منجم تجريبي أ' });
  await mine.getByLabel(/^الفئة/).selectOption({ label: 'خبث' });
  await mine.getByLabel(/^العنوان/).fill(title);
  await mine.getByLabel(/^الكمية الكلية/).fill('1000');
  await mine.getByLabel(/^سعر الطلب للطن/).fill('45');
  await mine.getByLabel(/^شروط التحميل/).fill('تحميل من ساحة المنجم بمعدات المنجم');
  await mine.getByRole('button', { name: 'حفظ كمسودة' }).click();
  await expect(mine).toHaveURL(/\/listings\/[0-9a-f-]{36}$/);
  await mine.getByRole('button', { name: 'نشر', exact: true }).click();
  await expect(mine.getByText('منشور', { exact: true })).toBeVisible();

  // 2. Factory browses the listing and submits an offer.
  const factory = await loginAs(browser, FACTORY);
  await factory.goto('/search');
  await factory.getByLabel('بحث').fill(title);
  await factory.getByRole('link', { name: new RegExp(title) }).click();
  await expect(factory.getByText('مسافة مباشرة تقريبية').first()).toBeVisible();
  await factory.getByRole('button', { name: 'تقديم عرض شراء' }).click();
  await dialog(factory).getByLabel(/^الكمية \(طن\)/).fill('300');
  await dialog(factory).getByLabel(/^سعر الوحدة/).fill('40');
  await dialog(factory).getByRole('button', { name: 'مراجعة وإرسال' }).click();
  await factory.getByRole('dialog').filter({ hasText: 'تأكيد عرض الشراء' }).getByRole('button', { name: 'إرسال العرض' }).click();
  await expect(factory).toHaveURL(/\/offers\/[0-9a-f-]{36}$/);
  const offerUrl = factory.url();

  // 3. Mine counter-offers (one counter, different price).
  await mine.goto(offerUrl);
  await mine.getByRole('button', { name: 'عرض مقابل' }).click();
  await dialog(mine).getByLabel(/^السعر الجديد/).fill('42');
  await dialog(mine).getByRole('button', { name: 'إرسال العرض المقابل' }).click();
  await expect(mine.getByText('عرض مقابل', { exact: true }).first()).toBeVisible();

  // 4. Factory accepts the counter-offer → commercial agreement and reservation.
  await factory.reload();
  await factory.getByRole('button', { name: 'قبول العرض المقابل' }).click();
  await dialog(factory).getByRole('button', { name: 'قبول', exact: true }).click();
  await expect(factory).toHaveURL(/\/deals\/[0-9a-f-]{36}$/);
  const dealUrl = factory.url();
  const dealId = dealUrl.split('/').pop()!;
  await expect(factory.getByText('بانتظار ناقل').first()).toBeVisible();
  await expect(factory.getByText('بانتظار عروض النقل')).toBeVisible();

  // 5. Carrier confirms availability with a binding quote (price computed by the server).
  const carrier = await loginAs(browser, CARRIER);
  await carrier.goto(`/carrier/opportunities/${dealId}`);
  await expect(carrier.getByText('الإجمالي', { exact: true })).toBeVisible();
  await carrier.getByRole('button', { name: 'مراجعة وتقديم العرض' }).click();
  await dialog(carrier).getByRole('button', { name: 'أقدّم العرض' }).click();
  await expect(carrier.getByText('عرضك', { exact: true })).toBeVisible();

  // 6. Factory selects the quote → three-party confirmation + simulated invoice.
  await factory.reload();
  await factory.getByRole('button', { name: 'اختيار هذا العرض' }).first().click();
  await dialog(factory).getByRole('button', { name: 'تأكيد الاختيار' }).click();
  await expect(factory.getByText('بانتظار الدفع (محاكاة)').first()).toBeVisible();

  // 7–8. Simulated payment; every financial screen shows the simulation badge.
  await factory.getByRole('link', { name: 'عرض الفاتورة والدفع (محاكاة)' }).click();
  await expect(factory.getByTestId('simulation-badge').first()).toBeVisible();
  await expect(factory.getByText('ليست فاتورة ضريبية').first()).toBeVisible();
  await factory.getByRole('button', { name: 'تنفيذ دفع محاكى' }).click();
  await dialog(factory).getByRole('button', { name: 'ادفع (محاكاة)' }).click();
  await expect(factory.getByText(/SIM-PAY-\d{4}-\d{6}/).first()).toBeVisible();

  // 9. Mine prepares the scheduled shipment. The factory never sees the extension action.
  await mine.goto(dealUrl);
  await mine.getByRole('link', { name: 'تفاصيل الشحنة' }).click();
  await expect(mine.getByRole('button', { name: /تمديد الموعد/ })).toBeVisible();
  const shipmentUrl = mine.url();
  await mine.getByRole('button', { name: 'جاهز للاستلام' }).click();
  await expect(mine.getByText('جاهزة للاستلام').first()).toBeVisible();

  // 10. Carrier progresses the shipment; only the assigned carrier has these actions.
  await carrier.goto(shipmentUrl);
  await carrier.getByRole('button', { name: 'تم الاستلام من المنجم' }).click();
  await dialog(carrier).getByRole('button', { name: 'تأكيد الاستلام' }).click();
  await expect(carrier.getByRole('button', { name: 'في الطريق' })).toBeVisible();
  await carrier.getByRole('button', { name: 'في الطريق' }).click();
  await expect(carrier.getByRole('button', { name: 'تم الوصول' })).toBeVisible();
  await carrier.getByRole('button', { name: 'تم الوصول' }).click();
  await expect(carrier.getByText('وصلت').first()).toBeVisible();

  // Factory confirms receipt → deal COMPLETED.
  await factory.goto(shipmentUrl);
  await expect(factory.getByRole('button', { name: /تمديد الموعد/ })).toHaveCount(0);
  await factory.getByRole('button', { name: 'تأكيد الاستلام' }).click();
  await dialog(factory).getByRole('button', { name: 'تأكيد الاستلام وإغلاق الصفقة' }).click();
  await expect(factory.getByText('مكتملة').first()).toBeVisible();
  await factory.goto(dealUrl);
  await expect(factory.getByText('مكتملة').first()).toBeVisible();
});

test('a pending organization sees the review banner and cannot act commercially', async ({ browser }) => {
  test.skip(!PASSWORD, 'SEED_DEMO_PASSWORD is not configured (apps/api/.env)');
  const page = await loginAs(browser, 'pending@demo.maknaz.local');
  await expect(page.getByText('جهتك قيد المراجعة')).toBeVisible();
  const res = await page.request.post('/api/v1/offers', { data: {}, headers: { 'Idempotency-Key': `e2e-${Date.now()}` } });
  expect([403]).toContain(res.status());
});

test('the UI is right-to-left and does not scroll horizontally on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
