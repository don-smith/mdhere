import { expect, test } from '@playwright/test';

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
