import type { Document, LibrarySnapshot } from './contracts';

export interface LibraryClient {
  snapshot(): Promise<LibrarySnapshot>;
  readDocument(path: string): Promise<Document>;
  refresh(): Promise<LibrarySnapshot>;
  openFolder(): Promise<LibrarySnapshot | undefined>;
  openExternalLink(url: string): Promise<void>;
}
