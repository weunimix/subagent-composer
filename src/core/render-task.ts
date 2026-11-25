import { fieldSchema } from './schema.js';
import type { FieldSpec, RoleSpec } from './types.js';

export type Json = Record<string, unknown>;

/**
 * 字段声明 → JSON Schema 属性节点。
 * 与 outputSchema 共用同一段映射：delegate 入参和结构化交付不会各写一份。
 */
export function propertyOf(field: FieldSpec): Json {
  return fieldSchema(field);
}

/** 字段值是否包含对象结构；结构化字段用 JSON 代码块呈现，避免被压成一行。 */
export function isStructured(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => item !== null && typeof item === 'object');
  }
  return value !== null && typeof value === 'object';
}

/** 字段值渲染：对象与对象数组保留完整结构，字符串数组仍按中文顿号连接。 */
export function renderFieldValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '（空）';
    if (value.some((item) => item !== null && typeof item === 'object')) {
      return JSON.stringify(value, null, 2);
    }
    return value.map(String).join('、');
  }
  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value ?? '');
}

/** 任务模板里的占位符：`<<字段名>>`。故意不用双花括号，避免与 DSH 模板变量混淆。 */
export function slotToken(name: string): string {
  return `<<${name}>>`;
}

export interface TaskSlot {
  /** 任务字段名。 */
  name: string;
  /**
   * 替换方式：json = 上游结构化输出的 JSON 文本（会放进 ```json 代码块），
   * text = 普通文本（字符串数组用中文顿号连接）。
   */
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
  renderField: (name: string, field: FieldSpec) => RenderedField,
  extraNotes?: string,
): string {
  const lines = [`# 任务：${spec.name}`, '', spec.when, '', '## 任务字段', ''];
  for (const [name, field] of Object.entries(spec.task)) {
    const { text, structured } = renderField(name, field);
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
    (name) => {
      const value = args[name];
      return { text: renderFieldValue(value), structured: isStructured(value) };
    },
    typeof extra === 'string' && extra.trim() !== '' ? extra.trim() : undefined,
  );
}

/**
 * 同一份任务单的模板：字段值换成 `<<字段名>>`，供 workflow 脚本在上游输出到手后填入。
 * 是否需要代码块由字段声明决定（object[] 一定是结构化），因为此刻还没有值。
 */
export function renderTaskTemplate(spec: RoleSpec): TaskTemplate {
  const slots: TaskSlot[] = [];
  const text = renderBody(spec, (name, field) => {
    const structured = field.type === 'object[]';
    slots.push({ name, kind: structured ? 'json' : 'text' });
    return { text: slotToken(name), structured };
  });
  return { text, slots };
}
