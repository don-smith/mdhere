import { expect, test } from '@playwright/test';

for (const theme of [
  { id: 'mdhere-light', name: 'Paper', background: 'rgb(255, 255, 255)', appearance: 'light' },
  { id: 'mdhere-dark', name: 'Midnight', background: 'rgb(24, 32, 45)', appearance: 'dark' },
  { id: 'field-notes', name: 'Field Notes', background: 'rgb(255, 253, 247)', appearance: 'light' }
]) {
  test(`captures the ${theme.name} full-shell reading desk from the presentation fixture`, async ({
    page
  }) => {
    await page.goto('/');
    await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
    const themeTrigger = page.getByTestId('document-toolbar').locator('.theme-trigger');
    await expect(themeTrigger).toHaveCount(1);
    await expect(themeTrigger).toHaveAccessibleName('Theme: Paper');
    await themeTrigger.click();
    const themeListbox = page.getByRole('listbox', { name: 'Theme options' });
    await expect(themeListbox.getByRole('option')).toHaveCount(3);
    await themeListbox.getByRole('option', { name: theme.name }).click();

    const reader = page.getByTestId('reader');
    await expect(reader.locator('h1')).toHaveText('Welcome');
    await expect(reader.locator('table')).toBeVisible();
    await expect(reader.locator('.contains-task-list')).toBeVisible();
    await expect(reader.locator('[data-mdhere-image-unavailable="true"]')).toBeVisible();
    await expect(reader).toHaveCSS('background-color', theme.background);
    await expect(reader).toHaveCSS('color-scheme', theme.appearance);
    await expect(page.locator('main')).toHaveCSS('color-scheme', theme.appearance);
    await expect(page.getByTestId('reading-desk')).toHaveScreenshot(`${theme.id}.png`, {
      animations: 'disabled'
    });

    await themeTrigger.hover();
    await themeTrigger.focus();
    await expect(themeTrigger).toBeFocused();
    await themeTrigger.click();
    await expect(themeListbox).toBeVisible();
    await expect(page.getByTestId('reading-desk')).toHaveScreenshot(`${theme.id}-open.png`, {
      animations: 'disabled'
    });
    await page.keyboard.press('Escape');
    await expect(themeListbox).toBeHidden();
    await expect(themeTrigger).toBeFocused();
  });

  test(`captures the ${theme.name} warning, no-match, dialog, and overlay state fixture`, async ({
    page
  }) => {
    await page.goto(`/?scenario=warning&theme=${theme.id}`);
    await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
    await page.getByLabel('Filter documents').fill('does-not-exist');
    await expect(page.locator('.filter-status[data-state="empty"]')).toBeVisible();
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();

    await expect(page.locator('.theme-notice[data-state="warning"]')).toBeVisible();
    await expect(page.locator('.keyboard-help-backdrop[data-state="open"]')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot(`${theme.id}-state-fixture.png`, {
      animations: 'disabled'
    });
  });

  test(`captures the ${theme.name} disabled, danger, and empty state fixtures`, async ({
    page
  }) => {
    await page.goto(`/?scenario=slow-refresh&theme=${theme.id}`);
    const refresh = page.getByRole('button', { name: 'Refresh library' });
    const themeTrigger = page.getByRole('button', { name: `Theme: ${theme.name}` });
    await themeTrigger.evaluate((element) => {
      (element as HTMLButtonElement).disabled = true;
    });
    await expect(themeTrigger).toBeDisabled();
    await refresh.hover();
    await refresh.focus();
    await refresh.click();
    await expect(refresh).toBeDisabled();
    await expect(refresh).toHaveAttribute('data-state', 'loading');
    await expect(page.locator('main')).toHaveScreenshot(`${theme.id}-disabled.png`, {
      animations: 'disabled'
    });

    await page.goto(`/?scenario=error&theme=${theme.id}`);
    await expect(page.locator('.shell-status[data-state="error"]')).toBeVisible();
    await expect(page.locator('main')).toHaveScreenshot(`${theme.id}-danger.png`, {
      animations: 'disabled'
    });

    await page.goto(`/?scenario=empty&theme=${theme.id}`);
    await expect(page.locator('.shell-status[data-state="empty"]')).toBeVisible();
  });
}

test('supports theme picker keyboard navigation, selection, and click-away dismissal', async ({
  page
}) => {
  await page.goto('/');
  const trigger = page.locator('.theme-trigger');
  await expect(trigger).toHaveAccessibleName('Theme: Paper');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const listbox = page.getByRole('listbox', { name: 'Theme options' });
  await expect(listbox).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(listbox.getByRole('option', { name: 'Midnight' })).toHaveAttribute(
    'data-active',
    'true'
  );
  await page.keyboard.press(' ');
  await expect(trigger).toHaveAccessibleName('Theme: Midnight');
  await expect(listbox).toBeHidden();

  await page.keyboard.press('Home');
  await expect(listbox.getByRole('option', { name: 'Paper' })).toHaveAttribute(
    'data-active',
    'true'
  );
  await page.keyboard.press('End');
  await expect(listbox.getByRole('option', { name: 'Field Notes' })).toHaveAttribute(
    'data-active',
    'true'
  );
  await page.getByTestId('document-toolbar').getByText('Select a document').click();
  await expect(listbox).toBeHidden();
  await expect(trigger).toBeFocused();
});
