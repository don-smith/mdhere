export type Pane = 'tree' | 'reader';

export type KeyboardCommand =
  | { kind: 'move-tree'; delta: number }
  | { kind: 'move-tree-edge'; edge: 'first' | 'last' }
  | { kind: 'collapse-folder' }
  | { kind: 'expand-folder' }
  | { kind: 'open-selected' }
  | { kind: 'focus-pane'; pane: Pane }
  | {
      kind: 'scroll-reader';
      intent: 'line-up' | 'line-down' | 'page-up' | 'page-down' | 'top' | 'bottom';
    }
  | { kind: 'focus-tree' }
  | { kind: 'toggle-help' };

export interface KeyboardState {
  pane: Pane;
  pending?: 'g';
}
