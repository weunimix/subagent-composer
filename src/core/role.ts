import type { OutputShape, RoleSpec, TaskShape, ToolKey } from './types.js';
import { DELEGATION_DISCIPLINE } from './discipline.js';
import { renderPersona } from './render.js';

/**
 * 角色的作者侧 API。
 *
 * 事实的所有权：
 *   id / name / when / order / tools / task / output   → 本类字段
 *   persona 文本                                        → identity + discipline + steps 的渲染结果
 * 派生（emit / schema / workflow 入参）由 adapters 负责，子类不得自己拼 YAML 或 schema。
 */
export abstract class SubagentRole {
  abstract readonly id: string;
  abstract readonly name: string;
  /** 面向路由的一句话，不要写成岗位职责长文。 */
  abstract readonly when: string;
  readonly order: number = 100;
  readonly tools: readonly ToolKey[] = [];
  /** 只读角色：产物的 fs 行会关掉 write/edit。 */
  readonly readOnly: boolean = false;
  abstract readonly task: TaskShape;
  abstract readonly output: OutputShape;

  /** 身份：一句话说清「我是谁、我的产出是什么」。 */
  abstract identity(): string;

  /** 角色特有的纪律，追加在共享委派纪律之后。 */
  extraDiscipline(): string[] {
    return [];
  }

  /** 工作步骤；渲染成有序列表。没有步骤就不渲染这一节。 */
  steps(): string[] {
    return [];
  }

  get discipline(): string[] {
    return [...DELEGATION_DISCIPLINE, ...this.extraDiscipline()];
  }

  compile(): RoleSpec {
    return {
      id: this.id,
      name: this.name,
      when: this.when,
      order: this.order,
      tools: this.tools,
      readOnly: this.readOnly,
      persona: renderPersona(this),
      task: this.task,
      output: this.output,
    };
  }
}
