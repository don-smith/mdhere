<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { isStoryFocusTreeMessage, validateStoryMessage } from '../story/navigation';
  import type { StoryPositionHandler } from '../navigation/coordinator';
  import { deriveStoryPalette } from '../story/palette';
  import type { Theme } from '../themes/types';
  import semanticCss from '../story/semantic.css?raw';

  let {
    path,
    fragment,
    scroll = 0,
    theme,
    onNavigate,
    onFocusTree,
    onPosition
  }: {
    path: string;
    fragment?: string;
    scroll?: number;
    theme?: Theme;
    onNavigate: Function;
    onFocusTree?: () => void;
    onPosition?: StoryPositionHandler;
  } = $props();
  let source = $state<string>();
  let frame = $state<HTMLIFrameElement>();
  let loaded = $state(false);

  function applyPalette() {
    const palette = theme && deriveStoryPalette(theme);
    if (palette)
      frame?.contentWindow?.postMessage(
        { type: 'mdhere:story-palette', palette, css: semanticCss },
        '*'
      );
  }

  $effect(() => {
    theme;
    applyPalette();
  });

  function applyPosition() {
    frame?.contentWindow?.postMessage(
      { type: 'mdhere:story-position', fragment: fragment ?? null, scroll },
      '*'
    );
  }

  $effect(() => {
    if (loaded) applyPosition();
  });

  function frameLoaded() {
    applyPalette();
    loaded = true;
  }

  $effect(() => {
    const currentPath = path;
    const handleMessage = (event: MessageEvent) => {
      if (isStoryFocusTreeMessage(event.source, frame?.contentWindow ?? null, event.data)) {
        onFocusTree?.();
        return;
      }
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
      if (
        path === 'guides/Story.html' ||
        path === 'guides/Next.html' ||
        path === 'guides/page%.html'
      )
        source = `/tests/fixtures/library/${path.split('/').map(encodeURIComponent).join('/')}`;
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
    onload={frameLoaded}
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
    background: var(--shell-background, white);
  }
</style>
