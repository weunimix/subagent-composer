# AGENTS.md

## 这个仓库是什么

DSH（DeepSeek Harness）的角色编译器：`src/roles/*.role.ts` → `dist/cordis.patch.yml` + `dist/roles.json`。

## 改动前必须知道

- **`dist/` 是产物**：只由 `npm run build` 生成，任何手改都会在下次 build 被覆盖。
- **`kernel/` 不引用具体角色**：内核只依赖 `types.ts` 里的形状。
- **角色清单只有一个来源**：`src/roster.ts` 的 `ROLE_CLASSES`。不要在别的文件里再列一遍。
- **persona 文本只由 `identity` / `extraDiscipline` / `steps` 渲染**：子类不得自己拼 markdown 段落。
- **不写示例**：结构化派工单的目的是消除冗余，示例属于冗余。
- **persona 里禁止出现 `{{` `}}`**：DSH 会当作模板变量解析，未注册会让提示词组装整体失败。

## 改完必须做

```bash
npm run typecheck && npm run build
```

然后检查 `dist/cordis.patch.yml`：角色数、preset id、工具行是否与 `roster.ts` 一致。

## 提交

Conventional Commits（`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`），改动走 PR，不直推默认分支。
