import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { emitPatch, rolePreset } from './adapters/dsh-preset/emit.js';
import { compileRoster } from './core/roster.js';

/**
 * 编译入口：roles/ → dist/cordis.patch.yml。
 *
 * 唯一的产物是装载期事实（bundle patch）。运行期没有本包的代码：
 * 要读角色清单直接看 `src/core/roster.ts`，或在 node 里调 `compileRoster()`。
 */
const OUT_DIR = join(process.cwd(), 'dist');

async function main(): Promise<void> {
  const specs = compileRoster();
  const rows = specs.map(rolePreset);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'cordis.patch.yml'), emitPatch(rows), 'utf8');

  console.log(`subagent-composer: ${specs.length} role(s) → dist/cordis.patch.yml`);
  for (const spec of specs) {
    console.log(`  ${spec.id.padEnd(20)} ${spec.name}  [${spec.tools.join(', ')}]`);
  }
}

main().catch((error: unknown) => {
  console.error('build failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
