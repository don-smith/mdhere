import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import DocumentTree from './DocumentTree.svelte';

const tree = [
  {
    kind: 'folder' as const,
    name: 'Guides',
    path: 'guides',
    children: [{ kind: 'document' as const, name: 'Welcome.md', path: 'guides/Welcome.md' }]
  }
];

describe('DocumentTree', () => {
  it('uses ARIA tree semantics, roving focus, and expandable folders', async () => {
    const onSelect = vi.fn();
    render(DocumentTree, { tree, onSelect });

    const folder = screen.getByRole('treeitem', { name: /Guides/ });
    expect(screen.getByRole('tree', { name: 'Documents' })).toBeInTheDocument();
    expect(folder).toHaveAttribute('aria-expanded', 'true');
    expect(folder).toHaveAttribute('tabindex', '0');

    await fireEvent.keyDown(folder, { key: 'ArrowLeft' });
    expect(folder).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('treeitem', { name: 'Welcome.md' })).not.toBeInTheDocument();

    await fireEvent.keyDown(folder, { key: 'ArrowRight' });
    expect(folder).toHaveAttribute('aria-expanded', 'true');
    await fireEvent.keyDown(folder, { key: 'ArrowDown' });
    const document = screen.getByRole('treeitem', { name: 'Welcome.md' });
    expect(document).toHaveFocus();
    await fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('guides/Welcome.md');
  });

  it('retains the navigation cursor when a visible document remains selected', async () => {
    const twoFolders = [
      {
        kind: 'folder' as const,
        name: 'First',
        path: 'first',
        children: [{ kind: 'document' as const, name: 'One.md', path: 'first/One.md' }]
      },
      {
        kind: 'folder' as const,
        name: 'Second',
        path: 'second',
        children: [{ kind: 'document' as const, name: 'Two.md', path: 'second/Two.md' }]
      }
    ];
    render(DocumentTree, { tree: twoFolders, selectedPath: 'second/Two.md', onSelect: vi.fn() });

    const first = screen.getByRole('treeitem', { name: /First/ });
    await fireEvent.click(first);
    await fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(screen.getByRole('treeitem', { name: /Second/ })).toHaveFocus();
  });
});
