import { describe, expect, it } from 'vitest';

import { InMemoryLibraryClient } from './in-memory-library-client';

const snapshot = {
  rootName: 'library',
  diagnostics: [],
  tree: [{ kind: 'document' as const, name: 'Read me.md', path: 'Read me.md' }]
};

describe('InMemoryLibraryClient', () => {
  it('returns a snapshot and reads documents by their relative path', async () => {
    const client = new InMemoryLibraryClient(snapshot, {
      'Read me.md': { path: 'Read me.md', title: 'Read me', content: '# Read me' }
    });

    await expect(client.snapshot()).resolves.toEqual(snapshot);
    await expect(client.readDocument('Read me.md')).resolves.toMatchObject({
      content: '# Read me'
    });
  });

  it('reports a typed failure for a missing document', async () => {
    const client = new InMemoryLibraryClient(snapshot, {});

    await expect(client.readDocument('missing.md')).rejects.toMatchObject({ kind: 'io' });
  });
});
