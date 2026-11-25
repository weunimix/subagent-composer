import { compileRoster } from '../core/roster.js';
import { renderTask, type Json } from '../core/render-task.js';
import { objectSchema, toJsonSchema } from '../core/schema.js';
import type { RoleSpec } from '../core/types.js';

/**
 * cordis 插件：给导演装一排「按角色定制」的委派工具。
 *
 * @deprecated 0.2.0 起弃用，0.3.0 移除。派工走 workflow 路径：
 * `toAgentCall` / `toAgentCallTemplate`（见 docs/dsh-workflow-adapter.md）。
 * 保留一个兼容周期的原因只有一个：已经挂在 preset 里的老会话不至于当场断掉。
 * 但不要在新代码里依赖它——它还带着一个形状缺陷（prompt/parent 放在嵌套
 * `request` 里，而 seam 契约是平铺的），已在 docs/delegate-vs-workflow.md
 * 记录在案；要复活这条路径，第一步是把调用改平，而不是加参数。
 *
 * 为什么当初不用内置 subagent：它的 `agent_preset` 只是一个可省略的枚举参数，
 * 模型一旦省略，子级就静默继承父级 preset —— 身份没了，父级也看不出来。
 * 这里的每个工具把 `agentPreset` 写死成角色 id，模型没有省略的余地。
 *
 * 依赖：`tools` 与 `subagents` 都在 inject 里声明（cordis 的 ctx 代理会拒绝
 * 访问未声明的服务名）。`subagents` 来自宿主，和内置 tool-subagent 同源，
 * preset 组装时可见——之前那次 `never started` 是入口指错（main 指向非插件）。
 */
export const name = 'subagent-composer';
export const inject = ['tools', 'subagents'];

/** 工具名：标识符友好。 */
export function toolNameOf(spec: RoleSpec): string {
  return `delegate_${spec.id.replace(/-/g, '_')}`;
}

interface SubagentService {
  startActivation(request: Json): Promise<{ childId: string }>;
}

/**
 * 取 subagents 服务。cordis 的 ctx 是 Proxy：属性名必须在 inject 里声明过，
 * 否则抛 `cannot get property "subagents" without inject`；ctx.get 则是
 * 无 inject 校验的 store 查找，留作兜底。
 */
function subagentServiceOf(ctx: Json): SubagentService {
  const declared = ctx['subagents'];
  if (declared !== undefined && declared !== null) return declared as SubagentService;
  const get = ctx['get'];
  if (typeof get === 'function') {
    const viaGet = (get as (this: Json, name: string) => unknown).call(ctx, 'subagents');
    if (viaGet !== undefined && viaGet !== null) return viaGet as SubagentService;
  }
  throw new Error('delegate: subagents service is unavailable in this preset scope');
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
      `把任务派给「${spec.name}」（独立上下文，看不到本次对话）。触发条件：${spec.when}` +
      `\n调用后立刻返回子会话 id，完成时你会收到通知。` +
      `\n任务字段：${Object.entries(spec.task)
        .map(([field, def]) => `${field}（${def.type}${def.required === true ? '，必填' : ''}）`)
        .join('、')}。`,
    parameters,
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
    async execute(args: Record<string, unknown>, exec: Json): Promise<{ subagentId: string }> {
      const parent = exec['agent'];
      if (parent === undefined || parent === null) {
        throw new Error('delegate tool requires a calling agent (exec.agent was undefined)');
      }
      const subagents = subagentServiceOf(ctx);
      const activation = await subagents.startActivation({
        provider: 'spawn',
        label: spec.name,
        request: {
          prompt: [{ type: 'text', text: renderTask(spec, args) }],
          parent,
          agentPreset: spec.id,
          // 交付字段下沉到子会话：子级会拿到 structured_output 工具，
          // 结果以 JSON 进结算通知，而不是一段散文。
          outputSchema: toJsonSchema(spec.output),
        },
        signal: exec['signal'],
        delivery: 'parent',
      });
      return { subagentId: activation.childId };
    },
  });
}

let deprecatedNotified = false;

/**
 * 弃用提示只打一次：这个插件是按 preset 挂载的，挂多了会把日志刷满。
 * 提示里给出替代路径与移除版本，别只写「已弃用」。
 */
function notifyDeprecated(): void {
  if (deprecatedNotified) return;
  deprecatedNotified = true;
  console.warn(
    '[subagent-composer] delegate_* 工具已弃用（0.2.0），将在 0.3.0 移除；' +
      '派工请改用 workflow 路径（toAgentCall / toAgentCallTemplate），' +
      '见 docs/delegate-vs-workflow.md。',
  );
}

/** cordis 入口：preset 挂上本插件后，roster 里的每个角色得到一个工具。 */
export function apply(ctx: Json): void {
  notifyDeprecated();
  for (const spec of compileRoster()) registerRole(ctx, spec);
}
