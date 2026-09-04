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

function maskCommentsAndStrings(css) {
  let masked = '';
  let index = 0;

  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      const end = css.indexOf('*/', index + 2);
      const comment = css.slice(index, end === -1 ? css.length : end + 2);
      masked += comment.replace(/[^\n\r]/g, ' ');
      index += comment.length;
      continue;
    }

    const quote = css[index];
    if (quote === '"' || quote === "'") {
      let end = index + 1;
      while (end < css.length) {
        if (css[end] === '\\') {
          end += 2;
        } else if (css[end++] === quote) {
          break;
        }
      }
      masked += css.slice(index, end).replace(/[^\n\r]/g, ' ');
      index = end;
      continue;
    }

    masked += css[index++];
  }

  return masked;
}

function findBlockEnd(css, start, end) {
  let depth = 1;
  for (let index = start + 1; index < end; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}' && --depth === 0) return index;
  }
  return -1;
}

function topLevelSegments(css) {
  const segments = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;

  for (let index = 0; index < css.length; index += 1) {
    if (css[index] === '(') parentheses += 1;
    if (css[index] === ')') parentheses = Math.max(0, parentheses - 1);
    if (css[index] === '[') brackets += 1;
    if (css[index] === ']') brackets = Math.max(0, brackets - 1);
    if (css[index] === ';' && parentheses === 0 && brackets === 0) {
      segments.push(css.slice(start, index));
      start = index + 1;
    }
  }

  segments.push(css.slice(start));
  return segments;
}

function declaredCustomProperties(ruleBody) {
  return topLevelSegments(ruleBody).flatMap((segment) => {
    const match = segment.trim().match(/^(--[a-zA-Z0-9-]+)\s*:/);
    return match ? [match[1]] : [];
  });
}

function selectorDefines(selector, requiredSelector) {
  if (requiredSelector === ':host') {
    return /(^|[^:\w-]):host(?![\w-])/.test(selector);
  }

  const className = requiredSelector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${className}(?![\\w-])`).test(selector);
}

function parsedContractEntries(css) {
  const source = maskCommentsAndStrings(css);
  const selectors = new Set();
  const variables = new Set();

  function parseRules(start, end) {
    let segmentStart = start;
    let index = start;
    let parentheses = 0;
    let brackets = 0;

    while (index < end) {
      const character = source[index];
      if (character === '(') parentheses += 1;
      if (character === ')') parentheses = Math.max(0, parentheses - 1);
      if (character === '[') brackets += 1;
      if (character === ']') brackets = Math.max(0, brackets - 1);

      if (character === ';' && parentheses === 0 && brackets === 0) {
        segmentStart = index + 1;
      } else if (character === '{' && parentheses === 0 && brackets === 0) {
        const header = source.slice(segmentStart, index).trim();
        const blockEnd = findBlockEnd(source, index, end);
        if (blockEnd === -1) return;
        const body = source.slice(index + 1, blockEnd);

        if (header.startsWith('@')) {
          parseRules(index + 1, blockEnd);
        } else if (header) {
          for (const requiredSelector of readerSelectors) {
            if (selectorDefines(header, requiredSelector)) selectors.add(requiredSelector);
          }
          for (const property of declaredCustomProperties(body)) variables.add(property);
        }

        segmentStart = blockEnd + 1;
        index = blockEnd;
      }
      index += 1;
    }
  }

  parseRules(0, source.length);
  return { selectors, variables };
}

export function missingReaderContract(css) {
  const { selectors, variables } = parsedContractEntries(css);
  return [
    ...readerSelectors.filter((selector) => !selectors.has(selector)),
    ...shikiVariables.filter((variable) => !variables.has(variable))
  ];
}

export function missingReaderDocumentation(source) {
  return [...readerSelectors, ...shikiVariables].filter((entry) => !source.includes(entry));
}
