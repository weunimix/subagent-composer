# 旧 delegate 路径 vs workflow 路径：对比与取舍

> **状态注记**：本文件是 0.2.0 收口时的决策记录。旧路径（`src/plugin/delegate.ts` 与 `调度者` preset）已删除，下文里的代码片段只作历史证据，不再可运行。

阶段 3 产物。对应需求 REQ-2026-001 / 功能点 p3，前提是阶段 0 的结论（结果 B）与阶段 2 的适配器。

## 一句话

两条路径喂给子 agent 的是**同一份 prompt 与同一份 outputSchema**；差别在承载方式、失败语义与权限面。旧 `delegate_*` 路径在本机 rc.5 上还有一个硬故障：交给 subagent seam 的调用形状不对。

## 对比

| 维度 | 旧 delegate 路径（`delegate_<role>`） | workflow 路径（`toAgentCall` / `toAgentCallTemplate`） |
| --- | --- | --- |
| 谁决定角色人设 | preset 注入（`preset-<role>` 的 persona 前缀） | 随 prompt 内联（脚本层无法按 preset 派工） |
| 谁决定任务措辞 | `renderTask` | 同一个 `renderTask`（模板模式下先出占位符、运行期填） |
| 交付 schema | `toJsonSchema(spec.output)` | 同一份 `toJsonSchema(spec.output)` |
| 有效 prompt | persona + 任务单 | persona + 任务单（同一个拼接结果） |
| 权限面 | 由 `preset-<role>` 决定，只读角色带 `write:false/edit:false` | 等于父级 preset，按任务收权做不到 |
| 失败语义 | 子 agent 失败 → 异常冒泡给调用方 | `agent()` **resolve null**，脚本自己判空/重试 |
| 超时 | 无（父级信号控制） | 无（`timeoutMs: null`），脚本自己数 |
| 并发与顺序 | 每个工具调用各自为政，编排者在父 agent 的对话里 | 脚本里的 `parallel` / `pipeline` / 顺序 await |
| 单次 usage | 无 | 无 |
| 本机是否可执行 | **否**：见下方硬故障 | 是（阶段 3 真实跑通） |

## 硬故障：delegate 交给 seam 的形状不对

`ctx.subagents.startActivation` 的契约是**平铺**的（`prompt` / `parent` / `agentPreset` / `outputSchema` / `agentOptions` 都在顶层），而 `src/plugin/delegate.ts` 传的是嵌套 `request: { prompt, parent, agentPreset, outputSchema }`。实测（把工具注册到一个假的 ctx，捕获真正传给 seam 的 spec）：

```
$ node -e "import('./dist/plugin/delegate.js')..."   # 见下方复现
spec keys: provider,label,request,signal,delivery
has prompt at top level: false
request keys: prompt,parent,agentPreset,outputSchema
```

seam 读顶层 `prompt`/`parent` 时会拿到 `undefined`，所以这条路径在本机 rc.5 上不可用。这也解释了为什么「旧路径能跑」这件事目前只有历史（v0.1.0 时代）的说法，没有本次可复现的运行。

## 复现

```bash
node -e "
import('./dist/plugin/delegate.js').then(async (m) => {
  const registered = []; const captured = [];
  m.apply({
    tools: { register: (d) => registered.push(d) },
    subagents: { startActivation: async (spec) => { captured.push(spec); return { subagentId: 'probe' }; } },
  });
  const tool = registered.find((d) => d.name === 'delegate_retrieval_reader');
  await tool.execute({ issueBrief: '议题', focusStatement: '中心', docPaths: ['docs/a.md'], round: 1 }, { agent: {}, signal: undefined });
  console.log(Object.keys(captured[0]));
});
"
```

## 取舍

**保留 workflow 路径作为主路径，delegate 路径删除。**（当时的裁决是「降级为兼容层，阶段 4 退役」；收口时判断保留一个「注册了但必抛错」的入口只会误导，于是直接删除。）

理由（按权重）：

1. **可执行性**：旧路径在本机 rc.5 有硬故障，workflow 路径阶段 3 真实跑通（见下）。
2. **编排能力**：gate / 顺序 / 重试只有脚本能表达；旧路径把编排推回父 agent 的对话里，不可复用也不可审计。
3. **一处源事实**：两条路径的 prompt 与 schema 现在由同一份 `RoleSpec` 与同一段渲染产出，`npm run check:projections` 断言了这件事；workflow 只是多了一层「先出模板、运行期填占位符」。
4. **代价我们认**：权限面变宽（只读角色在 workflow 里继承父级 preset）、prompt 变长（人设内联）、没有 usage 台账。这三条都写进了 `docs/dsh-workflow-adapter.md` 的「已知缺口」，不假装解决。

## 阶段 3 的真实运行记录

同一份 `scripts/flows/retrieval-audit.mjs` 跑了两次，run 名都是 `retrieval-audit-flow`：

| 次序 | 输入 | 结果 | 说明 |
| --- | --- | --- | --- |
| #1 | docPaths = 4 篇文档 | `stop: gate-revise` | reader 出 27 张卡；verifier 判 revise，列出 `missingDocs: [AGENTS.md]` 与 4 处引用瑕疵；gate 拦住，综合员未启动 |
| #2 | docPaths 补上 AGENTS.md，并显式 `forceSynthesize` | `stop: done` | 3 个 agent 各 1 次尝试；29 张卡；verifier 仍判 revise（7 条 unsupportedClaims），综合员带着 verificationNotes 成稿 |

两条可复用的结论：

- **gate 必须留在脚本里**：引擎不提供 gate，`agent()` 也不报错，只有脚本能把「verifier 判 revise」变成「不启动综合员」。
- **verifier 的 revise 不等于流程失败**：它给的是「证据够不够交付」，脚本可以选择重跑、补读、或带风险成稿。这条判定权在脚本，不在适配器。

判断链路的证据：run #2 的输入里有 `forceSynthesize` 时才出现第三个 agent，说明综合员的启动条件确实由脚本控制，而不是由引擎「顺手继续」。
