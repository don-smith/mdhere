<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { validateStoryMessage } from '../story/navigation';

  let { path, fragment, onNavigate }: { path: string; fragment?: string; onNavigate: Function } =
    $props();
  let source = $state<string>();
  let frame = $state<HTMLIFrameElement>();

  function applyFragment() {
    if (fragment)
      frame?.contentWindow?.postMessage({ type: 'mdhere:story-fragment', fragment }, '*');
  }

  $effect(() => {
    const currentPath = path;
    const handleMessage = (event: MessageEvent) => {
      const destination = validateStoryMessage(
        event.source,
        frame?.contentWindow ?? null,
        event.data,
        currentPath
      );
      if (destination) onNavigate(destination);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });

  $effect(() => {
    let current = true;
    source = undefined;
    if (import.meta.env.MODE === 'test') {
      if (path === 'guides/Story.html' || path === 'guides/Next.html')
        source = `/tests/fixtures/library/${path}`;
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
  <iframe
    bind:this={frame}
    data-testid="story-frame"
    title="HTML story"
    sandbox="allow-scripts"
    src={source}
    onload={applyFragment}
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
