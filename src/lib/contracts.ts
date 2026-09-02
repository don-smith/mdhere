export type TreeNode = FolderNode | DocumentNode;

export interface FolderNode {
  kind: 'folder';
  name: string;
  path: string;
  children: TreeNode[];
}

export interface DocumentNode {
  kind: 'document';
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

export interface Document {
  path: string;
  title: string;
  content: string;
}

export type LibraryErrorKind =
  | 'rootMissing'
  | 'invalidRoot'
  | 'notRegistered'
  | 'outsideRoot'
  | 'notMarkdown'
  | 'invalidUtf8'
  | 'documentTooLarge'
  | 'snapshotLimit'
  | 'io';

export interface LibraryError {
  kind: LibraryErrorKind;
  message: string;
}
