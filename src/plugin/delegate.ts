import { compileRoster } from '../core/roster.js';
import type { Json } from '../core/render-task.js';
import { objectSchema } from '../core/schema.js';
import type { RoleSpec } from '../core/types.js';

/**
 * cordis 插件：给导演装一排「按角色定制」的委派工具。
 *
 * @deprecated 0.2.0 起弃用，0.3.0 移除。派工走 workflow 路径：
 * `toAgentCall` / `toAgentCallTemplate`（见 docs/dsh-workflow-adapter.md）。
 * 保留一个兼容周期的目的只剩「装载不炸」：老 preset 里还写着本插件，删掉会让整个 preset 挂不上。
 * 但不要在新代码里依赖它——它还带着一个形状缺陷（prompt/parent 放在嵌套
 * `request` 里，而 seam 契约是平铺的），已在 docs/delegate-vs-workflow.md
 * 记录在案；要复活这条路径，第一步是把调用改平，而不是加参数。
 *
 * 为什么当初不用内置 subagent：它的 `agent_preset` 只是一个可省略的枚举参数，
 * 模型一旦省略，子级就静默继承父级 preset —— 身份没了，父级也看不出来。
 * 这里的每个工具把 `agentPreset` 写死成角色 id，模型没有省略的余地。
 *
 * 依赖：只需要 `tools`。不再声明 `subagents`——`execute` 恒抛错，留着它等于给
 * 「装载不炸」多加一个硬依赖（cordis 的 inject 是硬依赖，服务缺失整插件不启动）。
 */
export const name = 'subagent-composer';
export const inject = ['tools'];

/** 工具名：标识符友好。 */
export function toolNameOf(spec: RoleSpec): string {
  return `delegate_${spec.id.replace(/-/g, '_')}`;
}

function registerRole(ctx: Json, spec: RoleSpec): void {
  // 入参 schema 与 outputSchema 共用同一段映射，避免三处各写一遍对象节点。
  const parameters = objectSchema({
    ...spec.task,
    extraNotes: {
      type: 'string',
      desc: '可选：本次任务的额外背景或边界说明。不要复述角色的岗位说明。',
    },
  });

  const tools = ctx['tools'] as { register(definition: Json): unknown };

  tools.register({
    name: toolNameOf(spec),
    description:
      `【已弃用 0.2.0，0.3.0 移除】本机不可用：调用会直接报错，请改用 workflow 路径` +
      `（toAgentCall / toAgentCallTemplate + dsh_workflow 脚本）。` +
      `\n把任务派给「${spec.name}」（独立上下文，看不到本次对话）。触发条件：${spec.when}` +
      `\n任务字段：${Object.entries(spec.task)
        .map(([field, def]) => `${field}（${def.type}${def.required === true ? '，必填' : ''}）`)
        .join('、')}。`,
    parameters,
    // output.render 是宿主 `tools.register` 的硬契约（缺了直接 TypeError，整个 preset 装不上），
    // 不是死代码——即使 execute 恒抛错也必须保留。
    output: {
      schema: {
        type: 'object',
        properties: { subagentId: { type: 'string' } },
        required: ['subagentId'],
        additionalProperties: false,
      },
      render: (_args: unknown, value: { subagentId: string }): unknown => [
        { type: 'text', text: `started subagent ${value.subagentId}` },
      ],
    },
    isConcurrencySafe: (): boolean => true,
    async execute(): Promise<never> {
      throw new Error(
        `delegate_${spec.id.replace(/-/g, '_')} 已弃用且在本机不可用：它把 prompt/parent/agentPreset ` +
          `放在嵌套 request 里，而 subagent seam 读的是顶层字段（见 docs/delegate-vs-workflow.md）。` +
          `请改用 workflow 路径：toAgentCall(spec, args) → agent(prompt, options)。`,
      );
    },
  });
}

/** cordis 入口：preset 挂上本插件后，roster 里的每个角色得到一个工具。 */
export function apply(ctx: Json): void {
  for (const spec of compileRoster()) registerRole(ctx, spec);
}
