# 0.2.0 发布说明（subagent-composer）

## 一句话

角色定义从「kernel + roles + roster 三处混放」收敛到 `src/core`，同一份 RoleSpec 现在同时投影成 **DSH preset** 与 **dsh_workflow 的 `agent()` 入参**；旧 `delegate_*` 派工工具弃用（0.3.0 移除）。这是破坏性版本：`src/kernel/`、`src/roles/`、`src/roster.ts` 不再是路径，导出面新增 workflow 投影。

## 为什么升 0.2.0

- 目录结构破坏性变更：`src/core/`（角色与纯编译）+ `src/adapters/dsh-preset/`、`src/adapters/dsh-workflow/`（两套投影）+ 薄 `src/plugin/delegate.ts`。
- 导出面变化：新增 `toAgentCall`、`toAgentCallTemplate`、`renderTaskTemplate`，`toolNameOf` 标 `@deprecated`。
- 产物结构变化：`dist/roles.json` 里 `object[]` 字段新增 `fields` 块；`dist/cordis.patch.yml` **逐字节不变**。

## 新能力

| 能力 | 入口 |
| --- | --- |
| 角色 → preset 投影（不变） | `npm run build` → `dist/cordis.patch.yml` |
| 角色 → workflow 单次调用 | `toAgentCall(spec, args, overrides)` → `{prompt, options}` |
| 角色 → workflow 链式模板 | `toAgentCallTemplate(spec, overrides)` → `{promptTemplate, slots, options}` |
| `object[]` 嵌套输出 schema | 角色文件里 `fields: EVIDENCE_CARD_FIELDS` |
| 投影一致性检查 | `npm run check:projections` |

## 弃用

`delegate_<角色>` 仍然注册（老 preset 里还写着本插件），但**调用会直接抛错**并指向 workflow 路径。

`delegate_<角色>`（`src/plugin/delegate.ts`）：0.2.0 弃用，0.3.0 移除。仍注册以保老 preset 装载不炸，但它把 `prompt/parent/agentPreset` 放在嵌套 `request` 里，与 seam 的平铺契约不符，在本机 rc.5 不可用。替代路径：`toAgentCall` / `toAgentCallTemplate` + workflow 脚本。详见 `docs/delegate-vs-workflow.md`。

## 迁移

1. 引用 `dist/roles.json` 的工具：`object[]` 字段现在可能带 `fields`（`items.properties`），按需适配。
2. 调用 `delegate_*` 的会话：改用 workflow 脚本；脚本里 `phase()` 分段、`agent(prompt, options)` 派工。
3. 只读角色的权限保证：preset 路径仍然 `write:false/edit:false`；workflow 路径继承父级 preset，按任务收权暂不可行。

## 验证

```
npm run typecheck && npm run build && npm run check:projections
diff 基线 patch → 无输出（payload 未变）
真实 flow：reader → verifier gate → synthesizer，两次 run 均跑通（一次被 gate 拦、一次放行成稿）
```

## 0.3.0 待办

删除 `plugin/delegate.ts`；`调度者` preset 的派工工具换成 workflow；`dist/roles.json` 去留；workflow 路径的权限收紧。

## 已知缺口（不假装解决）

无 usage 台账；run 不持久化（拿不到可点开的 runId）；workflow 子 agent 继承父级权限面；`roles.json` 仍无人读取。
