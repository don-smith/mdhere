import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import test from 'node:test';

import { chromium } from '@playwright/test';

import { adaptPrototype, assessEvidence, startSink } from './run.mjs';

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function dryRun(output, extra = []) {
  return spawnSync(
    process.execPath,
    [join(import.meta.dirname, 'run.mjs'), '--dry-run', '--output', output, ...extra],
    { encoding: 'utf8' }
  );
}

test('default dry run prepares only committed fixture with no external prototype or app process', () => {
  const output = mkdtempSync(join(tmpdir(), 'mdhere-gate-test-'));
  try {
    const run = dryRun(output);
    assert.equal(run.status, 0, run.stderr);
    const sessions = readdirSync(output);
    assert.equal(sessions.length, 1);
    const session = join(output, sessions[0]);
    const {
      fixtureRoot,
      dryRun: dry,
      prototypeCopy
    } = JSON.parse(readFileSync(join(session, 'setup.json'), 'utf8'));
    assert.equal(dry, true);
    assert.equal(prototypeCopy, null);
    assert.equal(readdirSync(fixtureRoot).includes('prototype'), false);
    assert.equal(
      hash(join(fixtureRoot, 'Story.html')),
      hash(join(import.meta.dirname, 'Story.html'))
    );
    assert.match(readFileSync(join(fixtureRoot, 'story.js'), 'utf8'), /mdhere-story-gate/);
    assert.equal(
      readdirSync(session).some((name) => name === 'sink.pid' || name === 'app.log'),
      false
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('explicit optional prototype is adapted without changing source', () => {
  const output = mkdtempSync(join(tmpdir(), 'mdhere-gate-prototype-'));
  const source = mkdtempSync(join(tmpdir(), 'mdhere-optional-prototype-'));
  try {
    writeFileSync(join(source, 'myflow.html'), '<title>Optional</title>');
    writeFileSync(join(source, 'story.css'), 'body { color: red }');
    writeFileSync(
      join(source, 'prototype.js'),
      `let current = keys.includes(params.get('variant')) ? params.get('variant') : keys[0];\nif (push) {
      const p = new URLSearchParams(location.search);
      p.set('variant', key);
      try { history.replaceState(null, '', '?' + p.toString()); }
      catch { location.search = '?' + p.toString(); }
    }`
    );
    const original = hash(join(source, 'prototype.js'));
    const run = dryRun(output, ['--prototype', source]);
    assert.equal(run.status, 0, run.stderr);
    const session = join(output, readdirSync(output)[0]);
    const { fixtureRoot, prototypeCopy } = JSON.parse(
      readFileSync(join(session, 'setup.json'), 'utf8')
    );
    assert.equal(prototypeCopy, join(fixtureRoot, 'prototype'));
    assert.match(readFileSync(join(prototypeCopy, 'prototype.js'), 'utf8'), /let current = 'D'/);
    assert.equal(hash(join(source, 'prototype.js')), original);
    assert.notEqual(dryRun(output, ['--prototype', join(output, 'missing')]).status, 0);
  } finally {
    rmSync(output, { recursive: true, force: true });
    rmSync(source, { recursive: true, force: true });
  }
});

test('sink startup checks control, clears it, logs a denied request and cleans up owned PID', async () => {
  const output = mkdtempSync(join(tmpdir(), 'mdhere-sink-test-'));
  const reservation = createServer();
  await new Promise((done) => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  let sink;
  try {
    const started = await startSink(output, port);
    sink = started.sink;
    assert.equal(readFileSync(started.sinkLog, 'utf8'), '');
    assert.match(readFileSync(join(output, 'sink-control.jsonl'), 'utf8'), /"path":"\/control"/);
    assert.equal(readFileSync(join(output, 'sink.pid'), 'utf8').trim(), String(sink.pid));
    const response = await fetch(`http://127.0.0.1:${port}/unauthorized`);
    assert.equal(response.status, 200);
    assert.match(readFileSync(started.sinkLog, 'utf8'), /"path":"\/unauthorized"/);
    assert.equal(
      assessEvidence(readFileSync(started.sinkLog, 'utf8').split('\n'), null)
        .outboundRequestsReceived,
      1
    );
  } finally {
    if (sink) {
      sink.kill('SIGTERM');
      await new Promise((done) => sink.once('exit', done));
    }
    rmSync(output, { recursive: true, force: true });
  }
});

test('committed fixture loads local stylesheet and script in Chromium without a prototype', async () => {
  const output = mkdtempSync(join(tmpdir(), 'mdhere-prototype-browser-'));
  let browser;
  try {
    const run = spawnSync(
      process.execPath,
      [join(import.meta.dirname, 'run.mjs'), '--dry-run', '--output', output],
      { encoding: 'utf8' }
    );
    assert.equal(run.status, 0, run.stderr);
    const session = join(output, readdirSync(output)[0]);
    const { fixtureRoot } = JSON.parse(readFileSync(join(session, 'setup.json'), 'utf8'));
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`file://${join(fixtureRoot, 'Story.html')}`);
    assert.match(await page.title(), /Packaged story security gate/);
    assert.equal(await page.locator('#local-image').isVisible(), true);
    assert.equal(
      await page.evaluate(() =>
        [...document.styleSheets].some((sheet) => sheet.href?.endsWith('/story.css'))
      ),
      true
    );
    assert.match(await page.locator('#results').textContent(), /script: local classic JS ran/);
  } finally {
    if (browser) await browser.close();
    rmSync(output, { recursive: true, force: true });
  }
});

test('gate launcher does not persist packaged Tauri stderr containing live invoke keys', () => {
  const launcher = readFileSync(join(import.meta.dirname, 'run.mjs'), 'utf8');
  assert.match(
    launcher,
    /spawn\(binary, \[root, 'Story\.html'\], \{ stdio: \['ignore', appLogFd, 'ignore'\] \}\)/
  );
});

test('adaptation fails closed if the prototype switcher changes', () => {
  assert.throws(() => adaptPrototype('not the pinned switcher'), /changed/);
});

test('report distinguishes received requests/native success from inconclusive evidence', () => {
  assert.match(assessEvidence([], null).disposition, /INCONCLUSIVE/);
  assert.match(assessEvidence(['{"path":"/fetch"}'], null).disposition, /FAIL/);
  assert.match(assessEvidence([], 'LOW-LEVEL IPC CALLBACK 8142: known.md').disposition, /FAIL/);
  assert.match(assessEvidence([], 'HIGH-LEVEL READ DOCUMENT RESULT: known.md').disposition, /FAIL/);
  assert.match(assessEvidence([], 'low-level-ipc-post: submitted').ipcCallback, /NOT proof/);
  assert.match(assessEvidence([], null).actualResponseHeaders, /UNKNOWN/);
  assert.match(assessEvidence([], null).selfNavigation, /UNKNOWN/);
  assert.match(
    assessEvidence([], 'location-origin (URL, not security origin): mdhere-story://localhost')
      .effectiveFrameOrigin,
    /UNKNOWN/
  );
  const outcomes = [
    'effective-window-origin: null',
    'opaque-origin-storage: SecurityError',
    ...Array.from(
      { length: 5 },
      (_, index) => `self-navigation-outcome: target${index}: same URL, frame alive`
    )
  ].join('\n');
  assert.match(assessEvidence([], outcomes).effectiveFrameOrigin, /self.origin=null/);
  assert.match(assessEvidence([], outcomes).selfNavigation, /five attempts/);
  assert.match(
    assessEvidence([], `${outcomes}\nself-navigation-outcome: target: CHANGED URL`).disposition,
    /FAIL/
  );
});
