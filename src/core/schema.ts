import type { FieldSpec, TaskShape } from './types.js';

/** 只覆盖本编译器会生成的子集，够 DSH 的 structured_output 与 workflow 入参使用。 */
export function toJsonSchema(fields: TaskShape): Record<string, unknown> {
  return objectSchema(fields);
}

/**
 * 对象节点：`{ type: 'object', properties, required?, additionalProperties: false }`。
 * 顶层与 object[] 的元素共用这同一段，避免两处各写一遍。
 */
export function objectSchema(fields: TaskShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, spec] of Object.entries(fields)) {
    properties[name] = fieldSchema(spec);
    if (spec.required) required.push(name);
  }
  return {
    type: 'object',
    properties,
    // 空 required 数组在部分校验器里非法，省略更稳。
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

/** 单字段节点。object[] 的元素形状由 spec.fields 决定，省略时退化为无约束对象。 */
export function fieldSchema(spec: FieldSpec): Record<string, unknown> {
  const base: Record<string, unknown> = { description: spec.desc };
  switch (spec.type) {
    case 'string':
      return spec.values?.length
        ? { ...base, type: 'string', enum: spec.values }
        : { ...base, type: 'string' };
    case 'string[]':
      return {
        ...base,
        type: 'array',
        items: spec.values?.length ? { type: 'string', enum: spec.values } : { type: 'string' },
      };
    case 'object[]':
      return { ...base, type: 'array', items: spec.fields ? objectSchema(spec.fields) : { type: 'object' } };
    case 'number':
      return { ...base, type: 'number' };
    case 'boolean':
      return { ...base, type: 'boolean' };
  }
}
