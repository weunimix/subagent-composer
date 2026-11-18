# 架构：单一事实来源（SSOT）分析

## 一页结论

本项目把「角色」拆成**一条源事实**（TS 类）与**三份派生**（persona-preset、派工单 schema、导演路由表）。
每份事实只有一处作者侧写入点；其余全部由 `npm run build` 重新生成，禁止手改。

```
src/roles/*.role.ts      ← 唯一作者侧事实（身份、边界、步骤、任务字段、交付字段、工具）
src/roster.ts            ← 唯一角色清单
src/kernel/discipline.ts ← 唯一共享纪律
src/director.ts          ← 唯一导演人设
src/plugin/delegate.ts   ← 唯一委派工具（每角色一个 delegate_<id>）
        │  build
        ├─→ dist/cordis.patch.yml   （装载期事实：preset 声明 + persona + 工具行 + allowedAgentPresets）
        ├─→ dist/roles.json         （展示用快照：当前无人读取，见「已知缺口」）
        └─→ dist/plugin/delegate.js （运行期事实：工具的入参 schema 在装载时由 roster 现算）
```

## 二、事实所有权表

| 事实 | 唯一来源 | 派生到 | 谁可以改 |
|---|---|---|---|
| 角色身份（我是谁） | `role.identity()` | persona 首段、派工单描述 | 角色文件 |
| 共享委派纪律 | `kernel/discipline.ts` | 每个角色的 persona | 内核 |
| 角色特有纪律 | `role.extraDiscipline()` | persona「纪律」段 | 角色文件 |
| 工作步骤 | `role.steps()` | persona「步骤」段（自动编号） | 角色文件 |
| 任务字段 | `role.task` | persona 无关；→ delegate schema、`roles.json` | 角色文件 |
| 交付字段 | `role.output` | persona「交付字段」段、`outputSchema` | 角色文件 |
| 工具能力 | `role.tools`（+ `role.readOnly`） | preset 的工具行；只读角色自动 `write:false`/`edit:false` | 角色文件 |
| 角色清单 | `roster.ts::ROLE_CLASSES` | preset id 集合、`allowedAgentPresets`、delegate 工具集合 | 登记表 |
| 路由描述 | `role.when` | preset `description`（模型选角色时唯一可见的文字） | 角色文件 |
| 工具行定义 | `kernel/tools.ts::TOOL_CATALOG` | patch 里的 tool 行 | 内核 |
| 导演人设 | `director.ts` | 导演 preset 的 persona | 导演文件 |
| 产物（patch/json） | build | DSH Loader / delegate 工具 | 无人（禁止手改） |
| 安装状态 | 外部（profile） | — | 不属于本仓库 |

## 三、派生链与不变量

1. **一个角色 = 一条 preset**，id 为 `<role.id>`；patch 行 id 为 `preset-<role.id>`。
2. **rename 只发生在 id 上**：显示名只进 `config.name`，不参与路由。
3. **persona 文本 = identity + 纪律 + 步骤 + 交付字段**，四段各自一次，不允许角色再追加重复段落。
4. **同一事实不出现在两处**：`when` 只进 preset description，不进 persona；`output` 字段说明只进 persona「交付字段」与 schema，不再各写一份。
5. **build 幂等**：同一份源码两次 build，`dist/` 字节一致。
6. **patch 文件带 GENERATED 头**，回读结果必须与 `RoleSpec.persona` 逐字节相等（YAML 块标量）。
7. **身份不可省略**：delegate 工具把 `agentPreset` 写死为角色 id，模型没有「不选 preset」的选项；这是相对内置 `subagent` 的硬保证。
8. **只读角色不落写权限**：`role.tools` 含 `fs` 且 `readOnly` 为真时，生成的 fs 行必须同时关掉 `write` 与 `edit`。

## 四、被消除的重复（对照 pi 版）

| pi 版的问题 | 本项目的处理 |
|---|---|
| `getSteps()` 与 `buildOutput()` 手写步骤双维护 | 步骤只来自 `steps()`，编译器统一编号 |
| `GeneralBase.HARD_CONSTRAINTS` 被每个子类 `${this.HARD_CONSTRAINTS}` 复制 | 纪律只在 `discipline.ts`，渲染期内联 |
| `@displayName` 与 `@agentName` 二义 | 只有 `id`（路由用）与 `name`（给人看） |
| frontmatter 字段、目录、文件命名由编译器约定 | 全部消失：preset 声明由 DSH 承担 |
| workflow 的「何时调用」靠长提示词教 | `when` → preset `description` → 工具枚举，模型直接读 |
| 每个 agent 三份 markdown 段落各自渲染 | persona 一个渲染函数，四段拼接 |

## 五、已知缺口

1. **`dist/` 与源码的一致性只有约定**：没有 CI 断言「build 后工作区干净」。建议在 CI 里跑 `npm run build && git diff --exit-code dist/`。
2. **`roles.json` 无人读取**：`delegate` 在装载时直接 `compileRoster()`，`dist/roles.json` 只是给人和后续工具用的快照；若长期不用应删除，避免出现「第二份运行期事实」。
3. **工具名是外部契约**：`delegate_<id 中 - 换成 _>` 一旦被会话历史引用，改名会破坏冷恢复；改 id 属于破坏性变更，需要同时保留旧工具名或接受旧会话失效。
4. **安装状态不可断言**：profile 里装了什么、preset 是否注册成功，只能看运行时日志/Agent 预设列表。
5. **没有版本化产物**：字段结构变化时，旧会话冷恢复会读新 schema。建议后续加 `version`。
6. **`when` 的 60 字上限**是经验值，不是 DSH 限制；超出时应拆角色而不是放宽。

## 六、为什么这样切

- **运行时必须自包含**：子 agent 的系统提示词按字节计费、按字节缓存。共享纪律在 build 期内联进每个 persona，是「作者侧单源、运行期复制」，不算重复维护。
- **装载期与运行期分开**：preset 声明给 Loader 用（YAML），工具 schema 由插件在装载时从同一份 roster 现算（JSON 对象，不落盘解析），两者同源但不互相读取，避免运行期解析 YAML。
- **内核不含角色**：`kernel/` 只依赖 `types.ts`，因此可以单测、可以替换角色而不用动内核。
