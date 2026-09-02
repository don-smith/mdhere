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
  tree: [{ kind: 'document' as const, name: 'Replacement.md', path: 'Replacement.md' }]
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

  it('invokes the narrow native new-window command', async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await expect(new TauriLibraryClient().newWindow()).resolves.toBeUndefined();
    expect(tauri.invoke).toHaveBeenCalledWith('new_window');
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
