// Every five minutes, a real order, a real charge and a real confirmation email.
let lastOrderId = null;

export async function run(browser) {
  const page = await browser.newPage();
  await page.goto('https://shop.example.com/collections/all/products/first');
  await page.click('[data-testid="add-to-basket"]');
  await page.waitForSelector('[data-testid="basket-count"]');
  await page.click('[data-testid="checkout"]');
  await page.waitForSelector('[data-testid="order-confirmation"]');
  lastOrderId = await page.getAttribute('[data-testid="order-confirmation"]', 'data-order-id');
  await page.screenshot({ path: 'artifacts/checkout.png' });
}
