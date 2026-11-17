/**
 * 本文件是「派生物的契约」：其它模块只依赖这里的形状，不依赖具体角色。
 */

export type FieldType = 'string' | 'string[]' | 'number' | 'boolean' | 'object[]';

/** 一个字段的声明。任务字段与交付字段共用这个形状。 */
export interface FieldSpec {
  type: FieldType;
  /** 一句话说明。不写示例，不写重复的「请务必」。 */
  desc: string;
  required?: boolean;
  /** 仅 type: 'string' 时生效，生成 JSON Schema 的 enum。 */
  values?: string[];
}

export type TaskShape = Record<string, FieldSpec>;
export type OutputShape = Record<string, FieldSpec>;

/** 工具能力键。key → DSH tool 行 的映射由 kernel/tools.ts 拥有。 */
export type ToolKey = 'fs' | 'fs-search' | 'web' | 'bash' | 'skill' | 'todo' | 'ask-user';

/** 编译期产物：一个角色 = 一份 RoleSpec。 */
export interface RoleSpec {
  /** preset id，稳定标识；会话日志与冷恢复都靠它。 */
  id: string;
  /** 显示名，只给人看。 */
  name: string;
  /** 面向路由的一句话：主 agent 据此决定派不派这个角色。 */
  when: string;
  order: number;
  tools: readonly ToolKey[];
  /** 已渲染好的系统提示词文本。 */
  persona: string;
  task: TaskShape;
  output: OutputShape;
}
