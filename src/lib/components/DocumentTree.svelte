<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';

  import type { TreeNode } from '../contracts';
  import type { KeyboardCommand } from '../keyboard/types';
  import { initialExpandedPaths, visibleItems } from '../tree/visible-items';

  interface Props {
    tree: TreeNode[];
    selectedPath?: string;
    onSelect: Function;
  }

  let { tree, selectedPath, onSelect }: Props = $props();
  // The Set reference is deliberately replaced to make expand/collapse a single state transition.
  // eslint-disable-next-line svelte/no-unnecessary-state-wrap
  let expanded = $state<Set<string>>(new SvelteSet());
  let cursorPath = $state<string | undefined>();
  let treeElement: HTMLDivElement;
  let initialized = false;
  let items = $derived(visibleItems(tree, expanded));

  $effect(() => {
    if (!initialized) {
      initialized = true;
      const initialExpansion = initialExpandedPaths(tree);
      expanded = initialExpansion;
      cursorPath = selectedPath ?? visibleItems(tree, initialExpansion)[0]?.node.path;
    }
  });

  $effect(() => {
    if (selectedPath && items.some((item) => item.node.path === selectedPath))
      cursorPath = selectedPath;
  });

  function toggle(path: string) {
    const next = new SvelteSet(expanded);
    next.has(path) ? next.delete(path) : next.add(path);
    expanded = next;
  }

  function move(delta: number) {
    if (!items.length) return;
    const current = Math.max(
      0,
      items.findIndex((item) => item.node.path === cursorPath)
    );
    cursorPath = items[Math.min(items.length - 1, Math.max(0, current + delta))]?.node.path;
    focusCursor();
  }

  function focusCursor() {
    queueMicrotask(() =>
      treeElement
        ?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(cursorPath ?? '')}"]`)
        ?.focus()
    );
  }

  function activateCurrent() {
    const item = items.find((entry) => entry.node.path === cursorPath);
    if (!item) return;
    if (item.node.kind === 'folder') toggle(item.node.path);
    else onSelect(item.node.path);
  }

  export function focus() {
    focusCursor();
  }

  export function run(command: KeyboardCommand) {
    if (command.kind === 'move-tree') move(command.delta);
    else if (command.kind === 'move-tree-edge') {
      cursorPath = command.edge === 'first' ? items[0]?.node.path : items.at(-1)?.node.path;
      focusCursor();
    } else if (command.kind === 'collapse-folder') collapseCurrent();
    else if (command.kind === 'expand-folder') expandCurrent();
    else if (command.kind === 'open-selected') activateCurrent();
  }

  function collapseCurrent() {
    const current = items.find((item) => item.node.path === cursorPath);
    if (!current) return;
    if (current.node.kind === 'folder' && expanded.has(current.node.path)) {
      toggle(current.node.path);
    } else if (current.parentPath) {
      const parent = items.find((item) => item.node.path === current.parentPath);
      cursorPath = current.parentPath;
      if (parent?.node.kind === 'folder' && expanded.has(parent.node.path))
        toggle(parent.node.path);
      focusCursor();
    }
  }

  function expandCurrent() {
    const current = items.find((item) => item.node.path === cursorPath);
    if (!current) return;
    if (current.node.kind === 'folder') {
      if (!expanded.has(current.node.path)) toggle(current.node.path);
      else move(1);
    } else {
      onSelect(current.node.path);
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = items.find((entry) => entry.node.path === cursorPath);
    if (!current) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      cursorPath = items[0]?.node.path;
      focusCursor();
    } else if (event.key === 'End') {
      event.preventDefault();
      cursorPath = items.at(-1)?.node.path;
      focusCursor();
    } else if (event.key === 'ArrowRight' && current.node.kind === 'folder') {
      event.preventDefault();
      if (!expanded.has(current.node.path)) toggle(current.node.path);
      else move(1);
    } else if (event.key === 'ArrowLeft' && current.node.kind === 'folder') {
      event.preventDefault();
      if (expanded.has(current.node.path)) toggle(current.node.path);
      else if (current.parentPath) {
        cursorPath = current.parentPath;
        focusCursor();
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateCurrent();
    }
  }
</script>

<div
  bind:this={treeElement}
  class="document-tree"
  role="tree"
  aria-label="Documents"
  tabindex="0"
  onkeydown={onKeydown}
>
  {#each items as item (item.node.path)}
    <button
      type="button"
      role="treeitem"
      class:selected={selectedPath === item.node.path}
      class:current={cursorPath === item.node.path}
      class:folder={item.node.kind === 'folder'}
      aria-level={item.level}
      aria-selected={selectedPath === item.node.path}
      aria-expanded={item.node.kind === 'folder' ? expanded.has(item.node.path) : undefined}
      tabindex={cursorPath === item.node.path ? 0 : -1}
      data-tree-path={item.node.path}
      style:padding-left={`${0.45 + (item.level - 1) * 1.15}rem`}
      onclick={() => {
        cursorPath = item.node.path;
        item.node.kind === 'folder' ? toggle(item.node.path) : onSelect(item.node.path);
      }}
    >
      {#if item.node.kind === 'folder'}<span aria-hidden="true"
          >{expanded.has(item.node.path) ? '▾' : '▸'}</span
        >{/if}
      {item.node.name}
    </button>
  {/each}
</div>
