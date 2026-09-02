import type { TreeNode } from '../contracts';

export interface VisibleTreeItem {
  node: TreeNode;
  level: number;
  parentPath?: string;
}

export function visibleItems(
  nodes: TreeNode[],
  expanded: ReadonlySet<string>,
  level = 1,
  parentPath?: string
): VisibleTreeItem[] {
  return nodes.flatMap((node) => {
    const item: VisibleTreeItem = { node, level, parentPath };
    if (node.kind !== 'folder' || !expanded.has(node.path)) return [item];
    return [item, ...visibleItems(node.children, expanded, level + 1, node.path)];
  });
}

export function initialExpandedPaths(nodes: TreeNode[]): Set<string> {
  return new Set(
    nodes.flatMap((node) =>
      node.kind === 'folder' ? [node.path, ...initialExpandedPaths(node.children)] : []
    )
  );
}
