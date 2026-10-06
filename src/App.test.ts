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
  it('selects mixed documents without passing HTML markup to ReaderPane', async () => {
    const snapshot: LibrarySnapshot = {
      rootName: 'Mixed library',
      diagnostics: [],
      tree: [
        { kind: 'document', documentKind: 'markdown', name: 'Guide.md', path: 'Guide.md' },
        { kind: 'document', documentKind: 'html', name: 'Story.html', path: 'Story.html' }
      ]
    };
    const client: LibraryClient = {
      snapshot: () => Promise.resolve(snapshot),
      readDocument: (path) =>
        Promise.resolve(
          path === 'Story.html'
            ? { kind: 'html', path, title: 'Story' }
            : { kind: 'markdown', path, title: 'Guide', content: '# Guide' }
        ),
      refresh: () => Promise.resolve(snapshot),
      openFolder: () => Promise.resolve(undefined),
      openExternalLink: () => Promise.resolve()
    };
    const { container } = render(App, { client });
    await fireEvent.click(await screen.findByRole('treeitem', { name: 'Guide.md' }));
    await waitFor(() =>
      expect(container.querySelector('[data-testid="reader"]')?.shadowRoot?.textContent).toContain(
        'Guide'
      )
    );
    await fireEvent.click(screen.getByRole('treeitem', { name: 'Story.html' }));
    expect(await screen.findByText('Loading HTML story…')).toBeInTheDocument();
    expect(screen.queryByTestId('reader')).not.toBeInTheDocument();
    expect(screen.getByTestId('status-strip')).toHaveTextContent('HTML');
    expect(screen.getByTestId('document-toolbar')).toHaveTextContent('Story');
  });

  it('backs through mixed selections, rejects failed reads, and clears history on a launch update', async () => {
    const library: LibrarySnapshot = {
      rootName: 'Mixed',
      diagnostics: [],
      tree: [
        { kind: 'document', documentKind: 'markdown', name: 'Guide.md', path: 'Guide.md' },
        { kind: 'document', documentKind: 'html', name: 'Story.html', path: 'guides/Story.html' }
      ]
    };
    let launch: ((update: { snapshot: LibrarySnapshot; document: null }) => void) | undefined;
    const readDocument = vi.fn((path: string) =>
      path === 'Guide.md'
        ? Promise.resolve({ kind: 'markdown' as const, path, title: 'Guide', content: '# Guide' })
        : path === 'guides/Story.html'
          ? Promise.resolve({ kind: 'html' as const, path, title: 'Story' })
          : Promise.reject(Error('Missing'))
    );
    const client: LibraryClient = {
      snapshot: () => Promise.resolve(library),
      readDocument,
      refresh: () => Promise.resolve(library),
      openFolder: () => Promise.resolve(undefined),
      openExternalLink: () => Promise.resolve(),
      onLaunchUpdate: async (handler) => {
        launch = handler;
        return () => undefined;
      }
    };
    render(App, { client });
    const back = await screen.findByRole('button', { name: 'Back' });
    expect(back).toBeDisabled();
    await fireEvent.click(screen.getByRole('treeitem', { name: 'Guide.md' }));
    await waitFor(() => expect(screen.getByTestId('reader')).toBeInTheDocument());
    expect(back).toBeDisabled();
    await fireEvent.click(screen.getByRole('treeitem', { name: 'Story.html' }));
    const frame = await screen.findByTestId<HTMLIFrameElement>('story-frame');
    expect(back).toBeEnabled();
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: {
          type: 'mdhere:story-navigation',
          href: 'Missing.md',
          path: 'guides/Missing.md',
          kind: 'markdown'
        }
      })
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Missing'));
    expect(back).toBeEnabled();
    await fireEvent.click(back);
    await waitFor(() => expect(screen.getByTestId('reader')).toBeInTheDocument());
    expect(back).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('treeitem', { name: 'Story.html' }));
    await waitFor(() => expect(back).toBeEnabled());
    launch?.({ snapshot: library, document: null });
    await waitFor(() => expect(back).toBeDisabled());
    expect(screen.queryByTestId('story-frame')).not.toBeInTheDocument();
  });

  it('ignores forged and stale story messages and keeps the view when native read fails', async () => {
    const library: LibrarySnapshot = {
      rootName: 'Story library',
      diagnostics: [],
      tree: [
        { kind: 'document', documentKind: 'html', name: 'Story.html', path: 'guides/Story.html' }
      ]
    };
    const readDocument = vi
      .fn()
      .mockImplementation((path: string) =>
        path === 'guides/Story.html'
          ? Promise.resolve({ kind: 'html', path, title: 'Story' })
          : Promise.reject(new Error('Missing document'))
      );
    const client: LibraryClient = {
      snapshot: () => Promise.resolve(library),
      readDocument,
      refresh: () => Promise.resolve(library),
      openFolder: () => Promise.resolve({ ...library, tree: [] }),
      openExternalLink: () => Promise.resolve()
    };
    render(App, { client });
    await fireEvent.click(await screen.findByRole('treeitem', { name: 'Story.html' }));
    const frame = await screen.findByTestId<HTMLIFrameElement>('story-frame');
    const message = {
      type: 'mdhere:story-navigation',
      href: 'Missing.md',
      kind: 'markdown',
      path: 'guides/Missing.md'
    };
    window.dispatchEvent(new MessageEvent('message', { data: message, source: window }));
    expect(readDocument).toHaveBeenCalledOnce();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'mdhere:story-focus-tree' },
        source: window
      })
    );
    expect(screen.getByRole('treeitem', { name: 'Story.html' })).not.toHaveFocus();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'mdhere:story-focus-tree' },
        source: frame.contentWindow
      })
    );
    await waitFor(() => expect(screen.getByRole('treeitem', { name: 'Story.html' })).toHaveFocus());
    window.dispatchEvent(
      new MessageEvent('message', { data: message, source: frame.contentWindow })
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Missing document'));
    expect(screen.getByTestId('story-frame')).toBeInTheDocument();
    expect(screen.getByTestId('document-toolbar')).toHaveTextContent('Story');
    await fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await waitFor(() => expect(screen.queryByTestId('story-frame')).not.toBeInTheDocument());
    window.dispatchEvent(
      new MessageEvent('message', { data: message, source: frame.contentWindow })
    );
    expect(readDocument).toHaveBeenCalledTimes(2);
    (document.activeElement as HTMLElement).blur();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'mdhere:story-focus-tree' },
        source: frame.contentWindow
      })
    );
    expect(screen.queryByRole('treeitem', { name: 'Story.html' })).not.toBeInTheDocument();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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
          tree: [
            {
              kind: 'document',
              documentKind: 'markdown' as const,
              name: 'Guide.md',
              path: 'Guide.md'
            }
          ]
        }),
      readDocument: () =>
        Promise.resolve({ kind: 'markdown', path: 'Guide.md', title: 'Guide', content: '# Guide' }),
      refresh: () => Promise.reject(new Error('not used')),
      openFolder: () => Promise.resolve(undefined),
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
          tree: [
            {
              kind: 'document',
              documentKind: 'markdown' as const,
              name: 'Guide.md',
              path: 'Guide.md'
            }
          ]
        }),
      readDocument: () =>
        Promise.resolve({ kind: 'markdown', path: 'Guide.md', title: 'Guide', content: '# Guide' }),
      refresh: () => Promise.resolve({ rootName: 'Library', diagnostics: [], tree: [] }),
      openFolder: () => Promise.resolve(undefined),
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
      setZoom: vi.fn(),
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
          tree: [
            {
              kind: 'document',
              documentKind: 'markdown' as const,
              name: 'Guide.md',
              path: 'Guide.md'
            }
          ]
        }),
      readDocument: () =>
        Promise.resolve({
          kind: 'markdown',
          path: 'Guide.md',
          title: 'Guide',
          content: '---\ntitle: Guide\n---\n# Guide'
        }),
      refresh: () => Promise.reject(new Error('not used')),
      openFolder: () => Promise.resolve(undefined),
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
          children: [
            {
              kind: 'document' as const,
              documentKind: 'markdown' as const,
              name: 'Welcome.md',
              path: 'guides/Welcome.md'
            }
          ]
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
      tree: [
        {
          kind: 'document' as const,
          documentKind: 'markdown' as const,
          name: 'Guide.md',
          path: 'Guide.md'
        }
      ]
    };
    const client: LibraryClient = {
      snapshot: () => Promise.resolve(library),
      readDocument: () => Promise.reject(new Error('not used')),
      refresh: () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
      openFolder: () => Promise.resolve(undefined),
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

  it('reports a failed selected reread after refresh while retaining the view and Back history', async () => {
    const snapshot: LibrarySnapshot = {
      rootName: 'Library',
      diagnostics: [],
      tree: [
        { kind: 'document', documentKind: 'markdown', name: 'Guide.md', path: 'Guide.md' },
        { kind: 'document', documentKind: 'markdown', name: 'Other.md', path: 'Other.md' }
      ]
    };
    let missing = false;
    const client: LibraryClient = {
      snapshot: () => Promise.resolve(snapshot),
      refresh: () => Promise.resolve(snapshot),
      readDocument: (path) =>
        missing && path === 'Other.md'
          ? Promise.reject(Error('Selected file was deleted'))
          : Promise.resolve({ kind: 'markdown', path, title: path, content: '# Original' }),
      openFolder: () => Promise.resolve(undefined),
      openExternalLink: () => Promise.resolve()
    };
    render(App, { client });
    await fireEvent.click(await screen.findByRole('treeitem', { name: 'Guide.md' }));
    await fireEvent.click(screen.getByRole('treeitem', { name: 'Other.md' }));
    await waitFor(() =>
      expect(screen.getByTestId('document-toolbar')).toHaveTextContent('Other.md')
    );
    missing = true;
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh library' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Selected file was deleted')
    );
    expect(screen.getByTestId('document-toolbar')).toHaveTextContent('Other.md');
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  it('does not let a refresh reread overwrite a newer document selection', async () => {
    const snapshot: LibrarySnapshot = {
      rootName: 'Library',
      diagnostics: [],
      tree: [
        { kind: 'document', documentKind: 'markdown' as const, name: 'Guide.md', path: 'Guide.md' },
        { kind: 'document', documentKind: 'markdown' as const, name: 'Other.md', path: 'Other.md' }
      ]
    };
    const guide = {
      kind: 'markdown' as const,
      path: 'Guide.md',
      title: 'Guide',
      content: '# Guide'
    };
    const other = {
      kind: 'markdown' as const,
      path: 'Other.md',
      title: 'Other',
      content: '# Other'
    };
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
          tree: [
            {
              kind: 'document',
              documentKind: 'markdown' as const,
              name: 'Guide.md',
              path: 'Guide.md'
            }
          ]
        }),
      readDocument: () =>
        Promise.resolve({ kind: 'markdown', path: 'Guide.md', title: 'Guide', content: '# Guide' }),
      refresh: () => Promise.reject(new Error('not used')),
      openFolder,
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

  it('uses the platform modifier for bounded application zoom shortcuts', async () => {
    const platform = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const presentationApi = createFixturePresentationApi();
    const setZoom = vi.spyOn(presentationApi, 'setZoom');
    render(App, { presentationApi });
    await screen.findByRole('button', { name: 'Theme: Paper' });

    const press = (target: EventTarget, key: string, modifiers: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...modifiers
      });
      target.dispatchEvent(event);
      return event;
    };

    expect(press(window, '=', { metaKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(setZoom).toHaveBeenLastCalledWith(1.1));
    expect(press(window, '+', { metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(setZoom).toHaveBeenLastCalledWith(1.25));
    expect(press(window, '-', { metaKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(setZoom).toHaveBeenLastCalledWith(1.1));
    expect(press(window, '0', { metaKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(setZoom).toHaveBeenLastCalledWith(1));

    expect(press(window, '=', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(setZoom).toHaveBeenCalledTimes(4);
    const filter = screen.getByRole('searchbox', { name: 'Filter documents' });
    expect(press(filter, '=', { metaKey: true }).defaultPrevented).toBe(false);
    expect(setZoom).toHaveBeenCalledTimes(4);

    platform.mockReturnValue('Linux x86_64');
    expect(press(window, '=', { ctrlKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(setZoom).toHaveBeenLastCalledWith(1.1));
  });

  it('replaces an active reader when a native launch update arrives', async () => {
    let receiveUpdate:
      | ((update: {
          snapshot: LibrarySnapshot;
          document: { kind: 'markdown'; path: string; title: string; content: string } | null;
        }) => void)
      | undefined;
    const client: LibraryClient = {
      snapshot: () =>
        Promise.resolve({
          rootName: 'Initial library',
          diagnostics: [],
          tree: [
            {
              kind: 'document',
              documentKind: 'markdown' as const,
              name: 'Initial.md',
              path: 'Initial.md'
            }
          ]
        }),
      readDocument: vi.fn(),
      refresh: vi.fn(),
      openFolder: vi.fn(),
      consumeLaunchUpdate: () => Promise.resolve(undefined),
      onLaunchUpdate: async (handler) => {
        receiveUpdate = handler;
        return () => undefined;
      },
      openExternalLink: vi.fn()
    };
    render(App, { client });
    await screen.findByRole('treeitem', { name: 'Initial.md' });

    receiveUpdate?.({
      snapshot: {
        rootName: 'Replacement library',
        diagnostics: [],
        tree: [
          {
            kind: 'document',
            documentKind: 'markdown' as const,
            name: 'Welcome.md',
            path: 'guides/Welcome.md'
          }
        ]
      },
      document: {
        kind: 'markdown',
        path: 'guides/Welcome.md',
        title: 'Welcome',
        content: '# Welcome'
      }
    });

    await waitFor(() =>
      expect(screen.getByTestId('document-toolbar')).toHaveTextContent('Welcome')
    );
    expect(client.readDocument).not.toHaveBeenCalled();
  });

  it('opens an HTML launch as metadata without mounting the Markdown reader', async () => {
    const client: LibraryClient = {
      snapshot: vi.fn(),
      readDocument: vi.fn(),
      refresh: vi.fn(),
      openFolder: vi.fn(),
      openExternalLink: vi.fn(),
      consumeLaunchUpdate: () =>
        Promise.resolve({
          snapshot: {
            rootName: 'Library',
            diagnostics: [],
            tree: [
              { kind: 'document', documentKind: 'html', name: 'Story.html', path: 'Story.html' }
            ]
          },
          document: { kind: 'html', path: 'Story.html', title: 'Story' }
        })
    };
    render(App, { client });
    expect(await screen.findByText('Loading HTML story…')).toBeInTheDocument();
    expect(screen.queryByTestId('reader')).not.toBeInTheDocument();
    expect(client.readDocument).not.toHaveBeenCalled();
  });

  it('applies an initial native launch update without rereading the selected document', async () => {
    const consumeLaunchUpdate = vi.fn().mockResolvedValue({
      snapshot: {
        rootName: 'Other library',
        diagnostics: [],
        tree: [
          {
            kind: 'document',
            documentKind: 'markdown' as const,
            name: 'Welcome.md',
            path: 'guides/Welcome.md'
          }
        ]
      },
      document: {
        kind: 'markdown',
        path: 'guides/Welcome.md',
        title: 'Welcome',
        content: '# Welcome'
      }
    });
    const client: LibraryClient = {
      snapshot: vi.fn(),
      readDocument: vi.fn(),
      refresh: vi.fn(),
      openFolder: vi.fn(),
      consumeLaunchUpdate,
      openExternalLink: vi.fn()
    };
    render(App, { client });

    await waitFor(() =>
      expect(screen.getByTestId('document-toolbar')).toHaveTextContent('Welcome')
    );
    expect(consumeLaunchUpdate).toHaveBeenCalledOnce();
    expect(client.snapshot).not.toHaveBeenCalled();
    expect(client.readDocument).not.toHaveBeenCalled();
  });
});
