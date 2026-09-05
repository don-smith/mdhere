import { expect, test } from '@playwright/test';

test('renders the representative fixture with one confined image and no network requests', async ({
  page
}) => {
  const unexpectedRequests: string[] = [];
  const fontResponses: Array<{ url: string; status: number }> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) unexpectedRequests.push(request.url());
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.woff2')) {
      fontResponses.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto('/');
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
  const reader = page.getByTestId('reader');

  await expect(reader.locator('h1')).toHaveText('Reading a local field guide');
  await expect(reader.locator('ol li')).toHaveCount(3);
  await expect(reader.locator('article > ul:not(.contains-task-list) > li')).toHaveCount(3);
  await expect(reader.locator('.contains-task-list .task-list-item')).toHaveCount(2);
  await expect(reader.locator('blockquote')).toContainText('A useful reader makes structure');
  await expect(reader.locator('pre.shiki')).toBeVisible();
  await expect(reader.locator('.mdhere-mermaid-diagram svg')).toHaveCount(1);
  await expect(reader.locator('img[alt="A sunlit reading desk"]')).toBeVisible();
  await expect(reader.locator('[data-mdhere-image-unavailable="true"]')).toHaveText(
    'Image unavailable: Unavailable field photograph'
  );
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 16px "Source Serif 4"'),
      document.fonts.load('italic 400 16px "Source Serif 4"'),
      document.fonts.load('400 16px "Source Sans 3"'),
      document.fonts.load('italic 400 16px "Source Sans 3"')
    ]);
  });
  expect(new Set(fontResponses.map((response) => new URL(response.url).pathname)).size).toBe(4);
  expect(fontResponses.every((response) => response.status === 200)).toBe(true);
  await expect
    .poll(() =>
      reader.locator('img[alt="A sunlit reading desk"]').evaluate((image: HTMLImageElement) => ({
        complete: image.complete,
        width: image.naturalWidth
      }))
    )
    .toEqual({ complete: true, width: 960 });
  expect(unexpectedRequests).toEqual([]);
});

test('renders sanitized GFM inside the reader Shadow DOM', async ({ page }) => {
  await page.goto('/?scenario=mermaid');
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();

  const reader = page.getByTestId('reader');
  const disclosure = reader.locator('details.front-matter');
  const summary = disclosure.locator('summary');
  await expect(disclosure).not.toHaveAttribute('open', '');
  await expect(summary).toHaveText('Document details');
  await summary.click();
  await expect(disclosure).toHaveAttribute('open', '');

  await expect(reader.locator('h1')).toHaveText('Reading a local field guide');
  await expect(reader.locator('h1')).toHaveAttribute('id', 'reading-a-local-field-guide');
  await expect(reader.locator('del')).toHaveText('Rendered safely');
  await expect(reader.locator('[data-mdhere-image-unavailable="true"]')).toHaveText(
    'Image unavailable: Unavailable field photograph'
  );
  await expect(reader.locator('script')).toHaveCount(0);
  await expect(reader.locator('.mdhere-mermaid-diagram svg')).toHaveCount(4);
  await expect(
    reader
      .getByRole('alert')
      .filter({ hasText: 'Document-controlled Mermaid styles are not supported.' })
  ).toHaveCount(1);

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

test('rerenders visible Mermaid diagrams with the selected reader theme', async ({ page }) => {
  await page.goto('/?scenario=mermaid');
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();

  const reader = page.getByTestId('reader');
  await expect(reader.locator('.mdhere-mermaid-diagram svg')).toHaveCount(4);
  const paperSvg = await reader
    .locator('.mdhere-mermaid-diagram svg')
    .first()
    .evaluate((svg) => svg.outerHTML);

  await page.getByRole('button', { name: 'Theme: Paper' }).click();
  await page.getByRole('option', { name: 'Midnight' }).click();
  await expect(page.getByRole('button', { name: 'Theme: Midnight' })).toBeVisible();
  await expect
    .poll(() =>
      reader
        .locator('.mdhere-mermaid-diagram svg')
        .first()
        .evaluate((svg) => svg.outerHTML)
    )
    .not.toBe(paperSvg);

  const midnightPalette = await reader.evaluate((element) => {
    const svg = element.shadowRoot?.querySelector<SVGElement>('.mdhere-mermaid-diagram svg');
    const node = svg?.querySelector<SVGGraphicsElement>('.node rect');
    const edge = svg?.querySelector<SVGGraphicsElement>('.flowchart-link');
    if (!svg || !node || !edge) throw new Error('Expected flowchart SVG elements');
    return {
      nodeFill: getComputedStyle(node).fill,
      nodeStroke: getComputedStyle(node).stroke,
      edgeStroke: getComputedStyle(edge).stroke,
      styles: [...element.shadowRoot!.querySelectorAll('.mdhere-mermaid-diagram svg style')].map(
        (style) => style.textContent ?? ''
      )
    };
  });
  expect(midnightPalette.nodeFill).toBe('rgb(39, 50, 71)');
  expect(midnightPalette.nodeStroke).toBe('rgb(83, 98, 122)');
  expect(midnightPalette.edgeStroke).toBe('rgb(170, 183, 202)');
  expect(midnightPalette.styles.join('\n')).not.toContain('#ff0000');

  const midnightSvg = await reader
    .locator('.mdhere-mermaid-diagram svg')
    .first()
    .evaluate((svg) => svg.outerHTML);
  await page.getByRole('button', { name: 'Theme: Midnight' }).click();
  await page.getByRole('option', { name: 'Field Notes' }).click();
  await expect(page.getByRole('button', { name: 'Theme: Field Notes' })).toBeVisible();
  await expect
    .poll(() =>
      reader
        .locator('.mdhere-mermaid-diagram svg')
        .first()
        .evaluate((svg) => svg.outerHTML)
    )
    .not.toBe(midnightSvg);
  const fieldNotesStyle = await reader
    .locator('.mdhere-mermaid-diagram svg style')
    .first()
    .textContent();
  expect(fieldNotesStyle).toContain('#fffdf7');
  expect(fieldNotesStyle).toContain('#65705e');
});

test('keeps inline code whole while prose and fenced code retain their wrapping rules', async ({
  page
}) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto('/');
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();

  const reader = page.getByTestId('reader');
  const metrics = await reader.evaluate((element) => {
    const article = element.shadowRoot?.querySelector<HTMLElement>('article.reader-content');
    if (!article) throw new Error('Expected reader article');
    article.insertAdjacentHTML(
      'beforeend',
      `<p data-inline-code>Prose before <code>WaitingToSyncWithTheRemoteService</code> prose after.</p><pre data-fenced-code><code>const value = aLongFencedCodeLine;</code></pre>`
    );
    const inlineCode = article.querySelector<HTMLElement>('[data-inline-code] code');
    const prose = article.querySelector<HTMLElement>('[data-inline-code]');
    const fenced = article.querySelector<HTMLElement>('[data-fenced-code]');
    if (!inlineCode || !prose || !fenced) throw new Error('Expected injected code examples');
    const range = document.createRange();
    range.selectNodeContents(inlineCode);
    return {
      inlineRects: range.getClientRects().length,
      inlineWhiteSpace: getComputedStyle(inlineCode).whiteSpace,
      inlineOverflowWrap: getComputedStyle(inlineCode).overflowWrap,
      inlineWordBreak: getComputedStyle(inlineCode).wordBreak,
      proseOverflowWrap: getComputedStyle(prose).overflowWrap,
      fencedWhiteSpace: getComputedStyle(fenced).whiteSpace,
      fencedOverflowX: getComputedStyle(fenced).overflowX
    };
  });

  expect(metrics.inlineRects).toBe(1);
  expect(metrics.inlineWhiteSpace).toBe('nowrap');
  expect(metrics.inlineOverflowWrap).toBe('normal');
  expect(metrics.inlineWordBreak).toBe('normal');
  expect(metrics.proseOverflowWrap).toBe('anywhere');
  expect(metrics.fencedWhiteSpace).toBe('pre-wrap');
  expect(metrics.fencedOverflowX).toBe('auto');
});

test('keeps a 1440px reader bounded while its tables use available width or scroll', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();

  const reader = page.getByTestId('reader');
  await expect(reader.locator('h1')).toHaveText('Reading a local field guide');
  const metrics = await reader.evaluate((element) => {
    const shadow = element.shadowRoot;
    const article = shadow?.querySelector<HTMLElement>('article.reader-content');
    const readerPage = shadow?.querySelector<HTMLElement>('.reader-page');
    if (!shadow || !article || !readerPage) throw new Error('Expected reader Shadow DOM content');

    article.insertAdjacentHTML(
      'beforeend',
      `<table data-layout="unequal"><thead><tr><th>ID</th><th>State</th><th>Narrative</th></tr></thead><tbody><tr><td>42</td><td>Ready</td><td>A longer description that should receive the available reader width.</td></tr></tbody></table><table data-layout="unbreakable"><tbody><tr><td>${'x'.repeat(120)}</td></tr></tbody></table>`
    );

    const unequal = shadow.querySelector<HTMLTableElement>('table[data-layout="unequal"]');
    const unbreakable = shadow.querySelector<HTMLTableElement>('table[data-layout="unbreakable"]');
    if (!unequal || !unbreakable) throw new Error('Expected injected tables');

    const readerRect = element.getBoundingClientRect();
    const pageRect = readerPage.getBoundingClientRect();
    const articleRect = article.getBoundingClientRect();
    const columnWidths = [...unequal.querySelectorAll('th')].map(
      (cell) => cell.getBoundingClientRect().width
    );
    return {
      readerWidth: readerRect.width,
      pageWidth: pageRect.width,
      articleWidth: articleRect.width,
      leftContentMargin: articleRect.left - readerRect.left,
      rightContentMargin: readerRect.right - articleRect.right,
      unequalWidth: unequal.getBoundingClientRect().width,
      columnWidths,
      unbreakableClientWidth: unbreakable.clientWidth,
      unbreakableScrollWidth: unbreakable.scrollWidth
    };
  });

  expect(metrics.articleWidth).toBeGreaterThanOrEqual(760);
  expect(metrics.articleWidth).toBeGreaterThan(metrics.readerWidth * 0.65);
  expect(metrics.pageWidth).toBeLessThan(metrics.readerWidth);
  expect(Math.abs(metrics.leftContentMargin - metrics.rightContentMargin)).toBeLessThanOrEqual(2);
  expect(metrics.leftContentMargin).toBeGreaterThanOrEqual(150);
  expect(metrics.leftContentMargin).toBeLessThanOrEqual(175);
  expect(metrics.unequalWidth).toBeGreaterThanOrEqual(metrics.articleWidth - 1);
  expect(metrics.columnWidths[2]).toBeGreaterThan((metrics.columnWidths[0] ?? 0) * 2);
  expect(metrics.unbreakableScrollWidth).toBeGreaterThan(metrics.unbreakableClientWidth);
});

test('gives front-matter and plain documents the same roomier reader-page top offset', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();

  const reader = page.getByTestId('reader');
  await expect(reader.locator('details.front-matter')).toBeVisible();
  const frontMatterPadding = await reader.evaluate((element) => {
    const readerPage = element.shadowRoot?.querySelector<HTMLElement>('.reader-page');
    if (!readerPage) throw new Error('Expected reader page');
    return parseFloat(getComputedStyle(readerPage).paddingTop);
  });

  await reader.locator('a[data-mdhere-path="guides/Second.md"]').click();
  await expect(reader.locator('h1')).toHaveText('Second section');
  const plainMetrics = await reader.evaluate((element) => {
    const readerPage = element.shadowRoot?.querySelector<HTMLElement>('.reader-page');
    const heading = element.shadowRoot?.querySelector<HTMLElement>('h1');
    if (!readerPage || !heading) throw new Error('Expected plain reader page and heading');
    const pageRect = readerPage.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return {
      paddingTop: parseFloat(getComputedStyle(readerPage).paddingTop),
      headingOffset: headingRect.top - pageRect.top
    };
  });

  expect(frontMatterPadding).toBeGreaterThanOrEqual(57);
  expect(frontMatterPadding).toBeLessThanOrEqual(59);
  expect(plainMetrics.paddingTop).toBeGreaterThanOrEqual(57);
  expect(plainMetrics.paddingTop).toBeLessThanOrEqual(59);
  expect(plainMetrics.headingOffset).toBeGreaterThanOrEqual(57);
  expect(plainMetrics.headingOffset).toBeLessThanOrEqual(59);
});

test('installs structural CSS before the package stylesheet inside the reader Shadow DOM', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();

  const reader = page.getByTestId('reader');
  await expect
    .poll(() =>
      reader.evaluate((element) => {
        const root = element.shadowRoot;
        if (!root) return false;
        const styles =
          root.adoptedStyleSheets.length >= 2
            ? [...root.adoptedStyleSheets].map((sheet) =>
                [...sheet.cssRules].map((rule) => rule.cssText).join('\n')
              )
            : [...root.querySelectorAll('style')].map((style) => style.textContent ?? '');
        return styles.length >= 2 && styles[0]?.includes('.reader-page');
      })
    )
    .toBe(true);

  const styles = await reader.evaluate((element) => {
    const root = element.shadowRoot!;
    return root.adoptedStyleSheets.length >= 2
      ? [...root.adoptedStyleSheets].map((sheet) =>
          [...sheet.cssRules].map((rule) => rule.cssText).join('\n')
        )
      : [...root.querySelectorAll('style')].map((style) => style.textContent ?? '');
  });
  expect(styles[0]).toContain('.reader-page');
  expect(styles[1]).toContain('--shiki-background');
  expect(styles[1]).not.toContain('--shiki-light');
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
