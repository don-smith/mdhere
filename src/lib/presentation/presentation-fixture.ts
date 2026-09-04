import fieldNotesManifest from '../../../src-tauri/themes/field-notes/theme.json';
import fieldNotesCss from '../../../src-tauri/themes/field-notes/reader.css?raw';
import midnightManifest from '../../../src-tauri/themes/mdhere-dark/theme.json';
import midnightCss from '../../../src-tauri/themes/mdhere-dark/reader.css?raw';
import paperManifest from '../../../src-tauri/themes/mdhere-light/theme.json';
import paperCss from '../../../src-tauri/themes/mdhere-light/reader.css?raw';

import type { PresentationApi } from './presentation-store';
import type { PresentationSnapshot, Theme } from '../themes/types';

type ThemeManifest = Omit<Theme, 'css' | 'builtin'>;

function builtin(manifest: ThemeManifest, css: string): Theme {
  return { ...manifest, css, builtin: true };
}

const themes = [
  builtin(paperManifest as ThemeManifest, paperCss),
  builtin(midnightManifest as ThemeManifest, midnightCss),
  builtin(fieldNotesManifest as ThemeManifest, fieldNotesCss)
];

export const presentationFixture: PresentationSnapshot = {
  revision: 0,
  themes,
  selected: themes[0]!,
  diagnostics: [],
  frontMatterExpanded: false
};

export function createFixturePresentationApi(): PresentationApi {
  let snapshot = structuredClone(presentationFixture);
  let handler: ((next: PresentationSnapshot) => void) | undefined;

  function update(next: Omit<PresentationSnapshot, 'revision'>): PresentationSnapshot {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    handler?.(snapshot);
    return snapshot;
  }

  return {
    snapshot: async () => snapshot,
    select: async (themeId) => {
      const selected = snapshot.themes.find((theme) => theme.id === themeId);
      if (!selected) throw new Error(`Theme not found: ${themeId}`);
      return update({ ...snapshot, selected });
    },
    reload: async () => update(snapshot),
    setFrontMatterExpanded: async (frontMatterExpanded) =>
      update({ ...snapshot, frontMatterExpanded }),
    openFolder: async () => undefined,
    onChanged: async (next) => {
      handler = next;
      return () => {
        if (handler === next) handler = undefined;
      };
    }
  };
}
