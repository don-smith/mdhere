import { describe, expect, it, vi } from 'vitest';

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
    expect(rendered.html).toContain('src="mdhere-asset://localhost/images/cover.png"');
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

  it('emits light and dark Shiki tokens for language-aware code fences', async () => {
    const renderer = await MarkdownRenderer.create();
    const rendered = renderer.render('```typescript\nconst answer: number = 42;\n```', 'guide.md');

    expect(rendered.html).toContain('class="shiki');
    expect(rendered.html).toContain('--shiki-light:');
    expect(rendered.html).toContain('--shiki-dark:');
    expect(rendered.html).toContain('--shiki-dark-bg:');
    expect(rendered.html.match(/class="line"/g)).toHaveLength(1);
  });

  it('marks unavailable images and exposes only validated external links', async () => {
    const renderer = await MarkdownRenderer.create();
    const rendered = renderer.render(
      '![remote](https://example.com/image.png) [safe](https://example.com) [unsafe](ftp://example.com)',
      'guide.md'
    );

    expect(rendered.html).toContain('data-mdhere-image-unavailable="true"');
    expect(rendered.html).toContain('Image unavailable: remote');
    expect(rendered.html).not.toContain('src=""');
    expect(rendered.html).toContain('data-mdhere-external="https://example.com/"');
    expect(rendered.html).not.toContain('href="ftp:');
  });

  it('renders only the body for recognized front matter, but passes unclosed source through', async () => {
    const renderer = await MarkdownRenderer.create();
    const parser = Reflect.get(renderer, 'parser') as { render: (source: string) => string };
    const render = vi.spyOn(parser, 'render');

    const recognized = renderer.render('---\ntitle: Safe\n---\n# Body', 'guide.md');
    expect(render).toHaveBeenLastCalledWith('# Body', expect.anything());
    expect(recognized.frontMatter).toMatchObject({ kind: 'metadata' });
    expect(recognized.html).not.toContain('title: Safe');

    renderer.render('---\ntitle: Unclosed', 'guide.md');
    expect(render).toHaveBeenLastCalledWith('---\ntitle: Unclosed', expect.anything());
  });

  it('removes malformed closed front matter from HTML while retaining a warning model', async () => {
    const renderer = await MarkdownRenderer.create();
    const rendered = renderer.render(
      '---\ntitle: <script>alert(1)</script>\nitems: [\n---\n# Body',
      'guide.md'
    );

    expect(rendered.html).toContain('<h1 tabindex="-1">Body</h1>');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.frontMatter).toEqual({
      kind: 'warning',
      source: 'title: <script>alert(1)</script>\nitems: [\n'
    });
  });
});
