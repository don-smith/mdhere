<script lang="ts">
  import { onMount } from 'svelte';

  import type { Document, LibrarySnapshot, TreeNode } from './lib/contracts';
  import DocumentTree from './lib/components/DocumentTree.svelte';
  import KeyboardHelp from './lib/components/KeyboardHelp.svelte';
  import ReaderPane from './lib/components/ReaderPane.svelte';
  import ThemeChooser from './lib/components/ThemeChooser.svelte';
  import ThemeNotice from './lib/components/ThemeNotice.svelte';
  import { PresentationStore, tauriPresentationApi } from './lib/presentation/presentation-store';
  import { createFixturePresentationApi } from './lib/presentation/presentation-fixture';
  import type { PresentationSnapshot } from './lib/themes/types';
  import { KeyboardController } from './lib/keyboard/controller';
  import type { Pane } from './lib/keyboard/types';
  import { InMemoryLibraryClient } from './lib/in-memory-library-client';
  import type { LibraryClient } from './lib/library-client';
  import { TauriLibraryClient } from './lib/tauri-library-client';

  interface Props {
    client?: LibraryClient;
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
        "# Welcome\n\n~~Rendered safely~~. [Read next](Second.md#second-section) [Web](https://example.com) ![remote](https://example.com/image.png)\n\n```typescript\nconst theme = 'dark';\n```\n\n<scr" +
        'ipt>alert(1)</scr' +
        'ipt>'
    },
    'guides/Second.md': {
      path: 'guides/Second.md',
      title: 'Second',
      content: '# Second section\n\nThis document was selected by a confined local link.'
    }
  };

  let {
    client = import.meta.env.MODE === 'test'
      ? new InMemoryLibraryClient(demoSnapshot, demoDocuments)
      : new TauriLibraryClient()
  }: Props = $props();
  let snapshot = $state<LibrarySnapshot | undefined>();
  let selectedDocument = $state<Document | undefined>();
  let error = $state<string | undefined>();
  let needsFolder = $state(false);
  let fragment = $state<string | undefined>();
  let loading = $state(true);
  let presentation = $state<PresentationSnapshot | undefined>();
  const presentationStore = new PresentationStore(
    import.meta.env.MODE === 'test' ? createFixturePresentationApi() : tauriPresentationApi,
    (value) => (presentation = value)
  );
  interface KeyboardTarget {
    focus(): void;
    run: Function;
  }

  let activePane = $state<Pane>('tree');
  let helpOpen = $state(false);
  const keyboard = new KeyboardController();
  let documentTree = $state<KeyboardTarget>();
  let readerPane = $state<KeyboardTarget>();

  onMount(() => {
    void loadSnapshot();
    void presentationStore.load();
    return () => presentationStore.dispose();
  });

  async function loadSnapshot() {
    loading = true;
    error = undefined;
    try {
      snapshot = await client.snapshot();
      needsFolder = false;
    } catch (reason) {
      needsFolder = isUnregisteredLibrary(reason);
      error = messageFor(reason);
    } finally {
      loading = false;
    }
  }

  async function refreshLibrary() {
    loading = true;
    error = undefined;
    try {
      snapshot = await client.refresh();
      if (selectedDocument) {
        try {
          selectedDocument = await client.readDocument(selectedDocument.path);
        } catch {
          selectedDocument = undefined;
        }
      }
    } catch (reason) {
      error = messageFor(reason);
    } finally {
      loading = false;
    }
  }

  async function openFolder() {
    error = undefined;
    try {
      const nextSnapshot = await client.openFolder();
      if (nextSnapshot) {
        snapshot = nextSnapshot;
        selectedDocument = undefined;
        fragment = undefined;
        needsFolder = false;
      }
    } catch (reason) {
      error = messageFor(reason);
    }
  }

  async function selectDocument(path: string, nextFragment?: string) {
    error = undefined;
    fragment = nextFragment;
    try {
      selectedDocument = await client.readDocument(path);
    } catch (reason) {
      error = messageFor(reason);
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
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    const treeTarget = target?.closest('[role="treeitem"], [role="tree"]');
    const readerTarget = event
      .composedPath()
      .some((entry) => entry instanceof HTMLElement && entry.dataset.testid === 'reader');
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
    await presentationStore.select(themeId);
  }

  async function reloadThemes() {
    await presentationStore.reload();
  }

  async function openThemesFolder() {
    await presentationStore.openFolder();
  }

  function flattenedDocuments(nodes: TreeNode[]): TreeNode[] {
    return nodes.flatMap((node) =>
      node.kind === 'folder' ? [node, ...flattenedDocuments(node.children)] : [node]
    );
  }
</script>

<svelte:head><title>mdhere</title></svelte:head>
<svelte:window onkeydown={handleKeydown} />

<main
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
  <header aria-label="mdhere header">
    <strong>mdhere</strong>
    {#if snapshot}<span class="root">{snapshot.rootName}</span>{/if}
    {#if presentation}
      <ThemeChooser
        themes={presentation.themes}
        selectedId={presentation.selected.id}
        onSelect={selectTheme}
        onReload={reloadThemes}
        onOpenFolder={openThemesFolder}
      />
    {/if}
    <button onclick={openFolder}>Open Folder</button>
    <button onclick={refreshLibrary} disabled={loading}>Refresh</button>
  </header>
  {#if presentation}<ThemeNotice diagnostics={presentation.diagnostics} />{/if}

  {#if loading}
    <p class="status">Loading library…</p>
  {:else if needsFolder}
    <section class="status">
      <h1>Choose a folder</h1>
      <p>Select a folder containing Markdown documents to start reading.</p>
      <button onclick={openFolder}>Open Folder</button>
    </section>
  {:else if error}
    <section class="status error" role="alert">
      <h1>Unable to open the library</h1>
      <p>{error}</p>
      <button onclick={openFolder}>Open Folder</button>
      <button onclick={loadSnapshot}>Try again</button>
    </section>
  {:else if snapshot && flattenedDocuments(snapshot.tree).length === 0}
    <section class="status">
      <h1>No Markdown documents found</h1>
      <p>Choose another folder or add a .md file.</p>
    </section>
  {:else if snapshot}
    <div class="workspace">
      <nav aria-label="Documents">
        <DocumentTree
          bind:this={documentTree}
          tree={snapshot.tree}
          selectedPath={selectedDocument?.path}
          onSelect={selectDocument}
        />
      </nav>
      <article aria-label="Reader">
        <ReaderPane
          bind:this={readerPane}
          document={selectedDocument}
          {fragment}
          onDocumentLink={selectDocument}
          onExternalLink={(url: string) => client.openExternalLink(url)}
          themeCss={presentation?.selected.css}
          themeAppearance={presentation?.selected.appearance}
        />
      </article>
      <KeyboardHelp open={helpOpen} onClose={() => (helpOpen = false)} />
    </div>
  {/if}
</main>
