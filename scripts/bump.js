#!/usr/bin/env node
/**
 * scripts/bump.js
 * Synchronizes version across package.json, index.html, and sw.js
 *
 * Usage:
 *   node scripts/bump.js              # bumps patch (e.g. 1.2.0 -> 1.2.1)
 *   node scripts/bump.js patch        # bumps patch
 *   node scripts/bump.js minor        # bumps minor (e.g. 1.2.0 -> 1.3.0)
 *   node scripts/bump.js major        # bumps major (e.g. 1.2.0 -> 2.0.0)
 *   node scripts/bump.js 1.3.0        # sets specific version
 *   node scripts/bump.js --current    # prints current version
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const pkgPath = path.join(ROOT_DIR, 'package.json');
const indexPath = path.join(ROOT_DIR, 'index.html');
const swPath = path.join(ROOT_DIR, 'sw.js');

export function computeNextVersion(current, typeOrVersion = 'patch') {
  const cleanInput = String(typeOrVersion).trim().toLowerCase();

  if (cleanInput === 'current' || cleanInput === 'same' || cleanInput === '--no-bump') {
    return current.replace(/^v/, '');
  }

  // If explicit version like "1.3.0" or "v1.3.0"
  if (/^v?\d+\.\d+\.\d+$/.test(cleanInput)) {
    return cleanInput.replace(/^v/, '');
  }

  const semverMatch = current.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!semverMatch) {
    throw new Error(`Current version "${current}" is not valid semver (X.Y.Z)`);
  }

  let major = parseInt(semverMatch[1], 10);
  let minor = parseInt(semverMatch[2], 10);
  let patch = parseInt(semverMatch[3], 10);

  if (cleanInput === 'patch') {
    patch += 1;
  } else if (cleanInput === 'minor') {
    minor += 1;
    patch = 0;
  } else if (cleanInput === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else {
    throw new Error(`Unknown bump type: "${typeOrVersion}". Use patch, minor, major, or explicit X.Y.Z`);
  }

  return `${major}.${minor}.${patch}`;
}

export function syncFiles(newVersion) {
  // 1. package.json
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // 2. index.html
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  indexHtml = indexHtml.replace(
    /(<span class="brand-version">)[^<]*(<\/span>)/,
    `$1v${newVersion}$2`
  );
  indexHtml = indexHtml.replace(
    /(<link rel="stylesheet" href="style\.css\?v=)[^"]*(")/,
    `$1${newVersion}$2`
  );
  fs.writeFileSync(indexPath, indexHtml, 'utf8');

  // 3. sw.js
  let swJs = fs.readFileSync(swPath, 'utf8');
  swJs = swJs.replace(
    /(const CACHE_NAME = ')[^']*(';)/,
    `$1kiwikifu-v${newVersion}$2`
  );
  fs.writeFileSync(swPath, swJs, 'utf8');

  return newVersion;
}

// Execute CLI only when invoked directly
if (process.argv[1] === __filename) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const current = pkg.version || '1.2.0';
  const arg = process.argv[2] || 'patch';

  if (arg === '--current' || arg === '-v') {
    console.log(current);
    process.exit(0);
  }

  const nextVersion = computeNextVersion(current, arg);
  syncFiles(nextVersion);
  console.log(nextVersion);
}
