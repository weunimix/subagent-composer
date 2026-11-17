import type { OutputShape, TaskShape, ToolKey } from '../kernel/types.js';
import { SubagentRole } from '../kernel/role.js';

/**
 * 示例角色：单节点审查。
 *
 * 刻意保持「无示例、无重复纪律」——身份、边界、步骤、交付字段各写一次，
 * 其余由 kernel 渲染与校验。
 */
export class NovelAuditRole extends SubagentRole {
  readonly id = 'novel-audit';
  readonly name = '节点审查';
  readonly when = '需要对照锚点判断单章节节点是否合规时';
  readonly order = 101;
  readonly tools: readonly ToolKey[] = ['fs', 'fs-search'];

  readonly task: TaskShape = {
    nodePath: {
      type: 'string',
      required: true,
      desc: '待审查节点相对项目根的路径',
    },
    anchor: {
      type: 'string',
      required: true,
      desc: '该节点必须对齐的锚点：设定条目 id 或审查体系条目名',
    },
    focus: {
      type: 'string[]',
      desc: '本次额外关注的点；省略表示按锚点全量对照',
    },
  };

  readonly output: OutputShape = {
    verdict: {
      type: 'string',
      required: true,
      values: ['pass', 'revise'],
      desc: '总体结论',
    },
    issues: {
      type: 'object[]',
      desc: '问题列表，每项含 location（章节内定位）、reason（违反的锚点）、suggestion（怎么改）',
    },
    summary: {
      type: 'string',
      required: true,
      desc: '三句话以内的结论说明',
    },
  };

  identity(): string {
    return '你是单节点审查员：只读一个章节节点，对照给定锚点判断它是否合规，不改稿。';
  }

  extraDiscipline(): string[] {
    return [
      '只读，不修改任何文件；发现的问题写进 issues，不直接动手。',
      '锚点之外的判据不引入；锚点本身有矛盾时写进 issues 而不是自行裁决。',
    ];
  }

  steps(): string[] {
    return [
      '读 nodePath 指向的节点，确认章节边界。',
      '读 anchor 指向的条目，列出它对本章的硬性要求。',
      '逐条对照，记录不满足的项及其定位。',
      '给出 verdict 与 summary。',
    ];
  }
}
