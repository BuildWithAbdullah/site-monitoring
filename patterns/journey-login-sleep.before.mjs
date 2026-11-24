// The password is in the repository, in the run log, and in every artefact.
const password = 'basket-monitor-2024';

export async function run(browser) {
  const page = await browser.newPage();
  await page.goto('https://shop.example.com/account/login');
  await page.fill('#customer-email', 'monitor@example.com');
  await page.fill('#customer-password', password);
  await page.click('[data-testid="sign-in"]');
  await page.waitForTimeout(5000);
  await page.waitForSelector('[data-testid="account-orders"]');
  await page.screenshot({ path: 'artifacts/login.png' });
}
