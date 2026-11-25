# 方案：用 dsh_workflow 净化 subagent-composer

## 一句话

保留 `RoleSpec` 作为角色的唯一作者侧事实，把「执行状态、派工顺序、等待、重试、用量」外移到 `dsh_workflow`，让 subagent-composer 从「角色定义 + 委派工具」的混合体变成「角色编译器 + 可选适配器」。

本方案假设目标工作区的 DSH 已满足 `dsh_workflow` 的版本要求，且可以在新会话里安装和试跑。

## 背景

subagent-composer 的原始目标是把角色写成一份 SSOT，再编译成 DSH 能装载的 preset。为了对接 DSH 自带的 subagent 体系，当前又额外实现了：

- 每个角色一个 `delegate_<id>` 工具；
- 导演 preset `subagent-director`；
- 派工单渲染、工具 schema 生成、子代理激活；
- 一部分「谁先跑、跑完等谁」的约束，只能写在文档和 persona 里。

这些执行层内容不是角色 SSOT 的一部分；它们让插件变大，也让「角色定义」和「任务编排」互相耦合。

`dsh_workflow` 已经提供持久运行状态、等待、并行、pipeline、gate、retry、usage 和 output schema。它不提供角色目录，也不应该成为角色的第二份定义。两者正好互补。

## 目标结构

```
src/
  core/                   角色 SSOT 与纯编译逻辑
    roles/                RoleSpec 角色文件
    roster.ts             唯一角色清单
    discipline.ts         唯一共享纪律
    render.ts             persona 渲染
    schema.ts             字段声明 → JSON Schema
    render-task.ts        任务参数 → 文本（纯函数）
  adapters/
    dsh-preset/           角色 → DSH agent preset / cordis.patch.yml
    dsh-workflow/         角色 → WorkflowSpawnAgentInput / 角色包
  cli.ts                  build 入口
```

角色数据只从 `core/` 流向两个适配器；适配器不反向定义角色。

## SSOT 边界

| 事实 | 唯一来源 | 说明 |
|---|---|---|
| 角色身份、纪律、步骤、任务与交付字段、工具面 | `core/roles/*.role.ts` | 不迁移到 workflow 脚本 |
| 角色清单 | `core/roster.ts` | preset 与 workflow 都从它取 |
| 共享委派纪律 | `core/discipline.ts` | 只渲染进 persona 或角色包 |
| 执行状态、顺序、等待、重试、usage | `dsh_workflow` | subagent-composer 不再持有 |
| DSH preset | `adapters/dsh-preset` | 一个投影，不是第二份角色定义 |
| workflow 消费的角色包 | `adapters/dsh-workflow` | 由 RoleSpec 编译，不手写 |

## 先做决策，不先重构

本方案是否「零胶水」，取决于 `dsh_workflow` 的 `spawnAgent` 能否直接指向由 RoleSpec 生成的 agent preset。先做一个最小 spike，再决定实施细节。

### 待验证问题

1. `subagentType` 或等价字段能否接受 agent preset id，例如 `retrieval-reader`？
2. `outputSchema` 能否表达嵌套 `object[]`，例如 `evidenceCards` 里的 `docPath`、`section`、`claim`、`quote`、`relation`、`confidence`？
3. `readOnly` 与工具白名单是否按任务生效，能否去掉 `fs-search` 这类越权读取？
4. 单任务 `usage` 是否可取得，能否满足 token 台账？
5. `spawnAgent` 失败、超时、取消时，返回值和重试语义是否足够？

### 两种结果

结果 A：可以直接 target preset。

- subagent-composer 只保留 preset 编译器；workflow 用 preset id 派工。
- `delegate_*` 和导演 preset 可以退役。
- 这是最干净的结果。

结果 B：只能传 prompt 和 schema。

- 增加一个薄适配器：`RoleSpec → WorkflowSpawnAgentInput`。
- persona、纪律、步骤、任务渲染都从 RoleSpec 生成；output schema 原样传给 `outputSchema`。
- `delegate_*` 和导演 preset 仍可退役，但保留一个「角色包」构建产物供 workflow 读取。
- 这仍然比现在干净，只是多一层编译。

## 实施阶段

### 阶段 0：spike

只选 `retrieval-reader` 一个角色，不改现有插件行为。

- 在正确 DSH 版本上安装 `dsh_workflow`；
- 用 RoleSpec 生成一次任务输入；
- 验证上面的五个问题；
- 记录结果 A 或 B，作为后续阶段的输入。

spike 不通过，就停在阶段 0，不开始大重构。

### 阶段 1：抽 core

- 把 `kernel/`、`roles/`、`roster.ts`、`director.ts` 中属于角色定义和纯编译的部分移到 `core/`；
- 把 `plugin/delegate.ts` 里的 `propertyOf`、`renderFieldValue`、`renderTask` 抽成纯函数；
- 保持现有 build 输出不变，先不加新适配器；
- `typecheck`、`build`、现有 delegate 行为必须保持不变。

目标：先证明「角色定义」和「执行代码」可以在目录上分开，而不改变运行结果。

### 阶段 2：加 workflow 适配器

按阶段 0 的结果二选一：

- 结果 A：只加 preset 查询/映射，workflow 通过 preset id 派工；
- 结果 B：新增 `toWorkflowAgent(role, args)`，输出 prompt、tools、readOnly、task 文本、output schema；构建时生成 workflow 可读的角色包。

适配器只做转换，不持有执行状态，不注册新的 delegate 工具。

### 阶段 3：接入 workflow

- 写一个最小检索 flow：reader → verifier gate → synthesizer；
- 用 `dsh_workflow` 的 spawn/wait/parallel/gate/usage；
- 用 RoleSpec 生成的角色包，不把角色定义复制进 flow 脚本；
- 先与旧 delegate 路径并存，用同一议题对比结果。

### 阶段 4：退役旧执行层

- `delegate_*` 标记 deprecated，保留一个兼容周期；
- `director.ts` 的调度职责迁到 workflow spec，导演 preset 可保留为兼容入口；
- README、`docs/architecture-ssot.md` 更新为 core / adapters 结构；
- 如果移除 delegate 属于破坏性变更，版本升到 0.2.0，并说明旧会话影响。

## 验收

- `npm run typecheck && npm run build` 通过；
- 角色清单仍只有 `core/roster.ts` 一处；
- 角色定义不在 workflow 脚本或适配器里重复；
- 构建产物仍能供 DSH preset 使用；
- workflow 适配器只做转换，不含状态机、等待、重试；
- spike 的五个问题有明确结论；
- 同一角色改动后，preset 与 workflow 两个产物同时更新；
- 旧 delegate 路径在迁移期仍可用，或有明确的弃用说明。

## 非目标

- 不把角色定义迁进 workflow 脚本；
- 不 fork `dsh_workflow`；
- 不在本方案里改角色契约的内容（字段、纪律、枚举）；
- 不重写检索流程本身；
- 不解决 DSH 版本升级问题，只假设目标环境已满足。

## 开放问题

- workflow 的角色包是构建产物、运行时读取，还是由一个小工具按需返回？
- 结果 B 下，任务参数渲染是否需要同时保留 JSON 和文本两种形式？
- 角色包是否需要版本号，以支持旧 workflow run 的冷恢复？
- `delegate_*` 的兼容周期多长，是否需要同时保留旧工具名？

## 新会话交接

在新会话里先读：

1. 仓库 `AGENTS.md`；
2. `docs/architecture-ssot.md`；
3. 本文档。

第一件事只做阶段 0 的 spike，不要先重构。spike 结束后先写结论：结果 A 还是 B，五个问题分别是什么答案，再进入阶段 1。
