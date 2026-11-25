import type { FieldType, RoleSpec } from './types.js';

export type Json = Record<string, unknown>;

/** 任务模板里的占位符：`<<字段名>>`。故意不用双花括号，避免与 DSH 模板变量混淆。 */
export function slotToken(name: string): string {
  return `<<${name}>>`;
}

/**
 * 渲染方式只由**字段声明**决定，不看运行期的值。
 *
 * 早先按值判断（对象就上代码块），模板按声明判断（object[] 上代码块），
 * 两条路径在「对象数组为空」「string 字段收到对象」时输出不同，其中一种会把
 * 对象印成 `[object Object]` 静默丢数据。现在只有这一份判据。
 */
function kindOf(type: FieldType): TaskSlot['kind'] {
  return type === 'object[]' ? 'json' : 'text';
}

/** 报错文案会被模型读到，所以不用 `typeof` 的英文（`收到object` 读起来像笔误）。 */
function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '数组';
  if (typeof value === 'object') return '对象';
  if (typeof value === 'string') return '字符串';
  if (typeof value === 'number') return '数字';
  if (typeof value === 'boolean') return '布尔值';
  return typeof value;
}

/**
 * 字段值渲染。类型与声明不符时直接抛错：宁可让派工失败，也不要把对象
 * 悄悄压成 `[object Object]`。
 */
export function renderFieldValue(name: string, field: { type: FieldType }, value: unknown): string {
  if (field.type === 'object[]') {
    if (value === undefined || value === null) return JSON.stringify([], null, 2);
    if (!Array.isArray(value)) {
      throw new TypeError(`字段 ${name} 声明为 object[]，收到${typeName(value)}`);
    }
    return JSON.stringify(value, null, 2);
  }
  if (field.type === 'string[]') {
    if (value === undefined || value === null) return '（空）';
    if (!Array.isArray(value)) {
      throw new TypeError(`字段 ${name} 声明为 string[]，收到${typeName(value)}`);
    }
    if (value.length === 0) return '（空）';
    for (const item of value) {
      if (item !== null && typeof item === 'object') {
        throw new TypeError(`字段 ${name} 声明为 string[]，但数组里有${typeName(item)}`);
      }
    }
    return value.map(String).join('、');
  }
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    throw new TypeError(
      `字段 ${name} 声明为 ${field.type}，收到${typeName(value)}；结构化数据要声明成 object[] 或 string[]`,
    );
  }
  return String(value);
}

export interface TaskSlot {
  /** 任务字段名。 */
  name: string;
  /** 字段类型，填槽时据此校验值。 */
  type: FieldType;
  /** 渲染方式：json = JSON 代码块（object[]），text = 行内文本。 */
  kind: 'text' | 'json';
}

export interface TaskTemplate {
  /** 与 renderTask 同构的任务单，字段值换成占位符。 */
  text: string;
  /** 需要由调用方在运行期填入的字段。 */
  slots: TaskSlot[];
}

interface RenderedField {
  text: string;
  structured: boolean;
}

/**
 * 任务单骨架。renderTask 与 renderTaskTemplate 共用这一段，
 * 差别只在字段值怎么来 —— 一处措辞，两种渲染。
 */
function renderBody(
  spec: RoleSpec,
  renderField: (name: string, type: FieldType) => RenderedField,
  extraNotes?: string,
): string {
  const lines = [`# 任务：${spec.name}`, '', spec.when, '', '## 任务字段', ''];
  for (const [name, field] of Object.entries(spec.task)) {
    const { text, structured } = renderField(name, field.type);
    if (structured) {
      lines.push(`- ${name}：`, '', '```json', text, '```');
    } else {
      lines.push(`- ${name}：${text}`);
    }
  }
  if (extraNotes !== undefined) {
    lines.push('', '## 补充说明', '', extraNotes);
  }
  lines.push('', '## 交付', '', '按你的岗位说明要求的字段交付；字段不齐时如实说明缺什么。');
  return lines.join('\n');
}

/** 派工单正文：只写本次任务，不复述角色纪律。 */
export function renderTask(spec: RoleSpec, args: Record<string, unknown>): string {
  const extra = args.extraNotes;
  return renderBody(
    spec,
    (name, type) => ({
      text: renderFieldValue(name, { type }, args[name]),
      structured: kindOf(type) === 'json',
    }),
    typeof extra === 'string' && extra.trim() !== '' ? extra.trim() : undefined,
  );
}

/**
 * 同一份任务单的模板：字段值换成 `<<字段名>>`，供 workflow 脚本在上游输出到手后填入。
 * 是否需要代码块由字段声明决定（object[] 一定是结构化），因为此刻还没有值。
 */
export function renderTaskTemplate(spec: RoleSpec): TaskTemplate {
  const slots: TaskSlot[] = [];
  const text = renderBody(spec, (name, type) => {
    slots.push({ name, type, kind: kindOf(type) });
    return { text: slotToken(name), structured: kindOf(type) === 'json' };
  });
  return { text, slots };
}

/**
 * 按模板填槽。一次正则替换完成：替换进来的文本不会被当成占位符再扫一遍，
 * 所以字段值里出现字面 `<<x>>` 不会打乱其它槽。
 *
 * 只认字符串 + 槽位，所以 persona 前缀（`toAgentCallTemplate` 的 promptTemplate）
 * 也能用同一条规则填，不必为「整段 prompt」再写一份。
 */
export function fillSlots(
  text: string,
  slots: readonly TaskSlot[],
  values: Record<string, unknown>,
): string {
  const byName = new Map<string, TaskSlot>();
  for (const slot of slots) byName.set(slot.name, slot);
  return text.replace(/<<([A-Za-z0-9_]+)>>/g, (raw: string, name: string) => {
    const slot = byName.get(name);
    if (slot === undefined) throw new Error(`模板里出现未声明的占位符 ${raw}`);
    return renderFieldValue(slot.name, { type: slot.type }, values[slot.name]);
  });
}

/**
 * 交给 workflow guest 的同一段填槽实现（源码文本）。
 *
 * guest 沙箱没有 `import`，只能两段式；但「两份实现」不该靠断言维持一致。
 * 这里把自包含的三个函数原样导出，flow 脚本在生成期把这段源码注入 guest，
 * 于是运行期跑的就是 core 的这份代码，而不是它的手写副本。
 */
export const fillSlotsSource: string = [typeName, renderFieldValue, fillSlots]
  .map((fn) => fn.toString())
  .join('\n\n');

/** 任务单模板填槽。 */
export function fillTaskTemplate(template: TaskTemplate, values: Record<string, unknown>): string {
  return fillSlots(template.text, template.slots, values);
}
