import type { RoleSpec } from './types.js';

export class SpecError extends Error {}

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const MAX_WHEN = 60;

/**
 * build 期检查：拦掉会让 DSH 装载失败、或让派工语义含糊的输入。
 * 只做「必须成立」的断言，不做风格检查。
 */
export function assertSpec(spec: RoleSpec): void {
  const where = `role "${spec.id}"`;

  if (!ID_PATTERN.test(spec.id)) {
    throw new SpecError(`${where}: id 必须是小写字母开头的 kebab-case`);
  }
  if (!spec.name.trim()) {
    throw new SpecError(`${where}: name 不能为空`);
  }
  if (spec.when.trim().length === 0 || spec.when.length > MAX_WHEN) {
    throw new SpecError(`${where}: when 必须是 1–${MAX_WHEN} 字的一句话`);
  }
  // DSH 的 persona 模板会严格插值 {{变量}}，未注册的变量会让提示词组装整体失败。
  if (spec.persona.includes('{{') || spec.persona.includes('}}')) {
    throw new SpecError(`${where}: persona 里出现了 {{ }}，DSH 会当作变量解析并拒绝组装`);
  }
  if (spec.persona.trim().length < 20) {
    throw new SpecError(`${where}: persona 太短，缺少身份描述`);
  }
  for (const [name, field] of Object.entries(spec.task)) {
    if (!field.desc.trim()) throw new SpecError(`${where}: 任务字段 ${name} 缺少 desc`);
  }
  for (const [name, field] of Object.entries(spec.output)) {
    if (!field.desc.trim()) throw new SpecError(`${where}: 交付字段 ${name} 缺少 desc`);
  }
  // 没有交付字段，父级就拿不到结构化结果，委派退化成散文。
  if (Object.keys(spec.output).length === 0) {
    throw new SpecError(`${where}: 至少要声明一个交付字段`);
  }
}

/** 一次 build 内的全局检查：id 唯一。 */
export function assertRoster(specs: RoleSpec[]): void {
  const seen = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.id)) throw new SpecError(`重复的 role id: ${spec.id}`);
    seen.add(spec.id);
  }
}
