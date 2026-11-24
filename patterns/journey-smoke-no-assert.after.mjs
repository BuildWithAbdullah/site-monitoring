// Each step asserts on something only the working page renders, and a failure
// leaves evidence behind.
export async function run(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://shop.example.com/');
    await page.waitForSelector('[data-testid="basket-count"]');
    await page.click('a[href="/collections/all"]');
    await page.waitForSelector('[data-testid="product-grid"] [data-testid="product-card"]');
    await page.click('a[href="/collections/all/products/first"]');
    await page.waitForSelector('[data-testid="add-to-basket"]:not([disabled])');
  } catch (cause) {
    await page.screenshot({ path: 'artifacts/smoke-failure.png', fullPage: true });
    throw cause;
  }
}
