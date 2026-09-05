import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  isSemanticVersion,
  prepareVersion,
  preflightTag,
  releaseBuilds
} from '../../scripts/version.mjs';

function fixtureFiles(version = '0.1.0') {
  return new Map([
    [
      '/repo/package.json',
      `${JSON.stringify({ name: 'mdhere', version, private: true }, null, 2)}\n`
    ],
    [
      '/repo/src-tauri/Cargo.toml',
      `[package]\nname = "mdhere"\nversion = "${version}"\ndescription = "fixture"\n\n[dependencies]\nserde = "1"\n`
    ],
    [
      '/repo/src-tauri/Cargo.lock',
      `version = 4\n\n[[package]]\nname = "mdhere"\nversion = "${version}"\ndependencies = [\n "serde",\n]\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n`
    ]
  ]);
}

function memoryFs(files) {
  const writes = [];
  return {
    writes,
    readFile(path) {
      const source = files.get(path);
      if (source === undefined) throw new Error(`missing fixture ${path}`);
      return source;
    },
    writeFile(path, source) {
      writes.push(path);
      files.set(path, source);
    }
  };
}

test('accepts canonical semantic versions', () => {
  for (const version of ['0.1.0', '1.0.0', '12.34.56', '2.0.0-rc.1', '2.0.0+build.7']) {
    assert.equal(isSemanticVersion(version), true, version);
  }
});

test('rejects incomplete or non-canonical semantic versions', () => {
  for (const version of ['v1.2.3', '1.2', '01.2.3', '1.02.3', '1.2.03', '1.2.3 ', '1.2.3-']) {
    assert.equal(isSemanticVersion(version), false, version);
  }
});

test('prepares package, Cargo manifest, and Cargo lock metadata together', () => {
  const files = fixtureFiles();
  const fs = memoryFs(files);

  const result = prepareVersion('1.4.0', { root: '/repo', fs });

  assert.deepEqual(result.changedFiles, [
    'package.json',
    'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock'
  ]);
  assert.equal(JSON.parse(files.get('/repo/package.json')).version, '1.4.0');
  assert.match(files.get('/repo/src-tauri/Cargo.toml'), /name = "mdhere"\nversion = "1\.4\.0"/);
  assert.match(files.get('/repo/src-tauri/Cargo.lock'), /name = "mdhere"\nversion = "1\.4\.0"/);
  assert.equal(fs.writes.length, 3);
});

test('dry-run reports metadata changes without writing', () => {
  const files = fixtureFiles();
  const fs = memoryFs(files);

  const result = prepareVersion('1.4.0', { root: '/repo', fs, dryRun: true });

  assert.equal(result.dryRun, true);
  assert.equal(result.version, '1.4.0');
  assert.equal(fs.writes.length, 0);
  assert.equal(JSON.parse(files.get('/repo/package.json')).version, '0.1.0');
});

test('preflight rejects a tag that does not exactly match package metadata', () => {
  const fs = memoryFs(fixtureFiles('1.2.3'));
  assert.throws(
    () => preflightTag('refs/tags/v1.2.4', { root: '/repo', fs, runGit: () => assert.fail() }),
    /tag refs\/tags\/v1\.2\.4 does not match package version 1\.2\.3/
  );
});

test('preflight rejects inconsistent Cargo metadata before invoking git', () => {
  const files = fixtureFiles('1.2.3');
  files.set('/repo/src-tauri/Cargo.toml', '[package]\nname = "mdhere"\nversion = "1.2.2"\n');
  const fs = memoryFs(files);

  assert.throws(
    () => preflightTag('refs/tags/v1.2.3', { root: '/repo', fs, runGit: () => assert.fail() }),
    /Cargo package version 1\.2\.2 does not match package version 1\.2\.3/
  );
});

test('preflight resolves the tag and requires its commit in origin/main', () => {
  const fs = memoryFs(fixtureFiles('1.2.3'));
  const calls = [];
  const runGit = (arguments_) => {
    calls.push(arguments_);
    if (arguments_[0] === 'rev-list') return { status: 0, stdout: 'abc123\n', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };

  assert.deepEqual(preflightTag('refs/tags/v1.2.3', { root: '/repo', fs, runGit }), {
    version: '1.2.3',
    tagRef: 'refs/tags/v1.2.3',
    commit: 'abc123'
  });
  assert.deepEqual(calls, [
    ['rev-list', '-n', '1', 'refs/tags/v1.2.3'],
    ['merge-base', '--is-ancestor', 'abc123', 'origin/main']
  ]);
});

test('preflight reports a tagged commit outside origin/main', () => {
  const fs = memoryFs(fixtureFiles('1.2.3'));
  const runGit = (arguments_) =>
    arguments_[0] === 'rev-list'
      ? { status: 0, stdout: 'def456\n', stderr: '' }
      : { status: 1, stdout: '', stderr: '' };

  assert.throws(
    () => preflightTag('refs/tags/v1.2.3', { root: '/repo', fs, runGit }),
    /tagged commit def456 is not contained in origin\/main/
  );
});

test('CLI accepts pnpm argument separators for a dry run', () => {
  const root = new URL('../..', import.meta.url);
  const version = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version;
  const output = execFileSync(
    process.execPath,
    ['scripts/version.mjs', 'prepare', '--', version, '--dry-run'],
    { cwd: root, encoding: 'utf8' }
  );
  assert.match(output, new RegExp(`Version metadata is already ${version.replaceAll('.', '\\.')}`));
});

test('release build contract names only the agreed platform bundles', () => {
  assert.deepEqual(releaseBuilds('1.2.3'), [
    {
      platform: 'macos',
      target: 'universal-apple-darwin',
      bundle: 'dmg',
      artifact: 'mdhere_1.2.3_universal.dmg'
    },
    {
      platform: 'linux',
      target: 'x86_64-unknown-linux-gnu',
      bundle: 'appimage',
      artifact: 'mdhere_1.2.3_amd64.AppImage'
    },
    {
      platform: 'windows',
      target: 'x86_64-pc-windows-msvc',
      bundle: 'nsis',
      artifact: 'mdhere_1.2.3_x64-setup.exe'
    }
  ]);
});
