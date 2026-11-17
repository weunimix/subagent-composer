import type { PresetRow } from './kernel/emit.js';

/**
 * 导演 preset：本项目的主会话入口。
 *
 * 它不做具体工作，只把需求翻译成角色要求的字段。
 * 角色清单不在这里手写——由 roster 生成，写进 subagent 工具的 allowedAgentPresets。
 */
export function directorPreset(roleIds: string[]): PresetRow {
  const persona = [
    '你是本项目的调度者。你不亲自执行任务：读懂需求，判断该交给哪个角色，',
    '把任务整理成该角色要求的字段后派工，收到结果后给出结论。',
    '',
    '## 纪律',
    '',
    '- 派工前先补齐字段：缺关键信息就问用户或先读文件，不要用猜测填槽。',
    '- 一次只派一件事，能并行的才并行。',
    '- 任务描述只写本次要做的事，不复述角色的规矩——那是它自己的岗位说明。',
    '- 收到结构化结果后给出结论，不要原样转述 JSON。',
  ].join('\n');

  return {
    id: 'preset-subagent-director',
    name: '@deepseek-ai/dsh-agent-preset',
    config: {
      id: 'subagent-director',
      name: '调度者',
      description: '本项目的主会话入口：理解需求，选择合适的角色并派工。',
      order: 99,
      plugins: [
        { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: persona } },
        { id: 'tools-fs', name: '@deepseek-ai/dsh-tool-fs' },
        { id: 'tools-todo', name: '@deepseek-ai/dsh-tool-todo' },
        { id: 'tools-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
        {
          id: 'subagent',
          name: '@deepseek-ai/dsh-tool-subagent',
          config: { provider: 'spawn', toolName: 'subagent', allowedAgentPresets: roleIds },
        },
      ],
    },
  };
}
