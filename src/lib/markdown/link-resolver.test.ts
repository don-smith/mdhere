import { describe, expect, it } from 'vitest';

import { resolveDocumentLink, resolveImage } from './link-resolver';

describe('link resolver', () => {
  it('resolves an encoded relative Markdown link and preserves its fragment', () => {
    expect(resolveDocumentLink('guides/Start.md', '../Guide%20Two.markdown#A%20heading')).toEqual({
      kind: 'document',
      path: 'Guide Two.markdown',
      fragment: 'A heading'
    });
  });

  it('rejects traversal, absolute paths, malformed URLs, and unsupported links', () => {
    for (const target of [
      '../../outside.md',
      '/etc/passwd.md',
      '%E0%A4%A.md',
      'file:///tmp/a.md'
    ]) {
      expect(resolveDocumentLink('guide.md', target)).toEqual({ kind: 'inert' });
    }
  });

  it('allows only https external links and only relative local image paths', () => {
    expect(resolveDocumentLink('guide.md', 'https://example.com')).toEqual({
      kind: 'external',
      url: 'https://example.com/'
    });
    expect(resolveDocumentLink('guide.md', 'javascript:alert(1)')).toEqual({ kind: 'inert' });
    expect(resolveImage('guides/Start.md', '../images/photo.png')).toEqual({
      kind: 'asset',
      path: 'images/photo.png'
    });
    expect(resolveImage('guide.md', 'https://example.com/photo.png')).toEqual({
      kind: 'unavailable'
    });
  });
});
