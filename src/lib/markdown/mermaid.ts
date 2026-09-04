import mermaid, { type Mermaid } from 'mermaid';

import type { ShellColors, Theme, ThemeAppearance } from '../themes/types';

export interface MermaidThemeVariables {
  darkMode: boolean;
  background: string;
  primaryColor: string;
  primaryTextColor: string;
  primaryBorderColor: string;
  secondaryColor: string;
  secondaryTextColor: string;
  secondaryBorderColor: string;
  tertiaryColor: string;
  tertiaryTextColor: string;
  tertiaryBorderColor: string;
  mainBkg: string;
  nodeBkg: string;
  nodeBorder: string;
  nodeTextColor: string;
  lineColor: string;
  defaultLinkColor: string;
  arrowheadColor: string;
  textColor: string;
  titleColor: string;
  edgeLabelBackground: string;
  labelColor: string;
  clusterBkg: string;
  clusterBorder: string;
  actorBkg: string;
  actorBorder: string;
  actorTextColor: string;
  actorLineColor: string;
  signalColor: string;
  signalTextColor: string;
  labelBoxBkgColor: string;
  labelBoxBorderColor: string;
  labelTextColor: string;
  loopTextColor: string;
}

export interface MermaidConfiguration {
  startOnLoad: false;
  securityLevel: 'strict';
  theme: 'base';
  themeVariables: MermaidThemeVariables;
  secure: string[];
}

export interface MermaidApi {
  initialize(config: MermaidConfiguration): void;
  parse(source: string): Promise<unknown>;
  render(
    id: string,
    source: string,
    container: HTMLElement
  ): Promise<{ svg: string; bindFunctions?: (element: HTMLElement) => void }>;
}

type MermaidTheme = Pick<Theme, 'appearance' | 'shell'>;

const defaultShell: ShellColors = {
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
};

const defaultSecureKeys = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges'
];

const protectedVisualKeys = ['theme', 'themeVariables', 'themeCSS', 'darkMode', 'fontFamily'];

export function mermaidConfig(theme?: MermaidTheme): MermaidConfiguration {
  const appearance: ThemeAppearance = theme?.appearance ?? 'light';
  const shell = theme?.shell ?? defaultShell;
  const foreground = shell.foreground;
  const border = shell.border;
  const nodeBackground = shell.raisedSurface;

  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    secure: [...defaultSecureKeys, ...protectedVisualKeys],
    themeVariables: {
      darkMode: appearance === 'dark',
      background: shell.background,
      primaryColor: nodeBackground,
      primaryTextColor: foreground,
      primaryBorderColor: shell.borderStrong,
      secondaryColor: shell.accentSoft,
      secondaryTextColor: foreground,
      secondaryBorderColor: border,
      tertiaryColor: shell.surface,
      tertiaryTextColor: foreground,
      tertiaryBorderColor: border,
      mainBkg: nodeBackground,
      nodeBkg: nodeBackground,
      nodeBorder: shell.borderStrong,
      nodeTextColor: foreground,
      lineColor: shell.muted,
      defaultLinkColor: shell.muted,
      arrowheadColor: shell.muted,
      textColor: foreground,
      titleColor: shell.foregroundStrong,
      edgeLabelBackground: shell.background,
      labelColor: foreground,
      clusterBkg: shell.surface,
      clusterBorder: border,
      actorBkg: nodeBackground,
      actorBorder: shell.borderStrong,
      actorTextColor: foreground,
      actorLineColor: shell.borderStrong,
      signalColor: foreground,
      signalTextColor: foreground,
      labelBoxBkgColor: nodeBackground,
      labelBoxBorderColor: shell.borderStrong,
      labelTextColor: foreground,
      loopTextColor: foreground
    }
  };
}

export class MermaidRenderer {
  private nextDiagramId = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly api: MermaidApi = mermaid as Mermaid) {}

  render(article: HTMLElement, theme?: MermaidTheme): Promise<void> {
    const job = this.queue.then(() => this.renderArticle(article, theme));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async renderArticle(article: HTMLElement, theme?: MermaidTheme): Promise<void> {
    const placeholders = article.querySelectorAll<HTMLElement>('pre[data-mdhere-mermaid="true"]');
    if (placeholders.length === 0) return;
    this.api.initialize(mermaidConfig(theme));
    for (const placeholder of placeholders) {
      await this.renderPlaceholder(article, placeholder);
    }
  }

  private async renderPlaceholder(article: HTMLElement, placeholder: HTMLElement): Promise<void> {
    const source = placeholder.textContent ?? '';
    try {
      await this.api.parse(source);
      if (!isCurrentPlaceholder(article, placeholder)) return;

      const renderContainer = document.createElement('div');
      // Mermaid diagram renderers look up their generated IDs through document, not a ShadowRoot.
      renderContainer.setAttribute('aria-hidden', 'true');
      renderContainer.style.position = 'absolute';
      renderContainer.style.visibility = 'hidden';
      renderContainer.style.pointerEvents = 'none';
      document.body.append(renderContainer);
      try {
        const result = await this.api.render(
          `mdhere-mermaid-${++this.nextDiagramId}`,
          source,
          renderContainer
        );
        if (!isCurrentPlaceholder(article, placeholder)) return;

        const diagram = document.createElement('div');
        diagram.className = 'mdhere-mermaid-diagram';
        diagram.innerHTML = result.svg;
        placeholder.replaceWith(diagram);
        result.bindFunctions?.(diagram);
      } finally {
        renderContainer.remove();
      }
    } catch (reason) {
      if (!isCurrentPlaceholder(article, placeholder)) return;
      const message = document.createElement('p');
      message.className = 'mdhere-mermaid-error';
      message.setAttribute('role', 'alert');
      message.textContent = errorMessage(reason);
      placeholder.after(message);
    }
  }
}

function isCurrentPlaceholder(article: HTMLElement, placeholder: HTMLElement): boolean {
  return placeholder.isConnected && article.contains(placeholder);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export const mermaidRenderer = new MermaidRenderer();
