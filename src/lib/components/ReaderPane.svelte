<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  import type { Document } from '../contracts';
  import type { KeyboardCommand } from '../keyboard/types';
  import baseReaderCss from '../markdown/base-reader.css?inline';
  import { MarkdownRenderer } from '../markdown/renderer';
  import type {
    FrontMatter,
    FrontMatterEntry,
    FrontMatterScalar,
    FrontMatterValue
  } from '../markdown/types';

  interface Props {
    document?: Document;
    fragment?: string;
    onDocumentLink?: Function;
    onExternalLink?: Function;
    frontMatterExpanded?: boolean;
    onFrontMatterToggle?: Function;
    themeCss?: string;
    themeAppearance?: 'light' | 'dark';
  }

  let {
    document,
    fragment,
    onDocumentLink,
    onExternalLink,
    frontMatterExpanded = false,
    onFrontMatterToggle,
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
    void untrack(renderDocument);
  });

  $effect(() => {
    frontMatterExpanded;
    applyDisclosureState();
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
    if (!host || !shadow || !renderer) return;
    const content = shadow.querySelector<HTMLElement>('[data-reader-content]');
    if (!content) return;
    if (!document) {
      const empty = window.document.createElement('p');
      empty.className = 'reader-content reader-empty';
      empty.textContent = 'Select a document from the tree.';
      content.replaceChildren(empty);
      return;
    }

    const rendered = renderer.render(document.content, document.path);
    const article = window.document.createElement('article');
    article.className = 'reader-content';
    // Sanitized Markdown is the sole HTML string admitted to the reader DOM.
    article.innerHTML = rendered.html;
    content.replaceChildren(
      ...(rendered.frontMatter ? [frontMatterElement(rendered.frontMatter), article] : [article])
    );

    host.scrollTop = scrollPositions.get(document.path) ?? 0;
    if (fragment) {
      const target = shadow.querySelector<HTMLElement>(`[id="${CSS.escape(fragment)}"]`);
      target?.focus();
    }
  }

  function frontMatterElement(frontMatter: FrontMatter): HTMLDetailsElement {
    const details = window.document.createElement('details');
    details.className = 'front-matter';
    details.dataset.expectedOpen = String(frontMatterExpanded);
    details.open = frontMatterExpanded;

    const summary = window.document.createElement('summary');
    summary.className = 'front-matter-summary';
    summary.textContent =
      frontMatter.kind === 'metadata' ? 'Document details' : 'Front matter warning';
    details.append(summary);

    if (frontMatter.kind === 'metadata') {
      if (frontMatter.tagChips.length > 0) details.append(tagChipsElement(frontMatter.tagChips));
      details.append(fieldsElement(frontMatter.entries, 'front-matter-fields'));
    } else {
      details.append(warningElement(frontMatter.source, frontMatter.omittedCharacters));
    }

    summary.addEventListener('keydown', (event) => {
      if (!isDisclosureKey(event) || event.repeat) return;
      event.preventDefault();
      window.setTimeout(() => {
        details.open = !details.open;
      });
    });
    summary.addEventListener('keypress', (event) => {
      if (isDisclosureKey(event)) event.preventDefault();
    });
    summary.addEventListener('keyup', (event) => {
      if (isDisclosureKey(event)) event.preventDefault();
    });
    details.addEventListener('toggle', () => {
      if (details.open === (details.dataset.expectedOpen === 'true')) return;
      details.dataset.expectedOpen = String(details.open);
      onFrontMatterToggle?.(details.open);
    });
    return details;
  }

  function applyDisclosureState() {
    const details = shadow?.querySelector<HTMLDetailsElement>('details.front-matter');
    if (!details) return;
    details.dataset.expectedOpen = String(frontMatterExpanded);
    details.open = frontMatterExpanded;
  }

  function tagChipsElement(chips: FrontMatterScalar[]): HTMLDivElement {
    const tags = window.document.createElement('div');
    tags.className = 'front-matter-tags';
    tags.setAttribute('aria-label', 'Tags');
    for (const chip of chips) {
      const tag = window.document.createElement('span');
      tag.className = 'front-matter-tag';
      tag.textContent = scalarText(chip);
      tags.append(tag);
    }
    return tags;
  }

  function fieldsElement(entries: FrontMatterEntry[], className: string): HTMLDListElement {
    const fields = window.document.createElement('dl');
    fields.className = className;
    for (const entry of entries) {
      const field = window.document.createElement('div');
      field.className = 'front-matter-field';
      const key = window.document.createElement('dt');
      key.className = 'front-matter-key';
      key.textContent = entry.key;
      const value = window.document.createElement('dd');
      value.className = 'front-matter-value';
      value.append(valueElement(entry.value));
      field.append(key, value);
      fields.append(field);
    }
    return fields;
  }

  function valueElement(value: FrontMatterValue): HTMLElement {
    if (value.kind === 'scalar') {
      const scalar = window.document.createElement('span');
      scalar.textContent = scalarText(value.value);
      return scalar;
    }
    if (value.kind === 'sequence') {
      const list = window.document.createElement('ul');
      list.className = 'front-matter-list';
      for (const item of value.items) {
        const listItem = window.document.createElement('li');
        listItem.append(valueElement(item));
        list.append(listItem);
      }
      return list;
    }
    return fieldsElement(value.entries, 'front-matter-map');
  }

  function warningElement(source: string, omittedCharacters?: number): HTMLDivElement {
    const warning = window.document.createElement('div');
    warning.className = 'front-matter-warning';
    warning.setAttribute('role', 'alert');
    const message = window.document.createElement('p');
    message.textContent = 'This document has invalid or unsupported front matter.';
    const code = window.document.createElement('pre');
    code.textContent = source;
    warning.append(message, code);
    if (omittedCharacters) {
      const omitted = window.document.createElement('p');
      omitted.textContent = `${omittedCharacters} characters omitted.`;
      warning.append(omitted);
    }
    return warning;
  }

  function isDisclosureKey(event: KeyboardEvent): boolean {
    return event.key === 'Enter' || event.key === ' ' || event.code === 'Space';
  }

  function scalarText(value: FrontMatterScalar): string {
    return value === null ? 'null' : String(value);
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
  data-theme-appearance={themeAppearance}
  style:color-scheme={themeAppearance}
  tabindex="0"
  onscroll={rememberScroll}
></div>
