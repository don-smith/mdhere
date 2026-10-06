export type StoryDestination = { kind: 'markdown' | 'html'; path: string; fragment?: string };

function containsControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

// Keep story resolution separate from Markdown links: Markdown-to-HTML is not supported.
export function resolveStoryLink(documentPath: string, href: string): StoryDestination | null {
  if (
    !href ||
    href.startsWith('#') ||
    href.startsWith('/') ||
    href.includes('?') ||
    href.includes('\\') ||
    /^[a-z][a-z\d+.-]*:/i.test(href)
  )
    return null;
  const hash = href.indexOf('#');
  const rawPath = hash < 0 ? href : href.slice(0, hash);
  if (!rawPath) return null;
  const parts = documentPath.split('/').slice(0, -1);
  for (const raw of rawPath.split('/')) {
    if (/%(?:2f|5c|00)/i.test(raw)) return null;
    let segment: string;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (segment === '..' && raw === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else if (segment === '.' && raw === '.') {
      continue;
    } else if (
      !segment ||
      segment === '.' ||
      segment === '..' ||
      /[\\/]/.test(segment) ||
      /%(?:2f|5c|00|2e)/i.test(segment) ||
      containsControl(segment)
    )
      return null;
    else parts.push(segment);
  }
  const path = parts.join('/');
  const kind = /\.html$/i.test(path)
    ? 'html'
    : /\.(?:md|markdown)$/i.test(path)
      ? 'markdown'
      : null;
  if (!kind) return null;
  let fragment: string | undefined;
  if (hash >= 0 && href.slice(hash + 1)) {
    try {
      fragment = decodeURIComponent(href.slice(hash + 1));
    } catch {
      return null;
    }
    if (containsControl(fragment)) return null;
  }
  return { kind, path, ...(fragment === undefined ? {} : { fragment }) };
}

export function isStoryFocusTreeMessage(
  source: MessageEventSource | null,
  currentFrame: Window | null,
  data: unknown
): boolean {
  return (
    !!currentFrame &&
    source === currentFrame &&
    !!data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Object.keys(data).length === 1 &&
    (data as Record<string, unknown>).type === 'mdhere:story-focus-tree'
  );
}

export function validateStoryMessage(
  source: MessageEventSource | null,
  currentFrame: Window | null,
  data: unknown,
  documentPath: string
): StoryDestination | null {
  if (
    !currentFrame ||
    source !== currentFrame ||
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  )
    return null;
  const message = data as Record<string, unknown>;
  if (
    Object.keys(message).sort().join(',') !== 'href,kind,path,type' ||
    message.type !== 'mdhere:story-navigation' ||
    typeof message.href !== 'string' ||
    typeof message.path !== 'string' ||
    (message.kind !== 'html' && message.kind !== 'markdown')
  )
    return null;
  const destination = resolveStoryLink(documentPath, message.href);
  return destination && destination.path === message.path && destination.kind === message.kind
    ? destination
    : null;
}
