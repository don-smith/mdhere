import type { KeyboardCommand, KeyboardState } from './types';

export class KeyboardController {
  transition(
    state: KeyboardState,
    key: string
  ): { state: KeyboardState; command?: KeyboardCommand } {
    if (key === '?')
      return { state: { ...state, pending: undefined }, command: { kind: 'toggle-help' } };
    if (key === 'Tab') {
      return {
        state: { pane: state.pane === 'tree' ? 'reader' : 'tree' },
        command: { kind: 'focus-pane', pane: state.pane === 'tree' ? 'reader' : 'tree' }
      };
    }
    if (key === 'Escape' && state.pane === 'reader') {
      return { state: { pane: 'tree' }, command: { kind: 'focus-tree' } };
    }
    if (key === 'g') {
      if (state.pending === 'g') {
        return this.withPaneCommand(
          state,
          { kind: 'move-tree-edge', edge: 'first' },
          { kind: 'scroll-reader', intent: 'top' }
        );
      }
      return { state: { ...state, pending: 'g' } };
    }
    if (key === 'G')
      return this.withPaneCommand(
        state,
        { kind: 'move-tree-edge', edge: 'last' },
        { kind: 'scroll-reader', intent: 'bottom' }
      );

    const commands: Record<string, [KeyboardCommand, KeyboardCommand]> = {
      j: [
        { kind: 'move-tree', delta: 1 },
        { kind: 'scroll-reader', intent: 'line-down' }
      ],
      k: [
        { kind: 'move-tree', delta: -1 },
        { kind: 'scroll-reader', intent: 'line-up' }
      ],
      d: [
        { kind: 'move-tree', delta: 8 },
        { kind: 'scroll-reader', intent: 'page-down' }
      ],
      u: [
        { kind: 'move-tree', delta: -8 },
        { kind: 'scroll-reader', intent: 'page-up' }
      ],
      h: [{ kind: 'toggle-folder' }, { kind: 'toggle-folder' }],
      l: [{ kind: 'toggle-folder' }, { kind: 'toggle-folder' }],
      Enter: [{ kind: 'open-selected' }, { kind: 'open-selected' }]
    };
    const pair = commands[key];
    if (!pair) return { state: { ...state, pending: undefined } };
    if ((key === 'h' || key === 'l') && state.pane === 'reader') {
      return { state: { ...state, pending: undefined } };
    }
    return this.withPaneCommand(state, pair[0], pair[1]);
  }

  private withPaneCommand(
    state: KeyboardState,
    treeCommand: KeyboardCommand,
    readerCommand: KeyboardCommand
  ): { state: KeyboardState; command: KeyboardCommand } {
    return {
      state: { ...state, pending: undefined },
      command: state.pane === 'tree' ? treeCommand : readerCommand
    };
  }
}
