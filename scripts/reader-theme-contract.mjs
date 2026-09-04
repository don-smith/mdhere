export const readerSelectors = [
  ':host',
  '.reader-page',
  '.reader-content',
  '.front-matter',
  '.front-matter-summary',
  '.front-matter-fields',
  '.front-matter-field',
  '.front-matter-key',
  '.front-matter-value',
  '.front-matter-map',
  '.front-matter-list',
  '.front-matter-tags',
  '.front-matter-tag',
  '.front-matter-warning',
  '.mdhere-image-unavailable',
  '.shiki',
  '.task-list-item',
  '.contains-task-list'
];

export const shikiVariables = [
  '--shiki-foreground',
  '--shiki-background',
  '--shiki-token-comment',
  '--shiki-token-constant',
  '--shiki-token-string',
  '--shiki-token-string-expression',
  '--shiki-token-keyword',
  '--shiki-token-parameter',
  '--shiki-token-function',
  '--shiki-token-punctuation',
  '--shiki-token-link',
  '--shiki-token-changed',
  '--shiki-token-deleted',
  '--shiki-token-inserted'
];

export function missingReaderContract(css) {
  return [...readerSelectors, ...shikiVariables].filter((entry) => !css.includes(entry));
}
