import { expect, test } from '@playwright/test';

test('renders sanitized GFM inside the reader Shadow DOM', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Welcome.md' }).click();

  const reader = page.getByTestId('reader');
  await expect(reader.locator('h1')).toHaveText('Welcome');
  await expect(reader.locator('h1')).toHaveAttribute('id', 'welcome');
  await expect(reader.locator('del')).toHaveText('Rendered safely');
  await expect(reader.locator('img[data-mdhere-image-unavailable="true"]')).toHaveCount(1);
  await expect(reader.locator('script')).toHaveCount(0);

  const initialUrl = page.url();
  await reader.locator('a[data-mdhere-external="https://example.com/"]').click();
  await expect(page).toHaveURL(initialUrl);

  await reader.locator('a[data-mdhere-path="guides/Second.md"]').click();
  await expect(reader.locator('h1')).toHaveText('Second section');
  await expect(reader.locator('h1')).toBeFocused();

  expect(
    await reader.evaluate((element) => {
      const shadow = element.shadowRoot;
      return (
        Boolean(shadow?.querySelector('article.reader-content')) && !shadow?.querySelector('script')
      );
    })
  ).toBe(true);
});
