import type { ToolKey } from './types.js';

/** 一个 DSH 工具行。id 在 preset 内唯一即可。 */
export interface ToolRow {
  id: string;
  name: string;
  config?: Record<string, unknown>;
}

/**
 * 能力键 → DSH 工具行。加新能力只改这里和 ToolKey。
 * 名字对应 @deepseek-ai 的 tool 插件；read/write/edit 都由 tool-fs 提供。
 */
export const TOOL_CATALOG: Record<ToolKey, ToolRow> = {
  fs: { id: 'tools-fs', name: '@deepseek-ai/dsh-tool-fs' },
  'fs-search': {
    id: 'tools-fs-search',
    name: '@deepseek-ai/dsh-tool-fs-search',
    config: { sampleOverCapGlobResults: false },
  },
  web: { id: 'tools-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true } },
  bash: { id: 'tools-bash', name: '@deepseek-ai/dsh-tool-bash' },
  skill: { id: 'tools-skill', name: '@deepseek-ai/dsh-tool-skill' },
  // allowParallelInProgress 是必填项、无默认值：调度者会并发派工，故为 true。
  todo: {
    id: 'tools-todo',
    name: '@deepseek-ai/dsh-tool-todo',
    config: { allowParallelInProgress: true },
  },
  'ask-user': { id: 'tools-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
};
