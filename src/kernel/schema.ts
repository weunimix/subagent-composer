import type { FieldSpec, TaskShape } from './types.js';

/** 只覆盖本编译器会生成的子集，够 DSH 的 structured_output 与 delegate 入参使用。 */
export function toJsonSchema(fields: TaskShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, spec] of Object.entries(fields)) {
    properties[name] = fieldSchema(spec);
    if (spec.required) required.push(name);
  }
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function fieldSchema(spec: FieldSpec): Record<string, unknown> {
  const base: Record<string, unknown> = { description: spec.desc };
  switch (spec.type) {
    case 'string':
      return spec.values?.length
        ? { ...base, type: 'string', enum: spec.values }
        : { ...base, type: 'string' };
    case 'string[]':
      return { ...base, type: 'array', items: { type: 'string' } };
    case 'object[]':
      return { ...base, type: 'array', items: { type: 'object' } };
    case 'number':
      return { ...base, type: 'number' };
    case 'boolean':
      return { ...base, type: 'boolean' };
  }
}
