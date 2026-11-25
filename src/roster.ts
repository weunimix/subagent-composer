import type { RoleSpec } from './kernel/types.js';
import { assertRoster, assertSpec } from './kernel/validate.js';
import { NovelAuditRole } from './roles/novel-audit.role.js';
import { RetrievalReaderRole } from './roles/retrieval-reader.role.js';
import { RetrievalVerifierRole } from './roles/retrieval-verifier.role.js';
import { RetrievalSynthesizerRole } from './roles/retrieval-synthesizer.role.js';

/**
 * 角色登记表：编译范围由这里唯一决定。
 * 新增角色 = 加一个 roles/*.role.ts + 在这里登记，不加其它配置。
 */
export const ROLE_CLASSES = [
  NovelAuditRole,
  RetrievalReaderRole,
  RetrievalVerifierRole,
  RetrievalSynthesizerRole,
] as const;

export function compileRoster(): RoleSpec[] {
  const specs = ROLE_CLASSES.map((Role) => new Role().compile());
  assertRoster(specs);
  for (const spec of specs) assertSpec(spec);
  return specs;
}
