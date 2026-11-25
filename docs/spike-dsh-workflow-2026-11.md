# 阶段 0 spike：dsh_workflow 能力实测（REQ-2026-001）

- 日期：2026-11-26
- 环境：macOS，node v26.13.1，DSH `@deepseek-ai/dsh` 0.2.2-rc.5
- 方法：用本仓库 `compileRoster()` 产出的 `retrieval-reader` RoleSpec 生成一次真实的 workflow 任务输入（prompt + outputSchema），跑 3 次真实 workflow run，并用安装包的实现源码交叉核对。
- 约束：未修改 `src/` 行为代码；本文件与临时脚本是唯一新增物。

## 一、结论先行

**走结果 B。**

结果 A（workflow 直接用 agent preset id 派工）在 0.2.2-rc.5 上不可实现：workflow 脚本的 `agent()` 只认 `label / phase / schema / provider / model`，没有任何「指定 agent preset」或「指定工具面」的入口。因此本仓库能提供的只有编译器 + 一个把 `RoleSpec` 投影成 `{ prompt, schema }` 的薄适配器。

同时修正方案里的三条事实假设（它们描述的是另一个版本的 API，当前安装版本不存在）：

| 方案假设 | 实测 |
| --- | --- |
| `spawnAgent` / `WorkflowSpawnAgentInput` | 不存在。脚本钩子是 `agent(prompt, opts)`，opts 见上。 |
| gate / retry 语义 | 不存在。重试与等待由脚本自己写（`pipeline` 对 item 失败返回 `null`，不重试）。 |
| 单任务 usage | 不存在。`WorkflowResult` 只有 `{ value, stopReason, error?, agentsStarted }`。 |

## 二、五个待验证问题

### Q1 workflow 能否按 agent preset id 定向派工？→ **否（脚本层）／是（底层 seam）**

实测：`agent(prompt, { preset: 'retrieval-reader' })` 直接失败，错误原文：

```
Error: workflow run failed: WorkflowError: agent() option "preset" is not recognized
(supported: label, phase, schema, provider, model)
    at WorkflowExecution.readAgentOptions (dsh-workflow-guest.js:870:10)
```

底层则支持：`ctx.subagents.startActivation(spec)` 的 spec 是**平铺**字段，含 `agentPreset`（"独立 preset id…Only spawn supports this choice"），`dsh-subagent-spawn-in-process` 声明 `capabilities.agentPreset: true`。`dsh-subagent/lib/index.js:294,321,1544` 直接读 `spec.agentPreset`。

推论：preset 定向只能由**我们自己的工具**（走 subagent seam）提供，不能由 workflow 脚本提供。

### Q2 outputSchema 能否表达嵌套 object[]（evidenceCards 内多个子字段）？→ **能，但当前编译器降级了**

实测（`spike-schema-nested-props`）：`{"cards":[{"doc":"a.md","claim":"…","confidence":"high"}]}` 这种 `items` 内带 `properties` + `required` + `enum` 的 schema 被接受，子 agent 返回的结构完全符合，`enum` 也生效。

但本仓库 `src/kernel/schema.ts` 对 `object[]` 只产出 `{ type: 'array', items: { type: 'object' } }`——不带子属性。所以：

- 引擎不会因为 schema 拒绝；
- 但**契约是空的**：evidenceCards 里 docPath/evidenceRef/section/claim/quote/relation/confidence 全部无约束，本次能被填满只是因为 persona 的「交付字段」段落里写了这些名字。

结论：引擎能力足够，差距在编译器。阶段 2 应扩展 `FieldSpec`，让 `object[]` 能声明子字段（`fields: TaskShape`），产出 `items.properties`。

### Q3 readOnly 与工具白名单能否按任务生效？→ **否（脚本层）／是（preset 层）**

`agent()` 没有 `readOnly`、`tools` 之类入口（同 Q1 的 supported 列表）。工具面只能由子 agent 继承的 preset 决定；而 preset 只能经 seam 指定（Q1）。

本仓库已按此建模：`readOnly: true` 的角色在 preset 里把 fs 行改成 `write:false, edit:false`。这个能力**保留在 preset 投影里**，workflow 路径不会带来按任务收权。

### Q4 单任务 usage 能否取得？→ **否**

- `@deepseek-ai/dsh-workflow/lib` 中 grep `usage` 无任何命中；
- `WorkflowResult` = `{ value, stopReason, error?, agentsStarted }`；
- workflow 工具的返回值也只有 `{ runId, agentsStarted, result }`；
- 底层 `SubagentResult` 同样没有 usage。

结论：token 台账在 0.2.2-rc.5 拿不到。方案里「用量外移给 dsh_workflow」这一条**暂时不成立**，只能等上游或自建计费埋点。

### Q5 失败/超时/取消的返回值与重试语义够用吗？→ **失败=null，超时不存在，重试不存在**

实测（`spike-child-failure`）：给 `agent()` 传一个不存在的 provider，**不抛异常**，resolve `null`：

```json
{ "mode": "resolved", "out": null, "isNull": true }
```

- 取消：只有 run 级别的 `cancel(reason)`（`WorkflowRun`），脚本内拿不到「这个 agent 被取消」的细粒度信号。
- 超时：`agent()` 没有超时选项，run 也没有整体超时（`timeoutMs: null`）。
- 重试：不存在，重试要自己在脚本里写。

对适配器的含义：适配器**不能**也**不必**实现重试/超时；这属于 flow 脚本作者的责任。方案「适配器只做转换，不含状态机/等待/重试」的约束正好与实测一致。

## 三、一次真实的 RoleSpec → workflow 运行

`spike-reader-role`：用 `renderTask(retrievalReader, args)` + `toJsonSchema(spec.output)` 作为 `agent()` 的入参，让子 agent 读 `docs/architecture-ssot.md` 与 `docs/plan-dsh-workflow.md`，产出证据卡。

- 运行结果：completed，1 agent，返回 25 张证据卡 + coverage + boundaryNotes + 7 个 questions + summary，结构完整。
- 说明：`compileRoster()` 的产物（persona 文本、任务渲染、output schema）可以直接作为 workflow 输入使用，无需改角色定义。
- 同一轮里它还指出两份文档对「什么算角色事实」的判断互相矛盾（详见下节）。

## 四、附带发现（spike 的副产品）

1. **`docs/architecture-ssot.md` 与 `docs/plan-dsh-workflow.md` 对「角色事实」的定义相反**：前者把 `director.ts`、`plugin/delegate.ts` 列进「唯一作者侧事实」，后者把它们判为执行层并计划退役。两份文档同时在线、交接清单要求都读。
2. **方案的 SSOT 边界表缺三行**：`role.when`（路由描述，preset description 的唯一来源）、`TOOL_CATALOG`（工具行定义）、`role.task`（任务字段的运行期载体）。抽 core 后这三类事实的归属在方案里没有落点。
3. **「纪律」在表里出现两次**：第 1 行挂角色文件、第 3 行挂 `core/discipline.ts`，未区分「角色特有纪律」与「共享委派纪律」。
4. **`plugin/delegate.ts` 与本机 seam 契约不符**：它调用 `startActivation({..., request: { prompt, parent, agentPreset, outputSchema }})`，而 rc.5 的 spec 是平铺的（`spec.agentPreset`/`spec.prompt`）。按源码，这个调用大概率已经拿不到 prompt 与 preset。阶段 1/3 必须实证并修（静待证据，不在本 spike 改动）。
5. **`roles.json` 的去留**：架构文档建议删，方案阶段 1 要求 build 输出不变——两者需要一个裁决点。

## 五、对后续阶段的影响（已写进卡）

- 阶段 1（抽 core）：先定 5 个归属裁决，再搬文件；产物必须逐字节不变。
  - `core/`：`types / validate / discipline / render / schema / render-task / roles / roster`
  - `adapters/dsh-preset/`：`emit / tools / cli 的写盘部分 / director`
  - `roles.json`：阶段 1 保留（保证产物不变），阶段 4 再决定删或保留。
- 阶段 2（适配器）：只做 `RoleSpec → { prompt, schema }`；顺手补 `FieldSpec.fields`，让 `object[]` 表达 `items.properties`。
- 阶段 3（flow）：重试/超时自己写在脚本里；`null` 是失败信号，必须显式判断。
- 阶段 4（退役）：`delegate_*` 先修平铺调用或直接标记 deprecated，二选一。

## 六、复现

```bash
# 1. 生成 RoleSpec → workflow 输入（已跑，产物 1.8KB）
node /tmp/spike-input.mjs > /tmp/spike-worker-input.json

# 2. 三次 workflow run：spike-reader-role / spike-schema-nested-props / spike-child-failure
#    由会话内的 workflow 工具执行，meta.name 即上面的名字
```

关键错误原文（Q1）与失败返回（Q5）见上文，可直接 grep 复现。
