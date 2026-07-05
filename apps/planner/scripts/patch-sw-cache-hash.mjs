import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function resolveBuildId() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

const swPath = resolve('build/sw.js');
if (!existsSync(swPath)) {
  console.warn(`patch-sw-cache-hash: ${swPath} not found — skipping`);
  process.exit(0);
}

const buildId = resolveBuildId();
const content = readFileSync(swPath, 'utf8').replaceAll('__BUILD_ID__', buildId);
writeFileSync(swPath, content);
