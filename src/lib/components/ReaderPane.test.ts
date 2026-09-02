import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import ReaderPane from './ReaderPane.svelte';

async function readerElement(container: HTMLElement): Promise<HTMLElement> {
  const reader = container.querySelector<HTMLElement>('[data-testid="reader"]');
  if (!reader?.shadowRoot) throw new Error('Reader Shadow DOM was not mounted');
  await waitFor(() => expect(reader.shadowRoot?.innerHTML).toContain('<article'));
  return reader;
}

describe('ReaderPane', () => {
  it('renders sanitized Markdown inside an isolated Shadow DOM', async () => {
    const { container } = render(ReaderPane, {
      document: { path: 'guide.md', title: 'Guide', content: '~~done~~ <script>alert(1)</script>' }
    });
    const reader = await readerElement(container);

    expect(reader.shadowRoot?.innerHTML).toContain('<del>done</del>');
    expect(reader.shadowRoot?.innerHTML).not.toContain('<script>');
    expect(reader.shadowRoot?.querySelector('style, link')).not.toBeNull();
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
