<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { validateStoryMessage } from '../story/navigation';
  import type { StoryPositionHandler } from '../navigation/coordinator';

  let {
    path,
    fragment,
    scroll = 0,
    onNavigate,
    onPosition
  }: {
    path: string;
    fragment?: string;
    scroll?: number;
    onNavigate: Function;
    onPosition?: StoryPositionHandler;
  } = $props();
  let source = $state<string>();
  let frame = $state<HTMLIFrameElement>();

  function applyPosition() {
    frame?.contentWindow?.postMessage(
      { type: 'mdhere:story-position', fragment: fragment ?? null, scroll },
      '*'
    );
  }

  $effect(() => {
    const currentPath = path;
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source === frame?.contentWindow &&
        event.data &&
        typeof event.data === 'object' &&
        !Array.isArray(event.data) &&
        Object.keys(event.data).sort().join(',') === 'fragment,scroll,type' &&
        event.data.type === 'mdhere:story-position' &&
        (event.data.fragment === null ||
          (typeof event.data.fragment === 'string' &&
            ![...event.data.fragment].some((character: string) => {
              const code = character.charCodeAt(0);
              return code < 32 || code === 127;
            }))) &&
        typeof event.data.scroll === 'number' &&
        Number.isFinite(event.data.scroll) &&
        event.data.scroll >= 0
      ) {
        onPosition?.(event.data.scroll, event.data.fragment ?? undefined);
        return;
      }
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
    onload={applyPosition}
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
