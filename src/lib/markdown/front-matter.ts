import { isAlias, isMap, isScalar, isSeq, parseAllDocuments, type Node } from 'yaml';

import type { FrontMatter, FrontMatterEntry, FrontMatterScalar, FrontMatterValue } from './types';

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_WARNING_BYTES = 16 * 1024;
const MAX_NODES = 1_000;
const MAX_COLLECTION_DEPTH = 12;
const CORE_TAGS = new Set([
  'tag:yaml.org,2002:map',
  'tag:yaml.org,2002:seq',
  'tag:yaml.org,2002:str',
  'tag:yaml.org,2002:int',
  'tag:yaml.org,2002:float',
  'tag:yaml.org,2002:bool',
  'tag:yaml.org,2002:null'
]);
const encoder = new TextEncoder();

interface Extraction {
  body: string;
  frontMatter?: FrontMatter;
}

interface Line {
  text: string;
  next: number;
}

interface WalkState {
  nodes: number;
}

export function extractFrontMatter(markdown: string): Extraction {
  const start = markdown.startsWith('\uFEFF') ? 1 : 0;
  const opening = readLine(markdown, start);
  if (!opening || opening.text.trim() !== '---') return { body: markdown };

  let cursor = opening.next;
  let closing: Line | undefined;
  while (cursor <= markdown.length) {
    const line = readLine(markdown, cursor);
    if (!line) break;
    if (line.text.trim() === '---' || line.text.trim() === '...') {
      closing = line;
      break;
    }
    cursor = line.next;
  }

  if (!closing) return { body: markdown };

  const source = markdown.slice(opening.next, closingStart(markdown, closing));
  const body = markdown.slice(closing.next);
  if (source.trim().length === 0) return { body };

  if (byteLength(source) > MAX_SOURCE_BYTES) {
    const { prefix, omittedCharacters } = truncateByBytes(source, MAX_WARNING_BYTES);
    return {
      body,
      frontMatter: { kind: 'warning', source: prefix, omittedCharacters }
    };
  }

  try {
    return { body, frontMatter: parseFrontMatter(source) };
  } catch {
    return { body, frontMatter: { kind: 'warning', source } };
  }
}

function readLine(source: string, start: number): Line | undefined {
  if (start >= source.length) return undefined;
  const newline = source.indexOf('\n', start);
  if (newline === -1) return { text: source.slice(start), next: source.length };
  const end = source[newline - 1] === '\r' ? newline - 1 : newline;
  return { text: source.slice(start, end), next: newline + 1 };
}

function closingStart(source: string, closing: Line): number {
  const lineLength = closing.text.length;
  const beforeNewline = closing.next === source.length ? source.length : closing.next - 1;
  return beforeNewline - (source[beforeNewline - 1] === '\r' ? 1 : 0) - lineLength;
}

function parseFrontMatter(source: string): FrontMatter {
  const documents = parseAllDocuments(source, {
    version: '1.2',
    schema: 'core',
    strict: true,
    uniqueKeys: true,
    merge: false,
    resolveKnownTags: false
  });
  if (
    documents.length !== 1 ||
    documents[0].errors.length > 0 ||
    documents[0].warnings.length > 0
  ) {
    throw new Error('Front matter must contain one valid YAML document');
  }

  const state: WalkState = { nodes: 0 };
  const root = documents[0].contents;
  if (!root || !isMap(root)) throw new Error('Front matter must be a mapping');
  const value = walk(root, state, 1);
  if (value.kind !== 'mapping') throw new Error('Front matter must be a mapping');

  return {
    kind: 'metadata',
    entries: value.entries,
    tagChips: tagsFrom(value.entries)
  };
}

function walk(node: Node, state: WalkState, collectionDepth: number): FrontMatterValue {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw new Error('Front matter has too many nodes');
  if (isAlias(node)) throw new Error('Front matter aliases are not allowed');
  if (node.tag && !CORE_TAGS.has(node.tag)) {
    throw new Error('Front matter custom or unsupported tags are not allowed');
  }

  if (isScalar(node)) {
    const value = node.value;
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean' &&
      value !== null
    ) {
      throw new Error('Front matter has an unsupported scalar');
    }
    return { kind: 'scalar', value };
  }

  if (isSeq(node)) {
    if (collectionDepth > MAX_COLLECTION_DEPTH) {
      throw new Error('Front matter is too deeply nested');
    }
    return {
      kind: 'sequence',
      items: node.items.map((item) => {
        if (!item || !isNode(item)) throw new Error('Front matter has an empty sequence item');
        return walk(item, state, collectionDepth + 1);
      })
    };
  }

  if (isMap(node)) {
    if (collectionDepth > MAX_COLLECTION_DEPTH) {
      throw new Error('Front matter is too deeply nested');
    }
    return {
      kind: 'mapping',
      entries: node.items.map((pair) => mapEntry(pair.key, pair.value, state, collectionDepth))
    };
  }

  throw new Error('Front matter has an unsupported node');
}

function isNode(value: unknown): value is Node {
  return isAlias(value) || isMap(value) || isScalar(value) || isSeq(value);
}

function mapEntry(
  key: unknown,
  value: unknown,
  state: WalkState,
  collectionDepth: number
): FrontMatterEntry {
  if (!key || !isScalar(key) || typeof key.value !== 'string') {
    throw new Error('Front matter keys must be strings');
  }
  if (key.value === '<<') throw new Error('Front matter merge keys are not allowed');
  const keyValue = walk(key, state, collectionDepth);
  if (keyValue.kind !== 'scalar' || typeof keyValue.value !== 'string') {
    throw new Error('Front matter keys must be strings');
  }
  if (value === null) return { key: keyValue.value, value: { kind: 'scalar', value: null } };
  if (!isNode(value)) throw new Error('Front matter has an unsupported value');
  return { key: keyValue.value, value: walk(value, state, collectionDepth + 1) };
}

function tagsFrom(entries: FrontMatterEntry[]): FrontMatterScalar[] {
  const tags = entries.find((entry) => entry.key === 'tags')?.value;
  if (!tags || tags.kind !== 'sequence') return [];
  return tags.items
    .filter((item): item is { kind: 'scalar'; value: FrontMatterScalar } => item.kind === 'scalar')
    .slice(0, 3)
    .map((item) => item.value);
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function truncateByBytes(
  source: string,
  maximum: number
): { prefix: string; omittedCharacters: number } {
  let bytes = 0;
  let end = 0;
  for (const character of source) {
    const size = byteLength(character);
    if (bytes + size > maximum) break;
    bytes += size;
    end += character.length;
  }
  return { prefix: source.slice(0, end), omittedCharacters: Array.from(source.slice(end)).length };
}
