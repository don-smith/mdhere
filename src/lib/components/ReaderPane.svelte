<script lang="ts">
  import { onMount } from 'svelte';

  import type { Document } from '../contracts';
  import baseReaderCss from '../markdown/base-reader.css?inline';
  import { MarkdownRenderer } from '../markdown/renderer';

  interface Props {
    document?: Document;
    fragment?: string;
    onDocumentLink?: Function;
    onExternalLink?: Function;
  }

  let { document, fragment, onDocumentLink, onExternalLink }: Props = $props();
  let host: HTMLDivElement;
  let shadow: ShadowRoot | undefined;
  let renderer: MarkdownRenderer | undefined;

  onMount(() => {
    shadow = host.attachShadow({ mode: 'open' });
    installStyles(shadow);
    const content = window.document.createElement('div');
    content.dataset.readerContent = 'true';
    shadow.append(content);
    shadow.addEventListener('click', onClick);
    void loadRenderer();
    return () => shadow?.removeEventListener('click', onClick);
  });

  $effect(() => {
    document;
    fragment;
    void renderDocument();
  });

  async function loadRenderer() {
    renderer = await MarkdownRenderer.create();
    await renderDocument();
  }

  async function renderDocument() {
    if (!shadow || !renderer) return;
    const content = shadow.querySelector<HTMLElement>('[data-reader-content]');
    if (!content) return;
    if (!document) {
      content.innerHTML =
        '<p class="reader-content reader-empty">Select a document from the tree.</p>';
      return;
    }
    content.innerHTML = `<article class="reader-content">${renderer.render(document.content, document.path).html}</article>`;
    if (fragment) {
      const target = shadow.querySelector<HTMLElement>(`[id="${CSS.escape(fragment)}"]`);
      target?.focus();
    }
  }

  function installStyles(root: ShadowRoot) {
    if ('adoptedStyleSheets' in root && 'replaceSync' in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(baseReaderCss);
      root.adoptedStyleSheets = [sheet];
      return;
    }
    const style = window.document.createElement('style');
    style.textContent = baseReaderCss;
    root.append(style);
  }

  function onClick(event: Event) {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a');
    if (!link) return;
    const path = link.dataset.mdherePath;
    const external = link.dataset.mdhereExternal;
    if (!path && !external) return;
    event.preventDefault();
    if (path) onDocumentLink?.call(undefined, path, link.dataset.mdhereFragment);
    if (external) void onExternalLink?.call(undefined, external);
  }
</script>

<div bind:this={host} data-testid="reader" aria-live="polite"></div>
