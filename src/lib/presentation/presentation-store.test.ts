import { expect, it, vi } from 'vitest';

import { presentationFixture } from './presentation-fixture';
import { PresentationStore, type PresentationApi } from './presentation-store';
import type { PresentationSnapshot } from '../themes/types';

function fixture(): PresentationSnapshot {
  return structuredClone(presentationFixture);
}

it('propagates complete newer snapshots to two stores and rejects stale revisions', async () => {
  const handlers = new Set<(snapshot: PresentationSnapshot) => void>();
  const api: PresentationApi = {
    snapshot: vi.fn(async () => fixture()),
    select: vi.fn(),
    reload: vi.fn(),
    setFrontMatterExpanded: vi.fn(),
    openFolder: vi.fn(),
    onChanged: vi.fn(async (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    })
  };
  const first = new PresentationStore(api);
  const second = new PresentationStore(api);

  await Promise.all([first.load(), second.load()]);
  const updated = {
    ...fixture(),
    revision: 3,
    themes: [fixture().themes[2]!],
    selected: fixture().themes[2]!,
    diagnostics: ['A package could not be loaded.'],
    frontMatterExpanded: true
  };
  for (const handler of handlers) handler(updated);

  for (const store of [first, second]) {
    expect(store.snapshot).toEqual(updated);
    expect(store.snapshot?.themes).toHaveLength(1);
    expect(store.snapshot?.frontMatterExpanded).toBe(true);
  }

  const stale = { ...fixture(), revision: 2, frontMatterExpanded: false };
  for (const handler of handlers) handler(stale);
  expect(first.snapshot).toEqual(updated);
  expect(second.snapshot).toEqual(updated);
});

it('applies a mutation response and its matching event only once', async () => {
  let handler: ((snapshot: PresentationSnapshot) => void) | undefined;
  const initial = fixture();
  const updated = {
    ...initial,
    revision: 1,
    selected: initial.themes[1]!,
    frontMatterExpanded: true
  };
  const api: PresentationApi = {
    snapshot: vi.fn(async () => initial),
    select: vi.fn(async () => {
      handler?.(updated);
      return updated;
    }),
    reload: vi.fn(),
    setFrontMatterExpanded: vi.fn(),
    openFolder: vi.fn(),
    onChanged: vi.fn(async (next) => {
      handler = next;
      return () => undefined;
    })
  };
  const applied = vi.fn();
  const store = new PresentationStore(api, applied);

  await store.load();
  await store.select('mdhere-dark');

  expect(store.snapshot).toEqual(updated);
  expect(applied).toHaveBeenCalledTimes(2);
  expect(api.select).toHaveBeenCalledWith('mdhere-dark');
});

it('records mutation failures without replacing the applied snapshot', async () => {
  const initial = fixture();
  const api: PresentationApi = {
    snapshot: vi.fn(async () => initial),
    select: vi.fn(async () => Promise.reject(new Error('Preferences could not be saved.'))),
    reload: vi.fn(),
    setFrontMatterExpanded: vi.fn(),
    openFolder: vi.fn(),
    onChanged: vi.fn(async () => () => undefined)
  };
  const store = new PresentationStore(api);

  await store.load();
  await store.select('mdhere-dark');

  expect(store.snapshot).toEqual(initial);
  expect(store.error).toBe('Preferences could not be saved.');
});

it('subscribes once and stops applying events after disposal', async () => {
  let handler: ((snapshot: PresentationSnapshot) => void) | undefined;
  const unlisten = vi.fn(() => {
    handler = undefined;
  });
  const api: PresentationApi = {
    snapshot: vi.fn(async () => fixture()),
    select: vi.fn(),
    reload: vi.fn(),
    setFrontMatterExpanded: vi.fn(),
    openFolder: vi.fn(),
    onChanged: vi.fn(async (next) => {
      handler = next;
      return unlisten;
    })
  };
  const store = new PresentationStore(api);

  await store.load();
  await store.load();
  store.dispose();
  handler?.({ ...fixture(), revision: 1, frontMatterExpanded: true });

  expect(api.onChanged).toHaveBeenCalledOnce();
  expect(unlisten).toHaveBeenCalledOnce();
  expect(store.snapshot?.frontMatterExpanded).toBe(false);
});
