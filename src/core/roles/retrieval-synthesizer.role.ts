import type { OutputShape, TaskShape, ToolKey } from '../types.js';
import { SubagentRole } from '../role.js';
import { EVIDENCE_CARD_FIELDS, SEED_LEDGER_FIELDS } from './shapes.js';

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
      desc: '读者提交的证据卡，每项含 docPath、evidenceRef、section、claim、quote、relation、confidence',
      fields: EVIDENCE_CARD_FIELDS,
    },
    verificationNotes: {
      type: 'string[]',
      desc: '验证员给出的缺口、冲突与种子问题；省略表示未经验证',
    },
    seedLedger: {
      type: 'object[]',
      desc: '种子台账，每项含 docPath、initialRole、currentRole、evidenceRef、round、reason',
      fields: SEED_LEDGER_FIELDS,
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
      desc: '答案引用的文档行区间，如 设定系统/设定空间/宗教/正教/信仰实践.md:15-17',
    },
    uncertainties: {
      type: 'string[]',
      desc: '现有证据无法回答或只能部分回答的问题',
    },
    conflicts: {
      type: 'object[]',
      desc: '未解决的冲突，每项含 topic、sides、evidenceRefs、whyUnresolved',
    },
    presumption: {
      type: 'object[]',
      desc: '无命名或分类仲裁条款时的推定口径，每项含 topic、basis、confidence、unresolved；没有则省略',
    },
    coverage: {
      type: 'object[]',
      desc: '否定性或全称判断的覆盖度，每项含 claim、readCount、scannedCount、denominator、retrievalExpression',
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
      '答案中的每个事实性主张都要有 citations 指向证据卡中的 docPath 与行区间。',
      '冲突不强行合并；写进 conflicts，并说明哪种解释证据更强。',
      '遇到“scope 内没有、唯一、全部、零命中”等否定或全称判断时，必须绑定覆盖度和检索式，写入 coverage；不能升级为未限定 scope 的全称结论。',
      'scope 内没有命名或分类仲裁条款时，必须把结论标为推定口径，写入 presumption，说明依据、置信度和未决项；不得伪装成既定事实。',
    ];
  }

  steps(): string[] {
    return [
      '读 issueBrief 与 focusStatement，确认要回答的问题与中心。',
      '按主题归并 evidenceCards，区分支持、削弱、冲突与推断。',
      '处理 verificationNotes：缺口写入 uncertainties，冲突写入 conflicts，量化或否定性断言核对 coverage。',
      '检查是否存在命名或分类仲裁条款；没有则在 presumption 中记录推定口径、依据、置信度与未决项。',
      '给出 answer、citations、uncertainties、conflicts、presumption、coverage 与 summary。',
    ];
  }
}
