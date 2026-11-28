import type { OutputShape, TaskShape, ToolKey } from '../types.js';
import { SubagentRole } from '../role.js';
import { EVIDENCE_CARD_FIELDS, SEED_LEDGER_FIELDS } from './shapes.js';

/**
 * 检索验证员：独立核对读者是否覆盖完整候选集、证据是否可回溯、冲突是否被记录。
 */
export class RetrievalVerifierRole extends SubagentRole {
  readonly id = 'retrieval-verifier';
  readonly name = '检索验证员';
  readonly when = '需要独立核对检索覆盖、引用与冲突时';
  readonly order = 202;
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
      desc: '当前议题中心陈述；用于判断证据是否仍然围绕中心',
    },
    candidatePaths: {
      type: 'string[]',
      required: true,
      desc: '完整性分母：本轮全部候选文档路径，相对项目根',
    },
    candidateSections: {
      type: 'string[]',
      desc: '本轮全部候选片段 ID；候选片段必须都有证据卡或 boundaryNotes',
    },
    evidenceCards: {
      type: 'object[]',
      required: true,
      desc: '读者提交的证据卡，逐张核对引用是否落在原文、覆盖是否完整、与其它材料是否冲突',
      fields: EVIDENCE_CARD_FIELDS,
    },
    seedLedger: {
      type: 'object[]',
      desc: '种子台账，记录候选文档在本轮的初始角色、当前角色与轮次',
      fields: SEED_LEDGER_FIELDS,
    },
  };

  readonly output: OutputShape = {
    verdict: {
      type: 'string',
      required: true,
      values: ['pass', 'revise'],
      desc: '总体结论：证据可交付或需要补读重判',
    },
    missingDocs: {
      type: 'string[]',
      desc: '候选集中没有对应证据卡的文档路径',
    },
    missingSections: {
      type: 'string[]',
      desc: '候选片段中没有对应证据卡或 boundaryNotes 的片段 ID',
    },
    unsupportedClaims: {
      type: 'string[]',
      desc: '证据卡中没有原文支撑、引用与原文不一致、或量化复算不成立的主张',
    },
    negativeClaims: {
      type: 'object[]',
      desc: '否定性或全称结论的覆盖度核对，每项含 claim、readCount、scannedCount、denominator、retrievalExpression、status',
    },
    assertionChecks: {
      type: 'object[]',
      desc: '量化断言的独立复算，每项含 claim、retrievalExpression、observedCount、expectedCount、passed',
    },
    conflicts: {
      type: 'object[]',
      desc: '材料之间的冲突，每项含 topic、sides、evidenceRefs、whyUnresolved',
    },
    seedIssues: {
      type: 'object[]',
      desc: '种子台账中理由不足、轮次超限或中心漂移问题，每项含 docPath、issue、reason',
    },
    summary: {
      type: 'string',
      required: true,
      desc: '三句话以内说明验证结论与主要风险',
    },
  };

  identity(): string {
    return '你是检索验证员：独立核对读者是否覆盖完整候选集、证据是否可回溯、冲突是否被记录；不改写证据，不下最终结论。';
  }

  extraDiscipline(): string[] {
    return [
      '只依据 candidatePaths、candidateSections、evidenceCards 与 seedLedger 核对，不引入外部材料。',
      '候选片段的 fragmentId 必须能在候选片段集中解析；fragmentId 不存在或 quote 超出片段行区间时，记 unsupportedClaims。',
      '证据卡与原文不一致时以原文为准；无法回原文核对的引用标为无法核验。',
      '遇到“唯一、全部、首次、共 N 处、只有”等量化或穷尽性断言时，必须回到 candidatePaths 逐项复算，不能只核对引用；每条断言必须附可复现的检索式或文件清单。',
      '遇到“scope 内没有、没有任何、零命中”等否定性结论时，必须核对已读篇数、扫描篇数、分母和检索式；缺覆盖度的结论写入 unsupportedClaims 或 negativeClaims，不能放行。',
      '不修改文件，不替综合者写答案。',
    ];
  }

  steps(): string[] {
    return [
      '读 issueBrief、focusStatement 与 candidatePaths，建立本轮完整性分母。',
      '逐条核对 evidenceCards 的 docPath、evidenceRef、section、quote 是否可回溯，记录无支撑主张。',
      '检查 candidatePaths 是否都有对应证据卡，列出 missingDocs；检查 candidateSections 是否都有卡或边界注，列出 missingSections。',
      '复算所有量化与穷尽性断言，检查每条断言的检索式；结果写入 assertionChecks，不成立写入 unsupportedClaims。',
      '核对否定性结论的覆盖度，写入 negativeClaims。',
      '检查 seedLedger 的轮次与理由，记录 seedIssues；给出 verdict 与 summary。',
    ];
  }
}
