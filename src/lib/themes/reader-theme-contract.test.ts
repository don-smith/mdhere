import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  missingReaderContract,
  readerSelectors,
  shikiVariables
} from '../../../scripts/reader-theme-contract.mjs';

const packageCss = [
  'src-tauri/themes/mdhere-light/reader.css',
  'src-tauri/themes/mdhere-dark/reader.css',
  'src-tauri/themes/field-notes/reader.css',
  'docs/themes/starter/reader.css'
];

describe('reader theme contract', () => {
  it('keeps structural reader CSS presentation-free', async () => {
    const css = await readFile(resolve('src/lib/markdown/base-reader.css'), 'utf8');

    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    expect(css).not.toMatch(/(?:^|\n)\s*(?:color|background|border(?:-color)?|font)\s*:/m);
    expect(css).toContain('.reader-page');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('.contains-task-list');
  });

  it('keeps packages, starter, and guide synchronized on reader hooks and Shiki variables', async () => {
    const [guide, ...stylesheets] = await Promise.all(
      ['docs/themes.md', ...packageCss].map((path) => readFile(resolve(path), 'utf8'))
    );

    expect(missingReaderContract(guide!)).toEqual([]);
    for (const [index, css] of stylesheets.entries()) {
      expect(missingReaderContract(css)).toEqual([]);
      expect(css).not.toMatch(/(?:^|[,\s])(?:html|body|\.app-shell)\b|:global\(/m);
      expect(css).toContain(':host');
      expect(css).toContain('.front-matter-warning');
      expect(css).toContain('.mdhere-image-unavailable');
      expect(css).toContain('.shiki');
      expect(css).toContain('--shiki-background');
      expect(packageCss[index]).toBeDefined();
    }

    expect(readerSelectors).toHaveLength(18);
    expect(shikiVariables).toHaveLength(14);
  });
});
