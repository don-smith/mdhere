import { describe, expect, it, vi } from 'vitest';

import type { Theme } from '../themes/types';
import { MermaidRenderer, type MermaidApi, mermaidConfig } from './mermaid';

const paper = {
  appearance: 'light',
  shell: {
    background: '#f7f8fb',
    panel: '#ffffff',
    surface: '#ffffff',
    raisedSurface: '#ffffff',
    foreground: '#172033',
    foregroundStrong: '#101827',
    muted: '#5a6475',
    faint: '#7b8494',
    border: '#d9dfea',
    borderStrong: '#b8c3d6',
    accent: '#195bbd',
    accentForeground: '#ffffff',
    accentSoft: '#e5efff',
    hover: '#f0f4fa',
    selected: '#dbeafe',
    focus: '#195bbd',
    danger: '#a63838',
    warning: '#966614',
    overlay: '#17203366'
  }
} as const satisfies Pick<Theme, 'appearance' | 'shell'>;

const midnight = {
  appearance: 'dark',
  shell: {
    ...paper.shell,
    background: '#18202d',
    surface: '#202a3a',
    raisedSurface: '#273247',
    foreground: '#edf2fa',
    foregroundStrong: '#ffffff',
    muted: '#aab7ca',
    border: '#364257',
    borderStrong: '#53627a',
    accentSoft: '#243d67'
  }
} as const satisfies Pick<Theme, 'appearance' | 'shell'>;

function articleWith(source: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = `<pre data-mdhere-mermaid="true"><code>${source}</code></pre>`;
  document.body.append(article);
  return article;
}

function mermaidApi(overrides: Partial<MermaidApi> = {}): MermaidApi {
  return {
    initialize: vi.fn(),
    parse: vi.fn().mockResolvedValue({ diagramType: 'flowchart-v2' }),
    render: vi.fn().mockResolvedValue({ svg: '<svg><title>Diagram</title></svg>' }),
    ...overrides
  };
}

describe('mermaidConfig', () => {
  it('maps the selected shell palette to Mermaid base variables and protects it from directives', () => {
    expect(mermaidConfig(midnight)).toMatchObject({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      secure: expect.arrayContaining([
        'secure',
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'suppressErrorRendering',
        'maxEdges',
        'theme',
        'themeVariables',
        'themeCSS',
        'darkMode',
        'fontFamily'
      ]),
      themeVariables: {
        darkMode: true,
        background: '#18202d',
        mainBkg: '#273247',
        nodeBkg: '#273247',
        nodeBorder: '#53627a',
        nodeTextColor: '#edf2fa',
        lineColor: '#aab7ca',
        arrowheadColor: '#aab7ca',
        edgeLabelBackground: '#18202d',
        titleColor: '#ffffff'
      }
    });
  });

  it('uses the light palette without dark color derivation', () => {
    expect(mermaidConfig(paper).themeVariables).toMatchObject({
      darkMode: false,
      background: '#f7f8fb',
      mainBkg: '#ffffff',
      lineColor: '#5a6475',
      nodeTextColor: '#172033'
    });
  });
});

describe('MermaidRenderer', () => {
  it('configures and replaces valid placeholders with rendered SVG', async () => {
    const api = mermaidApi();
    const renderer = new MermaidRenderer(api);
    const article = articleWith('flowchart LR\n  A --> B');

    await renderer.render(article, midnight);

    expect(api.initialize).toHaveBeenCalledWith(mermaidConfig(midnight));
    expect(api.parse).toHaveBeenCalledWith('flowchart LR\n  A --> B');
    expect(api.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mdhere-mermaid-/),
      'flowchart LR\n  A --> B',
      expect.any(HTMLElement)
    );
    expect(article.querySelector('svg title')).toHaveTextContent('Diagram');
    expect(article.querySelector('[data-mdhere-mermaid]')).toBeNull();
    const renderContainer = vi.mocked(api.render).mock.calls[0]?.[2];
    expect(renderContainer?.isConnected).toBe(false);
  });

  it('serializes theme configuration with each complete article render', async () => {
    let resolveFirstParse: (() => void) | undefined;
    const api = mermaidApi({
      parse: vi
        .fn()
        .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFirstParse = resolve)))
        .mockResolvedValue({ diagramType: 'flowchart-v2' })
    });
    const renderer = new MermaidRenderer(api);
    const first = articleWith('flowchart LR\n  A --> B');
    const second = articleWith('flowchart LR\n  C --> D');

    const firstRender = renderer.render(first, paper);
    const secondRender = renderer.render(second, midnight);
    await Promise.resolve();

    expect(api.initialize).toHaveBeenCalledTimes(1);
    expect(api.initialize).toHaveBeenLastCalledWith(mermaidConfig(paper));

    resolveFirstParse?.();
    await Promise.all([firstRender, secondRender]);

    expect(api.initialize).toHaveBeenCalledTimes(2);
    expect(api.initialize).toHaveBeenLastCalledWith(mermaidConfig(midnight));
    expect(second.querySelector('svg')).not.toBeNull();
  });

  it('binds Mermaid functions to the rendered diagram', async () => {
    const bindFunctions = vi.fn();
    const renderer = new MermaidRenderer(
      mermaidApi({ render: vi.fn().mockResolvedValue({ svg: '<svg></svg>', bindFunctions }) })
    );
    const article = articleWith('flowchart LR\n  A --> B');

    await renderer.render(article, paper);

    expect(bindFunctions).toHaveBeenCalledWith(article.querySelector('.mdhere-mermaid-diagram'));
  });

  it.each([
    [
      'parse',
      (api: MermaidApi) => vi.mocked(api.parse).mockRejectedValue(new Error('Invalid syntax'))
    ],
    [
      'render',
      (api: MermaidApi) => vi.mocked(api.render).mockRejectedValue(new Error('Layout failed'))
    ]
  ])('keeps the source fence and adds a visible reason when %s fails', async (_, fail) => {
    const api = mermaidApi();
    fail(api);
    const renderer = new MermaidRenderer(api);
    const article = articleWith('not a diagram');

    await renderer.render(article, paper);

    expect(article.querySelector('pre')).toHaveTextContent('not a diagram');
    expect(article.querySelector('[role="alert"]')).toHaveTextContent(
      _ === 'parse' ? 'Invalid syntax' : 'Layout failed'
    );
  });

  it.each([
    'classDef danger fill:#ff0000',
    'style A fill:#ff0000',
    'linkStyle 0 stroke:#ff0000',
    'cssClass A danger'
  ])('keeps source when a semicolon introduces Mermaid %s', async (command) => {
    const api = mermaidApi();
    const renderer = new MermaidRenderer(api);
    const article = articleWith(`flowchart LR; A --> B; ${command}`);

    await renderer.render(article, paper);

    expect(article.querySelector('pre')).toHaveTextContent(command);
    expect(article.querySelector('[role="alert"]')).toHaveTextContent(
      'Document-controlled Mermaid styles are not supported.'
    );
    expect(api.parse).not.toHaveBeenCalled();
    expect(api.render).not.toHaveBeenCalled();
  });

  it('abandons a placeholder removed while parsing is pending', async () => {
    let resolveParse: (() => void) | undefined;
    const api = mermaidApi({
      parse: vi
        .fn()
        .mockImplementation(() => new Promise<void>((resolve) => (resolveParse = resolve)))
    });
    const renderer = new MermaidRenderer(api);
    const article = articleWith('flowchart LR\n  A --> B');
    const placeholder = article.querySelector('pre');
    if (!placeholder) throw new Error('Expected Mermaid placeholder');

    const pending = renderer.render(article, paper);
    placeholder.remove();
    resolveParse?.();
    await pending;

    expect(api.render).not.toHaveBeenCalled();
    expect(article.querySelector('svg')).toBeNull();
  });
});
