import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import App from './App.svelte';

describe('App', () => {
  it('shows a loading state while the library snapshot is requested', () => {
    render(App);

    expect(screen.getByText('Loading library…')).toBeInTheDocument();
  });
});
