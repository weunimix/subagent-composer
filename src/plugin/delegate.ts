import { toJsonSchema } from '../kernel/schema.js';
import type { RoleSpec } from '../kernel/types.js';

/** 导演填写的一张派工单。 */
export interface DelegateRequest {
  role: string;
  task: Record<string, unknown>;
}

/**
 * 派工单的 JSON Schema：按角色判别（oneOf + const role），
 * 让主 agent 在填写时就看到每个角色要求的字段。
 *
 * 这里只生成 schema，不注册工具——工具注册需要 DSH 在 preset scope 内
 * 暴露的 ctx.subagents.startActivation，尚未验证，见 docs/architecture-ssot.md。
 */
export function delegateSchema(specs: RoleSpec[]): Record<string, unknown> {
  return {
    type: 'object',
    oneOf: specs.map((spec) => ({
      type: 'object',
      properties: {
        role: { type: 'string', const: spec.id, description: spec.when },
        task: toJsonSchema(spec.task),
      },
      required: ['role', 'task'],
      additionalProperties: false,
    })),
  };
}

/** 任务字段说明表：给工具 description 用的纯文本（不重复 persona）。 */
export function taskBrief(spec: RoleSpec): string {
  const lines = Object.entries(spec.task).map(
    ([name, field]) => `- ${name}（${field.type}${field.required ? '，必填' : ''}）：${field.desc}`,
  );
  return `${spec.id}：${spec.when}\n${lines.join('\n')}`;
}
