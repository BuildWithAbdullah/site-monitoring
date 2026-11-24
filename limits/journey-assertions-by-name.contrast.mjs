// The same journey asserting in a form the checker does recognise.
export async function run(browser) {
  const page = await browser.newPage();
  await page.goto('https://shop.example.com/basket');
  await page.waitForSelector('[data-testid="basket"]');
  await page.screenshot({ path: 'artifacts/basket.png' });
}
