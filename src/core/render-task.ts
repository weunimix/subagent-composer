import type { FieldSpec, RoleSpec } from './types.js';

export type Json = Record<string, unknown>;

/** 字段声明 → JSON Schema 属性节点。 */
export function propertyOf(field: FieldSpec): Json {
  switch (field.type) {
    case 'string':
      return field.values === undefined
        ? { type: 'string', description: field.desc }
        : { type: 'string', enum: field.values, description: field.desc };
    case 'string[]':
      return {
        type: 'array',
        description: field.desc,
        items: field.values === undefined ? { type: 'string' } : { type: 'string', enum: field.values },
      };
    case 'number':
      return { type: 'number', description: field.desc };
    case 'boolean':
      return { type: 'boolean', description: field.desc };
    case 'object[]':
      return { type: 'array', description: field.desc, items: { type: 'object' } };
    default:
      return { type: 'string', description: field.desc };
  }
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

/** 派工单正文：只写本次任务，不复述角色纪律。 */
export function renderTask(spec: RoleSpec, args: Record<string, unknown>): string {
  const lines = [`# 任务：${spec.name}`, '', spec.when, '', '## 任务字段', ''];
  for (const [field] of Object.entries(spec.task)) {
    const value = args[field];
    const text = renderFieldValue(value);
    if (isStructured(value)) {
      lines.push(`- ${field}：`, '', '```json', text, '```');
    } else {
      lines.push(`- ${field}：${text}`);
    }
  }
  const extra = args.extraNotes;
  if (typeof extra === 'string' && extra.trim() !== '') {
    lines.push('', '## 补充说明', '', extra.trim());
  }
  lines.push('', '## 交付', '', '按你的岗位说明要求的字段交付；字段不齐时如实说明缺什么。');
  return lines.join('\n');
}
