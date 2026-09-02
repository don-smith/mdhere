import type { Document, LibrarySnapshot } from './contracts';

export interface LibraryClient {
  snapshot(): Promise<LibrarySnapshot>;
  readDocument(path: string): Promise<Document>;
  refresh(): Promise<LibrarySnapshot>;
}
