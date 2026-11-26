import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedRepoRoot: string | null = null;

export function findRepoRoot(): string {
  if (cachedRepoRoot) return cachedRepoRoot;
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let dir = resolve(start);
    for (let i = 0; i < 8; i += 1) {
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
          if (pkg.name === 'aislaves') {
            cachedRepoRoot = dir;
            return dir;
          }
        } catch {
          // ignore malformed package.json while walking up
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

export function getLocalDataDir(overrideDir?: string): string {
  if (overrideDir) return overrideDir;
  if (process.env.AISLAVES_DATA_DIR) return process.env.AISLAVES_DATA_DIR;
  return join(findRepoRoot(), '.aislaves-local');
}
