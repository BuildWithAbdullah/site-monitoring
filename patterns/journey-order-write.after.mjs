// Marked so reporting can exclude it, removed so it does not accumulate, and
// nothing carried between runs.
export async function run(browser, api) {
  const page = await browser.newPage();
  const marker = `SYNTHETIC-${Date.now()}`;
  let orderId = null;
  try {
    await page.goto('https://shop.example.com/collections/all/products/first');
    await page.click('[data-testid="add-to-basket"]');
    await page.waitForSelector('[data-testid="basket-count"]');
    await page.fill('[data-testid="order-note"]', marker);
    await page.click('[data-testid="checkout"]');
    await page.waitForSelector('[data-testid="order-confirmation"]');
    orderId = await page.getAttribute('[data-testid="order-confirmation"]', 'data-order-id');
  } catch (cause) {
    await page.screenshot({ path: 'artifacts/checkout-failure.png' });
    throw cause;
  } finally {
    if (orderId) await api.cancelOrder(orderId, marker);
  }
  return { orderId, marker };
}
