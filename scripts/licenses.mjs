#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
const OUTPUT = resolve(import.meta.dirname, '..', 'THIRD_PARTY_LICENSES.md');
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

function markdown(packages) {
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
    ''
  ].join('\n');
}

const mode = process.argv[2];
if (mode !== '--write' && mode !== '--check') {
  console.error('usage: node scripts/licenses.mjs --write|--check');
  process.exitCode = 64;
} else {
  try {
    const content = markdown(inventory());
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
