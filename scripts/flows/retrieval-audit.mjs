#!/usr/bin/env node
/**
 * 最小检索流程：reader → verifier gate → synthesizer。
 *
 * 这是「接入 side」的样例：角色定义仍然只在 src/core/roles/ 里，
 * 本文件只负责把 RoleSpec 的投影串成一条带 gate 的脚本。
 *
 * 用法：
 *   node scripts/flows/retrieval-audit.mjs > /tmp/flow.json     # 打印 {meta, source, args}
 *   # 再把 meta / source / args 交给 workflow 工具跑一次真实 run
 *
 * 为什么要分成「生成期」和「运行期」：workflow 脚本跑在 guest 里，不能 import
 * 本包，所以 prompt 必须在生成期拼好；上游输出还不存在的字段留成 `<<字段名>>`
 * 占位符，由脚本在运行期填。
 */
import { compileRoster } from '../../dist/index.js';
import { toAgentCall, toAgentCallTemplate } from '../../dist/index.js';

const specOf = (id) => {
  const spec = compileRoster().find((item) => item.id === id);
  if (!spec) throw new Error(`没有角色 ${id}`);
  return spec;
};

export const meta = {
  name: 'retrieval-audit-flow',
  description: 'reader → verifier gate → synthesizer 最小检索流程',
  whenToUse: '需要按角色链跑一次完整检索、并保留 gate 决策与各阶段摘要时',
  phases: [
    { title: '阅读', detail: 'reader 按候选集读全文，产出证据卡' },
    { title: '验证', detail: 'verifier 独立核对覆盖、引用与冲突' },
    { title: '综合', detail: 'synthesizer 只依据证据卡与验证意见成稿' },
  ],
};

export const source = String.raw`
var steps = args.steps;
var context = args.context;
var maxAttempts = args.maxAttempts || 2;

// 一次正则替换：替换进来的文本不会再被扫描，所以字段值里出现字面 <<x>> 不会打乱别的槽。
var SLOT = /<<([A-Za-z0-9_]+)>>/g;

function fill(step, values) {
  var byName = {};
  for (var i = 0; i < step.slots.length; i += 1) byName[step.slots[i].name] = step.slots[i];
  return step.promptTemplate.replace(SLOT, function (raw, name) {
    var slot = byName[name];
    if (slot === undefined) throw new Error('模板里出现未声明的占位符 ' + raw);
    var value = values[name];
    if (slot.kind === 'json') {
      if (value === undefined || value === null) return JSON.stringify([], null, 2);
      if (!Array.isArray(value)) throw new Error(name + '：声明为 object[]，收到非数组');
      return JSON.stringify(value, null, 2);
    }
    if (slot.type === 'string[]') {
      if (value === undefined || value === null) return '（空）';
      if (!Array.isArray(value)) throw new Error(name + '：声明为 string[]，收到非数组');
      return value.length === 0 ? '（空）' : value.map(String).join('、');
    }
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') throw new Error(name + '：声明为 ' + slot.type + '，收到对象');
    return String(value);
  });
}

/** 模板本身是否还留着自己没声明的占位符——只校验模板，不校验填好的 prompt。 */
function templateProblems(step, label) {
  var known = {};
  for (var i = 0; i < step.slots.length; i += 1) known[step.slots[i].name] = true;
  var problems = [];
  var match;
  var pattern = new RegExp(SLOT.source, 'g');
  while ((match = pattern.exec(step.promptTemplate)) !== null) {
    if (known[match[1]] !== true) problems.push(match[1]);
  }
  if (problems.length > 0) throw new Error(label + '：模板里有未声明的占位符 ' + problems.join(', '));
}

function valuesFor(extra) {
  var values = {};
  var key;
  for (key in context) values[key] = context[key];
  for (key in extra) values[key] = extra[key];
  return values;
}

async function run(step, values, label) {
  templateProblems(step, label);
  var prompt = fill(step, values);
  for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
    var out = await agent(prompt, step.options);
    if (out != null) return { out: out, attempts: attempt };
    log(label + '：第 ' + attempt + ' 次返回空');
  }
  return { out: null, attempts: maxAttempts };
}

function cardCount(result) {
  if (result == null) return 0;
  if (Array.isArray(result.evidenceCards)) return result.evidenceCards.length;
  return 0;
}

phase('阅读');
var reader = await run(steps.reader, valuesFor({}), 'reader');
if (reader.out == null) return { stop: 'reader-failed', attempts: reader.attempts };
var cards = reader.out;
var cardTotal = cardCount(cards);

phase('验证');
var verifier = await run(
  steps.verifier,
  valuesFor({ evidenceCards: cards.evidenceCards }),
  'verifier',
);
if (verifier.out == null) {
  return { stop: 'verifier-failed', attempts: verifier.attempts, cardCount: cardTotal };
}
var verification = verifier.out;
var passed = verification.verdict === 'pass';

phase('综合');
if (!passed && !context.forceSynthesize) {
  log('verifier 判 revise：停止在 gate，不进入综合');
  return {
    stop: 'gate-revise',
    cardCount: cardTotal,
    verdict: verification.verdict,
    missingDocs: verification.missingDocs || [],
    unsupportedClaims: verification.unsupportedClaims || [],
    verificationSummary: verification.summary,
  };
}

var notes = (verification.unsupportedClaims || []).map(function (claim) {
  return '待修正：' + claim;
});
notes = notes.concat((verification.missingDocs || []).map(function (doc) {
  return '未覆盖：' + doc;
}));
if (verification.summary) notes.push('验证结论：' + verification.summary);

var synthesizer = await run(
  steps.synthesizer,
  valuesFor({ evidenceCards: cards.evidenceCards, verificationNotes: notes }),
  'synthesizer',
);
if (synthesizer.out == null) {
  return { stop: 'synthesizer-failed', cardCount: cardTotal, verdict: verification.verdict };
}

return {
  stop: 'done',
  cardCount: cardTotal,
  readerAttempts: reader.attempts,
  verifierAttempts: verifier.attempts,
  synthesizerAttempts: synthesizer.attempts,
  verdict: verification.verdict,
  missingDocs: verification.missingDocs || [],
  unsupportedClaims: verification.unsupportedClaims || [],
  verificationSummary: verification.summary,
  answer: synthesizer.out.answer,
  citations: synthesizer.out.citations,
  uncertainties: synthesizer.out.uncertainties,
  summary: synthesizer.out.summary,
};
`;

const callToStep = (call) => ({ promptTemplate: call.prompt, slots: [], options: call.options });

export function buildArgs(overrides = {}) {
  const context = {
    issueBrief:
      '验证「DSH 角色编译器是否应该把执行层交给 dsh_workflow」这一议题：现有证据是否支持结果 B（编译器 + 薄适配器），以及哪些结论还缺证据。',
    focusStatement:
      '执行状态、派工顺序、失败语义应外移到 dsh_workflow；本仓库只保留角色事实与它的两份投影。',
    docPaths: [
      'docs/plan-dsh-workflow.md',
      'docs/spike-dsh-workflow-2026-11.md',
      'docs/dsh-workflow-adapter.md',
      'docs/architecture-ssot.md',
      'AGENTS.md',
    ],
    candidatePaths: [
      'docs/plan-dsh-workflow.md',
      'docs/spike-dsh-workflow-2026-11.md',
      'docs/dsh-workflow-adapter.md',
      'docs/architecture-ssot.md',
      'AGENTS.md',
    ],
    seedLedger: [
      {
        docPath: 'docs/plan-dsh-workflow.md',
        initialRole: 'center',
        currentRole: 'center',
        evidenceRef: 'docs/plan-dsh-workflow.md:L1-L40',
        round: 1,
        reason: '方案文档给出议题的中心陈述与 5 个待验证问题',
      },
    ],
    ...overrides,
  };

  const steps = {
    reader: callToStep(
      toAgentCall(specOf('retrieval-reader'), {
        issueBrief: context.issueBrief,
        focusStatement: context.focusStatement,
        docPaths: context.docPaths,
        seedCenter: ['执行层外移'],
        round: 1,
      }),
    ),
    verifier: toAgentCallTemplate(specOf('retrieval-verifier')),
    synthesizer: toAgentCallTemplate(specOf('retrieval-synthesizer')),
  };

  return { context, steps, maxAttempts: 2 };
}

if (process.argv[1] && process.argv[1].endsWith('retrieval-audit.mjs')) {
  process.stdout.write(`${JSON.stringify({ meta, source, args: buildArgs() }, null, 2)}\n`);
}
