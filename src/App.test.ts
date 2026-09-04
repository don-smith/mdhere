import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LibraryClient } from './lib/library-client';
import { presentationFixture } from './lib/presentation/presentation-fixture';
import type { PresentationApi } from './lib/presentation/presentation-store';
import type { PresentationSnapshot } from './lib/themes/types';
import App from './App.svelte';

describe('App', () => {
  afterEach(cleanup);

  it('shows a loading state while the library snapshot is requested', () => {
    render(App);

    expect(screen.getByText('Loading library…')).toBeInTheDocument();
  });

  it('offers a clear folder choice after a no-root window picker is cancelled', async () => {
    const client: LibraryClient = {
      snapshot: () => Promise.reject({ kind: 'notRegistered', message: 'No root selected' }),
      readDocument: () => Promise.reject(new Error('not used')),
      refresh: () => Promise.reject(new Error('not used')),
      openFolder: () => Promise.resolve(undefined),
      newWindow: () => Promise.resolve(),
      openExternalLink: () => Promise.resolve()
    };
    render(App, { client });

    const heading = await screen.findByRole('heading', { name: 'Choose a folder' });
    const choice = heading.closest('section');
    expect(choice?.querySelector('button')).toHaveTextContent('Open Folder');
  });

  it('applies every shell token and color scheme from the presentation fixture', async () => {
    const client: LibraryClient = {
      snapshot: () =>
        Promise.resolve({
          rootName: 'Library',
          diagnostics: [],
          tree: [{ kind: 'document', name: 'Guide.md', path: 'Guide.md' }]
        }),
      readDocument: () => Promise.resolve({ path: 'Guide.md', title: 'Guide', content: '# Guide' }),
      refresh: () => Promise.reject(new Error('not used')),
      openFolder: () => Promise.resolve(undefined),
      newWindow: () => Promise.resolve(),
      openExternalLink: () => Promise.resolve()
    };
    const { container } = render(App, { client });
    const shellProperties = {
      background: '--shell-background',
      panel: '--shell-panel',
      surface: '--shell-surface',
      raisedSurface: '--shell-raised-surface',
      foreground: '--shell-foreground',
      foregroundStrong: '--shell-foreground-strong',
      muted: '--shell-muted',
      faint: '--shell-faint',
      border: '--shell-border',
      borderStrong: '--shell-border-strong',
      accent: '--shell-accent',
      accentForeground: '--shell-accent-foreground',
      accentSoft: '--shell-accent-soft',
      hover: '--shell-hover',
      selected: '--shell-selected',
      focus: '--shell-focus',
      danger: '--shell-danger',
      warning: '--shell-warning',
      overlay: '--shell-overlay'
    } as const;
    const main = container.querySelector('main');
    if (!main) throw new Error('Expected the application root');

    await waitFor(() => {
      for (const [token, property] of Object.entries(shellProperties)) {
        expect(main.style.getPropertyValue(property)).toBe(
          presentationFixture.selected.shell[token as keyof typeof shellProperties]
        );
      }
      expect(main.style.colorScheme).toBe('light');
    });

    await fireEvent.click(await screen.findByRole('treeitem', { name: 'Guide.md' }));
    const reader = container.querySelector<HTMLElement>('[data-testid="reader"]');
    expect(reader?.style.colorScheme).toBe('light');

    const chooser = container.querySelector<HTMLSelectElement>('[aria-label="Theme"]');
    if (!chooser) throw new Error('Expected the theme chooser');
    await fireEvent.change(chooser, { target: { value: 'mdhere-dark' } });
    await waitFor(() => {
      expect(main.style.colorScheme).toBe('dark');
      expect(reader?.style.colorScheme).toBe('dark');
    });
  });

  it('persists only user disclosure toggles and reapplies later presentation snapshots', async () => {
    let changed: ((snapshot: PresentationSnapshot) => void) | undefined;
    const initial = structuredClone(presentationFixture);
    const expanded = {
      ...structuredClone(presentationFixture),
      revision: 1,
      frontMatterExpanded: true
    };
    const setFrontMatterExpanded = vi.fn().mockResolvedValue(expanded);
    const presentationApi: PresentationApi = {
      snapshot: vi.fn().mockResolvedValue(initial),
      select: vi.fn(),
      reload: vi.fn(),
      setFrontMatterExpanded,
      openFolder: vi.fn(),
      onChanged: vi.fn().mockImplementation(async (handler) => {
        changed = handler;
        return () => undefined;
      })
    };
    const client: LibraryClient = {
      snapshot: () =>
        Promise.resolve({
          rootName: 'Library',
          diagnostics: [],
          tree: [{ kind: 'document', name: 'Guide.md', path: 'Guide.md' }]
        }),
      readDocument: () =>
        Promise.resolve({
          path: 'Guide.md',
          title: 'Guide',
          content: '---\ntitle: Guide\n---\n# Guide'
        }),
      refresh: () => Promise.reject(new Error('not used')),
      openFolder: () => Promise.resolve(undefined),
      newWindow: () => Promise.resolve(),
      openExternalLink: () => Promise.resolve()
    };
    const { container } = render(App, { client, presentationApi });
    await fireEvent.click(await screen.findByRole('treeitem', { name: 'Guide.md' }));
    const reader = container.querySelector<HTMLElement>('[data-testid="reader"]');
    await waitFor(() =>
      expect(reader?.shadowRoot?.querySelector('details.front-matter')).not.toBeNull()
    );
    const details = reader?.shadowRoot?.querySelector<HTMLDetailsElement>('details.front-matter');
    const summary = details?.querySelector('summary');
    if (!details || !summary) throw new Error('Expected a front matter disclosure');

    expect(details.open).toBe(false);
    await fireEvent.click(summary);
    await waitFor(() => expect(setFrontMatterExpanded).toHaveBeenCalledOnce());
    expect(setFrontMatterExpanded).toHaveBeenCalledWith(true);
    expect(presentationApi.select).not.toHaveBeenCalled();
    expect(presentationApi.reload).not.toHaveBeenCalled();

    changed?.({ ...expanded, revision: 2, frontMatterExpanded: false });
    await waitFor(() => {
      const current = reader?.shadowRoot?.querySelector<HTMLDetailsElement>('details.front-matter');
      expect(current?.open).toBe(false);
    });
  });

  it('filters the in-memory snapshot without calling the library client', async () => {
    const snapshot = vi.fn().mockResolvedValue({
      rootName: 'Library',
      diagnostics: [],
      tree: [
        {
          kind: 'folder' as const,
          name: 'Guides',
          path: 'guides',
          children: [{ kind: 'document' as const, name: 'Welcome.md', path: 'guides/Welcome.md' }]
        }
      ]
    });
    const readDocument = vi.fn();
    const refresh = vi.fn();
    const client: LibraryClient = {
      snapshot,
      readDocument,
      refresh,
      openFolder: vi.fn(),
      newWindow: vi.fn(),
      openExternalLink: vi.fn()
    };
    render(App, { client });

    const filter = await screen.findByRole('searchbox', { name: 'Filter documents' });
    await fireEvent.change(filter, { target: { value: 'welcome' } });

    expect(screen.getByRole('treeitem', { name: 'Welcome.md' })).toBeInTheDocument();
    expect(snapshot).toHaveBeenCalledOnce();
    expect(readDocument).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('opens a native window with Command-N', async () => {
    const newWindow = vi.fn().mockResolvedValue(undefined);
    const client: LibraryClient = {
      snapshot: () =>
        Promise.resolve({
          rootName: 'Library',
          diagnostics: [],
          tree: [{ kind: 'document', name: 'Guide.md', path: 'Guide.md' }]
        }),
      readDocument: () => Promise.reject(new Error('not used')),
      refresh: () => Promise.reject(new Error('not used')),
      openFolder: () => Promise.resolve(undefined),
      newWindow,
      openExternalLink: () => Promise.resolve()
    };
    render(App, { client });
    await screen.findByRole('treeitem', { name: 'Guide.md' });

    await fireEvent.keyDown(window, { key: 'n', metaKey: true });

    await waitFor(() => expect(newWindow).toHaveBeenCalledOnce());
  });
});
