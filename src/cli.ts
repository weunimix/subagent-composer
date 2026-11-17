import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { directorPreset } from './director.js';
import { emitPatch, rolePreset } from './kernel/emit.js';
import type { RoleSpec } from './kernel/types.js';
import { compileRoster } from './roster.js';

/**
 * 编译入口：roles/ → dist/。
 *
 * dist/roles.json 是运行期事实（delegate 工具据此生成 schema），
 * dist/cordis.patch.yml 是装载期事实（bundle patch）。
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
