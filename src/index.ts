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
export { renderTask } from './core/render-task.js';
export { toAgentCall } from './adapters/dsh-workflow/input.js';
export type {
  WorkflowAgentCall,
  WorkflowAgentOptions,
  WorkflowAgentOverrides,
} from './adapters/dsh-workflow/input.js';
export { toolNameOf } from './plugin/delegate.js';
