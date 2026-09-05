#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMANTIC_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const metadataPaths = ['package.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'];
const defaultFs = {
  readFile: (path) => readFileSync(path, 'utf8'),
  writeFile: (path, source) => writeFileSync(path, source)
};

export function isSemanticVersion(version) {
  return typeof version === 'string' && SEMANTIC_VERSION.test(version);
}

function requireSemanticVersion(version) {
  if (!isSemanticVersion(version)) {
    throw new Error(`invalid semantic version: ${JSON.stringify(version)}`);
  }
  return version;
}

function packageVersion(source) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    throw new Error(`package.json is not valid JSON: ${error.message}`, { cause: error });
  }
  if (manifest.name !== 'mdhere') throw new Error('package.json must describe mdhere');
  return requireSemanticVersion(manifest.version);
}

function updatePackage(source, version) {
  const manifest = JSON.parse(source);
  manifest.version = version;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function cargoPackageBlock(source, kind) {
  const marker = kind === 'manifest' ? '[package]' : '[[package]]';
  const blocks = source.split(
    new RegExp(`(?=^${marker.replaceAll('[', '\\[').replaceAll(']', '\\]')})`, 'm')
  );
  const index = blocks.findIndex(
    (block) => block.startsWith(marker) && /^name\s*=\s*"mdhere"\s*$/m.test(block)
  );
  if (index === -1) throw new Error(`Cargo ${kind} does not contain the mdhere package`);
  return { blocks, index };
}

function cargoVersion(source, kind) {
  const { blocks, index } = cargoPackageBlock(source, kind);
  const match = blocks[index].match(/^version\s*=\s*"([^"]+)"\s*$/m);
  if (!match) throw new Error(`Cargo ${kind} mdhere package is missing its version`);
  return requireSemanticVersion(match[1]);
}

function updateCargoVersion(source, kind, version) {
  const { blocks, index } = cargoPackageBlock(source, kind);
  if (!/^version\s*=\s*"[^"]+"\s*$/m.test(blocks[index])) {
    throw new Error(`Cargo ${kind} mdhere package is missing its version`);
  }
  blocks[index] = blocks[index].replace(/^version\s*=\s*"[^"]+"\s*$/m, `version = "${version}"`);
  return blocks.join('');
}

function readMetadata(root, fs) {
  return Object.fromEntries(
    metadataPaths.map((relativePath) => [relativePath, fs.readFile(join(root, relativePath))])
  );
}

function assertMetadataVersion(files, expected) {
  const applicationVersion = packageVersion(files['package.json']);
  if (applicationVersion !== expected) {
    throw new Error(`package version ${applicationVersion} does not match ${expected}`);
  }
  const manifestVersion = cargoVersion(files['src-tauri/Cargo.toml'], 'manifest');
  if (manifestVersion !== expected) {
    throw new Error(
      `Cargo package version ${manifestVersion} does not match package version ${expected}`
    );
  }
  const lockVersion = cargoVersion(files['src-tauri/Cargo.lock'], 'lock');
  if (lockVersion !== expected) {
    throw new Error(`Cargo lock version ${lockVersion} does not match package version ${expected}`);
  }
}

export function prepareVersion(version, options = {}) {
  requireSemanticVersion(version);
  const root = resolve(options.root ?? process.cwd());
  const fs = options.fs ?? defaultFs;
  const dryRun = options.dryRun ?? false;
  const current = readMetadata(root, fs);
  const prepared = {
    'package.json': updatePackage(current['package.json'], version),
    'src-tauri/Cargo.toml': updateCargoVersion(
      current['src-tauri/Cargo.toml'],
      'manifest',
      version
    ),
    'src-tauri/Cargo.lock': updateCargoVersion(current['src-tauri/Cargo.lock'], 'lock', version)
  };
  assertMetadataVersion(prepared, version);
  const changedFiles = metadataPaths.filter((path) => prepared[path] !== current[path]);

  if (!dryRun) {
    for (const relativePath of changedFiles) {
      fs.writeFile(join(root, relativePath), prepared[relativePath]);
    }
    assertMetadataVersion(readMetadata(root, fs), version);
  }

  return { version, dryRun, changedFiles };
}

function defaultRunGit(arguments_, options = {}) {
  const result = spawnSync('git', arguments_, {
    cwd: options.cwd,
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

export function preflightTag(tagRef, options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const fs = options.fs ?? defaultFs;
  const runGit = options.runGit ?? ((arguments_) => defaultRunGit(arguments_, { cwd: root }));
  const files = readMetadata(root, fs);
  const version = packageVersion(files['package.json']);

  if (tagRef !== `refs/tags/v${version}`) {
    throw new Error(`tag ${tagRef} does not match package version ${version}`);
  }
  assertMetadataVersion(files, version);

  const resolved = runGit(['rev-list', '-n', '1', tagRef]);
  const commit = resolved.stdout.trim();
  if (resolved.status !== 0 || !commit) {
    throw new Error(
      `unable to resolve ${tagRef}: ${resolved.stderr.trim() || 'unknown git error'}`
    );
  }
  const ancestry = runGit(['merge-base', '--is-ancestor', commit, 'origin/main']);
  if (ancestry.status !== 0) {
    throw new Error(`tagged commit ${commit} is not contained in origin/main`);
  }

  return { version, tagRef, commit };
}

export function releaseBuilds(version) {
  requireSemanticVersion(version);
  return [
    {
      platform: 'macos',
      target: 'universal-apple-darwin',
      bundle: 'dmg',
      artifact: `mdhere_${version}_universal.dmg`
    },
    {
      platform: 'linux',
      target: 'x86_64-unknown-linux-gnu',
      bundle: 'appimage',
      artifact: `mdhere_${version}_amd64.AppImage`
    },
    {
      platform: 'windows',
      target: 'x86_64-pc-windows-msvc',
      bundle: 'nsis',
      artifact: `mdhere_${version}_x64-setup.exe`
    }
  ];
}

function usage() {
  return 'usage: node scripts/version.mjs prepare <version> [--dry-run]\n       node scripts/version.mjs preflight <refs/tags/vX.Y.Z>';
}

function main(arguments_) {
  const [command, ...commandArguments] = arguments_;
  if (commandArguments[0] === '--') commandArguments.shift();
  const [value, ...flags] = commandArguments;
  if (command === 'prepare' && value && flags.every((flag) => flag === '--dry-run')) {
    const result = prepareVersion(value, { dryRun: flags.includes('--dry-run') });
    const action = result.dryRun ? 'Would update' : 'Updated';
    console.log(
      result.changedFiles.length > 0
        ? `${action} ${result.changedFiles.join(', ')} to ${result.version}`
        : `Version metadata is already ${result.version}`
    );
    return;
  }
  if (command === 'preflight' && value && flags.length === 0) {
    const result = preflightTag(value);
    console.log(`Verified ${result.tagRef} at ${result.commit} for version ${result.version}`);
    return;
  }
  throw new Error(usage());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`version: ${error.message}`);
    process.exitCode = 1;
  }
}
