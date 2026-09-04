import { describe, expect, it } from 'vitest';

import { extractFrontMatter } from './front-matter';

function metadata(markdown: string) {
  const frontMatter = extractFrontMatter(markdown).frontMatter;
  expect(frontMatter?.kind).toBe('metadata');
  if (!frontMatter || frontMatter.kind !== 'metadata') throw new Error('Expected metadata');
  return frontMatter;
}

function warning(markdown: string) {
  const frontMatter = extractFrontMatter(markdown).frontMatter;
  expect(frontMatter?.kind).toBe('warning');
  if (!frontMatter || frontMatter.kind !== 'warning') throw new Error('Expected warning');
  return frontMatter;
}

describe('extractFrontMatter', () => {
  it('recognizes a BOM and both delimiter styles with LF or CRLF', () => {
    const bom = extractFrontMatter('\uFEFF --- \nfirst: one\n --- \n# Body');
    const crlf = extractFrontMatter('---\r\nsecond: two\r\n...\r\n# Body');

    expect(metadata('\uFEFF --- \nfirst: one\n --- \n# Body').entries[0].key).toBe('first');
    expect(metadata('---\r\nsecond: two\r\n...\r\n# Body').entries[0].key).toBe('second');
    expect(bom.body).toBe('# Body');
    expect(crlf.body).toBe('# Body');
  });

  it('leaves absent and unclosed openers as ordinary Markdown, but removes closed empty blocks', () => {
    expect(extractFrontMatter('# Title')).toEqual({ body: '# Title' });
    expect(extractFrontMatter('---\ntitle: unfinished')).toEqual({
      body: '---\ntitle: unfinished'
    });
    expect(extractFrontMatter('---\n\n---\n# Body')).toEqual({ body: '# Body' });
  });

  it('preserves ordered typed values, nested collections, multiline strings, and tag chips', () => {
    const frontMatter = metadata(`---
title: Reading desk
published: 2026-09-04
rank: 7
draft: false
summary: |
  First line
  Second line
tags: [reader, 2, true, ignored]
sections:
  introduction:
    points:
      - one
      - two
  conclusion: null
---
# Body`);

    expect(frontMatter.entries.map((entry) => entry.key)).toEqual([
      'title',
      'published',
      'rank',
      'draft',
      'summary',
      'tags',
      'sections'
    ]);
    expect(frontMatter.entries[1].value).toEqual({ kind: 'scalar', value: '2026-09-04' });
    expect(frontMatter.entries[2].value).toEqual({ kind: 'scalar', value: 7 });
    expect(frontMatter.entries[3].value).toEqual({ kind: 'scalar', value: false });
    expect(frontMatter.entries[4].value).toEqual({
      kind: 'scalar',
      value: 'First line\nSecond line\n'
    });
    expect(frontMatter.entries[6].value).toEqual({
      kind: 'mapping',
      entries: [
        {
          key: 'introduction',
          value: {
            kind: 'mapping',
            entries: [
              {
                key: 'points',
                value: {
                  kind: 'sequence',
                  items: [
                    { kind: 'scalar', value: 'one' },
                    { kind: 'scalar', value: 'two' }
                  ]
                }
              }
            ]
          }
        },
        { key: 'conclusion', value: { kind: 'scalar', value: null } }
      ]
    });
    expect(frontMatter.tagChips).toEqual(['reader', 2, true]);
  });

  it.each([
    ['duplicate keys', 'title: first\ntitle: second'],
    ['non-string keys', '1: title'],
    ['aliases', 'first: &value one\nsecond: *value'],
    ['merge keys', '<<: { title: one }'],
    ['custom tags', 'title: !local one'],
    ['non-core tags', 'published: !!timestamp 2026-09-04'],
    ['multiple documents', 'title: one\n... # first document\n--- # second document\ntitle: two']
  ])('returns a warning for %s', (_description, source) => {
    expect(warning(`---\n${source}\n---\n# Body`).source).toBe(`${source}\n`);
  });

  it('returns warnings for source, node, and nesting limits', () => {
    const oversized = `---\ntitle: ${'x'.repeat(64 * 1024)}\n---\n# Body`;
    const tooManyNodes = `---\nitems:\n${Array.from({ length: 1_000 }, (_, index) => `  - ${index}`).join('\n')}\n---`;
    const nested = `---\n${Array.from({ length: 13 }, (_, index) => `${'  '.repeat(index)}level${index}:`).join('\n')}
${'  '.repeat(13)}done: true
---`;

    const oversizedWarning = warning(oversized);
    expect(oversizedWarning.source).toHaveLength(16 * 1024);
    expect(oversizedWarning.omittedCharacters).toBeGreaterThan(0);
    expect(warning(tooManyNodes).source).toContain('items:');
    expect(warning(nested).source).toContain('level12:');
  });

  it('retains unsafe and malformed closed source only as warning data', () => {
    const result = extractFrontMatter(
      '---\ntitle: <script>alert(1)</script>\nlist: [\n---\n# Body'
    );

    expect(result.body).toBe('# Body');
    expect(warning('---\ntitle: <script>alert(1)</script>\nlist: [\n---').source).toContain(
      '<script>alert(1)</script>'
    );
  });
});
