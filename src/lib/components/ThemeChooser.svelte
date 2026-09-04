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

<div class="theme-chooser" data-state="resting">
  <label class="theme-field">
    <span>Theme</span>
    <select
      class="theme-select"
      aria-label="Theme"
      value={selectedId}
      onchange={(event) => onSelect(event.currentTarget.value)}
    >
      {#each themes as theme (theme.id)}
        <option value={theme.id}>{theme.name}</option>
      {/each}
    </select>
  </label>
  <button class="theme-action" data-state="resting" type="button" onclick={onReload}
    >Reload themes</button
  >
  <button class="theme-action" data-state="resting" type="button" onclick={onOpenFolder}
    >Themes folder</button
  >
</div>
