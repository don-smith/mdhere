import { describe, expect, it } from 'vitest';
import { presentationFixture } from '../presentation/presentation-fixture';
import { contrastRatio, deriveStoryPalette, storyPaletteKeys } from './palette';

const [paper, midnight, fieldNotes] = presentationFixture.themes;

describe('story palette', () => {
  it.each([paper!, midnight!, fieldNotes!])(
    'derives legible story colors from $name shell',
    (theme) => {
      const palette = deriveStoryPalette(theme)!;
      expect(Object.keys(palette).filter((key) => key.startsWith('--story-'))).toEqual(
        storyPaletteKeys
      );
      expect(palette['--story-background']).toBe(theme.shell.background);
      expect(palette['--story-surface']).toBe(theme.shell.surface);
      expect(palette['color-scheme']).toBe(theme.appearance);
      for (const token of ['--story-text', '--story-muted', '--story-link'] as const)
        expect(contrastRatio(palette[token], palette['--story-background'])).toBeGreaterThanOrEqual(
          4.5
        );
      expect(
        contrastRatio(palette['--story-on-accent'], palette['--story-accent'])
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette['--story-focus'], palette['--story-background'])
      ).toBeGreaterThanOrEqual(3);
    }
  );

  it('uses readable neutral text when valid custom shell colors are low contrast', () => {
    const theme = structuredClone(paper!);
    theme.shell.foreground = '#dddddd';
    theme.shell.accent = '#cccccc';
    theme.shell.accentForeground = '#ffffff';
    const palette = deriveStoryPalette(theme)!;
    expect(palette['--story-text']).toBe('#000000');
    expect(palette['--story-link']).toBe('#000000');
    expect(palette['--story-on-accent']).toBe('#000000');
  });

  it('rejects non-color input before it reaches the story frame', () => {
    const theme = structuredClone(paper!);
    theme.shell.accent = 'red; background: url(https://example.org)';
    expect(deriveStoryPalette(theme)).toBeNull();
  });
});
