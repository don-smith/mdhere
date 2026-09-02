import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import type { LibraryClient } from './lib/library-client';
import App from './App.svelte';

describe('App', () => {
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
      openExternalLink: () => Promise.resolve()
    };
    render(App, { client });

    const heading = await screen.findByRole('heading', { name: 'Choose a folder' });
    const choice = heading.closest('section');
    expect(choice?.querySelector('button')).toHaveTextContent('Open Folder');
  });
});
