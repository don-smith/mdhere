<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  import type { Document } from '../contracts';
  import type { KeyboardCommand } from '../keyboard/types';
  import baseReaderCss from '../markdown/base-reader.css?inline';
  import { MarkdownRenderer } from '../markdown/renderer';

  interface Props {
    document?: Document;
    fragment?: string;
    onDocumentLink?: Function;
    onExternalLink?: Function;
    themeCss?: string;
    themeAppearance?: 'light' | 'dark';
  }

  let {
    document,
    fragment,
    onDocumentLink,
    onExternalLink,
    themeCss = '',
    themeAppearance = 'light'
  }: Props = $props();
  let host: HTMLDivElement;
  let shadow: ShadowRoot | undefined;
  let renderer: MarkdownRenderer | undefined;
  let themeSheet: CSSStyleSheet | undefined;
  let themeStyle: HTMLStyleElement | undefined;
  const scrollPositions = new SvelteMap<string, number>();

  onMount(() => {
    shadow = host.attachShadow({ mode: 'open' });
    void installStyles(shadow);
    const content = window.document.createElement('div');
    content.dataset.readerContent = 'true';
    shadow.append(content);
    shadow.addEventListener('click', onClick);
    shadow.addEventListener('error', onAssetError, true);
    void loadRenderer();
    return () => {
      shadow?.removeEventListener('click', onClick);
      shadow?.removeEventListener('error', onAssetError, true);
    };
  });

  $effect(() => {
    document;
    fragment;
    void renderDocument();
  });

  $effect(() => {
    themeCss;
    void applyTheme();
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
    host.scrollTop = scrollPositions.get(document.path) ?? 0;
    if (fragment) {
      const target = shadow.querySelector<HTMLElement>(`[id="${CSS.escape(fragment)}"]`);
      target?.focus();
    }
  }

  export function focus() {
    host?.focus();
  }

  export function run(command: KeyboardCommand) {
    if (command.kind !== 'scroll-reader') return;
    const distance = Math.max(64, host.clientHeight * 0.45);
    const movement = {
      'line-up': -48,
      'line-down': 48,
      'page-up': -distance,
      'page-down': distance,
      top: -host.scrollTop,
      bottom: host.scrollHeight
    }[command.intent];
    host.scrollBy({ top: movement, behavior: 'smooth' });
  }

  function rememberScroll() {
    if (document) scrollPositions.set(document.path, host.scrollTop);
  }

  async function installStyles(root: ShadowRoot) {
    if ('adoptedStyleSheets' in root && 'replace' in CSSStyleSheet.prototype) {
      const baseSheet = new CSSStyleSheet();
      themeSheet = new CSSStyleSheet();
      await Promise.all([baseSheet.replace(baseReaderCss), themeSheet.replace(themeCss)]);
      root.adoptedStyleSheets = [baseSheet, themeSheet];
      return;
    }
    const style = window.document.createElement('style');
    style.textContent = baseReaderCss;
    root.append(style);
    themeStyle = window.document.createElement('style');
    themeStyle.dataset.mdhereTheme = 'true';
    themeStyle.textContent = themeCss;
    root.append(themeStyle);
  }

  async function applyTheme() {
    if (themeSheet) await themeSheet.replace(themeCss);
    if (themeStyle) themeStyle.textContent = themeCss;
  }

  function onAssetError(event: Event) {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;

    const alternative = image.alt || 'Image';
    const placeholder = window.document.createElement('span');
    placeholder.className = 'mdhere-image-unavailable';
    placeholder.dataset.mdhereImageUnavailable = 'true';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', `Image unavailable: ${alternative}`);
    placeholder.textContent = `Image unavailable: ${alternative}`;
    image.replaceWith(placeholder);
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

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={host}
  class="reader-pane"
  role="region"
  data-testid="reader"
  aria-label="Reader content"
  aria-live="polite"
  data-theme-appearance={themeAppearance}
  tabindex="0"
  onscroll={rememberScroll}
></div>
