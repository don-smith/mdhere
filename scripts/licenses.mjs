#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ALLOWED_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MIT',
  'MPL-2.0',
  'PSF-2.0',
  'Unicode-3.0',
  'Unlicense',
  'Zlib'
]);
const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = join(ROOT, 'THIRD_PARTY_LICENSES.md');
const FONT_ROOT = join(ROOT, 'src', 'assets', 'fonts');
const REQUIRED_FONTS = new Map([
  ['SourceSans3VF-Italic.woff2', { family: 'Source Sans 3', style: 'italic', revision: '3.052R' }],
  ['SourceSans3VF-Upright.woff2', { family: 'Source Sans 3', style: 'normal', revision: '3.052R' }],
  [
    'SourceSerif4Variable-Italic.woff2',
    { family: 'Source Serif 4', style: 'italic', revision: '4.005R' }
  ],
  [
    'SourceSerif4Variable-Roman.woff2',
    { family: 'Source Serif 4', style: 'normal', revision: '4.005R' }
  ]
]);
// khroma 2.1.0 publishes an MIT LICENSE file but omits license metadata from package.json.
const NPM_LICENSE_OVERRIDES = new Map([['khroma@2.1.0', 'MIT']]);

function command(command, arguments_) {
  return execFileSync(command, arguments_, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
}

function tokens(expression) {
  // Older Cargo packages commonly use `/` for SPDX's alternative-license `OR`.
  const normalized = expression.replaceAll('/', ' OR ');
  const values = normalized.match(/\(|\)|AND|OR|WITH|[A-Za-z0-9.+-]+/g) ?? [];
  if (values.join('') !== normalized.replace(/\s+/g, '')) {
    throw new Error(`Unsupported SPDX expression: ${expression}`);
  }
  return values;
}

function isAllowed(expression) {
  if (!expression) throw new Error('Missing SPDX license expression');
  const values = tokens(expression);
  let position = 0;

  function primary() {
    const token = values[position++];
    if (token === '(') {
      const result = orExpression();
      if (values[position++] !== ')') throw new Error(`Invalid SPDX expression: ${expression}`);
      return result;
    }
    if (!token || token === ')' || token === 'AND' || token === 'OR' || token === 'WITH') {
      throw new Error(`Invalid SPDX expression: ${expression}`);
    }
    if (values[position] === 'WITH') {
      position += 1;
      const exception = values[position++];
      if (!exception || exception === ')' || exception === 'AND' || exception === 'OR') {
        throw new Error(`Invalid SPDX expression: ${expression}`);
      }
      return false;
    }
    return ALLOWED_LICENSES.has(token);
  }

  function andExpression() {
    let result = primary();
    while (values[position] === 'AND') {
      position += 1;
      const right = primary();
      result = result && right;
    }
    return result;
  }

  function orExpression() {
    let result = andExpression();
    while (values[position] === 'OR') {
      position += 1;
      const right = andExpression();
      result = result || right;
    }
    return result;
  }

  const result = orExpression();
  if (position !== values.length) throw new Error(`Invalid SPDX expression: ${expression}`);
  return result;
}

function javascriptPackages() {
  const groups = JSON.parse(command('pnpm', ['licenses', 'list', '--prod', '--json']));
  return Object.values(groups)
    .flat()
    .flatMap((entry) =>
      entry.versions.map((version) => ({
        ecosystem: 'npm',
        name: entry.name,
        version,
        license: NPM_LICENSE_OVERRIDES.get(`${entry.name}@${version}`) ?? entry.license
      }))
    );
}

function rustPackages() {
  const architecture = { arm64: 'aarch64', x64: 'x86_64' }[process.arch] ?? process.arch;
  const metadata = JSON.parse(
    command('cargo', [
      'metadata',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      '--format-version',
      '1',
      '--filter-platform',
      `${architecture}-apple-darwin`
    ])
  );
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const root = metadata.packages.find((pkg) => pkg.name === 'mdhere' && pkg.source === null);
  if (!root || !metadata.resolve) throw new Error('Could not identify the mdhere Cargo package');

  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const reachable = new Set([root.id]);
  const pending = [root.id];
  while (pending.length > 0) {
    const id = pending.pop();
    const node = nodes.get(id);
    if (!node) continue;
    for (const dependency of node.deps) {
      if (!dependency.dep_kinds.some((kind) => kind.kind === null)) continue;
      if (!reachable.has(dependency.pkg)) {
        reachable.add(dependency.pkg);
        pending.push(dependency.pkg);
      }
    }
  }

  return [...reachable]
    .filter((id) => id !== root.id)
    .map((id) => packages.get(id))
    .filter((pkg) => pkg?.source !== null)
    .map((pkg) => ({
      ecosystem: 'Cargo',
      name: pkg.name,
      version: pkg.version,
      license: pkg.license
    }));
}

function sha256(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function fontInventory() {
  const inventoryPath = join(FONT_ROOT, 'inventory.json');
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.fonts)) {
    throw new Error(`${inventoryPath} must contain schemaVersion 1 and a fonts array`);
  }
  if (inventory.fonts.length !== REQUIRED_FONTS.size) {
    throw new Error(`Expected ${REQUIRED_FONTS.size} vendored font files`);
  }

  const seen = new Set();
  for (const font of inventory.fonts) {
    const expected = REQUIRED_FONTS.get(font.file);
    if (!expected || seen.has(font.file))
      throw new Error(`Unexpected font inventory file: ${font.file}`);
    seen.add(font.file);
    for (const field of ['family', 'style', 'revision']) {
      if (font[field] !== expected[field]) {
        throw new Error(`${font.file} has stale ${field} metadata`);
      }
    }
    if (font.weight !== '200 900' || font.license !== 'OFL-1.1') {
      throw new Error(`${font.file} must declare variable weight 200 900 and OFL-1.1`);
    }
    for (const field of ['repository', 'release', 'sourceArchive', 'sourcePath', 'copyright']) {
      if (typeof font[field] !== 'string' || !font[field].trim()) {
        throw new Error(`${font.file} is missing ${field}`);
      }
    }
    const fontPath = join(FONT_ROOT, font.file);
    const licensePath = join(FONT_ROOT, font.licenseFile);
    if (sha256(fontPath) !== font.sha256) throw new Error(`${font.file} checksum is stale`);
    if (sha256(licensePath) !== font.licenseSha256) {
      throw new Error(`${font.licenseFile} checksum is stale`);
    }
    const notice = readFileSync(licensePath, 'utf8');
    if (
      !notice.startsWith(font.copyright) ||
      !notice.includes('SIL OPEN FONT LICENSE Version 1.1')
    ) {
      throw new Error(`${font.licenseFile} is missing its exact copyright or OFL-1.1 notice`);
    }
  }
  return inventory.fonts;
}

function inventory() {
  const packages = [...javascriptPackages(), ...rustPackages()];
  const unique = new Map();
  for (const pkg of packages) {
    if (!isAllowed(pkg.license)) {
      throw new Error(
        `Disallowed SPDX license for ${pkg.ecosystem}:${pkg.name}@${pkg.version}: ${pkg.license}`
      );
    }
    unique.set(`${pkg.ecosystem}\u0000${pkg.name}\u0000${pkg.version}`, pkg);
  }
  return [...unique.values()].sort((left, right) =>
    [left.name, left.version, left.ecosystem]
      .join('\u0000')
      .localeCompare([right.name, right.version, right.ecosystem].join('\u0000'))
  );
}

function markdown(packages, fonts) {
  const headings = ['Ecosystem', 'Package', 'Version', 'SPDX license'];
  const rows = packages.map(({ ecosystem, name, version, license }) => [
    ecosystem,
    name,
    version,
    license
  ]);
  const widths = headings.map((heading, index) =>
    Math.max(heading.length, ...rows.map((row) => row[index].length))
  );
  const tableRow = (row) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`;
  return [
    '# Third-party licenses',
    '',
    'Generated by `pnpm licenses:write`; do not edit by hand.',
    '',
    'This inventory contains production npm packages and normal (non-dev) Cargo dependencies. Every SPDX expression satisfies the repository allowlist.',
    '',
    tableRow(headings),
    tableRow(widths.map((width) => '-'.repeat(width))),
    ...rows.map(tableRow),
    '',
    '## Bundled font software',
    '',
    'The application includes the following unmodified Adobe variable fonts under OFL-1.1. Exact upstream copyright and license notices are distributed in the application bundle under `Contents/Resources/licenses/fonts/`.',
    '',
    '| Family | Style | Revision | File | SHA-256 | Upstream release |',
    '| ------ | ----- | -------- | ---- | ------- | ---------------- |',
    ...fonts.map(
      (font) =>
        `| ${font.family} | ${font.style} | ${font.revision} | \`${font.file}\` | \`${font.sha256.replace('sha256:', '')}\` | [Adobe release](${font.release}) |`
    ),
    '',
    ...[...new Map(fonts.map((font) => [font.family, font])).values()].flatMap((font) => [
      `### ${font.family}`,
      '',
      font.copyright,
      '',
      `License: OFL-1.1. Exact notice: \`${font.licenseFile}\` (SHA-256 \`${font.licenseSha256.replace('sha256:', '')}\`).`,
      ''
    ])
  ].join('\n');
}

const mode = process.argv[2];
if (mode !== '--write' && mode !== '--check') {
  console.error('usage: node scripts/licenses.mjs --write|--check');
  process.exitCode = 64;
} else {
  try {
    const content = markdown(inventory(), fontInventory());
    if (mode === '--write') {
      writeFileSync(OUTPUT, content);
    } else if (readFileSync(OUTPUT, 'utf8') !== content) {
      throw new Error('THIRD_PARTY_LICENSES.md is stale; run pnpm licenses:write');
    }
  } catch (error) {
    console.error(`licenses: ${error.message}`);
    process.exitCode = 1;
  }
}
