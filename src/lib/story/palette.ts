import type { Theme } from '../themes/types';

export const storyPaletteKeys = [
  '--story-background',
  '--story-surface',
  '--story-text',
  '--story-muted',
  '--story-link',
  '--story-border',
  '--story-accent',
  '--story-on-accent',
  '--story-focus',
  '--story-font-body',
  '--story-font-ui',
  '--story-text-size',
  '--story-line-height',
  '--story-content-width'
] as const;

export type StoryPalette = Record<(typeof storyPaletteKeys)[number], string> & {
  'color-scheme': 'light' | 'dark';
  '--story-font-body': string;
  '--story-font-ui': string;
  '--story-text-size': string;
  '--story-line-height': string;
  '--story-content-width': string;
};

const hex = /^#[0-9a-fA-F]{6}$/;

function luminance(color: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(color.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

export function contrastRatio(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

function readable(color: string, background: string, minimum = 4.5): string {
  if (contrastRatio(color, background) >= minimum) return color;
  return contrastRatio('#000000', background) >= contrastRatio('#ffffff', background)
    ? '#000000'
    : '#ffffff';
}

// Theme shell colors are syntax-validated natively. Recheck at the frame boundary and
// provide legible text even when a user package has insufficient shell contrast.
export function deriveStoryPalette(theme: Theme): StoryPalette | null {
  const { shell, appearance } = theme;
  if (
    (appearance !== 'light' && appearance !== 'dark') ||
    ![
      shell.background,
      shell.surface,
      shell.foreground,
      shell.muted,
      shell.border,
      shell.accent,
      shell.accentForeground,
      shell.focus
    ].every((value) => hex.test(value))
  )
    return null;

  return {
    'color-scheme': appearance,
    '--story-background': shell.background,
    '--story-surface': shell.surface,
    '--story-text': readable(shell.foreground, shell.background),
    '--story-muted': readable(shell.muted, shell.background),
    '--story-link': readable(shell.accent, shell.background),
    '--story-border': shell.border,
    '--story-accent': shell.accent,
    '--story-on-accent': readable(shell.accentForeground, shell.accent),
    '--story-focus': readable(shell.focus, shell.background, 3),
    '--story-font-body': appearance === 'dark' ? 'system-ui, sans-serif' : 'Georgia, serif',
    '--story-font-ui': 'system-ui, sans-serif',
    '--story-text-size': '1.0625rem',
    '--story-line-height': '1.62',
    '--story-content-width': '42rem'
  };
}
