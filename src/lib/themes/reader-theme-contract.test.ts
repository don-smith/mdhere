import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  missingReaderContract,
  missingReaderDocumentation,
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
    expect(css).toMatch(/\.reader-page\s*\{[\s\S]*?max-inline-size:\s*96ch/);
    expect(css).toMatch(/\.reader-page\s*\{[\s\S]*?padding:\s*clamp\(0\.75rem, 2vw, 2rem\)/);
    expect(css).toMatch(
      /\.reader-page\s*\{[\s\S]*?padding-block-start:\s*clamp\(1\.5rem, 4vw, 4rem\)/
    );
    expect(css).toContain(':focus-visible');
    expect(css).toContain('.contains-task-list');
    expect(css).toMatch(/table th,[\s\S]*?table td\s*\{[\s\S]*?overflow-wrap:\s*normal/);
    expect(css).toMatch(/table th,[\s\S]*?table td\s*\{[\s\S]*?word-break:\s*normal/);
  });

  it('keeps packages, starter, and guide synchronized on reader hooks and Shiki variables', async () => {
    const [guide, ...stylesheets] = await Promise.all(
      ['docs/themes.md', ...packageCss].map((path) => readFile(resolve(path), 'utf8'))
    );

    expect(missingReaderDocumentation(guide!)).toEqual([]);
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

  it('requires CSS selectors and declarations rather than comments or string values', () => {
    const falseContract = `
      /* ${[...readerSelectors, ...shikiVariables].join(' ')} */
      :host { content: '${shikiVariables.join(':; ')}'; }
      .reader-page { content: '.reader-content .front-matter'; }
    `;

    expect(missingReaderContract(falseContract)).toEqual([
      ...readerSelectors.filter((selector) => ![':host', '.reader-page'].includes(selector)),
      ...shikiVariables
    ]);

    expect(missingReaderContract(`:host { ${shikiVariables.join(': #000; ')}: #000;`)).toEqual([
      ...readerSelectors,
      ...shikiVariables
    ]);
  });
});
