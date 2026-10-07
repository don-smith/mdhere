import { describe, expect, it } from 'vitest';
import { isStoryFocusTreeMessage, resolveStoryLink, validateStoryMessage } from './navigation';

const current = 'guides/chapters/Start.html';

describe('story navigation', () => {
  it('resolves ordinary nested relative HTML and Markdown paths with encoded names and fragments', () => {
    expect(resolveStoryLink(current, '../../Guide%20Two.md#Part%20One')).toEqual({
      kind: 'markdown',
      path: 'Guide Two.md',
      fragment: 'Part One'
    });
    expect(resolveStoryLink(current, '../Next.html')).toEqual({
      kind: 'html',
      path: 'guides/Next.html'
    });
    expect(resolveStoryLink(current, '#here')).toBeNull();
    expect(resolveStoryLink(current, 'page%25.html#section')).toEqual({
      kind: 'html',
      path: 'guides/chapters/page%.html',
      fragment: 'section'
    });
    for (const escape of ['2e', '2f']) {
      expect(resolveStoryLink(current, `a%25${escape}.html`)).toEqual({
        kind: 'html',
        path: `guides/chapters/a%${escape}.html`
      });
    }
  });

  it('rejects unsupported destinations, malformed encodings, root escape and schemes', () => {
    for (const href of [
      '../../../out.md',
      '/home.md',
      '//example.com/a.md',
      'file:foo.md',
      'https://example.com/a.html',
      'javascript:alert(1)',
      'next.txt',
      'next.html?x=1',
      '%E0%A4%A.md',
      '%2fsecret.md',
      'a%2f.html',
      '%2e/next.html',
      '%5csecret.md',
      '%2e%2e/next.html',
      'bad%00.md'
    ]) {
      expect(resolveStoryLink(current, href)).toBeNull();
    }
    expect(resolveStoryLink(current, '%252fsecret.md')).toEqual({
      kind: 'markdown',
      path: 'guides/chapters/%2fsecret.md'
    });
    expect(resolveStoryLink(current, '%252e%252e/next.html')).toEqual({
      kind: 'html',
      path: 'guides/chapters/%2e%2e/next.html'
    });
  });

  it('accepts only an exact focus action from the current frame', () => {
    const frame = {} as Window;
    const action = { type: 'mdhere:story-focus-tree' };
    expect(isStoryFocusTreeMessage(frame, frame, action)).toBe(true);
    expect(isStoryFocusTreeMessage({} as Window, frame, action)).toBe(false);
    expect(isStoryFocusTreeMessage(frame, null, action)).toBe(false);
    expect(isStoryFocusTreeMessage(frame, frame, { ...action, command: 'invoke' })).toBe(false);
    expect(isStoryFocusTreeMessage(frame, frame, { type: 'mdhere:story-navigation' })).toBe(false);
  });

  it('validates the exact current frame, locally resolved path/kind and message shape', () => {
    const frame = {} as Window;
    const message = {
      type: 'mdhere:story-navigation',
      href: '../../Guide%20Two.md#Part%20One',
      path: 'Guide Two.md',
      kind: 'markdown'
    };
    expect(validateStoryMessage(frame, frame, message, current)).toEqual({
      kind: 'markdown',
      path: 'Guide Two.md',
      fragment: 'Part One'
    });
    expect(validateStoryMessage({} as Window, frame, message, current)).toBeNull();
    for (const data of [
      null,
      [],
      { ...message, kind: 'html' },
      { ...message, path: 'elsewhere.md' },
      { ...message, extra: true },
      { ...message, href: '#here' },
      { ...message, href: 'missing.md', path: 'missing.md' }
    ]) {
      expect(validateStoryMessage(frame, frame, data, current)).toBeNull();
    }
    // Existence is deliberately deferred to native read.
    expect(
      validateStoryMessage(
        frame,
        frame,
        { ...message, href: 'missing.md', path: 'guides/chapters/missing.md' },
        current
      )
    ).toEqual({
      kind: 'markdown',
      path: 'guides/chapters/missing.md'
    });
  });
});
