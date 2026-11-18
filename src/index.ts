export { SubagentRole } from './kernel/role.js';
export type {
  FieldSpec,
  FieldType,
  OutputShape,
  RoleSpec,
  TaskShape,
  ToolKey,
} from './kernel/types.js';
export { ROLE_CLASSES, compileRoster } from './roster.js';
export { renderTask, toolNameOf } from './plugin/delegate.js';
