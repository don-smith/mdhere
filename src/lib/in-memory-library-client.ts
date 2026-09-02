import type { Document, LibraryError, LibrarySnapshot } from './contracts';
import type { LibraryClient } from './library-client';

export class InMemoryLibraryClient implements LibraryClient {
  constructor(
    private readonly librarySnapshot: LibrarySnapshot,
    private readonly documents: Record<string, Document>
  ) {}

  async snapshot(): Promise<LibrarySnapshot> {
    return this.librarySnapshot;
  }

  async readDocument(path: string): Promise<Document> {
    const document = this.documents[path];
    if (document) return document;

    return Promise.reject<never>({
      kind: 'io',
      message: `Document not found: ${path}`
    } satisfies LibraryError);
  }

  async refresh(): Promise<LibrarySnapshot> {
    return this.librarySnapshot;
  }

  async openFolder(): Promise<LibrarySnapshot> {
    return this.librarySnapshot;
  }

  async openExternalLink(): Promise<void> {
    // Browser tests deliberately do not launch external applications.
  }
}
