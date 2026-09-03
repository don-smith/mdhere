#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

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

function verifyBundle(path) {
  if (!path.endsWith('.app') || !existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`Expected a macOS .app bundle: ${path}`);
  }
  const plist = readFileSync(join(path, 'Contents', 'Info.plist'), 'utf8');
  if (plistValue(plist, 'CFBundleIdentifier') !== 'dev.mdhere.app') {
    throw new Error('Bundle identifier must be dev.mdhere.app');
  }
  if (plistValue(plist, 'LSMinimumSystemVersion') !== '13.0') {
    throw new Error('Bundle minimum macOS version must be 13.0');
  }
  if (plistValue(plist, 'CFBundleExecutable') !== 'mdhere') {
    throw new Error('Bundle executable must be mdhere');
  }
  requiredFile(join(path, 'Contents', 'MacOS', 'mdhere'));
  for (const theme of ['mdhere-light', 'mdhere-dark']) {
    requiredFile(join(path, 'Contents', 'Resources', 'themes', theme, 'theme.json'));
    requiredFile(join(path, 'Contents', 'Resources', 'themes', theme, 'reader.css'));
  }
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
