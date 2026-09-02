import { expect, test } from '@playwright/test';

test('supports keyboard-only tree navigation, pane switching, and shortcut help', async ({
  page
}) => {
  await page.goto('/');

  const folder = page.getByRole('treeitem', { name: 'guides' });
  await folder.focus();
  await page.keyboard.press('ArrowRight');

  const document = page.getByRole('treeitem', { name: 'Welcome.md' });
  await expect(document).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('reader').locator('h1')).toHaveText('Welcome');

  await page.keyboard.press('Tab');
  await expect(page.getByTestId('reader')).toBeFocused();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);

  await page.getByTestId('reader').focus();
  await page.keyboard.press('Escape');
  await expect(document).toBeFocused();
});
