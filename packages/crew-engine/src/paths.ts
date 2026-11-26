import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedRepoRoot: string | null = null;

export function findRepoRoot(): string {
  if (cachedRepoRoot) return cachedRepoRoot;
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = resolve(start);
    for (let i = 0; i < 6; i += 1) {
      const pkgPath = join(/*turbopackIgnore: true*/ dir, 'package.json');
      if (existsSync(/*turbopackIgnore: true*/ pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(/*turbopackIgnore: true*/ pkgPath, 'utf8')) as {
            name?: string;
          };
          if (pkg.name === 'aislaves') {
            cachedRepoRoot = dir;
            return dir;
          }
        } catch {
          // continue walking up
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  cachedRepoRoot = process.cwd();
  return cachedRepoRoot;
}

function isServerlessOrReadOnly(candidateRoot: string): boolean {
  if (
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL ||
    process.env.LAMBDA_TASK_ROOT
  ) {
    return true;
  }
  try {
    accessSync(/*turbopackIgnore: true*/ candidateRoot, constants.W_OK);
    return false;
  } catch {
    return true;
  }
}

export function getLocalDataDir(overrideDir?: string): string {
  if (overrideDir) return overrideDir;
  if (process.env.AISLAVES_DATA_DIR) return process.env.AISLAVES_DATA_DIR;
  const root = findRepoRoot();
  if (isServerlessOrReadOnly(root)) {
    return join(/*turbopackIgnore: true*/ tmpdir(), 'aislaves-local');
  }
  return join(/*turbopackIgnore: true*/ root, '.aislaves-local');
}
