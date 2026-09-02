import { invoke } from '@tauri-apps/api/core';

import type { Document, LibrarySnapshot } from './contracts';
import type { LibraryClient } from './library-client';

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

  openExternalLink(url: string): Promise<void> {
    return invoke('open_external_link', { url });
  }
}
