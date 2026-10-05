import { describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn()
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: tauri.listen }));

import { TauriLibraryClient } from './tauri-library-client';

const snapshot = {
  rootName: 'replacement',
  diagnostics: [],
  tree: [
    {
      kind: 'document' as const,
      documentKind: 'markdown' as const,
      name: 'Replacement.md',
      path: 'Replacement.md'
    }
  ]
};

describe('TauriLibraryClient', () => {
  it('waits for the native folder-picked event before replacing a library snapshot', async () => {
    let picked:
      ((event: { payload: { snapshot: typeof snapshot; error: null } }) => void) | undefined;
    const unlisten = vi.fn();
    tauri.listen.mockImplementation(async (_event, handler) => {
      picked = handler;
      return unlisten;
    });
    tauri.invoke.mockImplementation(async (command) => {
      expect(command).toBe('open_folder');
      picked?.({ payload: { snapshot, error: null } });
    });

    await expect(new TauriLibraryClient().openFolder()).resolves.toEqual(snapshot);
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('passes through HTML read metadata without manufacturing markup', async () => {
    const html = { kind: 'html', path: 'Story.html', title: 'Story' };
    tauri.invoke.mockResolvedValue(html);
    await expect(new TauriLibraryClient().readDocument('Story.html')).resolves.toEqual(html);
    expect(tauri.invoke).toHaveBeenCalledWith('read_document', { path: 'Story.html' });
  });

  it('consumes the pending native launch update', async () => {
    const update = { snapshot, document: null };
    tauri.invoke.mockResolvedValue(update);

    await expect(new TauriLibraryClient().consumeLaunchUpdate()).resolves.toEqual(update);
    expect(tauri.invoke).toHaveBeenCalledWith('take_launch_update');
  });

  it('subscribes to native launch updates', async () => {
    let received:
      ((event: { payload: { snapshot: typeof snapshot; document: null } }) => void) | undefined;
    const unlisten = vi.fn();
    tauri.listen.mockImplementation(async (_event, handler) => {
      received = handler;
      return unlisten;
    });
    const handler = vi.fn();

    await expect(new TauriLibraryClient().onLaunchUpdate(handler)).resolves.toBe(unlisten);
    received?.({ payload: { snapshot, document: null } });
    expect(handler).toHaveBeenCalledWith({ snapshot, document: null });
  });

  it('keeps the current library when the native folder picker is cancelled', async () => {
    let picked: ((event: { payload: { snapshot: null; error: null } }) => void) | undefined;
    tauri.listen.mockImplementation(async (_event, handler) => {
      picked = handler;
      return vi.fn();
    });
    tauri.invoke.mockImplementation(async () => {
      picked?.({ payload: { snapshot: null, error: null } });
    });

    await expect(new TauriLibraryClient().openFolder()).resolves.toBeUndefined();
  });
});
