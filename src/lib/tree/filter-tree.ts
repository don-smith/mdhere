import type { TreeNode } from '../contracts';

/**
 * Filters the current in-memory library tree without changing the source tree.
 * A retained folder exists only to preserve the context for a matching document.
 */
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return nodes;

  return nodes.flatMap<TreeNode>((node) => {
    if (node.kind === 'document') {
      return matches(node, needle) ? [node] : [];
    }

    const children = filterTree(node.children, needle);
    return children.length ? [{ ...node, children }] : [];
  });
}

function matches(node: Extract<TreeNode, { kind: 'document' }>, needle: string): boolean {
  return (
    node.name.toLocaleLowerCase().includes(needle) || node.path.toLocaleLowerCase().includes(needle)
  );
}
