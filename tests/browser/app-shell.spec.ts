import { expect, test } from '@playwright/test';

test('renders the Reading desk shell with real library hierarchy and document identity', async ({
  page
}) => {
  await page.goto('/');

  await expect(page).toHaveTitle('mdhere');
  await expect(page.getByTestId('reading-desk')).toBeVisible();
  await expect(page.getByLabel('Filter documents')).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'guides' })).toBeVisible();

  const document = page.getByRole('treeitem', { name: 'Welcome.md' });
  await expect(document).toHaveText('Welcome.md');
  await expect(document.locator('.tree-document-path')).toHaveCount(0);
  await document.click();

  await expect(page.getByTestId('document-toolbar')).toContainText('Welcome');
  await expect(page.getByTestId('document-toolbar')).toContainText('guides/Welcome.md');
  await expect(
    page.getByTestId('reading-desk').locator('.desk-reader > [data-testid="reader"]')
  ).toBeVisible();
  await expect(page.getByTestId('reading-frame')).toHaveCount(0);
  await expect(page.getByTestId('status-strip')).toContainText('Markdown');
  await expect(page.getByTestId('status-strip')).toContainText('UTF-8');
});

test('keeps a thin, edge-aligned scrollbar outside long library content', async ({ page }) => {
  await page.goto('/?scenario=long-library');

  const navigation = page.getByRole('navigation', { name: 'Documents' });
  await expect(navigation).toBeVisible();
  const metrics = await navigation.evaluate((element) => {
    const sidebar = element.closest<HTMLElement>('.desk-sidebar');
    if (!sidebar) throw new Error('Expected the library sidebar');
    const navigationRect = element.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    return {
      scrolls: element.scrollHeight > element.clientHeight,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      trailingPadding: getComputedStyle(element).paddingRight,
      rightOffset: Math.round(sidebarRect.right - navigationRect.right)
    };
  });

  expect(metrics.scrolls).toBe(true);
  expect(metrics.scrollbarWidth).toBe('thin');
  expect(metrics.trailingPadding).toBe('14.4px');
  expect(metrics.rightOffset).toBeLessThanOrEqual(1);
});

test('collapses the sidebar while retaining its expanded width and keyboard resize control', async ({
  page
}) => {
  await page.goto('/');

  const sidebar = page.locator('.desk-sidebar');
  const separator = page.getByRole('separator', { name: 'Sidebar width' });
  await expect(separator).toHaveAttribute('aria-valuenow', '304');
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', '320');

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
  const collapsedFolderAction = page.getByRole('button', { name: 'Open Folder' });
  await expect(collapsedFolderAction).toBeVisible();
  const horizontalOffsets = await collapsedFolderAction.evaluate((element) => {
    const action = element.getBoundingClientRect();
    const sidebar = element.closest<HTMLElement>('.desk-sidebar')?.getBoundingClientRect();
    if (!sidebar) throw new Error('Expected the library sidebar');
    return [action.left - sidebar.left, sidebar.right - action.right];
  });
  expect(Math.abs(horizontalOffsets[0] - horizontalOffsets[1])).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(sidebar).toHaveAttribute('data-state', 'expanded');
  await expect(separator).toHaveAttribute('aria-valuenow', '320');
});

test('keeps folder expansion state while the sidebar is collapsed', async ({ page }) => {
  await page.goto('/');

  const folder = page.getByRole('treeitem', { name: 'guides' });
  await folder.click();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');
});

test('renders named loading, empty, error, warning, overlay, and dialog states', async ({
  page
}) => {
  await page.goto('/?scenario=slow-loading');
  await expect(page.locator('.shell-status[data-state="loading"]')).toBeVisible();

  await page.goto('/?scenario=empty');
  await expect(page.locator('.shell-status[data-state="empty"]')).toContainText(
    'No Markdown documents found'
  );

  await page.goto('/?scenario=error');
  await expect(page.locator('.shell-status[data-state="error"]')).toContainText(
    'Unable to open the library'
  );

  await page.goto('/?scenario=warning');
  await expect(page.locator('.theme-notice[data-state="warning"]')).toContainText(
    'Some themes were not loaded.'
  );
  await page.getByRole('treeitem', { name: 'Welcome.md' }).focus();
  await page.keyboard.press('?');
  await expect(page.locator('.keyboard-help-backdrop[data-state="open"]')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});

test('exposes the disabled refresh state while a refresh is in flight', async ({ page }) => {
  await page.goto('/?scenario=slow-refresh');

  const refresh = page.getByRole('button', { name: 'Refresh library' });
  await expect(refresh).toHaveAttribute('data-state', 'resting');
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await expect(refresh).toHaveAttribute('data-state', 'loading');
});
