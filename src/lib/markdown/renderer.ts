import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { createCssVariablesTheme, createHighlighter } from 'shiki';

import { extractFrontMatter } from './front-matter';
import { resolveDocumentLink, resolveImage } from './link-resolver';
import { sanitizeHtml } from './sanitize';
import type { RenderedDocument } from './types';

const shikiTheme = createCssVariablesTheme({ name: 'mdhere' });
const highlighter = createHighlighter({
  themes: [shikiTheme],
  langs: ['text', 'bash', 'css', 'html', 'javascript', 'json', 'markdown', 'rust', 'typescript']
});

export type AssetUrl = (confinedPath: string) => string;

function nativeAssetUrl(path: string): string {
  return `mdhere-asset://localhost/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export class MarkdownRenderer {
  private constructor(private readonly parser: InstanceType<typeof MarkdownIt>) {}

  static async create(assetUrl: AssetUrl = nativeAssetUrl): Promise<MarkdownRenderer> {
    const syntaxHighlighter = await highlighter;
    const parser = new MarkdownIt({ html: false, linkify: true, typographer: true }).use(
      taskLists,
      {
        enabled: true,
        label: true,
        labelAfter: true
      }
    );
    const defaultLink = parser.renderer.rules.link_open;
    const defaultImage = parser.renderer.rules.image;
    const defaultFence = parser.renderer.rules.fence;
    const defaultHeading = parser.renderer.rules.heading_open;

    parser.renderer.rules.s_open = () => '<del>';
    parser.renderer.rules.s_close = () => '</del>';

    parser.renderer.rules.heading_open = (tokens, index, options, environment, self) => {
      const token = tokens[index];
      const text = plainText(tokens[index + 1]);
      const base = headingId(text);
      const headingIds = (environment?.headingIds as Map<string, number> | undefined) ?? new Map();
      const seen = (headingIds.get(base) ?? 0) + 1;
      headingIds.set(base, seen);
      token.attrSet('id', seen === 1 ? base : `${base}-${seen}`);
      token.attrSet('tabindex', '-1');
      return defaultHeading
        ? defaultHeading(tokens, index, options, environment, self)
        : self.renderToken(tokens, index, options);
    };

    parser.renderer.rules.link_open = (tokens, index, options, environment, self) => {
      const token = tokens[index];
      const destination = resolveDocumentLink(
        String(environment?.documentPath ?? ''),
        String(token.attrGet('href') ?? '')
      );
      if (destination.kind === 'document') {
        token.attrSet('href', '#');
        token.attrSet('data-mdhere-path', destination.path);
        if (destination.fragment) token.attrSet('data-mdhere-fragment', destination.fragment);
      } else if (destination.kind === 'external') {
        token.attrSet('href', '#');
        token.attrSet('data-mdhere-external', destination.url);
      } else {
        token.attrs = token.attrs?.filter(([name]) => name !== 'href') ?? [];
      }
      return defaultLink
        ? defaultLink(tokens, index, options, environment, self)
        : self.renderToken(tokens, index, options);
    };

    parser.renderer.rules.image = (tokens, index, options, environment, self) => {
      const token = tokens[index];
      const destination = resolveImage(
        String(environment?.documentPath ?? ''),
        String(token.attrGet('src') ?? '')
      );
      if (destination.kind === 'asset') {
        token.attrSet('src', assetUrl(destination.path));
      } else {
        const alternative = parser.utils.escapeHtml(token.content || 'Image');
        return `<span class="mdhere-image-unavailable" data-mdhere-image-unavailable="true" role="img" aria-label="Image unavailable: ${alternative}">Image unavailable: ${alternative}</span>`;
      }
      return defaultImage
        ? defaultImage(tokens, index, options, environment, self)
        : self.renderToken(tokens, index, options);
    };

    parser.renderer.rules.fence = (tokens, index, options, environment, self) => {
      const token = tokens[index];
      const language = token.info.trim().split(/\s+/, 1)[0] || 'text';
      const content = token.content.replace(/\r?\n$/, '');
      if (language === 'mermaid' || language === 'mmd') {
        return `<pre data-mdhere-mermaid="true"><code class="language-${language}">${parser.utils.escapeHtml(content)}</code></pre>`;
      }
      try {
        return syntaxHighlighter.codeToHtml(content, { lang: language, theme: 'mdhere' });
      } catch {
        const originalContent = token.content;
        token.content = content;
        try {
          return defaultFence
            ? defaultFence(tokens, index, options, environment, self)
            : self.renderToken(tokens, index, options);
        } finally {
          token.content = originalContent;
        }
      }
    };

    return new MarkdownRenderer(parser);
  }

  render(markdown: string, documentPath: string): RenderedDocument {
    const { body, frontMatter } = extractFrontMatter(markdown);
    // Heading IDs are scoped to one rendered document, never an earlier document.
    const ids = new Map<string, number>();
    const html = this.parser.render(body, { documentPath, headingIds: ids });
    return { html: sanitizeHtml(html), diagnostics: [], frontMatter };
  }
}

function plainText(token: { children?: Array<{ content: string }> | null } | undefined): string {
  return token?.children?.map((child) => child.content).join('') ?? '';
}

export function headingId(value: string): string {
  const normalized = value.normalize('NFC').toLocaleLowerCase().trim();
  const safe = normalized.replace(/[^\p{L}\p{N}\s_-]/gu, '');
  return safe.replace(/\s+/g, '-') || 'section';
}
