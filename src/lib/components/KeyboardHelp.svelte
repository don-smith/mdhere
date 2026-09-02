<script lang="ts">
  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();
  const bindings = [
    ['j / k', 'Move tree selection or scroll reader'],
    ['h / l', 'Collapse or expand the selected folder'],
    ['Enter', 'Open the selected document or activate a reader link'],
    ['Tab / Shift+Tab', 'Switch between tree and reader'],
    ['gg / G', 'Jump to first/last item or reader top/bottom'],
    ['d / u', 'Page tree or half-page reader'],
    ['Esc', 'Return focus to the tree'],
    ['?', 'Show this help']
  ];
</script>

{#if open}
  <div class="keyboard-help-backdrop">
    <dialog class="keyboard-help" open aria-label="Keyboard shortcuts">
      <header>
        <h2>Keyboard shortcuts</h2>
        <button type="button" onclick={onClose}>Close</button>
      </header>
      <dl>
        {#each bindings as [keys, description] (keys)}<div>
            <dt><kbd>{keys}</kbd></dt>
            <dd>{description}</dd>
          </div>{/each}
      </dl>
    </dialog>
  </div>
{/if}
