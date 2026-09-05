import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { PresentationSnapshot } from '../themes/types';

export interface PresentationApi {
  snapshot(): Promise<PresentationSnapshot>;
  select(themeId: string): Promise<PresentationSnapshot>;
  reload(): Promise<PresentationSnapshot>;
  setFrontMatterExpanded(expanded: boolean): Promise<PresentationSnapshot>;
  setSidebarWidth(width: number): Promise<PresentationSnapshot>;
  setZoom(zoom: number): Promise<PresentationSnapshot>;
  openFolder(): Promise<void>;
  onChanged(handler: (snapshot: PresentationSnapshot) => void): Promise<() => void>;
}

export const tauriPresentationApi: PresentationApi = {
  snapshot: () => invoke('presentation_snapshot'),
  select: (themeId) => invoke('select_theme', { themeId }),
  reload: () => invoke('reload_themes'),
  setFrontMatterExpanded: (expanded) => invoke('set_front_matter_expanded', { expanded }),
  setSidebarWidth: (width) => invoke('set_sidebar_width', { width }),
  setZoom: (zoom) => invoke('set_zoom', { zoom }),
  openFolder: () => invoke('open_themes_folder'),
  onChanged: async (handler) =>
    listen<PresentationSnapshot>('presentation-changed', (event) => handler(event.payload))
};

export class PresentationStore {
  snapshot: PresentationSnapshot | undefined;
  error: string | undefined;
  private revision = -1;
  private unlisten: (() => void) | undefined;

  constructor(
    private readonly api: PresentationApi = tauriPresentationApi,
    private readonly onSnapshot: (snapshot: PresentationSnapshot) => void = () => undefined
  ) {}

  async load(): Promise<void> {
    try {
      this.unlisten ??= await this.api.onChanged((snapshot) => this.apply(snapshot));
      this.apply(await this.api.snapshot());
      this.error = undefined;
    } catch (reason) {
      this.error = messageFor(reason);
    }
  }

  async select(themeId: string): Promise<void> {
    await this.mutate(() => this.api.select(themeId));
  }

  async reload(): Promise<void> {
    await this.mutate(() => this.api.reload());
  }

  async setFrontMatterExpanded(expanded: boolean): Promise<void> {
    await this.mutate(() => this.api.setFrontMatterExpanded(expanded));
  }

  async setSidebarWidth(width: number): Promise<void> {
    await this.mutate(() => this.api.setSidebarWidth(width));
  }

  async setZoom(zoom: number): Promise<void> {
    await this.mutate(() => this.api.setZoom(zoom));
  }

  openFolder(): Promise<void> {
    return this.api.openFolder();
  }

  dispose(): void {
    this.unlisten?.();
    this.unlisten = undefined;
  }

  private async mutate(mutation: () => Promise<PresentationSnapshot>): Promise<void> {
    try {
      this.apply(await mutation());
      this.error = undefined;
    } catch (reason) {
      this.error = messageFor(reason);
    }
  }

  private apply(snapshot: PresentationSnapshot): void {
    if (snapshot.revision <= this.revision) return;
    this.revision = snapshot.revision;
    this.snapshot = snapshot;
    this.onSnapshot(snapshot);
  }
}

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Presentation could not be updated.';
}
