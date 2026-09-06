import type { Document, LibrarySnapshot } from './contracts';

export interface LaunchUpdate {
  snapshot: LibrarySnapshot;
  document: Document | null;
}

export type Unlisten = () => void;

export interface LibraryClient {
  snapshot(): Promise<LibrarySnapshot>;
  readDocument(path: string): Promise<Document>;
  refresh(): Promise<LibrarySnapshot>;
  openFolder(): Promise<LibrarySnapshot | undefined>;
  consumeLaunchUpdate?(): Promise<LaunchUpdate | undefined>;
  onLaunchUpdate?(handler: (update: LaunchUpdate) => void): Promise<Unlisten>;
  openExternalLink(url: string): Promise<void>;
}
