<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  let { path }: { path: string } = $props();
  let source = $state<string>();

  $effect(() => {
    let current = true;
    source = undefined;
    if (import.meta.env.MODE === 'test') {
      if (path === 'guides/Story.html') source = '/tests/fixtures/library/guides/Story.html';
    } else {
      void invoke<string>('authorize_story', { path })
        .then((url) => {
          if (current) source = url;
        })
        .catch(() => {
          if (current) source = undefined;
        });
    }
    return () => {
      current = false;
      source = undefined;
    };
  });
</script>

{#if source}
  <iframe data-testid="story-frame" title="HTML story" sandbox="allow-scripts" src={source}
  ></iframe>
{:else}
  <div class="html-placeholder" role="status">Loading HTML story…</div>
{/if}

<style>
  iframe {
    width: 100%;
    height: 100%;
    flex: 1;
    min-width: 0;
    border: 0;
    background: white;
  }
</style>
