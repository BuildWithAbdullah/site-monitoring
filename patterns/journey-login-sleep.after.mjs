// Read from the environment, and waiting on the thing the next step needs.
export async function run(browser, env) {
  const page = await browser.newPage();
  try {
    await page.goto('https://shop.example.com/account/login');
    await page.fill('#customer-email', env.MONITOR_LOGIN);
    await page.fill('#customer-password', env.MONITOR_TOKEN);
    await page.click('[data-testid="sign-in"]');
    await page.waitForSelector('[data-testid="account-orders"]');
  } catch (cause) {
    await page.screenshot({ path: 'artifacts/login-failure.png' });
    throw cause;
  }
}
