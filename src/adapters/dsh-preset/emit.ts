import YAML from 'yaml';
import type { RoleSpec } from './types.js';
import { TOOL_CATALOG } from './tools.js';

/** 一条 DSH preset 声明（对应 @deepseek-ai/dsh-agent-preset 的一行）。 */
export interface PresetRow {
  id: string;
  name: string;
  config?: Record<string, unknown>;
}

const GENERATED_HEADER = [
  '# GENERATED FILE — do not edit.',
  '# 由 subagent-composer 从 roles/ 与 roster.ts 派生；改动请落在源码后重新 build。',
  '',
].join('\n');

function toolRows(spec: RoleSpec): PresetRow[] {
  return spec.tools.map((key) => {
    const row = TOOL_CATALOG[key];
    const presetRow: PresetRow = { id: row.id, name: row.name };
    // 只读角色：fs 行关掉 write / edit，纪律之外再加一道机械约束。
    if (key === 'fs' && spec.readOnly === true) {
      presetRow.config = { ...row.config, write: false, edit: false };
      return presetRow;
    }
    if (row.config) presetRow.config = row.config;
    return presetRow;
  });
}

/** 角色 → preset 声明。persona 与工具面都从这里投影出去。 */
export function rolePreset(spec: RoleSpec): PresetRow {
  return {
    id: `preset-${spec.id}`,
    name: '@deepseek-ai/dsh-agent-preset',
    config: {
      id: spec.id,
      name: spec.name,
      description: spec.when,
      order: spec.order,
      plugins: [
        { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: spec.persona } },
        ...toolRows(spec),
      ],
    },
  };
}

/**
 * 把一堆 preset 声明渲染成 bundle patch 文件（顶层数组 + 一条 insert）。
 * 注意：YAML 是字节级产物，persona 会以块标量写回，回读结果与 spec.persona 一致。
 */
export function emitPatch(rows: PresetRow[]): string {
  const doc = new YAML.Document([{ insert: rows }] as unknown[]);
  doc.commentBefore = GENERATED_HEADER;
  return doc.toString({ lineWidth: 0, blockQuote: 'literal' });
}
