import { describe, expect, it } from 'vitest';

import { MarkdownRenderer } from './renderer';

describe('MarkdownRenderer', () => {
  it('renders GFM features while escaping raw HTML and unsafe protocols', async () => {
    const renderer = await MarkdownRenderer.create();
    const rendered = renderer.render(
      '# Hello\n\n~~done~~\n\n- [x] task\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script> [bad](javascript:alert(1))',
      'guide.md'
    );

    expect(rendered.html).toContain('<del>done</del>');
    expect(rendered.html).toContain('<input');
    expect(rendered.html).toContain('<table>');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('href="javascript:');
  });

  it('rewrites local links and images without making the webview navigate', async () => {
    const renderer = await MarkdownRenderer.create();
    const rendered = renderer.render('[next](next.md#Part) ![cover](images/cover.png)', 'guide.md');

    expect(rendered.html).toContain('data-mdhere-path="next.md"');
    expect(rendered.html).toContain('data-mdhere-fragment="Part"');
    expect(rendered.html).toContain('src="mdhere-asset://local/images/cover.png"');
  });

  it('assigns deterministic, focusable IDs to headings', async () => {
    const renderer = await MarkdownRenderer.create();
    const rendered = renderer.render(
      '# Héllo, world!\n\n## Héllo, world!\n\n# _A  heading_',
      'guide.md'
    );

    expect(rendered.html).toContain('<h1 id="héllo-world" tabindex="-1">');
    expect(rendered.html).toContain('<h2 id="héllo-world-2" tabindex="-1">');
    expect(rendered.html).toContain('<h1 id="a-heading" tabindex="-1">');
  });

  it('marks unavailable images and exposes only validated external links', async () => {
    const renderer = await MarkdownRenderer.create();
    const rendered = renderer.render(
      '![remote](https://example.com/image.png) [safe](https://example.com) [unsafe](ftp://example.com)',
      'guide.md'
    );

    expect(rendered.html).toContain('data-mdhere-image-unavailable="true"');
    expect(rendered.html).toContain('data-mdhere-external="https://example.com/"');
    expect(rendered.html).not.toContain('href="ftp:');
  });
});
