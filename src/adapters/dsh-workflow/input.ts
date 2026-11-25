import {
  fillSlots,
  renderTask,
  renderTaskTemplate,
  type Json,
  type TaskSlot,
} from '../../core/render-task.js';
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

/** 把上游输出填进模板后的调用，形状与 toAgentCall 的产物完全一致。 */
export interface WorkflowAgentTemplate {
  /** 含 `<<字段名>>` 占位符的 prompt；人设已经拼在前面。 */
  promptTemplate: string;
  /** 需要调用方填的占位符；json 类用 JSON.stringify(value, null, 2)。 */
  slots: TaskSlot[];
  options: WorkflowAgentOptions;
}

/**
 * 链式场景用的投影：任务字段此刻还没有值，先产出模板，等上游输出到手再填。
 *
 * 为什么不在 template 里直接带值：workflow 脚本跑在 guest 里，不能 import 本包，
 * 所以「拼 prompt」这件事必须在生成期完成、把占位符留给脚本替换。
 */
export function toAgentCallTemplate(
  spec: RoleSpec,
  overrides: WorkflowAgentOverrides = {},
): WorkflowAgentTemplate {
  const options: WorkflowAgentOptions = {
    label: overrides.label ?? spec.name,
    schema: toJsonSchema(spec.output),
  };
  if (overrides.phase !== undefined) options.phase = overrides.phase;
  if (overrides.provider !== undefined) options.provider = overrides.provider;
  if (overrides.model !== undefined) options.model = overrides.model;

  const template = renderTaskTemplate(spec);
  return {
    promptTemplate: `${spec.persona}\n\n${template.text}`,
    slots: template.slots,
    options,
  };
}

/**
 * 把上游输出填进模板，得到与 `toAgentCall` 同形状的 prompt。
 * 与 core 的 fillTaskTemplate 共用一条填槽规则（含「值里带 <<x>> 不被二次替换」），
 * 这里只是把 persona 前缀也一起填掉。
 */
export function fillAgentCallTemplate(
  template: WorkflowAgentTemplate,
  values: Record<string, unknown>,
): string {
  return fillSlots(template.promptTemplate, template.slots, values);
}
