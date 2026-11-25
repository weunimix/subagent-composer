import { renderTask, type Json } from '../../core/render-task.js';
import { toJsonSchema } from '../../core/schema.js';
import type { RoleSpec } from '../../core/types.js';

/**
 * dsh-workflow 投影：RoleSpec → 脚本里 `agent(prompt, options)` 的入参。
 *
 * 阶段 0 spike 实测（DSH 0.2.2-rc.5）：脚本层只认 label / phase / schema / provider / model，
 * 没有 preset 定向，所以角色人设必须随 prompt 走——子 agent 继承的是父级 preset，
 * 拿不到我们编译出来的 preset-<role>。
 *
 * 这里只做投影：措辞来自 renderPersona 与 renderTask 的既有产物，schema 来自 toJsonSchema。
 * 顺序、等待、重试、失败判定都在调用方脚本里，不在这里。
 */

/** `agent()` 的第二个参数。只放脚本层真正认识的键。 */
export interface WorkflowAgentOptions {
  /** run 事件里显示的名字。 */
  label: string;
  /** 结构化交付的 JSON Schema，object-rooted。 */
  schema: Json;
  phase?: string;
  provider?: string;
  model?: string;
}

/** 一次子 agent 调用的完整入参：脚本里直接 `agent(call.prompt, call.options)`。 */
export interface WorkflowAgentCall {
  prompt: string;
  options: WorkflowAgentOptions;
}

/** 调用方的可选覆盖项；不传就完全由 RoleSpec 决定。 */
export interface WorkflowAgentOverrides {
  label?: string;
  phase?: string;
  provider?: string;
  model?: string;
}

/**
 * RoleSpec + 本次任务字段 → 一次 workflow 子 agent 调用。
 * 人设与任务单拼在同一段 prompt 里：persona 在前，任务单在后，与 delegate 路径同样的顺序。
 */
export function toAgentCall(
  spec: RoleSpec,
  args: Record<string, unknown>,
  overrides: WorkflowAgentOverrides = {},
): WorkflowAgentCall {
  const options: WorkflowAgentOptions = {
    label: overrides.label ?? spec.name,
    schema: toJsonSchema(spec.output),
  };
  if (overrides.phase !== undefined) options.phase = overrides.phase;
  if (overrides.provider !== undefined) options.provider = overrides.provider;
  if (overrides.model !== undefined) options.model = overrides.model;

  return {
    prompt: `${spec.persona}\n\n${renderTask(spec, args)}`,
    options,
  };
}
