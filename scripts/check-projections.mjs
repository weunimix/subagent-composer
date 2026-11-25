#!/usr/bin/env node
/**
 * 投影一致性检查：同一份 RoleSpec 必须同时驱动两份产物。
 *
 * 检查的是「一处源事实」这条不变量，不是产物内容本身：
 *   1. 每个交付字段的 desc 同时出现在 persona 与该角色的 workflow outputSchema 里；
 *   2. object[] 的子字段（FieldSpec.fields）在 outputSchema 里逐层展开；
 *   3. dist/cordis.patch.yml 的 persona 与 RoleSpec.persona 逐字节相等；
 *   4. 角色清单只有 roster 一处 → patch 里的 preset 行与 RoleSpec 一一对应；
 *   5. delegate 工具入参也走同一段映射：子字段一样展开，没有第二份手写 schema；
 *   6. workflow 的任务模板与 renderTask 同构：把占位符按同一条规则填回去，必须逐字节还原派工单。
 *
 * 跑之前先 npm run build：本脚本读 dist/，不重新编译。
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import YAML from 'yaml';

import { compileRoster, renderTask, toAgentCall, toAgentCallTemplate } from '../dist/index.js';
import { apply as applyDelegate } from '../dist/plugin/delegate.js';

const ROOT = process.cwd();
const problems = [];
const fail = (message) => problems.push(message);

const specs = compileRoster();
const patchText = await readFile(join(ROOT, 'dist/cordis.patch.yml'), 'utf8');
// patch 根节点是一个数组，第一项带 insert。
const patchRows = YAML.parse(patchText)?.[0]?.insert ?? [];

for (const spec of specs) {
  // when 只进 preset description 与任务单标题，不进 persona。
  if (spec.persona.includes(spec.when)) {
    fail(`${spec.id}: when 不应出现在 persona 里`);
  }

  const call = toAgentCall(spec, {});
  const properties = call.options.schema.properties ?? {};

  for (const [name, field] of Object.entries(spec.output)) {
    // 1. 同一字段：persona 段与 outputSchema 段必须来自同一个 desc。
    if (!spec.persona.includes(field.desc)) {
      fail(`${spec.id}.${name}: desc 没有出现在 persona 里`);
    }
    const node = properties[name];
    if (!node) {
      fail(`${spec.id}.${name}: outputSchema 缺少该字段`);
      continue;
    }
    if (node.description !== field.desc) {
      fail(`${spec.id}.${name}: outputSchema.description 与 FieldSpec.desc 不一致`);
    }

    // 2. object[] 的子字段必须展开；没声明 fields 就该是裸 object。
    if (field.type === 'object[]') {
      const items = node.items ?? {};
      if (field.fields === undefined) {
        if (items.type !== 'object' || items.properties !== undefined) {
          fail(`${spec.id}.${name}: 未声明 fields，items 应为裸 object`);
        }
        continue;
      }
      const nested = items.properties ?? {};
      for (const [sub, subField] of Object.entries(field.fields)) {
        if (nested[sub]?.description !== subField.desc) {
          fail(`${spec.id}.${name}.${sub}: outputSchema 子字段缺少描述或与声明不一致`);
        }
      }
      for (const sub of Object.keys(field.fields)) {
        if (!field.desc.includes(sub)) {
          fail(`${spec.id}.${name}: 父字段 desc 没有提到子字段 ${sub}，散文与声明已经漂移`);
        }
      }
      const expectedRequired = Object.entries(field.fields)
        .filter(([, f]) => f.required)
        .map(([k]) => k);
      const actualRequired = items.required ?? [];
      if (JSON.stringify(expectedRequired) !== JSON.stringify(actualRequired)) {
        fail(`${spec.id}.${name}: items.required 应为 [${expectedRequired.join(', ')}]，实际 [${actualRequired.join(', ')}]`);
      }
    }
  }

  // 3. persona 回读必须逐字节相等。
  const row = patchRows.find((r) => r.id === `preset-${spec.id}`);
  if (!row) {
    fail(`${spec.id}: dist/cordis.patch.yml 缺少 preset-${spec.id} 行`);
    continue;
  }
  const personaRow = row.config?.plugins?.find((p) => p.id === 'persona');
  if (personaRow?.config?.prefix !== spec.persona) {
    fail(`${spec.id}: patch 里的 persona 与 RoleSpec.persona 不是逐字节相等`);
  }
}

// 6. 模板与派工单同构：填回占位符后必须等于 renderTask 的产物。
const sampleValue = (field) => {
  switch (field.type) {
    case 'string':
      return '示例值';
    case 'string[]':
      return ['甲', '乙'];
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'object[]':
      return [Object.fromEntries(Object.entries(field.fields ?? {}).map(([name, sub]) => [name, sampleValue(sub)]))];
    default:
      return '';
  }
};
// 脚本侧的唯一一份替换规则：json 走 JSON.stringify，text 用顿号连接。
const fillSlots = (template, values) =>
  template.slots.reduce((prompt, slot) => {
    const value = values[slot.name];
    const text =
      slot.kind === 'json'
        ? JSON.stringify(value ?? [], null, 2)
        : Array.isArray(value)
          ? value.map(String).join('、')
          : String(value ?? '');
    return prompt.replace(`<<${slot.name}>>`, text);
  }, template.promptTemplate);

for (const spec of specs) {
  const sampleArgs = Object.fromEntries(
    Object.entries(spec.task).map(([name, field]) => [name, sampleValue(field)]),
  );
  const expected = `${spec.persona}\n\n${renderTask(spec, sampleArgs)}`;
  const template = toAgentCallTemplate(spec);
  const slotNames = template.slots.map((slot) => slot.name);
  if (JSON.stringify(slotNames) !== JSON.stringify(Object.keys(spec.task))) {
    fail(`${spec.id}: 模板占位符 [${slotNames.join(', ')}] 与任务字段不一致`);
  }
  for (const slot of template.slots) {
    const structured = spec.task[slot.name]?.type === 'object[]';
    if ((slot.kind === 'json') !== structured) {
      fail(`${spec.id}.${slot.name}: 占位符类型应为 ${structured ? 'json' : 'text'}`);
    }
  }
  const filled = fillSlots(template, sampleArgs);
  if (filled !== expected) {
    const at = [...filled].findIndex((ch, i) => ch !== expected[i]);
    fail(`${spec.id}: 模板填回后与 renderTask 不一致（首个差异在第 ${at + 1} 个字符）`);
  }
}

// 5. delegate 工具入参与 outputSchema 共用映射：object[] 的子字段同样展开。
const registered = [];
applyDelegate({
  tools: { register: (definition) => registered.push(definition) },
  subagents: null,
});
if (registered.length !== specs.length) {
  fail(`delegate 注册了 ${registered.length} 个工具，roster 有 ${specs.length} 个角色`);
}
for (const spec of specs) {
  const tool = registered.find((definition) => definition.name === `delegate_${spec.id.replace(/-/g, '_')}`);
  if (!tool) {
    fail(`${spec.id}: delegate 没有注册对应工具`);
    continue;
  }
  const params = tool.parameters?.properties ?? {};
  for (const [name, field] of Object.entries(spec.task)) {
    if (!params[name]) fail(`${spec.id}: delegate 入参缺少任务字段 ${name}`);
    if (field.type === 'object[]' && field.fields !== undefined) {
      const nested = params[name]?.items?.properties ?? {};
      for (const sub of Object.keys(field.fields)) {
        if (!nested[sub]) fail(`${spec.id}.${name}: delegate 入参没有展开子字段 ${sub}`);
      }
    }
  }
  if (!params.extraNotes) fail(`${spec.id}: delegate 入参缺少 extraNotes`);
}

// 4. 角色数一一对应：roster 的每个角色一行，外加导演行。
const expectedRows = specs.length + 1;
if (patchRows.length !== expectedRows) {
  fail(`patch 行数应为 ${expectedRows}（${specs.length} 角色 + 1 导演），实际 ${patchRows.length}`);
}

if (problems.length > 0) {
  console.error('投影检查失败：');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  const objectArrays = specs.flatMap((spec) =>
    Object.entries(spec.output)
      .filter(([, field]) => field.type === 'object[]')
      .map(([name, field]) => `${spec.id}.${name}${field.fields ? `(${Object.keys(field.fields).length} 子字段)` : '(裸对象)'}`),
  );
  console.log(`投影检查通过：${specs.length} 个角色，${patchRows.length} 条 patch 行。`);
  console.log(`  object[] 字段：${objectArrays.join('、') || '无'}`);
  console.log('  同一 desc 同时出现在 persona 与 workflow outputSchema；persona 回读逐字节相等。');
  console.log('  任务模板填回占位符后与 renderTask 逐字节相等。');
}
