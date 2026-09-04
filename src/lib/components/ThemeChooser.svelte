<script lang="ts">
  import { onMount } from 'svelte';

  import type { Theme } from '../themes/types';

  interface Props {
    themes: Theme[];
    selectedId: string;
    onSelect: Function;
    onReload: () => void;
    onOpenFolder: () => void;
  }

  const listboxId = 'theme-listbox';
  let { themes, selectedId, onSelect, onReload, onOpenFolder }: Props = $props();
  let selectable = $derived(themes.length > 1);
  let selectedTheme = $derived(themes.find((theme) => theme.id === selectedId));
  let isOpen = $state(false);
  let activeId = $state('');
  let chooser = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();

  $effect(() => {
    if (!isOpen || !themes.some((theme) => theme.id === activeId)) activeId = selectedId;
  });

  function optionId(themeId: string): string {
    return `theme-option-${themeId}`;
  }

  function activeIndex(): number {
    const index = themes.findIndex((theme) => theme.id === activeId);
    return index >= 0 ? index : 0;
  }

  function openPicker(): void {
    if (!selectable) return;
    activeId = selectedId;
    isOpen = true;
  }

  function closePicker(): void {
    if (!isOpen) return;
    isOpen = false;
    trigger?.focus();
  }

  function togglePicker(): void {
    if (isOpen) closePicker();
    else openPicker();
  }

  function moveActive(offset: number): void {
    if (!isOpen) openPicker();
    if (!themes.length) return;
    activeId = themes[(activeIndex() + offset + themes.length) % themes.length]!.id;
  }

  function choose(themeId: string): void {
    onSelect(themeId);
    closePicker();
  }

  function handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      openPicker();
      activeId = themes[0]?.id ?? selectedId;
    } else if (event.key === 'End') {
      event.preventDefault();
      openPicker();
      activeId = themes.at(-1)?.id ?? selectedId;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) choose(activeId);
      else openPicker();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePicker();
    }
  }

  function handleDocumentClick(event: MouseEvent): void {
    if (isOpen && event.target instanceof Node && !chooser?.contains(event.target)) closePicker();
  }

  onMount(() => {
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  });
</script>

<div class="theme-chooser" data-state={isOpen ? 'open' : 'resting'} bind:this={chooser}>
  <div class="theme-field">
    <span>Theme</span>
    <button
      bind:this={trigger}
      class="theme-trigger"
      data-state={isOpen ? 'open' : 'resting'}
      type="button"
      aria-label={`Theme: ${selectedTheme?.name ?? 'No theme selected'}`}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-controls={listboxId}
      disabled={!selectable}
      onclick={togglePicker}
      onkeydown={handleTriggerKeydown}
    >
      {selectedTheme?.name ?? 'No theme selected'}
      <span class="theme-trigger-indicator" aria-hidden="true">⌄</span>
    </button>
    {#if isOpen}<span class="visually-hidden" aria-live="polite"
        >Active theme: {themes.find((theme) => theme.id === activeId)?.name}</span
      >{/if}
    {#if isOpen}
      <div class="theme-listbox" id={listboxId} role="listbox" aria-label="Theme options">
        {#each themes as theme (theme.id)}
          <button
            class="theme-option"
            type="button"
            role="option"
            id={optionId(theme.id)}
            tabindex="-1"
            aria-selected={theme.id === selectedId}
            data-active={theme.id === activeId}
            onclick={() => choose(theme.id)}
          >
            {theme.name}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <button class="theme-action" data-state="resting" type="button" onclick={onReload}
    >Reload themes</button
  >
  <button class="theme-action" data-state="resting" type="button" onclick={onOpenFolder}
    >Themes folder</button
  >
</div>
