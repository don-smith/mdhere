<script lang="ts">
  import type { Theme } from '../themes/types';

  interface Props {
    themes: Theme[];
    selectedId: string;
    onSelect: Function;
    onReload: () => void;
    onOpenFolder: () => void;
  }

  let { themes, selectedId, onSelect, onReload, onOpenFolder }: Props = $props();
</script>

<label class="theme-chooser">
  <span>Theme</span>
  <select
    aria-label="Theme"
    value={selectedId}
    onchange={(event) => onSelect(event.currentTarget.value)}
  >
    {#each themes as theme (theme.id)}
      <option value={theme.id}>{theme.name}</option>
    {/each}
  </select>
</label>
<button onclick={onReload}>Reload Themes</button>
<button onclick={onOpenFolder}>Open Themes Folder</button>
