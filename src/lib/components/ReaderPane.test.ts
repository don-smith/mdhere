import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
});
