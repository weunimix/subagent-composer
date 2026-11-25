# subagent-composer

把「角色定义」编译成两样东西，**同源、两种投影**：

1. **DSH agent preset**（`dist/cordis.patch.yml`）—— 每个角色一条 preset：persona + 工具面，子 agent 继承；
2. **dsh_workflow 的 `agent()` 入参**（`toAgentCall` / `toAgentCallTemplate`）—— 同一份 persona 与任务单，交给 workflow 脚本派工。

一句话：**角色写一次；向内是子 agent 的身份，向外是父 agent 能读的契约，向下是 workflow 能跑的任务入参。**

## 为什么有两套

因为 DSH 0.2.2-rc.5 的 workflow 脚本层**不能按 preset 派工**（`agent()` 只认 `label/phase/schema/provider/model`）。
所以人设必须随 prompt 走；也只有这样，gate、顺序、重试这些执行状态才能留在脚本里，而不是塞进角色定义。
实测依据见 [docs/feasibility-dsh-workflow.md](docs/feasibility-dsh-workflow.md)，契约与边界见
[docs/dsh-workflow-adapter.md](docs/dsh-workflow-adapter.md)，两条执行路径的取舍见
[docs/delegate-vs-workflow.md](docs/delegate-vs-workflow.md)。

## 目录

```
src/
  core/                 角色事实与纯编译（不 import 适配器，也不含执行状态）
    types.ts            RoleSpec / FieldSpec / ToolKey —— 投影的契约
    role.ts             作者侧 API：abstract class SubagentRole
    render.ts           persona 唯一渲染入口（身份 / 纪律 / 步骤 / 交付字段）
    render-task.ts      任务单渲染：按值（renderTask）与按占位符（renderTaskTemplate）
    schema.ts           字段声明 → JSON Schema（含 object[] 的 items.properties）
    discipline.ts       所有角色共享的委派纪律
    validate.ts         build 期断言（含嵌套 fields 的递归校验）
    roles/*.role.ts     具体角色，一个角色一个文件
    roles/shapes.ts     跨角色复用的子字段形状（证据卡、种子台账）
    roster.ts           角色登记表：编译范围唯一来源
  adapters/
    dsh-preset/         RoleSpec → DSH preset 投影（emit / tools / director）
    dsh-workflow/       RoleSpec → agent(prompt, options) 投影（input.ts）
  plugin/delegate.ts    旧派工工具（**已弃用**，见下）
  cli.ts                编译入口：core/ → dist/
scripts/
  check-projections.mjs 投影一致性检查（同一份 RoleSpec → persona / schema / 模板 / 工具入参）
  flows/                样例 workflow 脚本（编排只有在这里，角色事实不进来）
```

## 用法

```bash
npm install
npm run build              # 产出 dist/cordis.patch.yml 与 dist/roles.json
npm run typecheck
npm run check:projections  # 断言同一份角色事实驱动的多份投影没有漂移
```

装成 preset：

1. 用 DSH 插件管理器把**本仓库绝对路径**作为本地包装上（Agent 侧 `plugin_manager` 的 `install_bundle`）。
2. 装好后不需要重启，bundle 的 patch 合入 profile，多出各角色 preset 行。
3. 新会话里选预设 `调度者`（id `subagent-director`）。

跑 workflow 路径：

```js
import { toAgentCall, toAgentCallTemplate } from 'subagent-composer';
```

拿到的 `{ prompt, options }` 直接喂给 workflow 脚本里的 `agent(prompt, options)`；链式场景先用
`toAgentCallTemplate` 出带 `<<字段名>>` 占位符的 prompt，再用 `fillAgentCallTemplate(template, values)` 填
（只做一次正则替换：字段值里出现字面 `<<x>>` 不会被当成占位符二次替换）。完整样例见
`scripts/flows/retrieval-audit.mjs`：`node scripts/flows/retrieval-audit.mjs` 打印它导出的 `{ meta, source, args }`。

两条约束：

- 不要手改 profile 的 `package.json` / `cordis.patch.yml`，也不要往 profile 里跑包管理器——profile 的依赖与 patch 层由插件管理器维护。
- `dist/` 必须随包发布，所以 `package.json` 里有 `"files": ["dist"]`；缺了它本地包会因为 `.gitignore` 忽略 `dist/` 而被裁掉产物。

## delegate_* 已弃用

`delegate_<角色>` 工具（`src/plugin/delegate.ts`）自 **0.2.0 起弃用，0.3.0 移除**。它仍然注册（老 preset 里还写着本插件，删掉会让整个 preset 挂不上），但**调用会直接抛错**并指向迁移路径——静默失败比报错更糟。**不要在新代码里依赖它**。

弃用的直接原因：它把 `prompt/parent/agentPreset/outputSchema` 放在嵌套的 `request` 里，而 subagent seam 的契约是平铺字段，所以在本机 rc.5 上拿不到 prompt（实测输出与复现命令见 [docs/delegate-vs-workflow.md](docs/delegate-vs-workflow.md)）。要复活它，第一步是把调用改平，而不是加参数。

替代路径是 workflow：`toAgentCall` / `toAgentCallTemplate` + `scripts/flows/*.mjs`。

## 状态

- M0 编译器骨架：完成（角色 → preset 声明）。
- M1 装配验证：完成（DSH 0.2.2-rc.1 实测）。
- 0.2.0（需求 REQ-2026-001）：抽 `src/core` 与 `adapters/`，`object[]` 支持嵌套 `items.properties`，新增 workflow 投影与 `check:projections`，最小 flow 真实跑通（reader → verifier gate → synthesizer），delegate 路径弃用。
- 0.3.0 待办：移除 `plugin/delegate.ts`，同时把 `package.json` 的 `main` / `exports` 从它移走（否则是断崖）；`调度者` preset 的派工工具换成 workflow；`dist/roles.json` 去留裁决。明细见 [docs/architecture-ssot.md](docs/architecture-ssot.md) 的「已知缺口」。

架构与单一事实来源见 [docs/architecture-ssot.md](docs/architecture-ssot.md)。
