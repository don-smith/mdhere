import { readFile } from 'node:fs/promises';

import { expect, test, type Locator } from '@playwright/test';

async function installBuiltinThemeCss(reader: Locator, theme: string) {
  const css = await readFile(
    new URL(`../../src-tauri/themes/${theme.replaceAll(' ', '-')}/reader.css`, import.meta.url),
    'utf8'
  );
  await reader.evaluate(async (host: HTMLElement, stylesheet: string) => {
    const shadow = host.shadowRoot;
    if (!shadow) throw new Error('Reader Shadow DOM was not mounted');
    const sheet = new CSSStyleSheet();
    await sheet.replace(stylesheet);
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
  }, css);
}

for (const theme of ['mdhere light', 'mdhere dark']) {
  test(`applies the ${theme} reader and shell theme`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
    await page.getByLabel('Theme').selectOption({ label: theme });

    const reader = page.getByTestId('reader');
    await expect(reader.locator('h1')).toHaveText('Welcome');
    await expect
      .poll(() => reader.evaluate((host) => host.shadowRoot?.adoptedStyleSheets.length ?? 0))
      .toBe(2);
    await installBuiltinThemeCss(reader, theme);

    if (theme === 'mdhere light') {
      await expect(reader.locator('pre.shiki')).toHaveCSS('background-color', 'rgb(238, 242, 248)');
      await expect(reader.locator('pre.shiki')).toHaveCSS('color', 'rgb(36, 41, 46)');
    } else {
      await expect(reader.locator('pre.shiki')).toHaveCSS('background-color', 'rgb(36, 41, 46)');
      await expect(reader.locator('pre.shiki')).toHaveCSS('color', 'rgb(225, 228, 232)');
      await expect(page.getByRole('treeitem', { name: 'guides' })).toHaveCSS(
        'color',
        'rgb(170, 183, 202)'
      );
    }
    await expect(reader.locator('pre.shiki > code')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)'
    );

    await expect(reader).toHaveScreenshot(`${theme.toLowerCase().replaceAll(' ', '-')}.png`);
  });
}
