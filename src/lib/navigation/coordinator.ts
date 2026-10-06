import type { Document } from '../contracts';

export type MarkdownPositionHandler = (scroll: number) => void;
export type StoryPositionHandler = (scroll: number, fragment?: string) => void;

export interface ViewingEntry {
  document: Document;
  path: string;
  fragment?: string;
  scroll: number;
}

export class NavigationCoordinator {
  private entries: ViewingEntry[] = [];
  private index = -1;
  private operation = 0;
  error: unknown;

  constructor(private readonly limit = 50) {}

  get current(): ViewingEntry | null {
    return this.entries[this.index] ?? null;
  }

  get canBack(): boolean {
    return this.index > 0;
  }

  reset(document?: Document): void {
    ++this.operation;
    this.entries = document ? [{ document, path: document.path, scroll: 0 }] : [];
    this.index = this.entries.length - 1;
    this.error = undefined;
  }

  position(scroll: number): void {
    if (!this.current || !Number.isFinite(scroll)) return;
    this.entries[this.index] = { ...this.current, scroll: Math.max(0, scroll) };
  }

  anchor(fragment: string | undefined, scroll: number): void {
    this.position(scroll);
    if (this.current) this.entries[this.index] = { ...this.current, fragment };
  }

  async select(
    path: string,
    read: () => Promise<Document>,
    fragment?: string,
    expectedKind?: Document['kind']
  ): Promise<'committed' | 'unchanged' | 'failed' | 'stale'> {
    const operation = ++this.operation;
    this.error = undefined;
    if (
      this.current?.path === path &&
      (!expectedKind || expectedKind === this.current.document.kind)
    ) {
      if (fragment !== undefined) this.anchor(fragment, this.current.scroll);
      else this.anchor(undefined, this.current.scroll);
      return 'unchanged';
    }
    try {
      const document = await read();
      if (operation !== this.operation) return 'stale';
      if (document.path !== path || (expectedKind && document.kind !== expectedKind)) {
        this.error = Error('The linked document is not available as requested.');
        return 'failed';
      }
      this.entries = [
        ...this.entries.slice(0, this.index + 1),
        { document, path, fragment, scroll: 0 }
      ].slice(-this.limit - 1);
      this.index = this.entries.length - 1;
      return 'committed';
    } catch (error) {
      if (operation !== this.operation) return 'stale';
      this.error = error;
      return 'failed';
    }
  }

  back(): ViewingEntry | null {
    ++this.operation;
    this.error = undefined;
    if (!this.canBack) return null;
    return this.entries[--this.index] ?? null;
  }

  async refresh(read: () => Promise<Document>): Promise<boolean> {
    const path = this.current?.path;
    if (!path) return false;
    const operation = this.operation;
    try {
      const document = await read();
      if (
        operation !== this.operation ||
        this.current?.path !== path ||
        document.path !== path ||
        document.kind !== this.current.document.kind
      )
        return false;
      this.entries[this.index] = { ...this.current, document };
      return true;
    } catch {
      return false;
    }
  }
}
