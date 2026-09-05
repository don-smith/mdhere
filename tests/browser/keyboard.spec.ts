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
  await expect(page.getByTestId('reader').locator('h1')).toHaveText('Reading a local field guide');

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

test('keeps reader chord state across events and reaches both document boundaries', async ({
  page
}) => {
  await page.setViewportSize({ width: 1000, height: 360 });
  await page.goto('/');

  const document = page.getByRole('treeitem', { name: 'Welcome.md' });
  await document.click();
  const reader = page.getByTestId('reader');
  await expect(reader.locator('h1')).toHaveText('Reading a local field guide');
  await reader.focus();

  await reader.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('g');
  await page.keyboard.press('g');
  await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(0);

  await page.keyboard.press('Shift+G');
  await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('scrolls the reader with uppercase tree commands without moving tree state', async ({
  page
}) => {
  await page.setViewportSize({ width: 1000, height: 360 });
  await page.goto('/');

  const folder = page.getByRole('treeitem', { name: 'guides' });
  const document = page.getByRole('treeitem', { name: 'Welcome.md' });
  await document.click();
  const reader = page.getByTestId('reader');
  await expect(reader.locator('h1')).toHaveText('Reading a local field guide');
  await reader.evaluate((element) => {
    element.scrollTop = 0;
  });

  await document.focus();
  await page.keyboard.press('Shift+J');
  await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(document).toBeFocused();
  await expect(document).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Shift+K');
  await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(document).toBeFocused();
  await expect(document).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('k');
  await expect(folder).toBeFocused();
  await page.keyboard.press('l');
  await expect(document).toBeFocused();
  await page.keyboard.press('k');
  await expect(folder).toBeFocused();
  await page.keyboard.press('j');
  await expect(document).toBeFocused();
});

test('filters the local tree with Command-K and restores tree focus on Escape', async ({
  page
}) => {
  await page.goto('/');

  const folder = page.getByRole('treeitem', { name: 'guides' });
  await folder.click();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Meta+k');
  const filter = page.getByRole('searchbox', { name: 'Filter documents' });
  await expect(filter).toBeFocused();
  await filter.fill('welcome');
  await expect(folder).toHaveAttribute('aria-expanded', 'true');

  const document = page.getByRole('treeitem', { name: 'Welcome.md' });
  await folder.focus();
  await page.keyboard.press('ArrowDown');
  await expect(document).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('reader').locator('h1')).toHaveText('Reading a local field guide');

  await filter.fill('missing');
  await expect(page.getByRole('status')).toHaveText('No matching documents.');
  await expect(filter).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(filter).toHaveValue('');
  await expect(folder).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape');
  await expect(folder).toBeFocused();
});

test('uses Vim tree commands and centers the keyboard-help overlay', async ({ page }) => {
  await page.goto('/');

  const folder = page.getByRole('treeitem', { name: 'guides' });
  await folder.focus();
  await page.keyboard.press('G');
  const second = page.getByRole('treeitem', { name: 'Second.md' });
  await expect(second).toBeFocused();
  await expect(second).toHaveClass(/current/);
  await page.keyboard.press('j');
  await expect(second).toHaveClass(/current/);

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
