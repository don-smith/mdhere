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

test('uses Vim tree commands and centers the keyboard-help overlay', async ({ page }) => {
  await page.goto('/');

  const folder = page.getByRole('treeitem', { name: 'guides' });
  await folder.focus();
  await page.keyboard.press('G');
  await expect(page.getByRole('treeitem', { name: 'Second.md' })).toBeFocused();

  await page.keyboard.press('h');
  await expect(folder).toBeFocused();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.x + box!.width / 2 - 640)).toBeLessThan(80);
  expect(Math.abs(box!.y + box!.height / 2 - 360)).toBeLessThan(80);
});
