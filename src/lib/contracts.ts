export type TreeNode = FolderNode | DocumentNode;

export interface FolderNode {
  kind: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}

export interface DocumentNode {
  kind: 'document';
  documentKind: 'markdown' | 'html';
  name: string;
  path: string;
}

export interface Diagnostic {
  message: string;
}

export interface LibrarySnapshot {
  rootName: string;
  tree: TreeNode[];
  diagnostics: Diagnostic[];
}

export type MarkdownDocument = { kind: 'markdown'; path: string; title: string; content: string };
export type HtmlDocument = { kind: 'html'; path: string; title: string };
export type Document = MarkdownDocument | HtmlDocument;

export type LibraryErrorKind =
  | 'rootMissing'
  | 'invalidRoot'
  | 'notRegistered'
  | 'outsideRoot'
  | 'notDocument'
  | 'invalidUtf8'
  | 'documentTooLarge'
  | 'snapshotLimit'
  | 'io';

export interface LibraryError {
  kind: LibraryErrorKind;
  message: string;
}
