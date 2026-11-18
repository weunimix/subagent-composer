import { compileRoster } from '../roster.js';
import { toJsonSchema } from '../kernel/schema.js';
import type { FieldSpec, RoleSpec } from '../kernel/types.js';

/**
 * cordis 插件：给导演装一排「按角色定制」的委派工具。
 *
 * 为什么不用内置 subagent：它的 `agent_preset` 只是一个可省略的枚举参数，
 * 模型一旦省略，子级就静默继承父级 preset —— 身份没了，父级也看不出来。
 * 这里的每个工具都把 `agentPreset` 写死成角色 id，模型没有省略的余地。
 *
 * 依赖：`tools` 与 `subagents` 都在 inject 里声明（cordis 的 ctx 代理会拒绝
 * 访问未声明的服务名）。`subagents` 来自宿主，和内置 tool-subagent 同源，
 * preset 组装时可见——之前那次 `never started` 是入口指错（main 指向非插件）。
 */
export const name = 'subagent-composer';
export const inject = ['tools', 'subagents'];

type Json = Record<string, unknown>;

/** 字段声明 → JSON Schema 属性节点。 */
function propertyOf(field: FieldSpec): Json {
  switch (field.type) {
    case 'string':
      return field.values === undefined
        ? { type: 'string', description: field.desc }
        : { type: 'string', enum: field.values, description: field.desc };
    case 'string[]':
      return {
        type: 'array',
        description: field.desc,
        items: field.values === undefined ? { type: 'string' } : { type: 'string', enum: field.values },
      };
    case 'number':
      return { type: 'number', description: field.desc };
    case 'boolean':
      return { type: 'boolean', description: field.desc };
    case 'object[]':
      return { type: 'array', description: field.desc, items: { type: 'object' } };
    default:
      return { type: 'string', description: field.desc };
  }
}

/** 工具名：标识符友好。 */
export function toolNameOf(spec: RoleSpec): string {
  return `delegate_${spec.id.replace(/-/g, '_')}`;
}

/** 派工单正文：只写本次任务，不复述角色纪律。 */
export function renderTask(spec: RoleSpec, args: Record<string, unknown>): string {
  const lines = [`# 任务：${spec.name}`, '', spec.when, '', '## 任务字段', ''];
  for (const [field] of Object.entries(spec.task)) {
    const value = args[field];
    const text = Array.isArray(value) ? value.join('、') : String(value ?? '');
    lines.push(`- ${field}：${text}`);
  }
  const extra = args.extraNotes;
  if (typeof extra === 'string' && extra.trim() !== '') {
    lines.push('', '## 补充说明', '', extra.trim());
  }
  lines.push('', '## 交付', '', '按你的岗位说明要求的字段交付；字段不齐时如实说明缺什么。');
  return lines.join('\n');
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
  const properties: Json = {};
  const required: string[] = [];
  for (const [field, def] of Object.entries(spec.task)) {
    properties[field] = propertyOf(def);
    if (def.required === true) required.push(field);
  }
  properties['extraNotes'] = {
    type: 'string',
    description: '可选：本次任务的额外背景或边界说明。不要复述角色的岗位说明。',
  };

  const tools = ctx['tools'] as { register(definition: Json): unknown };

  tools.register({
    name: toolNameOf(spec),
    description:
      `把任务派给「${spec.name}」（独立上下文，看不到本次对话）。触发条件：${spec.when}` +
      `\n调用后立刻返回子会话 id，完成时你会收到通知。` +
      `\n任务字段：${Object.entries(spec.task)
        .map(([field, def]) => `${field}（${def.type}${def.required === true ? '，必填' : ''}）`)
        .join('、')}。`,
    parameters: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
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

/** cordis 入口：preset 挂上本插件后，roster 里的每个角色得到一个工具。 */
export function apply(ctx: Json): void {
  for (const spec of compileRoster()) registerRole(ctx, spec);
}
