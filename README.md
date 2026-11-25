# subagent-composer

把「角色定义」编译成 DSH（DeepSeek Harness）能装载的两样东西：

1. **agent preset 声明** —— 每个角色一条 preset（persona + 工具面），被子 agent 继承；
2. **派工单 schema** —— 每个角色的任务字段，供主 agent 结构化填写。

一句话：**角色写一次，向内变成子 agent 的身份，向外变成父 agent 能读的契约。**

## 为什么不是 pi 版那套

pi 版的产物是 7 段 markdown（Identity / Should do / … / Output），只有「向内」的一面；
主 agent 派工时仍然写散文。本仓库只保留一面身份、新增一面契约，并且删掉了产物格式层
（frontmatter / 目录 / 命名）——DSH 里这些由 preset 声明与 Loader 承担。

## 目录

```
src/
  kernel/            编译器内核（不依赖任何具体角色）
    types.ts         RoleSpec / FieldSpec / ToolKey —— 派生物的契约
    role.ts          作者侧 API：abstract class SubagentRole
    render.ts        persona 唯一渲染入口
    schema.ts        字段声明 → JSON Schema
    emit.ts          角色 → preset 声明 / bundle patch
    tools.ts         能力键 → DSH 工具行
    discipline.ts    所有角色共享的委派纪律
    validate.ts      build 期断言
  roles/             具体角色（每个角色一个文件）
  roster.ts          角色登记表：编译范围唯一来源
  director.ts        导演 preset（主会话入口）
  plugin/delegate.ts 派工单工具：schema 生成 + 在 preset scope 内注册 `delegate_*`
  cli.ts             编译入口：roles/ → dist/
```

## 用法

```bash
npm install
npm run build       # 产出 dist/cordis.patch.yml 与 dist/roles.json
npm run typecheck
```

装进 DSH：

本仓库是一个 DSH bundle（`package.json` 里的 `dsh.bundle.patch` 指向 `dist/cordis.patch.yml`）。装进本机 DSH 并开始使用：

1. 用 DSH 的插件管理器把**包含本仓库的绝对路径**作为本地包装上（Agent 侧对应 `plugin_manager` 的 `install_bundle`，`target` 填仓库目录）。
2. 装好后**不需要重启**：bundle 的 patch 会合入 profile，多出各角色 preset 行与 `include:preset-subagent-director`。
3. 新开一个会话，在 Agent 预设里选择 `调度者`（id `subagent-director`），它会把活派给对应角色的子 agent（当前有 `节点审查` / `novel-audit`，以及 `检索阅读员`、`检索验证员`、`检索综合员`）。

两条约束：

- 不要手改 profile 的 `package.json` / `cordis.patch.yml`，也不要往 profile 里跑包管理器——profile 的依赖与 patch 层由插件管理器维护；profile 放在哪个目录由 DSH 按平台决定，不需要手工定位。
- `dist/` 必须随包发布，所以 `package.json` 里有 `"files": ["dist"]`。缺了它，本地包会因 `.gitignore` 忽略 `dist/` 而被裁掉产物，安装时报 `ENOENT .../dist/cordis.patch.yml`。

## 状态

- M0 编译器骨架：完成（角色 → preset 声明）。
- M1 装配验证：完成（DSH 0.2.2-rc.1 实测）。`plugin/delegate.ts` 在 preset scope 内注册
  `delegate_*` 工具，参数与输出 schema 均通过宿主的 `assertSupportedJsonSchema`；
  派工请求为 `provider: spawn` + `agentPreset: <角色 id>` + `outputSchema`。
  未跑的只有端到端一项：真实子会话需要新开会话并选 `调度者` 预设。
- M2 迁移既有角色 / M3 收编 workflow-composer：未开始。

架构与单一事实来源见 [docs/architecture-ssot.md](docs/architecture-ssot.md)。
