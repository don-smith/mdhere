import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { Theme, ThemeSnapshot } from './types';

export interface ThemeApi {
  catalog(): Promise<ThemeSnapshot>;
  select(themeId: string): Promise<Theme>;
  reload(): Promise<ThemeSnapshot>;
  openFolder(): Promise<void>;
  onChanged(handler: (theme: Theme) => void): Promise<() => void>;
}

export const tauriThemeApi: ThemeApi = {
  catalog: () => invoke('theme_catalog'),
  select: (themeId) => invoke('select_theme', { themeId }),
  reload: () => invoke('reload_themes'),
  openFolder: () => invoke('open_themes_folder'),
  onChanged: async (handler) => listen<Theme>('theme-changed', (event) => handler(event.payload))
};

export class ThemeStore {
  snapshot: ThemeSnapshot | undefined;
  error: string | undefined;
  private unlisten: (() => void) | undefined;

  constructor(
    private readonly api: ThemeApi = tauriThemeApi,
    private readonly onSnapshot: (snapshot: ThemeSnapshot) => void = () => undefined
  ) {}

  async load(): Promise<void> {
    try {
      this.snapshot = await this.api.catalog();
      this.onSnapshot(this.snapshot);
      this.error = undefined;
      this.unlisten ??= await this.api.onChanged((theme) => this.apply(theme));
    } catch (reason) {
      this.error = messageFor(reason);
    }
  }

  async select(themeId: string): Promise<void> {
    try {
      this.apply(await this.api.select(themeId));
      this.error = undefined;
    } catch (reason) {
      this.error = messageFor(reason);
    }
  }

  async reload(): Promise<void> {
    try {
      this.snapshot = await this.api.reload();
      this.onSnapshot(this.snapshot);
      this.error = undefined;
    } catch (reason) {
      this.error = messageFor(reason);
    }
  }

  openFolder(): Promise<void> {
    return this.api.openFolder();
  }

  dispose(): void {
    this.unlisten?.();
    this.unlisten = undefined;
  }

  private apply(theme: Theme): void {
    if (!this.snapshot) return;
    this.snapshot = { ...this.snapshot, selected: theme };
    this.onSnapshot(this.snapshot);
  }
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Themes could not be updated.';
}
