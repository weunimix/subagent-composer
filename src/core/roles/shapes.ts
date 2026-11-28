import type { TaskShape } from '../types.js';

/**
 * 跨角色复用的子字段形状。
 *
 * 这些字段在三个角色的说明里被重复描述（读者产出、验证员与综合员的入参），
 * 与其在 desc 里写散文、让每份 schema 各自演化，不如只声明一次。
 * 只写「一行证据卡长什么样」，不复述各角色自己的字段说明。
 */
export const EVIDENCE_CARD_FIELDS: TaskShape = {
  docPath: {
    type: 'string',
    required: true,
    desc: '证据所在文档路径，相对项目根',
  },
  fragmentId: {
    type: 'string',
    desc: '可选，H2/H3 片段 ID，形如 文档路径#小节标题；整篇文档证据可省略',
  },
  evidenceRef: {
    type: 'string',
    required: true,
    desc: '原文行区间引用，形如 文档路径:L15-L17',
  },
  section: {
    type: 'string',
    desc: '证据所在的章节或小节名',
  },
  claim: {
    type: 'string',
    required: true,
    desc: '这张证据卡支撑的主张，一句话',
  },
  quote: {
    type: 'string',
    desc: '支撑 claim 的原文摘录',
  },
  relation: {
    type: 'string',
    values: ['supports', 'contradicts', 'context', 'gap'],
    desc: '与议题中心陈述的关系',
  },
  confidence: {
    type: 'string',
    values: ['高', '中', '低'],
    desc: '证据强度',
  },
};

/** 种子台账的一行：某份文档在检索中的角色如何变化。 */
export const SEED_LEDGER_FIELDS: TaskShape = {
  docPath: {
    type: 'string',
    required: true,
    desc: '种子文档路径',
  },
  initialRole: {
    type: 'string',
    desc: '初始角色',
  },
  currentRole: {
    type: 'string',
    desc: '当前角色',
  },
  evidenceRef: {
    type: 'string',
    desc: '支持当前角色的行区间引用',
  },
  round: {
    type: 'number',
    desc: '角色发生变更的轮次',
  },
  reason: {
    type: 'string',
    desc: '变更或保留该角色的理由',
  },
};
