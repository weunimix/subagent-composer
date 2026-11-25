import type { FieldSpec } from './types.js';
import type { SubagentRole } from './role.js';

const TYPE_LABEL: Record<FieldSpec['type'], string> = {
  string: '字符串',
  'string[]': '字符串数组',
  number: '数字',
  boolean: '布尔',
  'object[]': '对象数组',
};

/**
 * 一个字段一行；`object[]` 的子字段由 `fields` 递归渲染成缩进子行。
 *
 * 子字段清单**不进 desc**：desc 只写语义，结构由 `fields` 一处提供。
 * 否则同一份子字段清单会同时存在于 `fields` 与散文里，改名时必然漂移。
 */
function fieldLine(name: string, spec: FieldSpec, indent = ''): string {
  const flags = [TYPE_LABEL[spec.type]];
  if (spec.required) flags.push('必填');
  if (spec.values?.length) flags.push(`取值 ${spec.values.join(' / ')}`);
  const line = `${indent}- \`${name}\`（${flags.join('，')}）：${spec.desc}`;
  if (spec.fields === undefined) return line;
  const children = Object.entries(spec.fields).map(([sub, subSpec]) => fieldLine(sub, subSpec, `${indent}  `));
  return [line, ...children].join('\n');
}

/**
 * persona 的唯一渲染入口。
 * 这里的每一段都来自字段，不允许子类再手写重复段落。
 */
export function renderPersona(role: SubagentRole): string {
  const sections: string[] = [role.identity().trim()];

  const discipline = role.discipline;
  if (discipline.length > 0) {
    sections.push(`## 纪律\n\n${discipline.map((item) => `- ${item}`).join('\n')}`);
  }

  const steps = role.steps();
  if (steps.length > 0) {
    sections.push(`## 步骤\n\n${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`);
  }

  const output = Object.entries(role.output);
  if (output.length > 0) {
    const lines = output.map(([name, spec]) => fieldLine(name, spec)).join('\n');
    sections.push(`## 交付字段\n\n${lines}`);
  }

  return sections.join('\n\n');
}
