# dsh_workflow 适配器：契约与边界

阶段 2 产物。对应需求 REQ-2026-001 / 功能点 p2，结论依据阶段 0 spike（`docs/feasibility-dsh-workflow.md`）。

## 一句话

`RoleSpec` 投影成 dsh_workflow 脚本里的一次 `agent(prompt, options)` 调用；顺序、等待、重试、失败判定全部留在脚本里。

## 接口

```ts
import { compileRoster, toAgentCall } from 'subagent-composer';

const reader = compileRoster().find((spec) => spec.id === 'retrieval-reader');
const call = toAgentCall(reader, { issueBrief, focusStatement, docPaths, round: 1 });
// 脚本里：
const result = await agent(call.prompt, call.options);
```

- `prompt` = `persona` + 空行 + `renderTask(spec, args)`。与 delegate 路径同一份措辞：delegate 的 prompt 只含任务单、人设由 preset 注入；workflow 子 agent 拿不到我们的 preset，所以人设必须随 prompt 走。
- `options` 只放脚本层认识的键：`label`（默认 `spec.name`）、`schema`（`toJsonSchema(spec.output)`），以及可选的 `phase` / `provider` / `model`。

## 为什么是这个形状（阶段 0 实测）

| 事实 | 实测结论 | 对适配器的影响 |
| --- | --- | --- |
| 脚本层能否按 preset 派工 | 否：`agent() option "preset" is not recognized (supported: label, phase, schema, provider, model)` | 人设必须进 prompt，不能让子 agent 自己去加载 preset-<role> |
| outputSchema 能否表达嵌套 object[] | 能：`items.properties + required + enum` 实测通过 | 补 `FieldSpec.fields`，证据卡子字段才不是空的 |
| readOnly / 工具白名单按任务生效 | 脚本层否；preset 层可以（现状即如此） | 适配器不做工具面，workflow 路径的权限等于父级 preset |
| 单任务 usage | 否：`WorkflowResult` 只有 `value / stopReason / error / agentsStarted` | 适配器不产 token 台账；脚本只能自己数 agent 次数 |
| 失败 / 超时 / 取消 | 子 agent 失败 **resolve** 而不是 reject；无超时；无重试 | 脚本必须显式判空，自己实现超时与重试 |

## 不做的事（每次 review 都按这条查）

- 不持有执行状态：没有队列、没有轮询、没有 `await sleep`。
- 不做失败判定：`agent()` 返回 `null` 时该重试还是放弃，由脚本决定。
- 不拼工具面：`readOnly`、工具白名单仍只经 preset 生效。
- 不写第二份角色事实：措辞全部来自 `persona` 与 `renderTask`，schema 全部来自 `toJsonSchema`。

## 验证方式

```bash
npm run typecheck && npm run build && npm run check:projections
```

`check:projections` 断言：交付字段的 desc 同时出现在 persona 与 workflow schema；`object[]` 子字段在 schema 里逐层展开且 required 一致；patch 里的 persona 与 `RoleSpec.persona` 逐字节相等；delegate 入参也展开同一批子字段。

真实运行记录：run `p2-adapter-agent-call`，把 `toAgentCall(retrieval-reader, …)` 的产物直接喂 `agent()`，返回 14 张证据卡，7 个子字段齐全，`relation` / `confidence` 落在 enum 内。

## 已知缺口

- 只有证据卡与种子台账声明了子字段；`conflicts`、`presumption`、`coverage`、`negativeClaims`、`issues` 仍是裸对象（`items: { type: 'object' }`），要约束得按同样方式补 `fields`。
- workflow 路径的权限面等于父级 preset：只读角色跑在可写 preset 下就仍是可写。要修只能在 preset 侧解决，适配器无能为力。
