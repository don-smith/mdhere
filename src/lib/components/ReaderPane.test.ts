import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { presentationFixture } from '../presentation/presentation-fixture';
import ReaderPane from './ReaderPane.svelte';

async function readerElement(container: HTMLElement): Promise<HTMLElement> {
  const reader = container.querySelector<HTMLElement>('[data-testid="reader"]');
  if (!reader?.shadowRoot) throw new Error('Reader Shadow DOM was not mounted');
  await waitFor(() => expect(reader.shadowRoot?.innerHTML).toContain('<article'));
  return reader;
}

describe('ReaderPane', () => {
  afterEach(cleanup);

  it('renders sanitized Markdown inside an isolated Shadow DOM', async () => {
    const { container } = render(ReaderPane, {
      document: { path: 'guide.md', title: 'Guide', content: '~~done~~ <script>alert(1)</script>' }
    });
    const reader = await readerElement(container);

    expect(reader.shadowRoot?.innerHTML).toContain('<del>done</del>');
    expect(reader.shadowRoot?.innerHTML).not.toContain('<script>');
    expect(reader.shadowRoot?.querySelector('style, link')).not.toBeNull();
  });

  it('keeps theme CSS inside the reader Shadow DOM', async () => {
    const { container } = render(ReaderPane, {
      document: { path: 'guide.md', title: 'Guide', content: '# Guide' },
      themeCss: ':host { background: rebeccapurple; }'
    });
    const reader = await readerElement(container);
    expect(reader.shadowRoot?.textContent).toContain('rebeccapurple');
    expect(document.head.textContent).not.toContain('rebeccapurple');
  });

  it('replaces a missing local image with an accessible placeholder', async () => {
    const { container } = render(ReaderPane, {
      document: { path: 'guide.md', title: 'Guide', content: '![cover](images/missing.png)' }
    });
    const reader = await readerElement(container);
    const image = reader.shadowRoot?.querySelector('img');
    if (!image) throw new Error('Expected the local image element');

    await fireEvent.error(image);

    expect(reader.shadowRoot?.querySelector('img')).toBeNull();
    expect(reader.shadowRoot?.textContent).toContain('Image unavailable: cover');
  });

  it('renders ordered, semantic front matter with safe text and three tag chips', async () => {
    const { container } = render(ReaderPane, {
      document: {
        path: 'guide.md',
        title: 'Guide',
        content: `---
title: <img src=x onerror=alert(1)>
published: true
tags: [reader, 7, false, ignored]
nested:
  author: Ada
  sections:
    - One
    - Two
---
# Guide`
      }
    });
    const reader = await readerElement(container);
    const details = reader.shadowRoot?.querySelector<HTMLDetailsElement>('details.front-matter');
    if (!details) throw new Error('Expected front matter disclosure');

    expect(details.open).toBe(false);
    expect(details.querySelector('summary')).toHaveTextContent('Document details');
    const page = details.parentElement;
    expect(page?.className).toBe('reader-page');
    expect(page?.children[0]).toBe(details);
    expect(page?.children[1]?.tagName).toBe('ARTICLE');
    expect(
      [...details.querySelectorAll('.front-matter-key')].map((element) => element.textContent)
    ).toEqual(['title', 'published', 'tags', 'nested', 'author', 'sections']);
    expect(
      [...details.querySelectorAll('.front-matter-tag')].map((element) => element.textContent)
    ).toEqual(['reader', '7', 'false']);
    expect(details.querySelector('.front-matter-map')).not.toBeNull();
    expect(details.querySelectorAll('.front-matter-map .front-matter-list > li')).toHaveLength(2);
    expect(details.querySelector('img')).toBeNull();
    expect(details).toHaveTextContent('<img src=x onerror=alert(1)>');
  });

  it('uses a native disclosure, reapplies the global state, and suppresses setup toggles', async () => {
    const onFrontMatterToggle = vi.fn();
    const firstDocument = {
      path: 'first.md',
      title: 'First',
      content: '---\ntitle: First\n---\n# First'
    };
    const { container, rerender } = render(ReaderPane, {
      document: firstDocument,
      frontMatterExpanded: true,
      onFrontMatterToggle
    });
    const reader = await readerElement(container);
    const firstDetails =
      reader.shadowRoot?.querySelector<HTMLDetailsElement>('details.front-matter');
    if (!firstDetails) throw new Error('Expected front matter disclosure');

    expect(firstDetails.open).toBe(true);
    expect(onFrontMatterToggle).not.toHaveBeenCalled();

    await rerender({
      document: {
        path: 'second.md',
        title: 'Second',
        content: '---\ntitle: Second\n---\n# Second'
      },
      frontMatterExpanded: false,
      onFrontMatterToggle
    });
    await waitFor(() => {
      const details = reader.shadowRoot?.querySelector<HTMLDetailsElement>('details.front-matter');
      expect(details?.open).toBe(false);
    });
    expect(onFrontMatterToggle).not.toHaveBeenCalled();

    const secondSummary = reader.shadowRoot?.querySelector('details.front-matter summary');
    if (!secondSummary) throw new Error('Expected front matter summary');
    await fireEvent.click(secondSummary);
    await waitFor(() => expect(onFrontMatterToggle).toHaveBeenCalledWith(true));
  });

  it('shows escaped malformed front matter in an initially open warning disclosure', async () => {
    const { container } = render(ReaderPane, {
      document: {
        path: 'broken.md',
        title: 'Broken',
        content: '---\ntitle: <script>alert(1)</script>\nlist: [\n---\n# Body'
      },
      frontMatterExpanded: true
    });
    const reader = await readerElement(container);
    const details = reader.shadowRoot?.querySelector<HTMLDetailsElement>('details.front-matter');
    if (!details) throw new Error('Expected front matter warning');

    expect(details.open).toBe(true);
    expect(details.querySelector('[role="alert"]')).toHaveTextContent(
      'This document has invalid or unsupported front matter.'
    );
    expect(details.querySelector('pre')).toHaveTextContent('<script>alert(1)</script>');
    expect(details.querySelector('script')).toBeNull();
  });

  it('reports truncated warning source without inserting it as HTML', async () => {
    const { container } = render(ReaderPane, {
      document: {
        path: 'large.md',
        title: 'Large',
        content: `---\nnotes: ${'x'.repeat(64 * 1024)}\n---\n# Large`
      }
    });
    const reader = await readerElement(container);
    const warning = reader.shadowRoot?.querySelector('.front-matter-warning');

    expect(warning).toHaveTextContent('characters omitted.');
    expect(warning?.querySelector('script')).toBeNull();
  });

  it('omits disclosures for absent and empty front matter', async () => {
    const { container, rerender } = render(ReaderPane, {
      document: { path: 'plain.md', title: 'Plain', content: '# Plain' }
    });
    const reader = await readerElement(container);
    expect(reader.shadowRoot?.querySelector('details.front-matter')).toBeNull();

    await rerender({
      document: { path: 'empty.md', title: 'Empty', content: '---\n\n---\n# Empty' }
    });
    await waitFor(() =>
      expect(reader.shadowRoot?.querySelector('details.front-matter')).toBeNull()
    );
  });

  it('reruns Mermaid parsing after a document refresh replaces its source', async () => {
    const theme = presentationFixture.selected;
    const { container, rerender } = render(ReaderPane, {
      theme,
      document: {
        path: 'diagram.md',
        title: 'Diagram',
        content: '```mermaid\nnot a diagram\n```'
      }
    });
    const reader = await readerElement(container);

    await waitFor(() =>
      expect(reader.shadowRoot?.querySelector('[role="alert"]')).toHaveTextContent(
        /No diagram type detected/
      )
    );

    await rerender({
      document: {
        path: 'diagram.md',
        title: 'Diagram',
        content: '```mmd\nthis is different invalid source\n```'
      }
    });

    await waitFor(() => {
      const article = reader.shadowRoot?.querySelector('article');
      expect(article?.querySelector('pre')).toHaveTextContent('this is different invalid source');
      expect(article?.querySelector('[role="alert"]')).toHaveTextContent(
        /No diagram type detected/
      );
    });
  });

  it('rebuilds the current article when the selected theme changes', async () => {
    const document = {
      path: 'diagram.md',
      title: 'Diagram',
      content: '```mermaid\nnot a diagram\n```'
    };
    const paper = presentationFixture.selected;
    const midnight = presentationFixture.themes.find((theme) => theme.id === 'mdhere-dark');
    if (!midnight) throw new Error('Expected Midnight fixture theme');
    const { container, rerender } = render(ReaderPane, {
      document,
      theme: paper,
      themeCss: paper.css,
      themeAppearance: paper.appearance
    });
    const reader = await readerElement(container);

    await waitFor(() =>
      expect(reader.shadowRoot?.querySelector('[role="alert"]')).toHaveTextContent(
        /No diagram type detected/
      )
    );
    const firstArticle = reader.shadowRoot?.querySelector('article');

    await rerender({
      document,
      theme: midnight,
      themeCss: midnight.css,
      themeAppearance: midnight.appearance
    });

    await waitFor(() => {
      expect(reader.shadowRoot?.querySelector('article')).not.toBe(firstArticle);
      expect(reader.shadowRoot?.querySelector('[role="alert"]')).toHaveTextContent(
        /No diagram type detected/
      );
      expect(reader.dataset.themeAppearance).toBe('dark');
    });
  });

  it('delegates validated local and external links without navigating the webview', async () => {
    const onDocumentLink = vi.fn();
    const onExternalLink = vi.fn();
    const { container } = render(ReaderPane, {
      document: {
        path: 'guide.md',
        title: 'Guide',
        content: '[next](next.md#part) [web](https://example.com)'
      },
      onDocumentLink,
      onExternalLink
    });
    const reader = await readerElement(container);
    const links = reader.shadowRoot?.querySelectorAll('a') ?? [];
    expect(links).toHaveLength(2);

    await fireEvent.click(links[0]!);
    await fireEvent.click(links[1]!);

    expect(onDocumentLink).toHaveBeenCalledWith('next.md', 'part');
    expect(onExternalLink).toHaveBeenCalledWith('https://example.com/');
  });

  it('wraps headings into collapsible sections and toggles them on click', async () => {
    const { container } = render(ReaderPane, {
      document: {
        path: 'guide.md',
        title: 'Guide',
        content: '# Guide\n\nIntro\n\n## One\n\nAlpha\n\n### Deep\n\nDetail\n\n## Two\n\nBeta'
      }
    });
    const reader = await readerElement(container);
    const sections = reader.shadowRoot?.querySelectorAll('section[data-mdhere-section]') ?? [];
    expect(sections).toHaveLength(4);

    const oneHeading = reader.shadowRoot?.querySelector('h2#one');
    if (!oneHeading) throw new Error('Expected the One heading');
    await fireEvent.click(oneHeading);

    const oneSection = oneHeading.closest('section[data-mdhere-section]');
    expect(oneSection?.getAttribute('data-mdhere-collapsed')).toBe('true');
    expect(oneHeading.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(oneHeading);
    expect(oneSection?.getAttribute('data-mdhere-collapsed')).toBe('false');
    expect(oneHeading.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps heading links clickable instead of toggling the section', async () => {
    const onDocumentLink = vi.fn();
    const { container } = render(ReaderPane, {
      document: { path: 'guide.md', title: 'Guide', content: '## [Target](other.md)\n\nBody' },
      onDocumentLink
    });
    const reader = await readerElement(container);
    const link = reader.shadowRoot?.querySelector('h2 a');
    if (!link) throw new Error('Expected a heading link');

    await fireEvent.click(link);

    expect(onDocumentLink).toHaveBeenCalledWith('other.md', undefined);
    const section = link.closest('section[data-mdhere-section]');
    expect(section?.getAttribute('data-mdhere-collapsed')).toBeNull();
  });

  it('collapses and expands all sections and remembers state per document', async () => {
    const content = '# Guide\n\nIntro\n\n## One\n\nAlpha\n\n## Two\n\nBeta';
    const { container, component, rerender } = render(ReaderPane, {
      document: { path: 'guide.md', title: 'Guide', content }
    });
    const reader = await readerElement(container);

    component.run({ kind: 'collapse-sections' });
    await waitFor(() => {
      const sections = reader.shadowRoot?.querySelectorAll('section[data-mdhere-section]') ?? [];
      expect(sections.length).toBeGreaterThan(0);
      expect(
        [...sections].every((section) => section.getAttribute('data-mdhere-collapsed') === 'true')
      ).toBe(true);
    });

    await rerender({
      document: { path: 'other.md', title: 'Other', content: '# Other\n\n## Sub\n\nX' }
    });
    await waitFor(() => {
      expect(reader.shadowRoot?.querySelector('h2#sub')?.textContent).toContain('Sub');
      const collapsed = reader.shadowRoot?.querySelectorAll(
        'section[data-mdhere-collapsed="true"]'
      );
      expect(collapsed?.length).toBe(0);
    });

    await rerender({ document: { path: 'guide.md', title: 'Guide', content } });
    await waitFor(() =>
      expect(reader.shadowRoot?.querySelector('h2#one')?.textContent).toContain('One')
    );
    await waitFor(() => {
      const collapsed = reader.shadowRoot?.querySelectorAll(
        'section[data-mdhere-collapsed="true"]'
      );
      expect(collapsed?.length).toBe(3);
    });

    component.run({ kind: 'expand-sections' });
    await waitFor(() => {
      const collapsed = reader.shadowRoot?.querySelectorAll(
        'section[data-mdhere-collapsed="true"]'
      );
      expect(collapsed?.length).toBe(0);
    });
  });
});
