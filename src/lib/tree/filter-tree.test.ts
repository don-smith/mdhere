import { describe, expect, it } from 'vitest';

import type { TreeNode } from '../contracts';
import { filterTree } from './filter-tree';

const tree: TreeNode[] = [
  {
    kind: 'folder',
    name: 'Guides',
    path: 'guides',
    children: [
      { kind: 'document', name: 'Welcome.md', path: 'guides/Welcome.md' },
      {
        kind: 'folder',
        name: 'Advanced',
        path: 'guides/advanced',
        children: [{ kind: 'document', name: 'Deep Dive.md', path: 'guides/advanced/Deep Dive.md' }]
      }
    ]
  },
  {
    kind: 'folder',
    name: 'Reference',
    path: 'reference',
    children: [{ kind: 'document', name: 'API.md', path: 'reference/API.md' }]
  }
];

describe('filterTree', () => {
  it('matches document names and paths without changing case', () => {
    expect(filterTree(tree, 'welcome')).toEqual([
      {
        kind: 'folder',
        name: 'Guides',
        path: 'guides',
        children: [{ kind: 'document', name: 'Welcome.md', path: 'guides/Welcome.md' }]
      }
    ]);
    expect(filterTree(tree, 'ADVANCED/deep')).toEqual([
      {
        kind: 'folder',
        name: 'Guides',
        path: 'guides',
        children: [
          {
            kind: 'folder',
            name: 'Advanced',
            path: 'guides/advanced',
            children: [
              { kind: 'document', name: 'Deep Dive.md', path: 'guides/advanced/Deep Dive.md' }
            ]
          }
        ]
      }
    ]);
  });

  it('keeps matching document ancestors in source order', () => {
    const filtered = filterTree(tree, '.md');

    expect(filtered.map((node) => node.path)).toEqual(['guides', 'reference']);
    expect(filtered[0]).toMatchObject({
      children: [
        { path: 'guides/Welcome.md' },
        { path: 'guides/advanced', children: [{ path: 'guides/advanced/Deep Dive.md' }] }
      ]
    });
  });

  it('does not reveal a folder solely because its name matches', () => {
    const namedFolderOnly: TreeNode[] = [
      {
        kind: 'folder',
        name: 'Guides',
        path: 'collection',
        children: [{ kind: 'document', name: 'Welcome.md', path: 'collection/Welcome.md' }]
      }
    ];

    expect(filterTree(namedFolderOnly, 'guides')).toEqual([]);
  });

  it('returns the original tree for an empty query and an empty tree for no matches', () => {
    expect(filterTree(tree, '')).toBe(tree);
    expect(filterTree(tree, 'missing')).toEqual([]);
  });
});
