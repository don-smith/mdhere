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
});
