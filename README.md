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
  plugin/delegate.ts 派工单 schema 生成（工具注册待 M1）
  cli.ts             编译入口：roles/ → dist/
```

## 用法

```bash
npm install
npm run build       # 产出 dist/cordis.patch.yml 与 dist/roles.json
npm run typecheck
```

装进 DSH：

1. `pnpm --dir ~/.dsh/profiles/desktop add file:C:\...\subagent-composer`
2. 在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 里追加 `subagent-composer`
3. 重启 DSH，在 Agent 预设里选择 `调度者`（id `subagent-director`）

## 状态

- M0 编译器骨架：完成（角色 → preset 声明）。
- M1 装配验证：未完成。`plugin/delegate.ts` 目前只生成 schema，不注册工具——
  注册需要 `ctx.subagents.startActivation` 在 preset scope 内可用，尚未验证。
- M2 迁移既有角色 / M3 收编 workflow-composer：未开始。

架构与单一事实来源见 [docs/architecture-ssot.md](docs/architecture-ssot.md)。
