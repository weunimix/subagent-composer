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

import {
  compileRoster,
  fillAgentCallTemplate,
  renderTask,
  toAgentCall,
  toAgentCallTemplate,
} from '../dist/index.js';
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
  // 脚本层只认这几个键：多写一个 `preset` 之类，宿主会直接拒绝整个 run（阶段 0 实测）。
  const SUPPORTED_OPTION_KEYS = ['label', 'phase', 'provider', 'model', 'schema'];
  const extraKeys = Object.keys(call.options).filter((key) => !SUPPORTED_OPTION_KEYS.includes(key));
  if (extraKeys.length > 0) {
    fail(`${spec.id}: agent() options 里出现了脚本层不认识的键 [${extraKeys.join(', ')}]`);
  }
  // 运行期传进来的野键（TS 拦不住 JS 调用方）不能漏进 options。
  const wild = toAgentCall(spec, {}, { preset: 'retrieval-verifier', readonly: true });
  const wildKeys = Object.keys(wild.options).filter((key) => !SUPPORTED_OPTION_KEYS.includes(key));
  if (wildKeys.length > 0) {
    fail(`${spec.id}: 未声明的 override 键漏进了 options [${wildKeys.join(', ')}]`);
  }
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
        // 按独立词匹配：`docPath` 不能因为包含 `path` 就把新增的 path 子字段糊过去。
        const asToken = new RegExp(`(^|[^A-Za-z0-9_])${sub}([^A-Za-z0-9_]|$)`);
        if (!asToken.test(field.desc)) {
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

// 6. 模板与派工单同构：用 core 的同一段填槽规则填回，必须等于 renderTask 的产物。
//    三种输入都覆盖：常规值、空对象数组、字段值里带字面 <<占位符>>。
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

/** 空对象数组 / 值里带占位符字面量，都是「按值渲染」与「先出模板再填」最容易分叉的输入。 */
const edgeArgs = (spec, makeValue) =>
  Object.fromEntries(
    Object.entries(spec.task).map(([name, field]) => [
      name,
      field.type === 'object[]' ? makeValue(field) : sampleValue(field),
    ]),
  );

for (const spec of specs) {
  const template = toAgentCallTemplate(spec);
  const slotNames = template.slots.map((slot) => slot.name);
  if (JSON.stringify(slotNames) !== JSON.stringify(Object.keys(spec.task))) {
    fail(`${spec.id}: 模板占位符 [${slotNames.join(', ')}] 与任务字段不一致`);
  }
  for (const slot of template.slots) {
    const expectedKind = spec.task[slot.name]?.type === 'object[]' ? 'json' : 'text';
    if (slot.kind !== expectedKind) {
      fail(`${spec.id}.${slot.name}: 占位符类型应为 ${expectedKind}`);
    }
  }

  const variants = [
    ['常规值', Object.fromEntries(Object.entries(spec.task).map(([name, field]) => [name, sampleValue(field)]))],
    ['空对象数组', edgeArgs(spec, () => [])],
    ['值里带占位符字面量', edgeArgs(spec, (field) => {
      const card = sampleValue(field);
      const first = Object.keys(field.fields ?? {})[0];
      if (first !== undefined) card[0][first] = '见 <<seedLedger>> 的字面量';
      return card;
    })],
  ];

  for (const [label, args] of variants) {
    const expected = `${spec.persona}\n\n${renderTask(spec, args)}`;
    const filled = fillAgentCallTemplate(template, args);
    if (filled !== expected) {
      const at = [...filled].findIndex((ch, i) => ch !== expected[i]);
      fail(`${spec.id}: 模板填回后与 renderTask 不一致（${label}，首个差异在第 ${at + 1} 个字符）`);
    }
  }
}

// 7. 只读角色的机械约束：patch 里的 fs 行必须关掉 write / edit（persona 之外的第二道）。
for (const spec of specs) {
  const row = patchRows.find((candidate) => candidate.id === `preset-${spec.id}`);
  if (!row) continue;
  const fsRow = (row.config?.plugins ?? []).find((plugin) => plugin.id === 'fs');
  if (fsRow === undefined) continue;
  const wantReadOnly = spec.readOnly === true;
  if (wantReadOnly && (fsRow.config?.write !== false || fsRow.config?.edit !== false)) {
    fail(`${spec.id}: 只读角色的 fs 行必须 write:false / edit:false`);
  }
  if (!wantReadOnly && (fsRow.config?.write === false || fsRow.config?.edit === false)) {
    fail(`${spec.id}: 可写角色的 fs 行不应关闭 write / edit`);
  }
  // 工具行必须与 role.tools 一一对应且顺序一致（工具面也是投影，不是手写）。
  const toolIds = (row.config?.plugins ?? []).filter((plugin) => plugin.id !== 'persona').map((plugin) => plugin.id);
  if (JSON.stringify(toolIds) !== JSON.stringify(spec.tools)) {
    fail(`${spec.id}: patch 工具行 [${toolIds.join(', ')}] 与 role.tools [${spec.tools.join(', ')}] 不一致`);
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
