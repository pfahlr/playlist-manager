#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const baseRef = process.env.SPEC_BASE_REF ?? 'HEAD';

const result = spawnSync(
  'pnpm',
  ['exec', 'optic', 'diff', 'openapi.yaml', '--base', baseRef, '--check', '--severity', 'error'],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
