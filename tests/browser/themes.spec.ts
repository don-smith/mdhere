import { expect, test } from '@playwright/test';

for (const theme of [
  { name: 'Paper', background: 'rgb(255, 255, 255)', appearance: 'light' },
  { name: 'Midnight', background: 'rgb(24, 32, 45)', appearance: 'dark' },
  { name: 'Field Notes', background: 'rgb(255, 253, 247)', appearance: 'light' }
]) {
  test(`applies the ${theme.name} presentation fixture without CSS injection`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
    await page.getByLabel('Theme').selectOption({ label: theme.name });

    const reader = page.getByTestId('reader');
    await expect(reader.locator('h1')).toHaveText('Welcome');
    await expect(reader).toHaveCSS('background-color', theme.background);
    await expect(reader).toHaveCSS('color-scheme', theme.appearance);
    await expect(page.locator('main')).toHaveCSS('color-scheme', theme.appearance);
    await expect
      .poll(() =>
        page
          .locator('main')
          .evaluate((element) => element.style.getPropertyValue('--shell-background'))
      )
      .not.toBe('');
  });
}
