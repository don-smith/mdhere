import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Chromium fixture uses the same document-start app script, with only its fixture URL prefix substituted.
const bridge = readFileSync('src-tauri/src/story/frame-init.js', 'utf8')
  .replace(
    "location.protocol === 'mdhere-story:'",
    "location.pathname.startsWith('/tests/fixtures/library/')"
  )
  .replace("'/' + location.pathname.split('/')[1] + '/'", "'/tests/fixtures/library/'")
  .replace(".split('/').slice(2)", ".split('/').slice(4)");

test('opens the portable example and its Markdown anchor without the app bridge', async ({
  page
}) => {
  await page.goto(pathToFileURL(resolve('docs/examples/story/index.html')).href);
  await expect(page.getByRole('heading', { name: 'A small story' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue in Markdown' }).click();
  await expect(page).toHaveURL(/chapter\.md$/);
  await expect(page.locator('body')).toContainText('A chapter');
});

test('routes ordinary story links to rendered Markdown and another HTML story', async ({
  page
}) => {
  await page.addInitScript({ content: bridge });
  await page.goto('/?scenario=story');
  await page.getByRole('treeitem', { name: 'Story.html' }).click();
  const story = page.frameLocator('[data-testid="story-frame"]');
  await story.getByRole('link', { name: 'Next story' }).click();
  await expect(page.getByTestId('document-toolbar')).toContainText('Next story');
  await expect(story.getByRole('heading', { name: 'Next story page' })).toBeVisible();
  await expect
    .poll(() => story.locator('body').evaluate((body) => body.baseURI))
    .toMatch(/#ending$/);
  await story.getByRole('link', { name: 'Previous story' }).click();
  await story.getByRole('link', { name: 'Same-page section' }).click();
  expect(await story.locator('body').evaluate((body) => body.baseURI)).toMatch(/#local$/);
  await expect(page.getByTestId('document-toolbar')).toContainText('Story');
  await story.getByRole('link', { name: 'Missing chapter' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('document-toolbar')).toContainText('Story');
  await story.getByRole('link', { name: 'Read Markdown' }).click();
  await expect(page.getByTestId('status-strip')).toContainText('Markdown');
  await expect(page.getByTestId('reader').locator('h1')).toBeVisible();
  await expect(page.getByTestId('story-frame')).toHaveCount(0);
});

test('isolates a local HTML story, loads its resources and tears it down on Markdown selection', async ({
  page
}) => {
  await page.goto('/?scenario=story');
  await page.getByRole('treeitem', { name: 'Story.html' }).click();
  const frame = page.getByTestId('story-frame');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(frame).not.toHaveAttribute('allow');
  await expect(page.getByTestId('status-strip')).toContainText('HTML');
  const story = page.frameLocator('[data-testid="story-frame"]');
  await expect(story.locator('body')).toHaveAttribute('data-local-script', 'ran');
  await expect(story.locator('h1')).toHaveText('Local story');
  await expect(story.getByAltText('Local illustration')).toHaveJSProperty('complete', true);
  await expect(story.locator('.animated')).toHaveCSS('animation-name', 'story-motion');
  expect(await frame.evaluate((element: HTMLIFrameElement) => element.contentDocument)).toBeNull();
  const origin = await story.locator('body').evaluate(() => {
    try {
      localStorage.setItem('story-origin-test', 'unexpected');
      return { effective: self.origin, storage: 'allowed' };
    } catch (error) {
      return { effective: self.origin, storage: (error as Error).name };
    }
  });
  expect(origin).toEqual({ effective: 'null', storage: 'SecurityError' });

  await page.getByRole('treeitem', { name: 'Welcome.md' }).click();
  await expect(frame).toHaveCount(0);
  await expect(page.getByTestId('reader')).toBeVisible();
  await expect(page.getByTestId('reader').locator('script')).toHaveCount(0);

  await page.getByRole('treeitem', { name: 'Story.html' }).click();
  await expect(frame).toBeVisible();
  await page.getByRole('button', { name: 'Open Folder' }).first().click();
  await expect(frame).toHaveCount(0);
});
