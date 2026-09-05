import { describe, expect, it } from 'vitest';

import { KeyboardController } from './controller';
import type { KeyboardState } from './types';

const controller = new KeyboardController();

function transition(pane: KeyboardState['pane'], key: string) {
  return controller.transition({ pane }, key).command;
}

describe('KeyboardController', () => {
  it.each([
    ['tree', 'j', { kind: 'move-tree', delta: 1 }],
    ['tree', 'k', { kind: 'move-tree', delta: -1 }],
    ['tree', 'h', { kind: 'collapse-folder' }],
    ['tree', 'l', { kind: 'expand-folder' }],
    ['tree', 'Enter', { kind: 'open-selected' }],
    ['reader', 'j', { kind: 'scroll-reader', intent: 'line-down' }],
    ['reader', 'k', { kind: 'scroll-reader', intent: 'line-up' }],
    ['reader', 'd', { kind: 'scroll-reader', intent: 'page-down' }],
    ['reader', 'u', { kind: 'scroll-reader', intent: 'page-up' }],
    ['tree', 'J', { kind: 'scroll-reader', intent: 'line-down' }],
    ['tree', 'K', { kind: 'scroll-reader', intent: 'line-up' }],
    ['reader', 'J', { kind: 'scroll-reader', intent: 'line-down' }],
    ['reader', 'K', { kind: 'scroll-reader', intent: 'line-up' }],
    ['reader', 'h', undefined],
    ['reader', 'l', undefined]
  ] as const)('%s %s maps to the settled command', (pane, key, command) => {
    expect(transition(pane, key)).toEqual(command);
  });

  it('uses a second g for the top action and cancels incomplete chords', () => {
    const first = controller.transition({ pane: 'tree' }, 'g');
    expect(first.command).toBeUndefined();
    expect(controller.transition(first.state, 'g').command).toEqual({
      kind: 'move-tree-edge',
      edge: 'first'
    });

    const readerFirst = controller.transition({ pane: 'reader' }, 'g');
    expect(controller.transition(readerFirst.state, 'g').command).toEqual({
      kind: 'scroll-reader',
      intent: 'top'
    });
    expect(controller.transition(first.state, 'x').state.pending).toBeUndefined();
  });

  it('switches pane, opens help, and returns the reader to the tree', () => {
    expect(transition('tree', 'Tab')).toEqual({ kind: 'focus-pane', pane: 'reader' });
    expect(transition('tree', '?')).toEqual({ kind: 'toggle-help' });
    expect(transition('reader', 'Escape')).toEqual({ kind: 'focus-tree' });
    expect(transition('reader', 'G')).toEqual({ kind: 'scroll-reader', intent: 'bottom' });
  });
});
