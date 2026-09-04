<script lang="ts">
  import { onMount } from 'svelte';

  import type { Document, LibrarySnapshot, TreeNode } from './lib/contracts';
  import DocumentTree from './lib/components/DocumentTree.svelte';
  import KeyboardHelp from './lib/components/KeyboardHelp.svelte';
  import ReaderPane from './lib/components/ReaderPane.svelte';
  import ThemeChooser from './lib/components/ThemeChooser.svelte';
  import ThemeNotice from './lib/components/ThemeNotice.svelte';
  import {
    PresentationStore,
    tauriPresentationApi,
    type PresentationApi
  } from './lib/presentation/presentation-store';
  import {
    createFixturePresentationApi,
    presentationFixture
  } from './lib/presentation/presentation-fixture';
  import type { PresentationSnapshot } from './lib/themes/types';
  import { KeyboardController } from './lib/keyboard/controller';
  import type { Pane } from './lib/keyboard/types';
  import { InMemoryLibraryClient } from './lib/in-memory-library-client';
  import { filterTree } from './lib/tree/filter-tree';
  import type { LibraryClient } from './lib/library-client';
  import { TauriLibraryClient } from './lib/tauri-library-client';

  interface Props {
    client?: LibraryClient;
    presentationApi?: PresentationApi;
  }

  const demoSnapshot: LibrarySnapshot = {
    rootName: 'Example library',
    diagnostics: [],
    tree: [
      {
        kind: 'folder',
        name: 'guides',
        path: 'guides',
        children: [
          { kind: 'document', name: 'Welcome.md', path: 'guides/Welcome.md' },
          { kind: 'document', name: 'Second.md', path: 'guides/Second.md' }
        ]
      }
    ]
  };
  const demoDocuments: Record<string, Document> = {
    'guides/Welcome.md': {
      path: 'guides/Welcome.md',
      title: 'Welcome',
      content:
        "---\ntitle: Welcome\ntags: [reader, safe, local, ignored]\nsummary: A rendered fixture\ncontext:\n  author: mdhere\n---\n# Welcome\n\n~~Rendered safely~~. [Read next](Second.md#second-section) [Web](https://example.com) ![remote](https://example.com/image.png)\n\n## Reader coverage\n\n- [x] Themed task\n- [ ] Open task\n\n| Surface | Result |\n| --- | --- |\n| Table | Themed |\n\n```typescript\nconst theme = 'dark';\n```\n\n<scr" +
        'ipt>alert(1)</scr' +
        'ipt>'
    },
    'guides/Second.md': {
      path: 'guides/Second.md',
      title: 'Second',
      content: '# Second section\n\nThis document was selected by a confined local link.'
    }
  };
  const mermaidDocuments: Record<string, Document> = {
    ...demoDocuments,
    'guides/Welcome.md': {
      ...demoDocuments['guides/Welcome.md'],
      content:
        demoDocuments['guides/Welcome.md'].content +
        '\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```mmd\nflowchart LR\n  C --> D\n```\n\n```mermaid\n%%{init: {"theme": "dark", "themeVariables": {"lineColor": "#ff0000"}} }%%\nflowchart LR\n  E --> F\n```\n\n```mermaid\nflowchart LR; G --> H; style G fill:#ff0000\n```'
    }
  };

  function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function testScenario(): string | null {
    return new URLSearchParams(window.location.search).get('scenario');
  }

  function testThemeId(): string | null {
    return new URLSearchParams(window.location.search).get('theme');
  }

  function testLibraryClient(): LibraryClient {
    const scenario = testScenario();
    if (scenario === 'empty') {
      return new InMemoryLibraryClient({ ...demoSnapshot, tree: [] }, demoDocuments);
    }
    if (scenario === 'mermaid') {
      return new InMemoryLibraryClient(demoSnapshot, mermaidDocuments);
    }
    if (scenario === 'error') {
      return {
        snapshot: () => Promise.reject(new Error('The library could not be read.')),
        readDocument: () => Promise.reject(new Error('not used')),
        refresh: () => Promise.reject(new Error('not used')),
        openFolder: () => Promise.resolve(undefined),
        newWindow: () => Promise.resolve(),
        openExternalLink: () => Promise.resolve()
      };
    }
    if (scenario === 'long-library') {
      return new InMemoryLibraryClient(
        {
          ...demoSnapshot,
          tree: Array.from({ length: 48 }, (_, index) => ({
            kind: 'document' as const,
            name: `Chapter ${index + 1}.md`,
            path: `chapters/Chapter ${index + 1}.md`
          }))
        },
        demoDocuments
      );
    }
    const client = new InMemoryLibraryClient(demoSnapshot, demoDocuments);
    if (scenario === 'slow-loading') {
      return {
        snapshot: async () => {
          await delay(300);
          return client.snapshot();
        },
        readDocument: (path) => client.readDocument(path),
        refresh: () => client.refresh(),
        openFolder: () => client.openFolder(),
        newWindow: () => client.newWindow(),
        openExternalLink: () => client.openExternalLink()
      };
    }
    if (scenario === 'slow-refresh') {
      return {
        snapshot: () => client.snapshot(),
        readDocument: (path) => client.readDocument(path),
        refresh: async () => {
          await delay(300);
          return client.refresh();
        },
        openFolder: () => client.openFolder(),
        newWindow: () => client.newWindow(),
        openExternalLink: () => client.openExternalLink()
      };
    }
    return client;
  }

  function testPresentationApi(): PresentationApi {
    const fixture = structuredClone(presentationFixture);
    const selected = fixture.themes.find((theme) => theme.id === testThemeId());
    if (selected) fixture.selected = selected;
    if (testScenario() === 'warning') fixture.diagnostics = ['A local theme needs attention.'];
    return createFixturePresentationApi(fixture);
  }

  let {
    client = import.meta.env.MODE === 'test' ? testLibraryClient() : new TauriLibraryClient(),
    presentationApi = import.meta.env.MODE === 'test' ? testPresentationApi() : tauriPresentationApi
  }: Props = $props();
  let snapshot = $state<LibrarySnapshot | undefined>();
  let selectedDocument = $state<Document | undefined>();
  let error = $state<string | undefined>();
  let needsFolder = $state(false);
  let fragment = $state<string | undefined>();
  let loading = $state(true);
  let presentation = $state<PresentationSnapshot | undefined>();
  let presentationStore: PresentationStore | undefined;
  let sidebarCollapsed = $state(false);
  let sidebarWidth = $state(304);
  let resizingSidebar = $state(false);
  const SIDEBAR_MIN_WIDTH = 248;
  const SIDEBAR_MAX_WIDTH = 560;
  const SIDEBAR_KEYBOARD_STEP = 16;
  const COLLAPSED_SIDEBAR_WIDTH = 52;
  let deskSidebarWidth = $derived(sidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth);
  interface KeyboardTarget {
    focus(): void;
    run: Function;
  }

  let activePane = $state<Pane>('tree');
  let helpOpen = $state(false);
  const keyboard = new KeyboardController();
  let documentTree = $state<KeyboardTarget>();
  let readerPane = $state<KeyboardTarget>();
  let filterQuery = $state('');
  let filterInput = $state<HTMLInputElement>();
  let filterActive = $derived(filterQuery.trim().length > 0);
  let filteredTree = $derived(snapshot ? filterTree(snapshot.tree, filterQuery) : []);
  let selectedLineCount = $derived(
    selectedDocument ? selectedDocument.content.split(/\r?\n/).length : undefined
  );
  let libraryOperation = 0;
  let selectionOperation = 0;

  onMount(() => {
    presentationStore = new PresentationStore(presentationApi, (value) => (presentation = value));
    void loadSnapshot();
    void presentationStore.load();
    return () => presentationStore?.dispose();
  });

  async function loadSnapshot() {
    const operation = ++libraryOperation;
    loading = true;
    error = undefined;
    try {
      const nextSnapshot = await client.snapshot();
      if (operation !== libraryOperation) return;
      snapshot = nextSnapshot;
      needsFolder = false;
    } catch (reason) {
      if (operation !== libraryOperation) return;
      needsFolder = isUnregisteredLibrary(reason);
      error = messageFor(reason);
    } finally {
      if (operation === libraryOperation) loading = false;
    }
  }

  async function refreshLibrary() {
    const operation = ++libraryOperation;
    loading = true;
    error = undefined;
    try {
      const nextSnapshot = await client.refresh();
      if (operation !== libraryOperation) return;
      snapshot = nextSnapshot;
      const path = selectedDocument?.path;
      const selectedOperation = selectionOperation;
      if (path) {
        try {
          const refreshedDocument = await client.readDocument(path);
          if (operation === libraryOperation && selectedOperation === selectionOperation)
            selectedDocument = refreshedDocument;
        } catch {
          if (operation === libraryOperation && selectedOperation === selectionOperation)
            selectedDocument = undefined;
        }
      }
    } catch (reason) {
      if (operation === libraryOperation) error = messageFor(reason);
    } finally {
      if (operation === libraryOperation) loading = false;
    }
  }

  async function openFolder() {
    const operation = ++libraryOperation;
    error = undefined;
    try {
      const nextSnapshot = await client.openFolder();
      if (operation !== libraryOperation) return;
      if (nextSnapshot) {
        snapshot = nextSnapshot;
        selectedDocument = undefined;
        fragment = undefined;
        needsFolder = false;
      }
    } catch (reason) {
      if (operation === libraryOperation) error = messageFor(reason);
    }
  }

  async function selectDocument(path: string, nextFragment?: string) {
    const operation = ++selectionOperation;
    error = undefined;
    fragment = nextFragment;
    try {
      const nextDocument = await client.readDocument(path);
      if (operation === selectionOperation) selectedDocument = nextDocument;
    } catch (reason) {
      if (operation === selectionOperation) error = messageFor(reason);
    }
  }

  function messageFor(reason: unknown): string {
    if (reason instanceof Error) return reason.message;
    if (typeof reason === 'object' && reason && 'message' in reason) return String(reason.message);
    return 'mdhere could not complete that request.';
  }

  function isUnregisteredLibrary(reason: unknown): boolean {
    return (
      typeof reason === 'object' &&
      reason !== null &&
      'kind' in reason &&
      reason.kind === 'notRegistered'
    );
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.metaKey && !event.altKey && !event.ctrlKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      void client.newWindow().catch((reason) => (error = messageFor(reason)));
      return;
    }
    if (event.metaKey && !event.altKey && !event.ctrlKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      filterInput?.focus();
      filterInput?.select();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target === filterInput && event.key === 'Escape') {
      event.preventDefault();
      if (filterQuery) filterQuery = '';
      else {
        activePane = 'tree';
        documentTree?.focus();
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const treeTarget = target?.closest('[role="treeitem"], [role="tree"]');
    const eventPath = event.composedPath();
    if (eventPath.some((entry) => entry instanceof HTMLElement && entry.tagName === 'SUMMARY'))
      return;
    const readerTarget = eventPath.some(
      (entry) => entry instanceof HTMLElement && entry.dataset.testid === 'reader'
    );
    if (
      !treeTarget &&
      !readerTarget &&
      target?.closest('button, input, textarea, select, [role="dialog"]')
    )
      return;

    const pane: Pane = treeTarget ? 'tree' : readerTarget ? 'reader' : activePane;
    const result = keyboard.transition({ pane }, event.key);
    activePane = result.state.pane;
    if (!result.command) return;
    event.preventDefault();
    if (result.command.kind === 'toggle-help') {
      helpOpen = !helpOpen;
    } else if (result.command.kind === 'focus-tree') {
      documentTree?.focus();
    } else if (result.command.kind === 'focus-pane') {
      result.command.pane === 'tree' ? documentTree?.focus() : readerPane?.focus();
    } else if (result.command.kind === 'scroll-reader') {
      readerPane?.run(result.command);
    } else {
      documentTree?.run(result.command);
    }
  }

  async function selectTheme(themeId: string) {
    await presentationStore?.select(themeId);
  }

  async function reloadThemes() {
    await presentationStore?.reload();
  }

  async function openThemesFolder() {
    await presentationStore?.openFolder();
  }

  function setFrontMatterExpanded(expanded: boolean) {
    void presentationStore?.setFrontMatterExpanded(expanded);
  }

  function clampSidebarWidth(width: number): number {
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
  }

  function updateSidebarWidth(width: number, persist: boolean) {
    sidebarWidth = clampSidebarWidth(width);
    if (persist) void presentationStore?.setSidebarWidth(sidebarWidth);
  }

  function startSidebarResize(event: PointerEvent) {
    if (sidebarCollapsed) return;
    resizingSidebar = true;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId);
  }

  function resizeSidebar(event: PointerEvent) {
    if (!resizingSidebar) return;
    updateSidebarWidth(event.clientX, false);
  }

  function finishSidebarResize(event: PointerEvent) {
    if (!resizingSidebar) return;
    resizingSidebar = false;
    (event.currentTarget as HTMLElement | null)?.releasePointerCapture(event.pointerId);
    updateSidebarWidth(sidebarWidth, true);
  }

  function resizeSidebarWithKeyboard(event: KeyboardEvent) {
    const adjustment =
      event.key === 'ArrowLeft'
        ? -SIDEBAR_KEYBOARD_STEP
        : event.key === 'ArrowRight'
          ? SIDEBAR_KEYBOARD_STEP
          : 0;
    if (!adjustment) return;
    event.preventDefault();
    updateSidebarWidth(sidebarWidth + adjustment, true);
  }

  $effect(() => {
    if (presentation && !resizingSidebar) sidebarWidth = presentation.sidebarWidth;
  });

  function flattenedDocuments(nodes: TreeNode[]): TreeNode[] {
    return nodes.flatMap((node) =>
      node.kind === 'folder' ? [node, ...flattenedDocuments(node.children)] : [node]
    );
  }
</script>

<svelte:head><title>mdhere</title></svelte:head>
<svelte:window onkeydown={handleKeydown} />

<main
  class="app-shell"
  data-state={loading ? 'loading' : error ? 'error' : 'ready'}
  style:--shell-background={presentation?.selected.shell.background}
  style:--shell-panel={presentation?.selected.shell.panel}
  style:--shell-surface={presentation?.selected.shell.surface}
  style:--shell-raised-surface={presentation?.selected.shell.raisedSurface}
  style:--shell-foreground={presentation?.selected.shell.foreground}
  style:--shell-foreground-strong={presentation?.selected.shell.foregroundStrong}
  style:--shell-muted={presentation?.selected.shell.muted}
  style:--shell-faint={presentation?.selected.shell.faint}
  style:--shell-border={presentation?.selected.shell.border}
  style:--shell-border-strong={presentation?.selected.shell.borderStrong}
  style:--shell-accent={presentation?.selected.shell.accent}
  style:--shell-accent-foreground={presentation?.selected.shell.accentForeground}
  style:--shell-accent-soft={presentation?.selected.shell.accentSoft}
  style:--shell-hover={presentation?.selected.shell.hover}
  style:--shell-selected={presentation?.selected.shell.selected}
  style:--shell-focus={presentation?.selected.shell.focus}
  style:--shell-danger={presentation?.selected.shell.danger}
  style:--shell-warning={presentation?.selected.shell.warning}
  style:--shell-overlay={presentation?.selected.shell.overlay}
  style:color-scheme={presentation?.selected.appearance}
>
  {#if loading && !snapshot}
    <section class="shell-status" data-state="loading" aria-live="polite">
      <p>Loading library…</p>
    </section>
  {:else if needsFolder}
    <section class="shell-status" data-state="empty">
      <h1>Choose a folder</h1>
      <p>Select a folder containing Markdown documents to start reading.</p>
      <button class="status-action" data-state="resting" onclick={openFolder}>Open Folder</button>
    </section>
  {:else if error}
    <section class="shell-status" data-state="error" role="alert">
      <h1>Unable to open the library</h1>
      <p>{error}</p>
      <div class="status-actions">
        <button class="status-action" data-state="danger" onclick={openFolder}>Open Folder</button>
        <button class="status-action" data-state="resting" onclick={loadSnapshot}>Try again</button>
      </div>
    </section>
  {:else if snapshot && flattenedDocuments(snapshot.tree).length === 0}
    <section class="shell-status" data-state="empty">
      <h1>No Markdown documents found</h1>
      <p>Choose another folder or add a .md file.</p>
      <button class="status-action" data-state="resting" onclick={openFolder}>Open Folder</button>
    </section>
  {:else if snapshot}
    <div
      class="reading-desk"
      data-testid="reading-desk"
      data-sidebar-state={sidebarCollapsed ? 'collapsed' : 'expanded'}
      style:--sidebar-width={`${deskSidebarWidth}px`}
    >
      <aside
        class="desk-sidebar"
        aria-label="Library"
        data-state={sidebarCollapsed ? 'collapsed' : 'expanded'}
      >
        <div class="desk-brand">
          {#if !sidebarCollapsed}
            <span class="brand-mark" aria-hidden="true">m</span>
            <span class="brand-copy"><strong>mdhere</strong><small>{snapshot.rootName}</small></span
            >
          {/if}
          <button
            class="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            onclick={() => (sidebarCollapsed = !sidebarCollapsed)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path class="sidebar-toggle-pane" d="M4 5h5v14H4z" />
              <path d="M9 4v16" />
            </svg>
          </button>
        </div>
        <div
          class="sidebar-expanded-content"
          aria-hidden={sidebarCollapsed}
          inert={sidebarCollapsed}
        >
          <label class="library-search">
            <span class="visually-hidden">Filter documents</span>
            <input
              bind:this={filterInput}
              bind:value={filterQuery}
              class="library-search-input"
              type="search"
              aria-label="Filter documents"
              placeholder="Filter documents"
            />
            <kbd aria-hidden="true">⌘K</kbd>
          </label>
          <nav class="library-navigation" aria-label="Documents">
            <DocumentTree
              bind:this={documentTree}
              tree={filteredTree}
              {filterActive}
              selectedPath={selectedDocument?.path}
              onSelect={selectDocument}
            />
            {#if !filteredTree.length}<p class="filter-status" data-state="empty" role="status">
                No matching documents.
              </p>{/if}
          </nav>
          <button class="sidebar-action" data-state="resting" onclick={openFolder}
            >Open Folder</button
          >
        </div>
        {#if sidebarCollapsed}
          <button
            class="sidebar-action sidebar-action-icon"
            data-state="resting"
            type="button"
            aria-label="Open Folder"
            onclick={openFolder}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v10H3z" /></svg>
          </button>
        {/if}
      </aside>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="sidebar-resizer"
        role="separator"
        aria-label="Sidebar width"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        tabindex="0"
        onpointerdown={startSidebarResize}
        onpointermove={resizeSidebar}
        onpointerup={finishSidebarResize}
        onpointercancel={finishSidebarResize}
        onkeydown={resizeSidebarWithKeyboard}
      ></div>

      <section class="desk-main" aria-label="Reading desk">
        <header class="document-toolbar" data-testid="document-toolbar">
          <div class="document-identity">
            <p>{selectedDocument?.path ?? snapshot.rootName}</p>
            <h1>{selectedDocument?.title ?? 'Select a document'}</h1>
          </div>
          <div class="toolbar-controls">
            {#if presentation}
              <ThemeChooser
                themes={presentation.themes}
                selectedId={presentation.selected.id}
                onSelect={selectTheme}
                onReload={reloadThemes}
                onOpenFolder={openThemesFolder}
              />
            {/if}
            <button
              class="toolbar-action"
              data-state="resting"
              type="button"
              aria-label="Keyboard shortcuts"
              onclick={() => (helpOpen = true)}>?</button
            >
            <button
              class="toolbar-action"
              data-state={loading ? 'loading' : 'resting'}
              type="button"
              aria-label="Refresh library"
              onclick={refreshLibrary}
              disabled={loading}>↻</button
            >
          </div>
        </header>

        <div class="desk-reader">
          <ReaderPane
            bind:this={readerPane}
            document={selectedDocument}
            {fragment}
            onDocumentLink={selectDocument}
            onExternalLink={(url: string) => client.openExternalLink(url)}
            frontMatterExpanded={presentation?.frontMatterExpanded ?? false}
            onFrontMatterToggle={setFrontMatterExpanded}
            themeCss={presentation?.selected.css}
            theme={presentation?.selected}
            themeAppearance={presentation?.selected.appearance}
          />
        </div>

        <footer class="desk-status-strip" data-testid="status-strip">
          <span>Markdown</span>
          {#if selectedLineCount}<span>{selectedLineCount} lines</span>{/if}
          <span>UTF-8</span>
        </footer>
      </section>
    </div>
  {/if}

  {#if presentation}<ThemeNotice diagnostics={presentation.diagnostics} />{/if}
  <KeyboardHelp open={helpOpen} onClose={() => (helpOpen = false)} />
</main>
