import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { directorPreset } from './adapters/dsh-preset/director.js';
import { emitPatch, rolePreset } from './adapters/dsh-preset/emit.js';
import type { RoleSpec } from './core/types.js';
import { compileRoster } from './core/roster.js';

/**
 * 编译入口：roles/ → dist/。
 *
 * dist/cordis.patch.yml 是装载期事实（bundle patch）。
 * dist/roles.json 是给人看的结构快照；运行期 schema 由编译产物现算，不读这个文件。
 * 两者来自同一次 compile，不允许各自手写。
 */
const OUT_DIR = join(process.cwd(), 'dist');

async function main(): Promise<void> {
  const specs = compileRoster();
  const rows = [...specs.map(rolePreset), directorPreset(specs.map((s) => s.id))];

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'cordis.patch.yml'), emitPatch(rows), 'utf8');
  await writeFile(join(OUT_DIR, 'roles.json'), JSON.stringify(specs, null, 2) + '\n', 'utf8');

  console.log(`subagent-composer: ${specs.length} role(s) + 1 director → dist/`);
  for (const spec of specs) {
    console.log(`  ${spec.id.padEnd(20)} ${spec.name}  [${spec.tools.join(', ')}]`);
  }
}

main().catch((error: unknown) => {
  console.error('build failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
