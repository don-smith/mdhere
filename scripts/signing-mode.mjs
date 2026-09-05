#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export const APPLE_SIGNING_SECRET_NAMES = [
  'APPLE_CERTIFICATE',
  'APPLE_CERTIFICATE_PASSWORD',
  'KEYCHAIN_PASSWORD',
  'APPLE_ID',
  'APPLE_PASSWORD',
  'APPLE_TEAM_ID'
];

export function selectAppleSigningMode(environment = process.env) {
  const missing = APPLE_SIGNING_SECRET_NAMES.filter((name) => !environment[name]);

  if (missing.length === APPLE_SIGNING_SECRET_NAMES.length) {
    return { mode: 'adhoc', missing };
  }
  if (missing.length === 0) {
    return { mode: 'developer-id', missing };
  }

  throw new Error(`Apple signing secrets are partially configured; missing: ${missing.join(', ')}`);
}

function main() {
  const { mode } = selectAppleSigningMode();
  process.stdout.write(`mode=${mode}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`signing-mode: ${error.message}`);
    process.exitCode = 1;
  }
}
