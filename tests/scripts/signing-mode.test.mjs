import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { APPLE_SIGNING_SECRET_NAMES, selectAppleSigningMode } from '../../scripts/signing-mode.mjs';

function appleEnvironment(overrides = {}) {
  return Object.fromEntries(
    APPLE_SIGNING_SECRET_NAMES.map((name) => [name, overrides[name] ?? ''])
  );
}

test('selects ad-hoc signing when every Apple secret is absent', () => {
  assert.deepEqual(selectAppleSigningMode(appleEnvironment()), {
    mode: 'adhoc',
    missing: APPLE_SIGNING_SECRET_NAMES
  });
});

test('selects Developer ID signing only when every Apple secret is present', () => {
  const environment = appleEnvironment(
    Object.fromEntries(APPLE_SIGNING_SECRET_NAMES.map((name) => [name, `configured-${name}`]))
  );

  assert.deepEqual(selectAppleSigningMode(environment), {
    mode: 'developer-id',
    missing: []
  });
});

test('rejects partial Apple configuration by naming only missing secrets', () => {
  const configuredValue = 'private-certificate-material';
  const environment = appleEnvironment({
    APPLE_CERTIFICATE: configuredValue,
    APPLE_CERTIFICATE_PASSWORD: 'private-password'
  });

  assert.throws(
    () => selectAppleSigningMode(environment),
    (error) => {
      assert.match(error.message, /Apple signing secrets are partially configured/);
      for (const missing of APPLE_SIGNING_SECRET_NAMES.slice(2)) {
        assert.match(error.message, new RegExp(missing));
      }
      assert.doesNotMatch(error.message, /private-certificate-material|private-password/);
      return true;
    }
  );
});

test('CLI emits a GitHub output without exposing configured values', () => {
  const environment = {
    ...process.env,
    ...appleEnvironment(
      Object.fromEntries(APPLE_SIGNING_SECRET_NAMES.map((name) => [name, `secret-${name}`]))
    )
  };
  const result = spawnSync(process.execPath, ['scripts/signing-mode.mjs'], {
    cwd: new URL('../..', import.meta.url),
    env: environment,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'mode=developer-id\n');
  assert.equal(result.stderr, '');
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-/);
});
