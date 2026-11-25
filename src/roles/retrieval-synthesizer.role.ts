import type { OutputShape, TaskShape, ToolKey } from '../kernel/types.js';
import { SubagentRole } from '../kernel/role.js';

/**
 * 检索综合员：只依据证据卡与验证意见回答议题，保留冲突与不确定性。
 */
export class RetrievalSynthesizerRole extends SubagentRole {
  readonly id = 'retrieval-synthesizer';
  readonly name = '检索综合员';
  readonly when = '需要基于证据卡综合议题结论时';
  readonly order = 203;
  readonly tools: readonly ToolKey[] = [];
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
      desc: '当前议题中心陈述；答案必须围绕它',
    },
    evidenceCards: {
      type: 'object[]',
      required: true,
      desc: '读者提交的证据卡，每项含 docPath、section、claim、quote、relation、confidence',
    },
    verificationNotes: {
      type: 'string[]',
      desc: '验证员给出的缺口、冲突与种子问题；省略表示未经验证',
    },
    seedLedger: {
      type: 'object[]',
      desc: '种子台账，每项含 docPath、initialRole、currentRole、evidenceRef、round、reason',
    },
  };

  readonly output: OutputShape = {
    answer: {
      type: 'string',
      required: true,
      desc: '面向议题的最终回答，区分事实、推断与未决',
    },
    citations: {
      type: 'string[]',
      required: true,
      desc: '答案引用的文档路径，必须来自证据卡',
    },
    uncertainties: {
      type: 'string[]',
      desc: '现有证据无法回答或只能部分回答的问题',
    },
    conflicts: {
      type: 'object[]',
      desc: '未解决的冲突，每项含 topic、sides、evidenceRefs、whyUnresolved',
    },
    summary: {
      type: 'string',
      required: true,
      desc: '三句话以内说明结论、依据与最大不确定性',
    },
  };

  identity(): string {
    return '你是检索综合员：只依据证据卡与验证意见回答议题，保留冲突与不确定性；不引入新事实。';
  }

  extraDiscipline(): string[] {
    return [
      '只使用 evidenceCards 与 verificationNotes 中的材料；需要新事实时写进 uncertainties。',
      '答案中的每个事实性主张都要有 citations 指向证据卡中的 docPath。',
      '冲突不强行合并；写进 conflicts，并说明哪种解释证据更强。',
    ];
  }

  steps(): string[] {
    return [
      '读 issueBrief 与 focusStatement，确认要回答的问题与中心。',
      '按主题归并 evidenceCards，区分支持、削弱、冲突与推断。',
      '处理 verificationNotes：缺口写入 uncertainties，冲突写入 conflicts。',
      '给出 answer、citations、uncertainties、conflicts 与 summary。',
    ];
  }
}
