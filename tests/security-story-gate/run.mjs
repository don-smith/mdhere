import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const prototype = join(
  homedir(),
  '.myflow/repositories/github.com/don-smith/myflow/story-PROTOTYPE'
);
const defaultVerify = join(
  homedir(),
  '.myflow/repositories/github.com/don-smith/mdhere/workstreams/html-story-pages/verify'
);
const app = join(repo, 'src-tauri/target/release/bundle/macos/mdhere.app');
const binary = join(app, 'Contents/MacOS/mdhere');

export function adaptPrototype(script) {
  const defaultVariant =
    "let current = keys.includes(params.get('variant')) ? params.get('variant') : keys[0];";
  const queryUpdate = `if (push) {
      const p = new URLSearchParams(location.search);
      p.set('variant', key);
      try { history.replaceState(null, '', '?' + p.toString()); }
      catch { location.search = '?' + p.toString(); }
    }`;
  if (!script.includes(defaultVariant) || !script.includes(queryUpdate)) {
    throw new Error('Prototype switcher changed; cannot safely adapt disposable copy');
  }
  return script
    .replace(defaultVariant, "let current = 'D';")
    .replace(
      queryUpdate,
      '// The disposable mdhere copy switches variants without query navigation.'
    );
}

export function preparePrototype(library) {
  for (const file of ['myflow.html', 'story.css', 'prototype.js']) {
    if (!existsSync(join(prototype, file))) throw new Error(`Local prototype missing: ${file}`);
  }
  const directory = join(library, 'prototype');
  mkdirSync(directory);
  copyFileSync(join(prototype, 'myflow.html'), join(directory, 'myflow.html'));
  copyFileSync(join(prototype, 'story.css'), join(directory, 'story.css'));
  writeFileSync(
    join(directory, 'prototype.js'),
    adaptPrototype(readFileSync(join(prototype, 'prototype.js'), 'utf8'))
  );
  return directory;
}

export function assessEvidence(sinkRows, observations) {
  const successfulIpc = /HIGH-LEVEL READ DOCUMENT RESULT|LOW-LEVEL IPC CALLBACK 8142/.test(
    observations ?? ''
  );
  const requests = sinkRows.filter((line) => line.trim()).length;
  const navigationChecks =
    observations?.split('\n').filter((line) => line.includes('self-navigation-outcome:')) ?? [];
  const changedNavigation = navigationChecks.some((line) => line.includes('CHANGED URL'));
  const originObserved =
    observations?.includes('effective-window-origin: null') &&
    observations.includes('opaque-origin-storage: SecurityError');
  return {
    disposition:
      requests > 0 || successfulIpc || changedNavigation
        ? 'FAIL — STOP AND RETURN TO DESIGN'
        : 'INCONCLUSIVE — developer physical gate still required',
    outboundRequestsReceived: requests,
    nativeCommandSuccessObserved: successfulIpc,
    ipcCallback: observations?.includes('low-level-ipc-post: submitted')
      ? 'Raw IPC posted; no successful callback captured is NOT proof of denial'
      : 'UNKNOWN: raw IPC attempt/callback not captured',
    effectiveFrameOrigin: originObserved
      ? 'JS observed self.origin=null and localStorage SecurityError in the packaged frame'
      : 'UNKNOWN: need effective self.origin and storage denial from packaged frame',
    selfNavigation:
      navigationChecks.length === 5 && !changedNavigation
        ? 'JS remained in the frame with the same URL after each of five attempts; native callback not directly observed'
        : `UNKNOWN or failed: ${navigationChecks.length}/5 post-attempt checks captured`,
    actualResponseHeaders: 'UNKNOWN: inspect packaged WKWebView response, not Rust expectations'
  };
}

function runningApps() {
  const result = spawnSync('pgrep', ['-x', 'mdhere'], { encoding: 'utf8' });
  if (result.status === 1) return [];
  if (result.status !== 0)
    throw new Error(`Could not check existing mdhere processes: ${result.stderr}`);
  return result.stdout.trim().split(/\s+/).filter(Boolean);
}

function command(executable, args, log) {
  console.log(`Running ${executable} ${args.join(' ')} (log: ${log})`);
  const result = spawnSync(executable, args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  writeFileSync(log, `${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.status !== 0)
    throw new Error(`${executable} failed (${result.status ?? result.error}); see ${log}`);
}

export async function startSink(session, port = 8765) {
  const sinkLog = join(session, 'requests.jsonl');
  writeFileSync(sinkLog, '');
  const logFd = openSync(join(session, 'sink.log'), 'a');
  const sink = spawn(process.execPath, [join(here, 'sink.mjs'), sinkLog], {
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, MDHERE_GATE_SINK_PORT: String(port) }
  });
  closeSync(logFd);
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((done) => setTimeout(done, 100));
      if (sink.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/control`, {
          signal: AbortSignal.timeout(500)
        });
        ready = response.ok;
        if (ready) break;
      } catch {
        /* Sink may not have bound yet. */
      }
    }
    if (!ready || sink.exitCode !== null)
      throw new Error(`Sink did not start on 127.0.0.1:${port}; see sink.log (port occupied?)`);
    // Control request proves the sink can receive traffic; remove it before the app starts.
    const control = readFileSync(sinkLog, 'utf8');
    if (!control.includes('"path":"/control"'))
      throw new Error('Sink control request was not logged');
    writeFileSync(join(session, 'sink-control.jsonl'), control);
    writeFileSync(sinkLog, '');
    writeFileSync(join(session, 'sink.pid'), `${sink.pid}\n`);
    return { sink, sinkLog };
  } catch (error) {
    sink.kill('SIGTERM');
    throw error;
  }
}

function clipboard(runId) {
  const paste = spawnSync('pbpaste', [], { encoding: 'utf8' });
  const text = paste.status === 0 ? paste.stdout : '';
  return text.includes(`mdhere-story-gate: ${runId}`) ? text : null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'Usage: node tests/security-story-gate/run.mjs [--dry-run] [--output ABSOLUTE_DIRECTORY]'
    );
    return;
  }
  const dryRun = args.includes('--dry-run');
  const outputIndex = args.indexOf('--output');
  if (
    args.some((arg, i) => !['--dry-run', '--output'].includes(arg) && i !== outputIndex + 1) ||
    (outputIndex >= 0 && !args[outputIndex + 1]?.startsWith('/'))
  ) {
    throw new Error('Only --dry-run and --output ABSOLUTE_DIRECTORY are accepted');
  }
  const verify = outputIndex >= 0 ? args[outputIndex + 1] : defaultVerify;
  if (process.platform !== 'darwin' && !dryRun)
    throw new Error('Packaged security gate requires macOS');
  const previous = runningApps();
  if (previous.length && !dryRun)
    throw new Error(
      `Existing mdhere PID(s): ${previous.join(', ')}. Quit them yourself, then rerun. No process was killed or redirected.`
    );
  const session = join(
    verify,
    `phase-2-gate-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  );
  mkdirSync(session, { recursive: true });
  const runId = randomUUID();
  const prep = spawnSync('bash', [join(here, 'prepare.sh')], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: session }
  });
  if (prep.status !== 0) throw new Error(`Fixture preparation failed: ${prep.stderr}`);
  const root = prep.stdout.match(/^fixture root: (.+)$/m)?.[1];
  if (!root || !root.startsWith(session))
    throw new Error('Fixture path did not resolve under session');
  const gateScript = join(root, 'story.js');
  writeFileSync(gateScript, readFileSync(gateScript, 'utf8').replace('__GATE_RUN_ID__', runId));
  const prototypeDirectory = preparePrototype(root);
  const metadata = {
    runId,
    session,
    fixtureRoot: root,
    prototypeCopy: prototypeDirectory,
    prototypeSource: prototype,
    app,
    startedAt: new Date().toISOString(),
    dryRun
  };
  writeFileSync(join(session, 'setup.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  if (dryRun) {
    console.log(
      `Dry run prepared ${session}; no build, sink or app started. Prototype copy defaults to D; source unchanged.`
    );
    return;
  }
  let sink;
  let launched;
  let sinkLog;
  const abort = new AbortController();
  process.on('SIGINT', () => abort.abort());
  try {
    command('pnpm', ['tauri', 'build', '--bundles', 'app'], join(session, 'build.log'));
    command('pnpm', ['verify:bundle', '--', app], join(session, 'bundle.log'));
    metadata.bundleSha256 = createHash('sha256').update(readFileSync(binary)).digest('hex');
    metadata.macOS = spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim();
    const lock = readFileSync(join(repo, 'src-tauri/Cargo.lock'), 'utf8');
    metadata.runtime = Object.fromEntries(
      ['tauri', 'wry'].map((name) => [
        name,
        lock.match(new RegExp(`^name = "${name}"\\nversion = "([^"]+)"`, 'm'))?.[1] ?? 'UNKNOWN'
      ])
    );
    if (runningApps().length)
      throw new Error('An mdhere process started during build; refusing to launch another');
    ({ sink, sinkLog } = await startSink(session));
    // Pinned Tauri logs its *expected live invoke key* to stderr when an invalid
    // low-level IPC message arrives. Never persist that diagnostic in evidence.
    writeFileSync(
      join(session, 'app.log'),
      'App stderr suppressed: Tauri can print a live invoke key on invalid IPC.\n'
    );
    const appLogFd = openSync(join(session, 'app.log'), 'a');
    launched = spawn(binary, [root, 'Story.html'], { stdio: ['ignore', appLogFd, 'ignore'] });
    closeSync(appLogFd);
    launched.unref();
    metadata.appPid = launched.pid;
    metadata.sinkPid = sink.pid;
    writeFileSync(join(session, 'setup.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    await new Promise((done) => setTimeout(done, 1200));
    if (launched.exitCode !== null)
      throw new Error(`Packaged app exited (${launched.exitCode}); see app.log`);
    console.log(`\nOne app window opened. Evidence: ${session}`);
    console.log(
      '1. In Story.html, click "Run security attempts". Wait ~3 seconds; local script/image/animation should work, escapes and navigation should not.'
    );
    console.log(
      '2. Click "Copy observations"; then choose prototype/myflow.html in the tree and check variant D, JS/CSS and layout.'
    );
    console.log(
      '3. Return here and press Enter. If the app leaves its story, a native command succeeds, or outbound traffic appears, stop and report failure.'
    );
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      await rl.question('Press Enter when done (Ctrl-C records partial evidence): ', {
        signal: abort.signal
      });
    } finally {
      rl.close();
    }
    const observations = clipboard(runId);
    if (observations) writeFileSync(join(session, 'observations.txt'), observations);
    const rows = readFileSync(sinkLog, 'utf8').split('\n');
    const assessment = assessEvidence(rows, observations);
    const report = {
      ...metadata,
      completedAt: new Date().toISOString(),
      ...assessment,
      observationCapture: observations
        ? 'copied from fixture with matching run ID'
        : 'UNKNOWN: no matching fixture clipboard; inspect app visually',
      visualAssessment: 'UNKNOWN: developer must explicitly confirm',
      prototype: 'UNKNOWN unless developer observed variant D and assets',
      appStillRunning: launched.exitCode === null
    };
    writeFileSync(join(session, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      `\n${assessment.disposition}\nRequests received: ${assessment.outboundRequestsReceived}; IPC: ${assessment.ipcCallback}; origin: ${assessment.effectiveFrameOrigin}; self-navigation: ${assessment.selfNavigation}; actual response headers: UNKNOWN.`
    );
    console.log(
      `Report: ${join(session, 'report.json')} | Sink: ${sinkLog} | App log: ${join(session, 'app.log')}`
    );
    if (!observations)
      console.log(
        'Observations not captured. Do not infer IPC denial; repeat Copy observations and use physical Web Inspector if needed.'
      );
    if (assessment.disposition.startsWith('FAIL')) {
      process.exitCode = 2;
      console.log(
        'STOP: native success, unauthorized outbound request, or direct frame navigation — return to Design.'
      );
    }
    console.log(
      'No automatic PASS. Developer must inspect actual response headers and command results before confirming the physical gate.'
    );
    if (launched.exitCode === null)
      console.log(
        `Packaged app PID ${launched.pid} remains open; quit it when finished (do not kill another session).`
      );
  } finally {
    if (sink) sink.kill('SIGTERM');
    if (!existsSync(join(session, 'report.json'))) {
      writeFileSync(
        join(session, 'report.json'),
        `${JSON.stringify(
          {
            ...metadata,
            disposition: 'BLOCKED/INCOMPLETE',
            actualResponseHeaders: 'UNKNOWN',
            ipcCallback: 'UNKNOWN',
            error: 'Launcher interrupted or failed; see logs'
          },
          null,
          2
        )}\n`
      );
      console.log(`Incomplete evidence: ${session}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Gate setup blocked: ${error.message}`);
    process.exitCode = 1;
  });
}
