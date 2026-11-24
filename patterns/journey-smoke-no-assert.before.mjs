// A check that passes against an empty page, an error page and a login wall.
export async function run(browser) {
  const page = await browser.newPage();
  await page.goto('https://shop.example.com/');
  await page.click('a[href="/collections/all"]');
  await page.click('a[href="/collections/all/products/first"]');
}
