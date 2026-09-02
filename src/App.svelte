<script lang="ts">
  import { onMount } from 'svelte';

  import type { Document, LibrarySnapshot, TreeNode } from './lib/contracts';
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
        children: [{ kind: 'document', name: 'Welcome.md', path: 'guides/Welcome.md' }]
      }
    ]
  };
  const demoDocuments: Record<string, Document> = {
    'guides/Welcome.md': {
      path: 'guides/Welcome.md',
      title: 'Welcome',
      content: '# Welcome\n\nSelect a Markdown document to read it here.'
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
  let loading = $state(true);

  onMount(() => {
    void loadSnapshot();
  });

  async function loadSnapshot() {
    loading = true;
    error = undefined;
    try {
      snapshot = await client.snapshot();
    } catch (reason) {
      error = messageFor(reason);
    } finally {
      loading = false;
    }
  }

  async function selectDocument(path: string) {
    error = undefined;
    try {
      selectedDocument = await client.readDocument(path);
    } catch (reason) {
      error = messageFor(reason);
    }
  }

  function messageFor(reason: unknown): string {
    if (reason instanceof Error) return reason.message;
    if (typeof reason === 'object' && reason && 'message' in reason) return String(reason.message);
    return 'MD Here could not complete that request.';
  }

  function flattenedDocuments(nodes: TreeNode[]): TreeNode[] {
    return nodes.flatMap((node) =>
      node.kind === 'folder' ? [node, ...flattenedDocuments(node.children)] : [node]
    );
  }
</script>

<svelte:head><title>MD Here</title></svelte:head>

<main>
  <header aria-label="MD Here header">
    <strong>MD Here</strong>
    {#if snapshot}<span class="root">{snapshot.rootName}</span>{/if}
    <button onclick={loadSnapshot} disabled={loading}>Refresh</button>
  </header>

  {#if loading}
    <p class="status">Loading library…</p>
  {:else if error}
    <section class="status error" role="alert">
      <h1>Unable to open the library</h1>
      <p>{error}</p>
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
        <ul>
          {#each flattenedDocuments(snapshot.tree) as node (node.path)}
            {#if node.kind === 'folder'}
              <li class="folder">{node.name}</li>
            {:else}
              <li>
                <button
                  class:selected={selectedDocument?.path === node.path}
                  onclick={() => selectDocument(node.path)}>{node.name}</button
                >
              </li>
            {/if}
          {/each}
        </ul>
      </nav>
      <article aria-live="polite">
        {#if selectedDocument}
          <h1>{selectedDocument.title}</h1>
          <pre>{selectedDocument.content}</pre>
        {:else}
          <p class="status">Select a document from the tree.</p>
        {/if}
      </article>
    </div>
  {/if}
</main>
