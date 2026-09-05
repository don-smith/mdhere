#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { missingReaderContract } from './reader-theme-contract.mjs';

const root = resolve(import.meta.dirname, '..');
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const bundledThemes = ['mdhere-light', 'mdhere-dark', 'field-notes'];
const shellTokens = [
  'background',
  'panel',
  'surface',
  'raisedSurface',
  'foreground',
  'foregroundStrong',
  'muted',
  'faint',
  'border',
  'borderStrong',
  'accent',
  'accentForeground',
  'accentSoft',
  'hover',
  'selected',
  'focus',
  'danger',
  'warning',
  'overlay'
];

function requiredFile(path) {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Missing file: ${path}`);
}

function plistValue(source, key) {
  const match = source.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  if (!match) throw new Error(`Info.plist is missing ${key}`);
  return match[1];
}

function capabilityFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return capabilityFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  });
}

function verifyCapabilities() {
  const capabilities = capabilityFiles(join(root, 'src-tauri', 'capabilities'));
  if (capabilities.length === 0) throw new Error('No capability files found');
  for (const path of capabilities) {
    const permissions = JSON.parse(readFileSync(path, 'utf8')).permissions;
    if (
      !Array.isArray(permissions) ||
      permissions.length !== 1 ||
      permissions[0] !== 'core:default'
    ) {
      throw new Error(`${path} must grant exactly ["core:default"]`);
    }
  }
}

function verifyThemePackage(directory, expectedId) {
  const manifestPath = join(directory, 'theme.json');
  const cssPath = join(directory, 'reader.css');
  requiredFile(manifestPath);
  requiredFile(cssPath);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${manifestPath} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (manifest.schemaVersion !== 2) {
    throw new Error(`${manifestPath} must use schemaVersion 2`);
  }
  if (manifest.id !== expectedId) {
    throw new Error(`${manifestPath} must have id ${expectedId}`);
  }
  if (!['light', 'dark'].includes(manifest.appearance) || !manifest.name?.trim()) {
    throw new Error(`${manifestPath} must have a name and light or dark appearance`);
  }
  for (const token of shellTokens) {
    const value = manifest.shell?.[token];
    const format = token === 'overlay' ? /^#[0-9a-f]{8}$/i : /^#[0-9a-f]{6}$/i;
    if (typeof value !== 'string' || !format.test(value)) {
      throw new Error(`${manifestPath} has an invalid shell.${token}`);
    }
  }
  const css = readFileSync(cssPath, 'utf8');
  if (!css.trim()) throw new Error(`${cssPath} must not be empty`);
  const missing = missingReaderContract(css);
  if (missing.length > 0) {
    throw new Error(`${cssPath} is missing reader contract entries: ${missing.join(', ')}`);
  }
}

function verifyFontLicenses(path) {
  const source = join(root, 'src', 'assets', 'fonts');
  const bundled = join(path, 'Contents', 'Resources', 'licenses', 'fonts');
  for (const file of ['inventory.json', 'LICENSE-Source-Sans-3.md', 'LICENSE-Source-Serif-4.md']) {
    const sourcePath = join(source, file);
    const bundledPath = join(bundled, file);
    requiredFile(sourcePath);
    requiredFile(bundledPath);
    if (!readFileSync(sourcePath).equals(readFileSync(bundledPath))) {
      throw new Error(`${bundledPath} does not match the checked font notice`);
    }
  }
  const sourceInventory = join(root, 'THIRD_PARTY_LICENSES.md');
  const bundledInventory = join(
    path,
    'Contents',
    'Resources',
    'licenses',
    'THIRD_PARTY_LICENSES.md'
  );
  requiredFile(bundledInventory);
  if (!readFileSync(sourceInventory).equals(readFileSync(bundledInventory))) {
    throw new Error(`${bundledInventory} does not match THIRD_PARTY_LICENSES.md`);
  }
}

function verifyBundle(path) {
  if (basename(path) !== 'mdhere.app' || !existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`Expected a macOS bundle named mdhere.app: ${path}`);
  }
  const plist = readFileSync(join(path, 'Contents', 'Info.plist'), 'utf8');
  if (plistValue(plist, 'CFBundleIdentifier') !== 'dev.mdhere.app') {
    throw new Error('Bundle identifier must be dev.mdhere.app');
  }
  if (plistValue(plist, 'CFBundleName') !== 'mdhere') {
    throw new Error('Bundle name must be mdhere');
  }
  for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
    if (plistValue(plist, key) !== packageVersion) {
      throw new Error(`${key} must match package version ${packageVersion}`);
    }
  }
  if (plistValue(plist, 'LSMinimumSystemVersion') !== '13.0') {
    throw new Error('Bundle minimum macOS version must be 13.0');
  }
  if (plistValue(plist, 'CFBundleExecutable') !== 'mdhere') {
    throw new Error('Bundle executable must be mdhere');
  }
  requiredFile(join(path, 'Contents', 'MacOS', 'mdhere'));
  for (const theme of bundledThemes) {
    verifyThemePackage(join(path, 'Contents', 'Resources', 'themes', theme), theme);
  }
  verifyFontLicenses(path);
}

const arguments_ = process.argv.slice(2);
if (arguments_[0] === '--') arguments_.shift();
if (arguments_.length !== 1) {
  console.error('usage: node scripts/verify-bundle.mjs <path-to-mdhere.app>');
  process.exitCode = 64;
} else {
  try {
    const app = resolve(arguments_[0]);
    verifyCapabilities();
    verifyBundle(app);
    console.log(`Verified ${app}`);
  } catch (error) {
    console.error(`verify-bundle: ${error.message}`);
    process.exitCode = 1;
  }
}
