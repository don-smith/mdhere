import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LibraryClient } from './lib/library-client';
import type { LibrarySnapshot } from './lib/contracts';
import {
  createFixturePresentationApi,
  presentationFixture
} from './lib/presentation/presentation-fixture';
import type { PresentationApi } from './lib/presentation/presentation-store';
import type { PresentationSnapshot } from './lib/themes/types';
import App from './App.svelte';

describe('App', () => {
  afterEach(cleanup);

  it('shows a loading state while the library snapshot is requested', () => {
    render(App);

    expect(screen.getByText('Loading library…')).toBeInTheDocument();
  });

  it('offers a clear folder choice until an explicit no-root folder action', async () => {
    const openFolder = vi.fn().mockResolvedValue(undefined);
    const client: LibraryClient = {
      snapshot: () => Promise.reject({ kind: 'notRegistered', message: 'No root selected' }),
      readDocument: () => Promise.reject(new Error('not used')),
      refresh: () => Promise.reject(new Error('not used')),
      openFolder,
      newWindow: () => Promise.resolve(),
      openExternalLink: () => Promise.resolve()
    };
    render(App, { client });

    const heading = await screen.findByRole('heading', { name: 'Choose a folder' });
    const choice = heading.closest('section');
    expect(choice?.querySelector('button')).toHaveTextContent('Open Folder');
    expect(openFolder).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    expect(openFolder).toHaveBeenCalledOnce();
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

    const trigger = screen.getByRole<HTMLButtonElement>('button', { name: 'Theme: Paper' });
    expect(trigger).toBeEnabled();
    expect(screen.queryByRole('listbox', { name: 'Theme options' })).not.toBeInTheDocument();

    await fireEvent.click(trigger);
    const listbox = screen.getByRole('listbox', { name: 'Theme options' });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(
      presentationFixture.themes.map((theme) => theme.name)
    );
    expect(listbox).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('option', { name: 'Field Notes' }));
    await waitFor(() => expect(main.style.colorScheme).toBe('light'));

    await fireEvent.keyDown(trigger, { key: 'Home' });
    expect(screen.getByRole('option', { name: 'Paper' })).toHaveAttribute('data-active', 'true');
    await fireEvent.keyDown(trigger, { key: 'End' });
    expect(screen.getByRole('option', { name: 'Field Notes' })).toHaveAttribute(
      'data-active',
      'true'
    );
    await fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: 'Midnight' })).toHaveAttribute('data-active', 'true');
    await fireEvent.keyDown(trigger, { key: ' ' });
    await waitFor(() => {
      expect(main.style.colorScheme).toBe('dark');
      expect(reader?.style.colorScheme).toBe('dark');
      expect(screen.queryByRole('listbox', { name: 'Theme options' })).not.toBeInTheDocument();
    });
  });

  it('disables the theme trigger when the catalog has no alternative', async () => {
    const client: LibraryClient = {
      snapshot: () =>
        Promise.resolve({
          rootName: 'Library',
          diagnostics: [],
          tree: [{ kind: 'document', name: 'Guide.md', path: 'Guide.md' }]
        }),
      readDocument: () => Promise.resolve({ path: 'Guide.md', title: 'Guide', content: '# Guide' }),
      refresh: () => Promise.resolve({ rootName: 'Library', diagnostics: [], tree: [] }),
      openFolder: () => Promise.resolve(undefined),
      newWindow: () => Promise.resolve(),
      openExternalLink: () => Promise.resolve()
    };
    const onlyTheme = structuredClone(presentationFixture.selected);
    render(App, {
      client,
      presentationApi: createFixturePresentationApi({
        ...structuredClone(presentationFixture),
        themes: [onlyTheme],
        selected: onlyTheme
      })
    });

    expect(await screen.findByRole('button', { name: `Theme: ${onlyTheme.name}` })).toBeDisabled();
  });

  it('dismisses the theme listbox with Escape and click-away, returning focus to its trigger', async () => {
    render(App);

    const trigger = await screen.findByRole<HTMLButtonElement>('button', { name: 'Theme: Paper' });
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('listbox', { name: 'Theme options' })).toBeInTheDocument();
    await fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Theme options' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await fireEvent.click(trigger);
    expect(screen.getByRole('listbox', { name: 'Theme options' })).toBeInTheDocument();
    await fireEvent.click(document.body);
    expect(screen.queryByRole('listbox', { name: 'Theme options' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
      setSidebarWidth: vi.fn(),
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

  it('uses named Reading desk controls and disables refresh while it is pending', async () => {
    let resolveRefresh: ((snapshot: LibrarySnapshot) => void) | undefined;
    const library: LibrarySnapshot = {
      rootName: 'Library',
      diagnostics: [],
      tree: [{ kind: 'document' as const, name: 'Guide.md', path: 'Guide.md' }]
    };
    const client: LibraryClient = {
      snapshot: () => Promise.resolve(library),
      readDocument: () => Promise.reject(new Error('not used')),
      refresh: () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      openFolder: () => Promise.resolve(undefined),
      newWindow: () => Promise.resolve(),
      openExternalLink: () => Promise.resolve()
    };
    const { container } = render(App, { client });

    const refresh = await screen.findByRole('button', { name: 'Refresh library' });
    expect(refresh).toHaveClass('toolbar-action');
    expect(refresh).toHaveAttribute('data-state', 'resting');
    const themeTrigger = screen.getByRole<HTMLButtonElement>('button', { name: 'Theme: Paper' });
    expect(themeTrigger).toHaveClass('theme-trigger');
    expect(themeTrigger).toBeEnabled();
    expect(container.querySelector('.desk-reader > [data-testid="reader"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="reading-frame"]')).toBeNull();
    await fireEvent.click(refresh);

    await waitFor(() => {
      expect(refresh).toBeDisabled();
      expect(refresh).toHaveAttribute('data-state', 'loading');
    });
    resolveRefresh?.(library);
    await waitFor(() => expect(refresh).toBeEnabled());
  });

  it('does not let a refresh reread overwrite a newer document selection', async () => {
    const snapshot: LibrarySnapshot = {
      rootName: 'Library',
      diagnostics: [],
      tree: [
        { kind: 'document', name: 'Guide.md', path: 'Guide.md' },
        { kind: 'document', name: 'Other.md', path: 'Other.md' }
      ]
    };
    const guide = { path: 'Guide.md', title: 'Guide', content: '# Guide' };
    const other = { path: 'Other.md', title: 'Other', content: '# Other' };
    let guideReads = 0;
    let resolveRefreshedGuide: ((document: typeof guide) => void) | undefined;
    const client: LibraryClient = {
      snapshot: () => Promise.resolve(snapshot),
      refresh: () => Promise.resolve(snapshot),
      readDocument: (path) => {
        if (path === 'Other.md') return Promise.resolve(other);
        guideReads += 1;
        return guideReads === 1
          ? Promise.resolve(guide)
          : new Promise((resolve) => {
              resolveRefreshedGuide = resolve;
            });
      },
      openFolder: () => Promise.resolve(undefined),
      newWindow: () => Promise.resolve(),
      openExternalLink: () => Promise.resolve()
    };
    render(App, { client });

    await fireEvent.click(await screen.findByRole('treeitem', { name: 'Guide.md' }));
    await waitFor(() => expect(screen.getByTestId('document-toolbar')).toHaveTextContent('Guide'));
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh library' }));
    await waitFor(() => expect(guideReads).toBe(2));
    await fireEvent.click(screen.getByRole('treeitem', { name: 'Other.md' }));
    await waitFor(() => expect(screen.getByTestId('document-toolbar')).toHaveTextContent('Other'));

    resolveRefreshedGuide?.(guide);
    await waitFor(() => expect(screen.getByTestId('document-toolbar')).toHaveTextContent('Other'));
  });

  it('collapses the sidebar without losing its expanded width and exposes an operable resize separator', async () => {
    const openFolder = vi.fn().mockResolvedValue(undefined);
    const client: LibraryClient = {
      snapshot: () =>
        Promise.resolve({
          rootName: 'Library',
          diagnostics: [],
          tree: [{ kind: 'document', name: 'Guide.md', path: 'Guide.md' }]
        }),
      readDocument: () => Promise.resolve({ path: 'Guide.md', title: 'Guide', content: '# Guide' }),
      refresh: () => Promise.reject(new Error('not used')),
      openFolder,
      newWindow: () => Promise.resolve(),
      openExternalLink: () => Promise.resolve()
    };
    const presentationApi = createFixturePresentationApi();
    const setSidebarWidth = vi.spyOn(presentationApi, 'setSidebarWidth');
    const { container } = render(App, { client, presentationApi });

    const toggle = await screen.findByRole('button', { name: 'Collapse sidebar' });
    const separator = screen.getByRole('separator', { name: 'Sidebar width' });
    expect(separator).toHaveAttribute('aria-valuenow', '304');

    await fireEvent.click(toggle);
    expect(container.querySelector('.desk-sidebar')).toHaveAttribute('data-state', 'collapsed');
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    expect(openFolder).toHaveBeenCalledOnce();

    await fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(container.querySelector('.desk-sidebar')).toHaveAttribute('data-state', 'expanded');
    expect(separator).toHaveAttribute('aria-valuenow', '304');
    await fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(setSidebarWidth).toHaveBeenCalledWith(320);
    await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '320'));
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
