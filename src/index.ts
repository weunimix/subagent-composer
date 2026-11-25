export { SubagentRole } from './core/role.js';
export type {
  FieldSpec,
  FieldType,
  OutputShape,
  RoleSpec,
  TaskShape,
  ToolKey,
} from './core/types.js';
export { ROLE_CLASSES, compileRoster } from './core/roster.js';
export { fillSlots, fillTaskTemplate, renderTask, renderTaskTemplate, slotToken } from './core/render-task.js';
export type { TaskSlot, TaskTemplate } from './core/render-task.js';
export { fillAgentCallTemplate, toAgentCall, toAgentCallTemplate } from './adapters/dsh-workflow/input.js';
export type {
  WorkflowAgentCall,
  WorkflowAgentOptions,
  WorkflowAgentOverrides,
  WorkflowAgentTemplate,
} from './adapters/dsh-workflow/input.js';
/** @deprecated 0.2.0 起弃用，0.3.0 移除；派工改用 toAgentCall / toAgentCallTemplate。 */
export { toolNameOf } from './plugin/delegate.js';
