export type FrontMatterScalar = string | number | boolean | null;

export type FrontMatterValue =
  | { kind: 'scalar'; value: FrontMatterScalar }
  | { kind: 'sequence'; items: FrontMatterValue[] }
  | { kind: 'mapping'; entries: FrontMatterEntry[] };

export interface FrontMatterEntry {
  key: string;
  value: FrontMatterValue;
}

export type FrontMatter =
  | { kind: 'metadata'; entries: FrontMatterEntry[]; tagChips: FrontMatterScalar[] }
  | { kind: 'warning'; source: string; omittedCharacters?: number };

export interface RenderedDocument {
  html: string;
  diagnostics: string[];
  frontMatter?: FrontMatter;
}

export interface ReaderNavigation {
  path: string;
  fragment?: string;
}
