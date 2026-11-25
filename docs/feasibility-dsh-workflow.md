# 可行性验证报告：把执行层交给 dsh_workflow（REQ-2026-001）

- 日期：2026-11-26
- 环境：macOS，node v26.13.1，`@deepseek-ai/dsh` 0.2.2-rc.5（`dsh-workflow` 0.2.2-rc.5，guest 运行时来自 `dsh-workflow-ptc`）
- 提问：subagent-composer 现在自己实现的执行层（派工、顺序、等待、重试、失败判定、权限、用量），哪些能整体交给 `dsh_workflow`？迁移后插件的能力边界收到哪里？
- 方法：4 次真实 workflow run + 安装包源码核对（不是读文档、不是猜 API）
- 约束：验证期间未改 `src/`；本报告与临时脚本是唯一新增物

## 一、结论

**可行，但迁移的边界不在「全部」而在「执行层」。**

| 结论 | 含义 |
| --- | --- |
| 执行层可以整体迁走 | 派工目标、顺序、并发、等待、gate、失败判定、重试/超时策略都能由 workflow 脚本承担 |
| 身份与权限载体迁不走 | 子 agent 的 persona 只能内联进 prompt；工具面 / readOnly 只能由 agent preset 决定，而脚本层没有指定 preset 的入口 |
| 有两项能力当前版本根本没有 | per-task `usage`、run 持久化（`workflow_manage runs` 返回 `[]`），迁移后也不会凭空出现 |
| 因此插件的边界 | 从「角色定义 + 派工工具」缩为「角色定义编译器」：同一份 `RoleSpec` 投影成 preset（权限/身份给 DSH 用）与 workflow 调用（prompt + schema 给脚本用）；`delegate_*` 退役 |

一句话：**方案里的「结果 B」不是退而求其次，而是这个版本上唯一成立的形态**——workflow 拿不到 preset，所以它必须拿到完整的 prompt；而 prompt 只能由编译器在生成期给出。

## 二、要迁移的「实现层」到底是什么

先拆清楚插件现在在运行时替宿主做了哪几件事（`src/plugin/delegate.ts`）：

| # | 现在的职责 | 现状实现 |
| --- | --- | --- |
| R1 | 把每个角色注册成一个工具（`delegate_<id>`） | `tools.register`，由模型决定调哪一个 |
| R2 | 决定「哪个角色、什么任务」 | 工具名 + 参数 schema（`spec.task`） |
| R3 | 拼任务单文本 | `renderTask(spec, args)` |
| R4 | 指定子会话的身份 | `startActivation({ agentPreset: spec.id })` |
| R5 | 指定输出契约 | `outputSchema: toJsonSchema(spec.output)` |
| R6 | 指定工具面 / 只读 | preset 的插件行（`write:false/edit:false`） |
| R7 | 把子会话 id 交回父 agent | 工具返回值 `{ subagentId }` |

其中 R2/R3/R4/R5/R6 是「派工」，R1/R7 是「把派工包装成模型可调用的工具」。**迁移的目标是 R1–R5、R7 交给 workflow，R4/R6 只能留在 preset。**

## 三、逐能力判定（主表）

| 能力 | workflow 能接吗 | 证据 | 迁移后归属 |
| --- | --- | --- | --- |
| 派工目标（下一步找哪个角色） | **能** | 脚本里 `agent(prompt, opts)` 由你写死每一步用哪个 prompt | flow 脚本 |
| 身份 / persona | **不能透传，只能内联** | `agent()` 没有 `preset` 入口（见 E1） | 编译器把 `spec.persona` 写进 prompt |
| 任务输入渲染 | **能** | prompt 是任意字符串；本仓库 `renderTask` 在生成期产文本 | 编译器（生成期） |
| 输出契约 | **能** | `opts.schema` 实测支持 `items.properties + required + enum`（见 E2） | 编译器产 `toJsonSchema`，脚本透传 |
| 顺序 / 并发 | **能** | 脚本 `pipeline/parallel/await` | flow 脚本 |
| 等待 / 轮询 | **能** | 普通 async 代码 | flow 脚本 |
| gate（业务判定） | **能** | 脚本里 `if (verdict !== 'pass') return {...}`，见 E4 第一次 run 被拦 | flow 脚本 |
| 失败判定 | **能，但必须显式写** | 子 agent 失败 **resolve 成 `null`**（E3），不是 reject | flow 脚本 |
| 重试 | **能，但要自己写** | 引擎无 retry；循环调用即可（本仓库 `maxAttempts`） | flow 脚本 |
| 超时 | **能，但要自己写** | `agent()` 无 `timeoutMs`；run 整体 `timeoutMs: null` | flow 脚本 |
| 模型 / provider 覆盖 | **能** | `opts.provider` / `opts.model` 在支持列表内 | flow 脚本 |
| 工具面（readOnly、白名单） | **不能** | 脚本层无 tools/readOnly；工具面只由 preset 决定（E1 的 supported 列表） | preset 投影（现状保留） |
| per-task 用量（usage） | **不能** | `WorkflowResult = { value, stopReason, error?, agentsStarted }`；源码无 usage | 宿主能力缺口，报告如实登记 |
| run 持久化 / 冷恢复 | **不能** | `workflow_manage runs` 返回 `[]`，无 runId 可点开 | 宿主能力缺口 |
| 把结果交回父 agent | **能** | 脚本 `return` 值就是工具结果 | flow 脚本 |

判定依据不是文档，是运行时把未支持的键**直接拒绝**：

```js
// /Users/minxuwei/Developer/dsh-rc5/node_modules/@deepseek-ai/dsh-workflow-ptc/src/runtime.ts
const SUPPORTED_AGENT_OPTIONS = new Set(['label', 'phase', 'schema', 'provider', 'model']);
const DEFERRED_AGENT_OPTIONS = new Set(['effort', 'isolation', 'agentType']);
// :255  deferred 键 → "agent() option \"...\" is deferred and not supported by this engine"
// :257  其余键   → "agent() option \"...\" is not recognized (supported: label, phase, schema, provider, model)"
```

`agent()` 内部只把 `schema / provider / model` 转给 `startAgent({...})`；`stopReason === 'completed'` 且有 schema 时返回 `result.structured`，否则返回文本，非 completed 返回 `null`。**没有 preset、tools、usage 的任何透传。**

## 四、决定性实验（原始输出）

### E1：脚本层能不能按 agent preset 派工 → 不能

```js
await agent(args.prompt, { schema: args.schema, preset: 'retrieval-reader' })
```

```
Error: workflow run failed: WorkflowError: agent() option "preset" is not recognized
(supported: label, phase, schema, provider, model)
    at WorkflowExecution.readAgentOptions (dsh-workflow-guest.js:870:10)
```

对照组（同一份 prompt 去掉 `preset`）跑通，返回 25 张证据卡。

结论：**身份不能靠「让子 agent 自己加载 preset-<role>」实现**，必须在 prompt 里自带。

### E2：schema 能不能表达 evidenceCards 这种嵌套结构 → 能

```js
schema: { type:'object', properties:{ cards:{ type:'array', items:{ type:'object',
  properties:{ doc:{type:'string'}, claim:{type:'string'}, confidence:{type:'string', enum:['high','medium','low']} },
  required:['doc','claim'], additionalProperties:false } } }, required:['cards'] }
```

跑通，返回结构完全符合，`enum` 生效。**但**当时本仓库编译器对 `object[]` 只产 `{type:'array', items:{type:'object'}}`——引擎够用，是编译器在降级（阶段 2 已用 `FieldSpec.fields` 补齐）。

### E3：子 agent 失败时脚本看到什么 → `null`（不是异常）

```js
await agent('回复 ok', { provider: 'no-such-provider' })
// → { mode: 'resolved', out: null, isNull: true }
```

结论：**「失败」在 workflow 里不是异常，是空值**。迁移后所有失败判定、重试都得由脚本显式写，否则会带着 `null` 继续往下跑。

### E4：整条链路能不能真的跑完 → 能，且 gate 真的拦得住

`scripts/flows/retrieval-audit.mjs` 的 guest 脚本，同一个 `meta.name = retrieval-audit-flow`：

| run | 输入 | 结果 |
| --- | --- | --- |
| #1 | 4 篇文档 | `completed (2 agents)`，`stop=gate-revise`，27 张证据卡，`missingDocs=['AGENTS.md']`，**综合员没启动** |
| #2 | 补上 AGENTS.md + `forceSynthesize` | `completed (3 agents)`，`stop=done`，29 张卡，三阶段各 1 次尝试、0 重试，产出 answer/citations/uncertainties |

这说明：顺序、gate、失败后停止、按上一阶段输出填下一阶段输入（`evidenceCards`、`verificationNotes`）——**这些原本压在插件/父 agent 里的东西，脚本都能做**。

### E5：脚本能不能直接读角色定义 → 不能（所以必须在生成期投影）

workflow 脚本跑在 guest 沙箱里，没有 `import`、没有 `require`、没有文件系统。它拿到的只有 `args`。

结论：**「运行时按角色查表」这条路不存在**。角色 → 调用参数的转换必须发生在构建/生成期，这正是适配器存在的理由，也是它「只有转换、没有状态」的原因。

## 五、结果 A 与结果 B

| | 结果 A：workflow 直接 target preset | 结果 B：编译器投影 prompt + schema |
| --- | --- | --- |
| 前提 | 脚本层能指定 preset | 不能（E1） |
| 人设来源 | 子 agent 自己加载 `preset-retrieval-reader` | 编译器把 persona 写进 prompt |
| 权限面 | preset 自带（只读/工具面精确） | 继承父级 preset，按任务收权不可行 |
| 结论 | **不可行** | **唯一可行路径** |

所以方案文档里「spawnAgent 能直接指向 RoleSpec 生成的 agent preset」这一前提在当前版本不成立。**事实修正：`spawnAgent` / `WorkflowSpawnAgentInput` / gate / retry / usage 都不存在**；脚本钩子只有 `agent / parallel / pipeline / phase / log`。

## 六、迁移前后的边界

```
迁移前（插件在执行期派工）
  RoleSpec ──► delegate_<role> 工具 ──► subagents.startActivation(preset, schema)
                                          └─ 子会话；顺序/等待/重试压回父 agent 对话

迁移后（插件在构建期投影，执行交给 workflow）
  RoleSpec ──► preset（身份/权限，给 DSH 装）
            └► agent 调用参数（prompt+schema，给脚本用）
                               │
                        workflow 脚本（顺序/gate/重试/失败判定/结果回传）
```

插件剩下的东西：**角色定义（唯一源）+ 两个投影 + 一个一致性断言**。运行时不再有派工工具，也不再持有执行状态。

## 七、迁不走的，以及代价（不假装解决）

| 缺口 | 后果 | 现状处理 |
| --- | --- | --- |
| 权限面 | 只读角色经 workflow 派工时继承父级 preset，仍可能写文件 | preset 路径仍 `write:false/edit:false`；workflow 路径的收紧留给宿主 |
| usage | 没有 token 台账，成本只能数 agent 次数 | 报告如实登记，不假造数据 |
| run 持久化 | 拿不到可点开的 runId，只能靠 `meta.name` + 返回体 | flow 返回值里带足摘要 |
| 失败语义 | `null` 会被当成正常结果往后传 | 脚本每次调用后显式判空（`templateProblems` / 重试循环已实现） |
| 超时 | 单个 `agent()` 不超时 | 脚本侧需要自己加（当前未加，记在缺口里） |

## 八、复现

```bash
# 1. 生成一次真实的 workflow 入参
node -e "import('./dist/index.js').then(m=>{const s=m.compileRoster().find(x=>x.id==='retrieval-reader');console.log(JSON.stringify(m.toAgentCall(s,{issueBrief:'b',focusStatement:'f',docPaths:['docs/feasibility-dsh-workflow.md'],round:1})))})"

# 2. 跑最小 flow（reader → verifier gate → synthesizer）
node scripts/flows/retrieval-audit.mjs

# 3. 引擎侧能力断言
grep -n "SUPPORTED_AGENT_OPTIONS\|DEFERRED_AGENT_OPTIONS" \
  ~/Developer/dsh-rc5/node_modules/@deepseek-ai/dsh-workflow-ptc/src/runtime.ts
```

## 九、这份报告改变了什么

1. 阶段 2 的适配器形态：不是「spawn 输入」，而是 `agent(prompt, options)` 入参，persona 必须内联。
2. 阶段 2 顺带补 `FieldSpec.fields`：不补，schema 是对 `object[]` 的假承诺。
3. 阶段 3 的 gate 只能写在脚本里，且必须判 `null`。
4. 阶段 4 的弃用理由不是「有更好的」，而是「这条路径在 rc.5 上本来就取不到 prompt」——`delegate.ts` 把 `prompt/parent/agentPreset` 放在嵌套 `request` 里，与 seam 的平铺契约不符（实测捕获的 spec keys：`provider,label,request,signal,delivery`）。
