import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseDocument } from 'yaml';

const workflowUrl = new URL('../../.github/workflows/release.yml', import.meta.url);
const source = readFileSync(workflowUrl, 'utf8');
const document = parseDocument(source, { uniqueKeys: true });
assert.deepEqual(
  document.errors.map((error) => error.message),
  [],
  'release workflow must be valid YAML with unique keys'
);
const workflow = document.toJS();

function stepNamed(job, name) {
  const step = job.steps.find((candidate) => candidate.name === name);
  assert.ok(step, `${name} step is required`);
  return step;
}

function actionSteps() {
  return Object.values(workflow.jobs).flatMap((job) =>
    job.steps.filter((step) => typeof step.uses === 'string')
  );
}

test('valid YAML workflow verifies pull requests, main pushes, and version tags', () => {
  assert.equal(workflow.name, 'Verify and release');
  assert.deepEqual(workflow.on.pull_request.branches, ['main']);
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.on.push.tags, ['v*.*.*']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.match(workflow.concurrency.group, /github\.ref/);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);

  const verify = workflow.jobs.verify;
  assert.equal(verify['runs-on'], 'macos-latest');
  assert.deepEqual(verify.permissions, { contents: 'read' });
  assert.equal(verify.if, undefined);
  assert.match(stepNamed(verify, 'Install dependencies').run, /pnpm install --frozen-lockfile/);
  assert.match(stepNamed(verify, 'Install Playwright Chromium').run, /playwright install chromium/);
  assert.match(stepNamed(verify, 'Verify repository').run, /pnpm verify/);

  const preflight = stepNamed(verify, 'Preflight release tag');
  assert.match(preflight.if, /refs\/tags\//);
  assert.match(preflight.run, /refs\/remotes\/origin\/main/);
  assert.match(preflight.run, /pnpm release:preflight/);
});

test('release mutation is tag-only and permission-scoped behind verification', () => {
  const prepare = workflow.jobs['prepare-release'];
  const build = workflow.jobs['build-release'];
  const publish = workflow.jobs['publish-release'];

  for (const job of [prepare, build, publish]) {
    assert.match(job.if, /refs\/tags\//);
    assert.deepEqual(job.permissions, { contents: 'write' });
  }
  assert.equal(prepare.needs, 'verify');
  assert.deepEqual(build.needs, ['verify', 'prepare-release']);
  assert.deepEqual(publish.needs, ['verify', 'prepare-release', 'build-release']);

  const signingIndex = prepare.steps.findIndex((step) => step.name === 'Select Apple signing mode');
  const releaseIndex = prepare.steps.findIndex(
    (step) => step.name === 'Create or reuse draft release'
  );
  assert.ok(signingIndex >= 0 && releaseIndex > signingIndex);
  const releaseScript = prepare.steps[releaseIndex].with.script;
  assert.match(releaseScript, /draft:\s*true/);
  assert.match(releaseScript, /generate_release_notes:\s*true/);
  assert.match(releaseScript, /listReleases/);
  assert.match(releaseScript, /existing\.draft/);

  const publishScript = stepNamed(publish, 'Validate assets and publish release').with.script;
  assert.match(publishScript, /listReleaseAssets/);
  assert.match(publishScript, /\.dmg/);
  assert.match(publishScript, /\.AppImage/);
  assert.match(publishScript, /-setup\.exe/);
  assert.match(publishScript, /draft:\s*false/);
});

test('build matrix contains only the three agreed fail-fast-false bundles', () => {
  const build = workflow.jobs['build-release'];
  assert.equal(build.strategy['fail-fast'], false);
  assert.deepEqual(build.strategy.matrix.include, [
    {
      platform: 'macos',
      runner: 'macos-latest',
      target: 'universal-apple-darwin',
      'rust-targets': 'aarch64-apple-darwin,x86_64-apple-darwin',
      bundles: 'dmg'
    },
    {
      platform: 'linux',
      runner: 'ubuntu-22.04',
      target: 'x86_64-unknown-linux-gnu',
      'rust-targets': 'x86_64-unknown-linux-gnu',
      bundles: 'appimage'
    },
    {
      platform: 'windows',
      runner: 'windows-latest',
      target: 'x86_64-pc-windows-msvc',
      'rust-targets': 'x86_64-pc-windows-msvc',
      bundles: 'nsis'
    }
  ]);

  const tauri = stepNamed(build, 'Build and upload release asset');
  assert.match(tauri.uses, /^tauri-apps\/tauri-action@[0-9a-f]{40}$/);
  assert.equal(tauri.with.args, '--target ${{ matrix.target }} --bundles ${{ matrix.bundles }}');
  assert.equal(tauri.with.uploadUpdaterJson, false);
  assert.equal(tauri.with.uploadUpdaterSignatures, false);
  assert.match(tauri.with.releaseId, /prepare-release\.outputs\.release-id/);

  const linux = stepNamed(build, 'Install Linux bundle dependencies');
  assert.match(linux.if, /matrix\.platform == 'linux'/);
  for (const dependency of [
    'libwebkit2gtk-4.1-dev',
    'libayatana-appindicator3-dev',
    'librsvg2-dev',
    'patchelf',
    'xdg-utils'
  ]) {
    assert.match(linux.run, new RegExp(dependency.replace('.', '\\.')));
  }
});

test('Apple signing handles ad-hoc and Developer ID modes and always cleans up', () => {
  const prepare = workflow.jobs['prepare-release'];
  const signing = stepNamed(prepare, 'Select Apple signing mode');
  for (const name of [
    'APPLE_CERTIFICATE',
    'APPLE_CERTIFICATE_PASSWORD',
    'KEYCHAIN_PASSWORD',
    'APPLE_ID',
    'APPLE_PASSWORD',
    'APPLE_TEAM_ID'
  ]) {
    assert.equal(signing.env[name], `\${{ secrets.${name} }}`);
  }
  assert.match(signing.run, /signing-mode\.mjs/);

  const build = workflow.jobs['build-release'];
  assert.match(stepNamed(build, 'Configure ad-hoc signing').if, /signing-mode == 'adhoc'/);
  assert.match(stepNamed(build, 'Configure ad-hoc signing').run, /APPLE_SIGNING_IDENTITY=-/);

  const certificate = stepNamed(build, 'Import Developer ID certificate');
  assert.match(certificate.if, /signing-mode == 'developer-id'/);
  assert.match(certificate.run, /security create-keychain/);
  assert.match(certificate.run, /security import/);
  assert.match(certificate.run, /Developer ID Application/);

  const cleanup = stepNamed(build, 'Clean temporary signing material');
  assert.match(cleanup.if, /always\(\)/);
  assert.match(cleanup.run, /security delete-keychain/);
  assert.match(cleanup.run, /apple-certificate\.p12/);
});

test('toolchains, package install, caches, and every action are pinned contracts', () => {
  const verify = workflow.jobs.verify;
  const node = stepNamed(verify, 'Set up Node');
  assert.equal(node.with['node-version-file'], '.node-version');
  assert.match(stepNamed(verify, 'Read Rust toolchain').run, /rust-toolchain\.toml/);
  assert.equal(
    stepNamed(verify, 'Set up Rust').with.toolchain,
    '${{ steps.rust-toolchain.outputs.channel }}'
  );

  const actions = actionSteps();
  assert.ok(actions.length > 0);
  for (const step of actions) {
    assert.match(step.uses, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/, step.uses);
    const escaped = step.uses.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(source, new RegExp(`${escaped}\\s+# [^\\n]+v?\\d`));
  }

  assert.ok(actions.some((step) => step.uses.startsWith('actions/checkout@')));
  assert.ok(actions.some((step) => step.uses.startsWith('actions/setup-node@')));
  assert.ok(
    actions.some((step) => step.uses.startsWith('actions-rust-lang/setup-rust-toolchain@'))
  );
  assert.ok(actions.some((step) => step.uses.startsWith('Swatinem/rust-cache@')));
  assert.ok(actions.some((step) => step.uses.startsWith('tauri-apps/tauri-action@')));
  assert.ok(actions.some((step) => step.uses.startsWith('actions/github-script@')));
});
