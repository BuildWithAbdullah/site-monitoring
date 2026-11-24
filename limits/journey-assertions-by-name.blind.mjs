// This journey does assert. The assertion is a helper in another module, named
// something the checker does not recognise as an assertion, so the journey is
// reported as asserting nothing.
import { basketRenders } from './assertions.mjs';

export async function run(browser) {
  const page = await browser.newPage();
  await page.goto('https://shop.example.com/basket');
  await basketRenders(page);
  await page.screenshot({ path: 'artifacts/basket.png' });
}
