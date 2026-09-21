import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

// Pick the first available port at or after 4173 so the browser suite never
// collides with unrelated local servers (vite runs with --strictPort so it
// fails loudly rather than drifting to a port Playwright is not watching).
//
// Playwright evaluates this config more than once, and later evaluations can
// run after the webServer has already bound the port. A fresh probe in each
// evaluation would therefore disagree about the port, so the first evaluation
// records its choice in a short-lived cache file that later ones reuse.
const PORT_CACHE = join(process.cwd(), 'node_modules', '.cache', 'playwright-port');
const PORT_CACHE_TTL_MS = 60_000;

function readCachedPort(): number | null {
  try {
    if (Date.now() - statSync(PORT_CACHE).mtimeMs > PORT_CACHE_TTL_MS) return null;
    const port = Number(readFileSync(PORT_CACHE, 'utf8').trim());
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function recordPort(port: number): void {
  try {
    mkdirSync(dirname(PORT_CACHE), { recursive: true });
    writeFileSync(PORT_CACHE, String(port));
  } catch {
    // A missing cache only costs an extra probe on the next evaluation.
  }
}

// The probe runs in a child process and writes the port with
// process.stdout.write: console.log would colorize the number in some
// contexts, and parsing ANSI-wrapped text yields NaN.
function probePort(): number {
  const script =
    'const net=require("node:net");' +
    'let p=Number(process.argv[1]);' +
    'const next=()=>{const s=net.createServer();' +
    's.once("error",()=>{p+=1;next();});' +
    's.once("listening",()=>s.close(()=>process.stdout.write(String(p))));' +
    's.listen(p,"127.0.0.1");};next();';
  const result = spawnSync(process.execPath, ['-e', script, String(4173)], {
    encoding: 'utf8',
    timeout: 10_000
  });
  const port = Number(result.stdout.trim());
  return Number.isInteger(port) && port > 0 ? port : 4173;
}

const port =
  readCachedPort() ??
  (() => {
    const probed = probePort();
    recordPort(probed);
    return probed;
  })();

export default defineConfig({
  testDir: './tests/browser',
  use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `vite --mode test --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`
  }
});
