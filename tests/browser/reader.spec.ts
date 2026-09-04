import { expect, test } from '@playwright/test';

test('renders sanitized GFM inside the reader Shadow DOM', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();

  const reader = page.getByTestId('reader');
  const disclosure = reader.locator('details.front-matter');
  const summary = disclosure.locator('summary');
  await expect(disclosure).not.toHaveAttribute('open', '');
  await expect(summary).toHaveText('Document details');
  await summary.click();
  await expect(disclosure).toHaveAttribute('open', '');

  await expect(reader.locator('h1')).toHaveText('Welcome');
  await expect(reader.locator('h1')).toHaveAttribute('id', 'welcome');
  await expect(reader.locator('del')).toHaveText('Rendered safely');
  await expect(reader.locator('[data-mdhere-image-unavailable="true"]')).toHaveText(
    'Image unavailable: remote'
  );
  await expect(reader.locator('script')).toHaveCount(0);

  const initialUrl = page.url();
  await reader.locator('a[data-mdhere-external="https://example.com/"]').click();
  await expect(page).toHaveURL(initialUrl);

  await reader.locator('a[data-mdhere-path="guides/Second.md"]').click();
  await expect(reader.locator('h1')).toHaveText('Second section');
  await expect(reader.locator('h1')).toBeFocused();
  await expect(reader.locator('details.front-matter')).toHaveCount(0);

  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
  await expect(disclosure).toHaveAttribute('open', '');

  expect(
    await reader.evaluate((element) => {
      const shadow = element.shadowRoot;
      return (
        Boolean(shadow?.querySelector('article.reader-content')) && !shadow?.querySelector('script')
      );
    })
  ).toBe(true);
});

test('activates the native disclosure with Enter and Space', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();

  const reader = page.getByTestId('reader');
  const disclosure = reader.locator('details.front-matter');
  const summary = disclosure.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await page.keyboard.press(' ');
  await expect(disclosure).not.toHaveAttribute('open', '');
});
