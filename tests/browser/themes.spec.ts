import { expect, test } from '@playwright/test';

for (const theme of ['Mdhere Light', 'Mdhere Dark']) {
  test(`applies the ${theme} reader and shell theme`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
    await page.getByLabel('Theme').selectOption({ label: theme });

    const reader = page.getByTestId('reader');
    await expect(reader.locator('h1')).toHaveText('Welcome');
    await expect(reader).toHaveScreenshot(`${theme.toLowerCase().replaceAll(' ', '-')}.png`);
  });
}
