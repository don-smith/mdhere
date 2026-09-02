import { expect, it, vi } from 'vitest';

import { ThemeStore, type ThemeApi } from './theme-store';
import type { Theme } from './types';

const light: Theme = {
  schemaVersion: 1,
  id: 'mdhere-light',
  name: 'Mdhere Light',
  appearance: 'light',
  shell: {
    background: '#ffffff',
    foreground: '#172033',
    muted: '#5a6475',
    border: '#d9dfea',
    accent: '#195bbd'
  },
  css: ':host { color: black; }',
  builtin: true
};
const dark: Theme = {
  ...light,
  id: 'mdhere-dark',
  appearance: 'dark',
  css: ':host { color: white; }'
};

it('maps catalog data and global theme changes into the current selection', async () => {
  let changed: ((theme: Theme) => void) | undefined;
  const api: ThemeApi = {
    catalog: vi
      .fn()
      .mockResolvedValue({ themes: [light, dark], selected: light, diagnostics: ['bad package'] }),
    select: vi.fn().mockResolvedValue(dark),
    reload: vi.fn(),
    openFolder: vi.fn(),
    onChanged: vi.fn(async (handler) => {
      changed = handler;
      return () => undefined;
    })
  };
  const store = new ThemeStore(api);

  await store.load();
  expect(store.snapshot?.selected.id).toBe('mdhere-light');
  expect(store.snapshot?.diagnostics).toEqual(['bad package']);
  changed?.(dark);
  expect(store.snapshot?.selected.id).toBe('mdhere-dark');
});
