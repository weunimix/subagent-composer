import type { OutputShape, TaskShape, ToolKey } from '../types.js';
import { SubagentRole } from '../role.js';
import { EVIDENCE_CARD_FIELDS } from './shapes.js';

/**
 * 检索阅读员：在分配到的完整文档集内逐篇阅读，产出可核验的证据卡。
 */
export class RetrievalReaderRole extends SubagentRole {
  readonly id = 'retrieval-reader';
  readonly name = '检索阅读员';
  readonly when = '需要按完整候选集阅读全文并产出证据卡时';
  readonly order = 201;
  readonly tools: readonly ToolKey[] = ['fs', 'fs-search'];
  readonly readOnly = true;

  readonly task: TaskShape = {
    issueBrief: {
      type: 'string',
      required: true,
      desc: '议题简报：要回答的问题、边界与已知背景',
    },
    focusStatement: {
      type: 'string',
      required: true,
      desc: '当前议题中心陈述；只用于判断证据与焦点的关系',
    },
    docPaths: {
      type: 'string[]',
      required: true,
      desc: '本轮分配的全文章节路径，相对项目根；没有片段索引的文档必须全部阅读',
    },
    sectionPaths: {
      type: 'string[]',
      desc: '本轮分配的 H2/H3 片段 ID，形如 文档路径#小节标题；有片段时只读片段，不读整篇',
    },
    seedCenter: {
      type: 'string[]',
      desc: '当前种子中心文档路径；省略表示尚未形成中心',
    },
    round: {
      type: 'number',
      desc: '当前校准轮次；首轮省略或填 0',
    },
  };

  readonly output: OutputShape = {
    evidenceCards: {
      type: 'object[]',
      required: true,
      desc: '本次阅读产出的证据卡；一条主张一张卡，跨文档支撑时拆成多张',
      fields: EVIDENCE_CARD_FIELDS,
    },
    coverage: {
      type: 'string[]',
      required: true,
      desc: '已读文档路径；必须覆盖 docPaths 全部条目',
    },
    sectionCoverage: {
      type: 'string[]',
      desc: '已读片段 ID；必须覆盖 sectionPaths 全部条目',
    },
    boundaryNotes: {
      type: 'string[]',
      desc: '阅读中遇到的 scope 外文件及其处理方式；这些文件不产出证据卡',
    },
    questions: {
      type: 'string[]',
      desc: '阅读中无法由现有材料回答的问题',
    },
    summary: {
      type: 'string',
      required: true,
      desc: '三句话以内说明本轮证据对议题中心的支持或削弱',
    },
  };

  identity(): string {
    return '你是检索阅读员：按分配到的片段或全文文档逐段阅读原文，产出可核验的证据卡；不筛选文档，不综合最终结论。';
  }

  extraDiscipline(): string[] {
    return [
      '必须读完 sectionPaths 的全部片段与 docPaths 的全部全文文档；漏读的写进 questions，不能静默跳过。',
      '只读 sectionPaths 指定的片段与 docPaths 指定的文档；读到 scope 外文件时写入 boundaryNotes，不产出证据卡，不进入综合。',
      '证据卡挂 fragmentId；片段证据的 fragmentId 必须是 sectionPaths 中的 ID，quote 必须落在该片段行区间内。',
      '只记录原文支持的内容：claim 与 quote 必须来自所读文档，推断要标 relation 为推断并说明依据。',
      '证据位置必须使用 path:L15-L17 形式的行区间，不写无行号的概述。',
      '不修改文件，不替规划者决定议题中心；对中心的异议写进 summary 或 questions。',
    ];
  }

  steps(): string[] {
    return [
      '读 issueBrief 与 focusStatement，确认本轮要回答什么、中心是什么。',
      '逐段阅读 sectionPaths 指向的片段；没有片段的文档逐篇阅读 docPaths 指向的全文。按章节记录与议题相关的原文和行区间。',
      '把原文整理成证据卡，标注它与中心的关系：supports、contradicts、context、gap；片段证据写明 fragmentId。',
      '核对 sectionCoverage 与 coverage 是否覆盖全部 sectionPaths 与 docPaths；把 scope 外文件写入 boundaryNotes。',
      '提交证据卡、覆盖情况、边界记录与未决问题。',
    ];
  }
}
