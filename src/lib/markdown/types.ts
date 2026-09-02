export interface RenderedDocument {
  html: string;
  diagnostics: string[];
}

export interface ReaderNavigation {
  path: string;
  fragment?: string;
}
