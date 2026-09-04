import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const shellTokens = [
  'background',
  'panel',
  'surface',
  'raised-surface',
  'foreground',
  'foreground-strong',
  'muted',
  'faint',
  'border',
  'border-strong',
  'accent',
  'accent-foreground',
  'accent-soft',
  'hover',
  'selected',
  'focus',
  'danger',
  'warning',
  'overlay'
];

const shellSources = [
  'src/app.css',
  'src/lib/components/DocumentTree.svelte',
  'src/lib/components/ThemeChooser.svelte',
  'src/lib/components/ThemeNotice.svelte',
  'src/lib/components/KeyboardHelp.svelte'
];

describe('Reading desk shell theme contract', () => {
  it('derives every visible shell color from semantic tokens', async () => {
    const sources = await Promise.all(shellSources.map((path) => readFile(resolve(path), 'utf8')));
    const css = sources.join('\n');

    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    for (const token of shellTokens) {
      expect(css).toContain(`--shell-${token}`);
    }

    const visibleColorValues = [
      ...css.matchAll(
        /(?:^|[;{]\s*)(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow)\s*:\s*([^;}]*)/gm
      )
    ].map((match) => match[1]?.trim() ?? '');
    expect(visibleColorValues.length).toBeGreaterThan(0);
    for (const value of visibleColorValues) {
      expect(value).toMatch(/var\(--shell-|transparent|currentColor|^0$/);
      expect(value).not.toMatch(
        /\b(?:black|white|red|green|blue|yellow|orange|purple|pink|brown|gray|grey|cyan|magenta)\b/i
      );
    }
  });

  it('defines every custom theme picker state through shell tokens', async () => {
    const css = await readFile(resolve('src/app.css'), 'utf8');

    for (const state of [
      '.theme-trigger {',
      '.theme-trigger:hover',
      '.theme-trigger:focus-visible',
      ".theme-trigger[data-state='open']",
      '.theme-trigger:disabled',
      '.theme-listbox {',
      '.theme-option {',
      '.theme-option:hover',
      ".theme-option[aria-selected='true']"
    ]) {
      expect(css).toContain(state);
    }
    expect(css).toMatch(/\.theme-trigger\s*\{[\s\S]*?var\(--shell-border-strong\)/);
    expect(css).toMatch(/\.theme-trigger\s*\{[\s\S]*?font-weight:\s*650/);
    expect(css).toMatch(/\.theme-trigger:hover[\s\S]*?var\(--shell-hover\)/);
    expect(css).toMatch(/\.theme-trigger:focus-visible\s*\{[\s\S]*?var\(--shell-focus\)/);
    expect(css).toMatch(
      /\.theme-trigger\[data-state='open'\]\s*\{[\s\S]*?var\(--shell-accent-soft\)/
    );
    expect(css).toMatch(/\.theme-trigger:disabled[\s\S]*?var\(--shell-faint\)/);
    expect(css).toMatch(/\.theme-option\[aria-selected='true'\][\s\S]*?var\(--shell-selected\)/);
  });

  it('keeps the navigation scrollbar thin at the sidebar edge', async () => {
    const css = await readFile(resolve('src/app.css'), 'utf8');

    expect(css).toMatch(/\.library-navigation\s*\{[\s\S]*?margin-right:\s*-0\.9rem/);
    expect(css).toMatch(/\.library-navigation\s*\{[\s\S]*?padding-right:\s*0\.9rem/);
    expect(css).toMatch(/\.library-navigation\s*\{[\s\S]*?overflow-y:\s*auto/);
    expect(css).toMatch(/\.library-navigation\s*\{[\s\S]*?scrollbar-width:\s*thin/);
    expect(css).toMatch(/\.library-navigation::-webkit-scrollbar\s*\{[\s\S]*?width:\s*0\.4rem/);
    expect(css).toMatch(
      /\.library-navigation::-webkit-scrollbar-thumb\s*\{[\s\S]*?var\(--shell-border-strong\)/
    );
  });

  it('keeps front matter subdued and separated in every bundled reader theme', async () => {
    const themeCss = await Promise.all(
      ['mdhere-light', 'mdhere-dark', 'field-notes'].map((theme) =>
        readFile(resolve(`src-tauri/themes/${theme}/reader.css`), 'utf8')
      )
    );

    for (const css of themeCss) {
      expect(css).toMatch(/\.front-matter\s*\{[\s\S]*?margin-bottom:\s*4rem/);
      expect(css).toMatch(/\.front-matter-summary\s*\{[\s\S]*?font-weight:\s*normal/);
    }
  });
});
