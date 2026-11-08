# KnowStack 0.5.1 最终回复提醒验证

## 结果与范围

- 按用户要求先提交已有 0.5.0 改动：`6bc03c9 feat(knowstack): add read-only outdated memory reminders`。提交前 149 项 Node 基线测试通过，提交后工作区干净；本版后续改动独立保留在工作区，未推送。
- 最终语法检查覆盖根目录 JavaScript、全部 Renderer 模块及测试 CJS；Node 回归 **155 项通过，0 失败**。
- Chrome 模拟宿主：1100px 和 390px 各 11 项提醒交互，合计 **22 项通过**。运行记录保持折叠且不挂载工具卡，最终回复槽位单独显示提醒。
- 原记忆编辑器可信输入回归 **8 组通过**：桌面与窄屏的取消删除、Esc、保存删除、放弃草稿；均使用模拟项目数据，不访问真实记忆。
- 已只读核对本机宿主挂载实现：`entryExtra` 在完整助手回答结束后挂载，提供 `message`、`messageId`、`sessionId`；正文位于 `message.content`。代码块渲染槽位只提供 `language`、`source`，不适合作为可信会话来源。本版不加载宿主模块、不修改宿主代码。
- **尚未在真实 PI-Desktop 安装新版并触发最终卡片**。浏览器测试使用模拟宿主与 hooks 适配，不能替代真实 React 槽位、Markdown 注释保留及 Agent 输出行为的安装验收。未删除、改写或新增真实项目记忆。

## 使用变化

疑似过时提醒不再只能从工具运行记录查看。报告成功时返回 `finalReminder`：可读文字提醒、具体条目标题和一行报告 ID 注释。工具描述及 Agent 指引要求将该字段原样附在最终回答末尾，不放进代码块，也不只输出到运行过程。

最终回答下方的 `entryExtra` 提取独立回执标记，使用宿主提供的会话 ID 查询真实报告。无需工具卡先挂载，也不从最终回答文字接受记忆原文、原因、目标项目或删除指令。报告 ID 对应原服务记录，沿用原有会话、项目、快照、15 分钟有效期与只读核验。

卡片采用琥珀色警示线和“知栈 · 过时记忆待检查”标题。条目标题和定位／忽略按钮靠前；原文和依据可展开。首个定位按钮在测试布局中位于宿主默认 320px 折叠高度内。长内容或多条提醒仍可能需要宿主的“展开完整内容”，不要求展开工具运行记录。

删除规则保持不变：打开只定位，不改草稿；由用户自行确认删除草稿并点击保存后才写入。自动保存开关不授权删除。

## 证据对应

| 证据 | 验证结论 | 实现位置 |
| --- | --- | --- |
| `tests/knowstack.test.cjs` 最终回执用例 | 标记来自真实报告 ID，重复跳过不返回回执，原生写入为 0 | `outdated-reports.js`、`knowstack-extension.js` |
| `tests/knowstack-ui.test.cjs` 最终回复用例 | 仅挂载 `entryExtra` 即可加载提醒；无标记、无会话、错误消息 ID、用户消息不查询；复制到其他会话或重载后不泄露原文、不提供操作 | `renderer/outdated-ui.mjs`、`renderer/knowstack.mjs` |
| 同文件的标记解析测试 | 支持宿主字符串及文本分块，去重和限量；代码块、缩进代码及引用不触发提醒 | `finalReminderIds` |
| `tests/outdated-browser.html` + `tests/outdated-cdp.cjs` | 运行记录未挂载时最终卡片仍显示，原文可展开、定位高亮、忽略、失效、窄屏和模拟用户删除链路通过 | `makeOutdatedEntry`、`makeOutdatedCard` |
| `tests/memory-input-cdp.cjs` | 原有删除确认及关闭编辑器后可信聊天输入不回归 | 原记忆编辑器 |

模拟截图：[桌面最终提醒](outdated-card-0.5.1.png)、[窄屏最终提醒](outdated-card-0.5.1-narrow.png)、[定位编辑器](outdated-editor-0.5.1.png)、[窄屏编辑器](outdated-editor-0.5.1-narrow.png)。这些不是实机截图。

## 复现本地检查

要求 Node.js 22+ 与本机 Chrome；可通过 `CHROME_PATH` 指定 Chrome。

```bash
for f in *.js renderer/*.mjs tests/*.cjs; do node --check "$f"; done
node --test tests/*.test.cjs
node tests/outdated-cdp.cjs
KNOWSTACK_SCREENSHOT_DIR="$PI_SCRATCH_DIR" node tests/memory-input-cdp.cjs
git diff --check
```

`outdated-cdp.cjs` 默认生成本版模拟截图；设置 `KNOWSTACK_SCREENSHOT_DIR` 可避免改写截图。使用 PI-Desktop 的 `PluginCheck` 和 `PluginPack` 校验并生成 `dist/local.project-memory-api-probe-0.5.1.piplug`，不手工压缩。

## 安装验收

1. 安装 0.5.1 包，确认插件注册版本为 0.5.1，并重启当前会话 Agent。没有新增权限。
2. 在测试项目手动添加可丢弃的测试记忆，并明确告知 Agent 该测试规则已废弃，要求只提醒、不删除、不新增记忆。
3. 折叠工具运行记录，等待任务结束。检查最终文字提醒和其下方原生卡片：标题、条目、原因、定位／忽略按钮均应可见。
4. 如果仅有文字没有卡片，检查最终原始消息是否包含工具返回的独立 HTML 注释标记、插件 Renderer 是否为新版；不能把 `reported` 等同于实机卡片已显示。
5. 点击定位，核对正确项目与条目，确认没有自动删草稿或保存。是否真正删除由用户自行决定。
6. 跨会话粘贴标记不能读取报告。忽略、修改原文、换项目、15 分钟后或插件重载，应分别走原有失效保护。

## 已知边界

- 显示依赖 Agent 保留 `finalReminder` 及标记。旧版已结束回复没有标记，不自动补卡；模型不遵循指引时不能保证出现卡片。
- 无插件 Renderer 时保留文字提醒；临时报告不跨插件重载恢复。失效卡片没有操作能力。
- 同报告在工具区和最终回复区可有两张展示实例；每次操作仍重新核验服务记录，不能因某个实例显示旧状态就绕过忽略、变化或失效保护。
- 原生记忆保存仍是宿主内部 IPC 的整表保存，不具备原子比较并保存；本版不改变这一已有边界。
