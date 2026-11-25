# 0.2.0 发布说明（subagent-composer）

## 一句话

角色定义收敛到 `src/core`，同一份 RoleSpec 投影成 **DSH preset** 与 **dsh_workflow 的 `agent()` 入参**；
仓库不再持有执行层：旧 `delegate_*` 派工工具、`调度者`（`subagent-director`）preset、`dist/roles.json` 全部删除。

## 为什么升 0.2.0

- **目录**：`src/kernel/` + `src/roles/` + `src/roster.ts` → `src/core/`（角色与纯编译）+ `src/adapters/dsh-preset/`、`src/adapters/dsh-workflow/`（两套投影）。
- **导出面**：新增 `toAgentCall`、`toAgentCallTemplate`、`fillAgentCallTemplate`、`fillSlots`、`fillSlotsSource`、`fillTaskTemplate`、`renderTaskTemplate`、`slotToken`；移除 `toolNameOf` 与 delegate 注册。
- **产物**：`dist/` 只剩 `cordis.patch.yml` 与库文件；`roles.json` 删除；patch 里 reader 的 persona 展开子字段行、`调度者` 行消失。

## 新能力

| 能力 | 入口 |
| --- | --- |
| 角色 → preset 投影 | `npm run build` → `dist/cordis.patch.yml` |
| 角色 → workflow 单次调用 | `toAgentCall(spec, args, overrides)` → `{prompt, options}` |
| 角色 → workflow 链式模板 | `toAgentCallTemplate(spec, overrides)` → `{promptTemplate, slots, options}` |
| `object[]` 嵌套输出 schema | 角色文件里 `fields: EVIDENCE_CARD_FIELDS` |
| persona 自动展开子字段 | `core/render.ts::fieldLine` 递归 `fields`，desc 只写语义 |
| 投影一致性检查 | `npm run check:projections`（含 guest 填槽实跑） |

## 破坏性变更与迁移

1. **`delegate_*` 工具与插件入口删除**：`src/plugin/delegate.ts` 已移除，`package.json` 的 `main` / `exports` 指向 `./dist/index.js`。
   迁移：preset 里若仍写着 `{ id: 'delegate', name: 'subagent-composer' }`，删掉这一行；派工改用 workflow 脚本（`agent(prompt, options)`）。
2. **`调度者` preset（`subagent-director`）删除**：它唯一的派工手段就是 delegate。
   迁移：主会话入口改成直接跑 workflow 脚本；需要「先聊清楚」时用普通会话。
3. **`dist/roles.json` 删除**：它从 0.2.0 起就没有消费者。
   迁移：`import { compileRoster } from 'subagent-composer'`（运行期现算，不依赖快照）。
4. **persona 渲染变为递归**：`object[]` 声明了 `fields` 时，子字段以缩进子行出现，父字段 desc 不再罗列子字段。
   迁移：如果你比对过 patch 文本，reader 的「交付字段」段会多出 7 行子字段；任务单侧不受影响（子字段本来就在 workflow 入参 schema 里）。
5. **旧路径的坑不修了**：delegate 把 `prompt/parent/agentPreset` 放在嵌套 `request` 里，与 seam 的平铺契约不符，在本机 rc.5 拿不到 prompt。与其修一个没人该用的入口，不如删掉。决策记录见 `docs/delegate-vs-workflow.md`。

## 验证

```
npm run typecheck && npm run build && npm run check:projections
diff 基线 patch → 只有两处：reader persona 展开子字段、导演行消失
真实 flow：reader → verifier gate → synthesizer，两次 run（一次被 gate 拦、一次放行成稿）
```

## 已知缺口（不假装解决）

无 usage 台账；run 不持久化（拿不到可点开的 runId）；workflow 子 agent 继承父级权限面（按任务收权做不到）；`dist/` 与源码的一致性靠 CI 约定而非仓库内断言。
