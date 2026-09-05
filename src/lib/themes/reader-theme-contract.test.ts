import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  missingReaderContract,
  missingReaderDocumentation,
  readerSelectors,
  shikiVariables
} from '../../../scripts/reader-theme-contract.mjs';
import { representativeReaderDocument } from '../fixtures/representative-reader';

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
    expect(css).toMatch(
      /\.reader-content :not\(pre\) > code\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?overflow-wrap:\s*normal[\s\S]*?word-break:\s*normal/
    );
  });

  it('keeps a deterministic inventory for every vendored variable font asset', async () => {
    const inventory = JSON.parse(
      await readFile(resolve('src/assets/fonts/inventory.json'), 'utf8')
    ) as {
      fonts: Array<{
        family: string;
        revision: string;
        file: string;
        sha256: string;
        license: string;
      }>;
    };

    expect(inventory.fonts).toHaveLength(4);
    expect(inventory.fonts.map((font) => font.family)).toEqual([
      'Source Sans 3',
      'Source Sans 3',
      'Source Serif 4',
      'Source Serif 4'
    ]);
    expect(inventory.fonts.every((font) => /^sha256:[0-9a-f]{64}$/.test(font.sha256))).toBe(true);
    expect(inventory.fonts.map((font) => font.revision)).toEqual([
      '3.052R',
      '3.052R',
      '4.005R',
      '4.005R'
    ]);
    expect(inventory.fonts.every((font) => font.license === 'OFL-1.1')).toBe(true);
  });

  it('defines the bundled variable font families once in application CSS', async () => {
    const css = await readFile(resolve('src/app.css'), 'utf8');

    expect(css.match(/@font-face/g)).toHaveLength(4);
    expect(css).toMatch(/font-family:\s*'Source Serif 4'/);
    expect(css).toMatch(/font-family:\s*'Source Sans 3'/);
    expect(css).toContain("url('./assets/fonts/SourceSerif4Variable-Roman.woff2')");
    expect(css).toContain("url('./assets/fonts/SourceSerif4Variable-Italic.woff2')");
    expect(css).toContain("url('./assets/fonts/SourceSans3VF-Upright.woff2')");
    expect(css).toContain("url('./assets/fonts/SourceSans3VF-Italic.woff2')");
    expect(css).toMatch(/font-weight:\s*200 900/);
  });

  it('keeps one representative source with the complete reader fixture contract', () => {
    const fixture = representativeReaderDocument.content;

    for (const source of [
      '# Reading a local field guide',
      '## ',
      '### ',
      '#### ',
      '##### ',
      '###### ',
      '- [x]',
      '- [ ]',
      '1. ',
      '> ',
      '`renderDocument`',
      '```typescript',
      '| Surface |',
      '```mermaid',
      '---',
      '[local chapter]',
      '[project website]',
      '![A sunlit reading desk]',
      '![Unavailable field photograph]'
    ]) {
      expect(fixture).toContain(source);
    }
  });

  it('gives each built-in theme its agreed font allocation without imposing it on starters', async () => {
    const [paper, midnight, fieldNotes, starter] = await Promise.all(
      packageCss.map((path) => readFile(resolve(path), 'utf8'))
    );

    expect(paper).toMatch(/:host[\s\S]*?font[\s\S]*?'Source Serif 4'/);
    expect(paper).toMatch(/\.reader-content h1[\s\S]*?font-family:\s*'Source Sans 3'/);
    expect(midnight).toMatch(/:host[\s\S]*?font[\s\S]*?'Source Sans 3'/);
    expect(midnight).toMatch(/\.reader-content h1[\s\S]*?font-family:\s*'Source Serif 4'/);
    expect(fieldNotes).toMatch(/:host[\s\S]*?font[\s\S]*?'Source Serif 4'/);
    expect(fieldNotes).toMatch(/\.front-matter-summary[\s\S]*?font-family:\s*'Source Sans 3'/);
    expect(starter).not.toMatch(/Source (?:Serif 4|Sans 3)/);
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
