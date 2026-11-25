# AGENTS.md

## 这个仓库是什么

DSH（DeepSeek Harness）的角色编译器：`src/core/roles/*.role.ts` →（经两个适配器）→ `dist/cordis.patch.yml` + `dist/roles.json`。

目录：`src/core/` 放角色定义与纯编译（types / validate / discipline / render / schema / render-task / roles / roster），`src/adapters/dsh-preset/` 把 RoleSpec 投影成 DSH preset（emit / tools / director），`src/adapters/dsh-workflow/` 把 RoleSpec 投影成 dsh_workflow 脚本的 `agent(prompt, options)` 入参，`src/plugin/delegate.ts` 是运行时派工适配器。角色数据只从 core 流向适配器。

`object[]` 字段的子字段用 `FieldSpec.fields` 声明：声明了才产出 `items.properties`，不声明就退化为裸对象。跨角色复用的子字段形状放 `src/core/roles/shapes.ts`，不在各角色里各写一份。

## 改动前必须知道

- **`dist/` 是产物**：只由 `npm run build` 生成，任何手改都会在下次 build 被覆盖。
- **`src/core/` 主体不引用具体角色**：`core/types.ts`、`core/render.ts`、`core/schema.ts` 等只依赖 `types.ts` 里的形状；只有 `core/roles/*.role.ts` 与 `core/roster.ts` 知道具体角色。
- **角色清单只有一个来源**：`src/core/roster.ts` 的 `ROLE_CLASSES`。不要在别的文件里再列一遍。
- **persona 文本只由 `identity` / `extraDiscipline` / `steps` 渲染**：子类不得自己拼 markdown 段落。
- **不写示例**：结构化派工单的目的是消除冗余，示例属于冗余。
- **persona 里禁止出现 `{{` `}}`**：DSH 会当作模板变量解析，未注册会让提示词组装整体失败。

## 改完必须做

```bash
npm run typecheck && npm run build && npm run check:projections
```

然后检查 `dist/cordis.patch.yml`：角色数、preset id、工具行是否与 `core/roster.ts` 一致。阶段 1 之后产物必须与抽 core 前逐字节一致，结构变更要先说明。`check:projections` 断言同一份 RoleSpec 同时驱动 persona 与 workflow outputSchema：改字段只改一处，两份产物跟着变。

## 提交

Conventional Commits（`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`），改动走 PR，不直推默认分支。
