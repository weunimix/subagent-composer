# 架构：单一事实来源（SSOT）分析

## 一页结论

本项目把「角色」拆成**一条源事实**（TS 类）与**三份派生**：persona-preset、派工单 schema、workflow 入参。
每份事实只有一处作者侧写入点；其余全部由 `npm run build` / `npm run check:projections` 现算或断言，禁止手改。

```
src/core/roles/*.role.ts    ← 唯一作者侧事实（身份、边界、步骤、任务字段、交付字段、工具）
src/core/roster.ts          ← 唯一角色清单
src/core/discipline.ts      ← 唯一共享纪律
src/core/roles/shapes.ts    ← 唯一跨角色子字段形状
adapters/dsh-preset/*       ← 角色 → preset 投影（emit / tools）
adapters/dsh-workflow/input ← 角色 → agent(prompt, options) 投影
        │  build
        └─→ dist/cordis.patch.yml   （装载期事实：preset 声明 + persona + 工具行）
```

运行期没有本包的代码：`dist/` 只有那份 patch 与给人 import 的库文件。**执行状态不在这张图里**：
派工顺序、等待、重试、gate、失败判定全部属于调用方（workflow 脚本），`core/` 只描述「角色是谁、要什么字段、交付什么」。

## 二、事实所有权表

| 事实 | 唯一来源 | 派生到 | 谁可以改 |
|---|---|---|---|
| 角色身份（我是谁） | `role.identity()` | persona 首段 | 角色文件 |
| 共享委派纪律 | `core/discipline.ts` | 每个角色的 persona | 内核 |
| 角色特有纪律 | `role.extraDiscipline()` | persona「纪律」段 | 角色文件 |
| 工作步骤 | `role.steps()` | persona「步骤」段（自动编号） | 角色文件 |
| 任务字段 | `role.task` | 任务单渲染（`core/render-task.ts`）、workflow 入参 schema 与 prompt | 角色文件 |
| 交付字段 | `role.output` | persona「交付字段」段、`outputSchema`（preset 与 workflow 共用） | 角色文件 |
| `object[]` 的子字段 | `FieldSpec.fields`（复用形状在 `core/roles/shapes.ts`） | `items.properties`；persona 里的缩进子字段行；任务单里的结构化示例 | 角色文件 / shapes |
| 工具能力 | `role.tools`（+ `role.readOnly`） | preset 的工具行；只读角色自动 `write:false`/`edit:false` | 角色文件 |
| 角色清单 | `core/roster.ts::ROLE_CLASSES` | preset id 集合、`compileRoster()` 的返回值 | 登记表 |
| 路由描述 | `role.when` | preset `description`（模型选角色时唯一可见的文字） | 角色文件 |
| 工具行定义 | `adapters/dsh-preset/tools.ts::TOOL_CATALOG` | patch 里的 tool 行 | 适配器 |
| 任务单措辞 | `core/render-task.ts::renderBody` | `renderTask`（按值）与 `renderTaskTemplate`（按占位符） | 内核 |
| workflow 入参 | `adapters/dsh-workflow/input.ts` | `toAgentCall` / `toAgentCallTemplate` 的 `{prompt, options}` | 适配器 |
| 占位符填槽规则 | `core/render-task.ts::fillSlots` | `fillTaskTemplate`、`fillAgentCallTemplate`、`fillSlotsSource`（注入 guest 的同一段源码） | 内核 |
| 执行状态（顺序/重试/gate） | **本仓库不持有** | 调用方的 workflow 脚本 | 不属于本仓库 |
| 产物（patch） | build | DSH Loader | 无人（禁止手改） |
| 安装状态 | 外部（profile） | — | 不属于本仓库 |

## 三、派生链与不变量

1. **一个角色 = 一条 preset**，id 为 `<role.id>`；patch 行 id 为 `preset-<role.id>`。
2. **rename 只发生在 id 上**：显示名只进 `config.name`，不参与路由。
3. **persona 文本 = identity + 纪律 + 步骤 + 交付字段**，四段各自一次，不允许角色再追加重复段落。
4. **同一事实不出现在两处**：`when` 只进 preset description 与任务单标题，不进 persona；`output` 字段说明只进 persona「交付字段」与 schema；`object[]` 的子字段只在 `fields` 声明一次，父字段 desc 只写一句语义，persona 由 `fieldLine` 递归展开成缩进子行。
5. **任务单只有一段措辞**：`renderTask` 与 `renderTaskTemplate` 共用 `renderBody`，且「是否结构化」只由字段声明决定（不看运行期的值）。填回占位符后必须与按值渲染逐字节相等——常规值、空对象数组、值里带字面 `<<x>>` 三种输入都由 `check:projections` 断言；类型与声明不符时两条路径都抛错，不会把对象印成 `[object Object]`。
6. **同一字段 desc 同时出现在 persona 与 outputSchema**：`check:projections` 逐字段比对；子字段的 desc 出现在 schema 的 `items.properties` 与 persona 的缩进子行里，两处都来自 `fields`。
7. **build 幂等**：同一份源码两次 build，`dist/` 字节一致。
8. **patch 文件带 GENERATED 头**，回读结果必须与 `RoleSpec.persona` 逐字节相等（YAML 块标量）。
9. **只读角色不落写权限**：`role.tools` 含 `fs` 且 `readOnly` 为真时，生成的 fs 行必须同时关掉 `write` 与 `edit`。**注意**：这条只在 preset 路径成立；workflow 路径继承父级 preset，按任务收权做不到（见「已知缺口」）。
10. **适配器只做投影**：`adapters/dsh-workflow/input.ts` 是纯函数，不持有状态、不判定失败、不重试、不拼工具面。gate 与重试留在脚本里。
11. **填槽只有一份实现**：`fillSlots` 是唯一实现；flow 脚本在生成期把 `fillSlotsSource`（`typeName` / `renderFieldValue` / `fillSlots` 三个自包含函数的源码）注入 guest，运行期跑的就是这段代码。`check:projections` 断言 guest 里只有 1 份 `fillSlots(`/`renderFieldValue(`/`typeName(`，并用假 agent 实跑（stop、调用次数、字面量保真、无残留占位符、`string[]` 拒绝对象项）。
12. **persona 是身份的载体**：0.2.0 起身份靠「persona 内联进 prompt」（preset 与 workflow 两条路径都如此），不再依赖 delegate 写死 `agentPreset`。

## 四、被消除的重复（对照 pi 版，以及抽 core 之前）

| 问题 | 本项目的处理 |
|---|---|
| `getSteps()` 与 `buildOutput()` 手写步骤双维护 | 步骤只来自 `steps()`，编译器统一编号 |
| `GeneralBase.HARD_CONSTRAINTS` 被每个子类复制 | 纪律只在 `discipline.ts`，渲染期内联 |
| `@displayName` 与 `@agentName` 二义 | 只有 `id`（路由用）与 `name`（给人看） |
| frontmatter / 目录 / 文件命名由编译器约定 | 全部消失：preset 声明由 DSH 承担 |
| 「何时调用」靠长提示词教 | `when` → preset `description` |
| 字段 → JSON Schema 的映射在两处各写一份 | 只有 `core/schema.ts` 一处（`objectSchema` / `fieldSchema`） |
| 任务单在两处渲染 | 只有 `core/render-task.ts`；workflow 侧是同一段措辞的占位符版本 |
| 子字段形状在每个角色里各写一份 | `core/roles/shapes.ts` |
| 子字段清单在 desc 散文里再罗列一遍 | 只在 `fields`；persona 由 `fieldLine` 展开 |
| 填槽在 core 与 flow guest 各写一份 | guest 注入 `fillSlotsSource`，运行期同一段源码 |
| 内核混着具体角色（`src/kernel` + `src/roles` + `src/roster.ts`） | `core/` 主体只依赖 `types.ts`；角色只在 `core/roles/` |
| 两套派工入口（delegate 工具 / workflow 脚本） | 只留 workflow；delegate 与 `调度者` preset 已删除 |
| 无人读取的 `dist/roles.json` | 删除；要角色清单用 `compileRoster()` |

## 五、已知缺口

1. **`dist/` 与源码的一致性仍是约定**：没有 CI 断言。`dist/` 在 `.gitignore` 里，`git diff --exit-code dist/` 永远是空的，靠不住；建议 CI 跑一次 `npm run typecheck && npm run build && npm run check:projections`，再 `npm run build` 一次比 `dist/*` 的哈希（幂等才是可靠信号）。
2. **workflow 路径权限面变宽**：子 agent 继承父级 preset，只读角色在 workflow 里仍可能写文件。要收紧只能在 preset 层做，或者等宿主支持按任务收权。
3. **没有 usage 台账**：脚本层与 seam 都不返回单次 token 用量，成本只能外部估算。
4. **run 不持久化**：`workflow_manage runs` 返回空数组，真实运行只有 meta.name 与返回体可作凭证，卡上留不下可点开的 runId。
5. **guest 是两段式**：沙箱没有 `import`，所以填槽源码必须在生成期注入；这是唯一一处跨边界拼接，靠 `check:projections` 的计数与实跑断言兜住。
6. **安装状态不可断言**：profile 里装了什么、preset 是否注册成功，只能看运行时日志/预设列表。
7. **`when` 的 60 字上限**是经验值，不是 DSH 限制；超出时应拆角色而不是放宽。

## 六、为什么这样切

- **运行时必须自包含**：子 agent 的系统提示词按字节计费、按字节缓存。共享纪律在 build 期内联进每个 persona，是「作者侧单源、运行期复制」，不算重复维护。
- **装载期与运行期分开**：preset 声明给 Loader 用（YAML），workflow 入参给脚本用（JSON），两者都从同一份 RoleSpec 现算，互不读取对方的产物。
- **执行状态外移**：gate、顺序、重试、失败判定只在调用方有意义，写进角色定义会让「角色」变成「流程」。所以 `core/` 不 import 任何适配器，也不认识 workflow。
- **core 不含角色以外的判断**：`core/` 主体只依赖 `types.ts`，因此可以单测、可以替换角色而不用动内核。
