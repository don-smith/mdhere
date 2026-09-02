export type ResolvedLink =
  | { kind: 'document'; path: string; fragment?: string }
  | { kind: 'external'; url: string }
  | { kind: 'inert' };

export type ResolvedImage = { kind: 'asset'; path: string } | { kind: 'unavailable' };

export function resolveDocumentLink(documentPath: string, target: string): ResolvedLink {
  if (target.startsWith('#')) {
    const fragment = decode(target.slice(1));
    return fragment === undefined
      ? { kind: 'inert' }
      : { kind: 'document', path: documentPath, fragment };
  }

  const external = externalUrl(target);
  if (external) return { kind: 'external', url: external };
  const [pathPart, fragmentPart] = splitFragment(target);
  if (fragmentPart === undefined || pathPart === undefined) return { kind: 'inert' };
  const path = relativePath(documentPath, pathPart);
  if (!path || !isMarkdown(path)) return { kind: 'inert' };
  const fragment = fragmentPart === '' ? undefined : decode(fragmentPart);
  return fragment === undefined && fragmentPart !== ''
    ? { kind: 'inert' }
    : { kind: 'document', path, fragment };
}

export function resolveImage(documentPath: string, target: string): ResolvedImage {
  if (hasScheme(target) || target.startsWith('/') || target.includes('#') || target.includes('?')) {
    return { kind: 'unavailable' };
  }
  const path = relativePath(documentPath, target);
  return path ? { kind: 'asset', path } : { kind: 'unavailable' };
}

function splitFragment(target: string): [string | undefined, string | undefined] {
  const index = target.indexOf('#');
  const rawPath = index === -1 ? target : target.slice(0, index);
  if (!rawPath || rawPath.includes('?')) return [undefined, undefined];
  const path = decode(rawPath);
  return [path, index === -1 ? '' : target.slice(index + 1)];
}

function relativePath(documentPath: string, target: string): string | undefined {
  if (target.startsWith('/') || hasScheme(target)) return undefined;
  const parts = documentPath.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.pop()) return undefined;
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function externalUrl(target: string): string | undefined {
  if (!target.startsWith('https:')) return undefined;
  try {
    const url = new URL(target);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function hasScheme(target: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target);
}

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function isMarkdown(path: string): boolean {
  return /\.(?:md|markdown)$/i.test(path);
}
