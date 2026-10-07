import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StoryPane from './StoryPane.svelte';

const tauri = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  tauri.invoke.mockReset();
});

describe('StoryPane authorization', () => {
  it('shows a retryable current-pane error after post-read authorization fails without changing the view', async () => {
    vi.stubEnv('MODE', 'production');
    tauri.invoke.mockRejectedValueOnce(new Error('Story disappeared'));
    tauri.invoke.mockResolvedValueOnce('mdhere-story://localhost/1/Story.html');
    render(StoryPane, { path: 'Story.html', onNavigate: vi.fn() });
    expect(await screen.findByRole('alert')).toHaveTextContent('Story disappeared');
    expect(screen.queryByTestId('story-frame')).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry story' }));
    await waitFor(() => expect(screen.getByTestId('story-frame')).toBeInTheDocument());
    expect(tauri.invoke).toHaveBeenCalledTimes(2);
    expect(tauri.invoke).toHaveBeenCalledWith('authorize_story', { path: 'Story.html' });
  });
});
