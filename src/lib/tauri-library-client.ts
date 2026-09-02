import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { Document, LibrarySnapshot } from './contracts';
import type { LibraryClient } from './library-client';

interface FolderPickResult {
  snapshot: LibrarySnapshot | null;
  error: string | null;
}

export class TauriLibraryClient implements LibraryClient {
  snapshot(): Promise<LibrarySnapshot> {
    return invoke('library_snapshot');
  }

  readDocument(path: string): Promise<Document> {
    return invoke('read_document', { path });
  }

  refresh(): Promise<LibrarySnapshot> {
    return invoke('refresh_library');
  }

  async openFolder(): Promise<LibrarySnapshot | undefined> {
    let resolvePick: (result: FolderPickResult) => void;
    const picked = new Promise<FolderPickResult>((resolve) => {
      resolvePick = resolve;
    });
    const unlisten = await listen<FolderPickResult>('folder-picked', (event) => {
      resolvePick(event.payload);
    });

    try {
      await invoke('open_folder');
      const result = await picked;
      if (result.error) throw new Error(result.error);
      return result.snapshot ?? undefined;
    } finally {
      unlisten();
    }
  }

  newWindow(): Promise<void> {
    return invoke('new_window');
  }

  openExternalLink(url: string): Promise<void> {
    return invoke('open_external_link', { url });
  }
}
