# KnowStack 0.4.2 当前面板项目跟随验证

> 本版已完成自动化测试与宿主源码静态核对；尚未安装／重载到真实 PI-Desktop，未完成真实多窗口及记忆写入验收。以下浏览器截图使用模拟项目，不是宿主实机截图。

## 行为与保护

- 按要求先提交既有工作：`a13e730`，`feat(knowstack): add project memory editor and right-panel entry`。本版修改在该提交之后进行。
- 从右侧工作面板“新建（＋）→ 项目记忆”打开，读取同一 Renderer 窗口的项目，不再按名称默认选择首项目。项目栏只读，保留原编辑器和 15px 入口图标。
- 没有草稿时自动跟随该窗口项目；有草稿时保留旧项目内容、警告并禁用保存。用户确认“重新读取”后才丢弃旧草稿、读取当前项目。
- 无本地项目、远程项目、上下文切换中或无法识别宿主时停止读写，不回退其他项目。
- 保存前复核窗口项目及原生会话归属、项目根目录绑定和记忆快照。保存已发出后即使窗口切换，也只完成原目标请求，不把内容转发新项目；原生整表接口仍非原子操作。
- Agent `remember` 保持只追加；没有新增权限或第二套知识库。

## 证据 → 结论 → 位置

| 证据 | 结论 | 位置 |
| --- | --- | --- |
| 只读核对本机宿主 `app.asar` 的 Renderer HTML、入口导出及窗口状态字段 | 入口为本地 `assets/index-*.js`，存在窗口独立状态仓库；可做只读适配，但不是公共稳定 API，也不等于已实机运行 | `renderer/panel-context.mjs` |
| 32 项编辑器及上下文专项测试通过 | 非首项目选择、多根项目、窗口隔离、会话变更拒绝、切换竞态、草稿保护和订阅释放有自动化覆盖 | `tests/memory-editor.test.cjs`、`tests/panel-context.test.cjs` |
| 完整 Node 测试 126 项通过、0 失败；正式入口及所有 Renderer 模块语法检查通过 | 原 Agent 追加、模式设置及旧诊断回归继续通过 | `tests/*.test.cjs` |
| Chrome CDP 1100×900、390×850，记忆测试各 17 项通过 | 正式 UI 模块在模拟窗口状态下正确跟随，保留编辑、保存、确认、冲突、失败和键盘保护 | `tests/memory-browser.html` |
| Chrome CDP 1100×850、390×850，设置测试各 10 项通过 | 设置页交互无回归；浏览器共 54 项通过 | `tests/settings-browser.html` |
| `git diff --check` 通过 | 无差异空白错误，仅既有 LF/CRLF 提示 | 当前工作区差异 |
| `PluginCheck` 通过 | 清单及打包输入符合安装器规则；仅原有高风险权限授权提示 | `manifest.json` |

截图：[右侧入口](launcher-0.4.2.png) · [窄屏入口](launcher-0.4.2-narrow.png) · [编辑器](memory-0.4.2.png) · [窄屏编辑器](memory-0.4.2-narrow.png)。窄屏通过 CDP 显式设置视口并核对 `innerWidth === 390`，不是简单裁剪桌面画面。

## 兼容边界

当前公共 Renderer API 不提供当前面板项目。适配仅导入当前文档已加载的本地宿主入口模块，按状态形状查找唯一具有 `getState`／`subscribe` 的仓库，不写仓库、不硬编码 bundle 哈希或导出名，不使用跨窗口共享的 `workspace.get`，也不修改宿主文件。若未来模块导出或状态结构变化，会明确报错并停止读写，需要更新适配。

有活动会话时，通过固定 `sessionGet` 通道限制读取为 1 条消息、1 字符，仅用于归属复核；没有会话但当前窗口有本地项目时，按该窗口 `activeProjectPath` 匹配唯一项目组。消息内容不用于记忆编辑，也不回传 Agent。

最后一次核验与宿主写入之间仍存在非原子窗口，无法保证阻止所有外部整表并发写入。保存结果不确定时不自动重试。

## 复现与实机验收

从项目根目录运行：

```bash
for file in knowstack-main.js memory-service.js project-settings.js knowstack-extension.js renderer/*.mjs; do
  node --check "$file" || exit 1
done
node --test tests/*.test.cjs
git diff --check
```

使用支持本地 ES 模块的 Chrome 打开 `tests/memory-browser.html`，执行 `window.runBrowserTests()`，在 1100×900 和 390×850 下均应得到 `passed: 17`、`failed: 0`。设置页 `tests/settings-browser.html` 在对应宽度下各 10 项通过。

使用 PI-Desktop `PluginCheck(directory=".")`、`PluginPack(directory=".")` 生成 `dist/local.project-memory-api-probe-0.4.2.piplug`。

实际宿主待验收：

1. 安装／重载 0.4.2，在两个窗口分别打开不同项目，从各自右侧列表进入，确认项目名与路径属于该窗口（包括名称排序非首的项目）。
2. 无草稿时切换项目，确认自动跟随且另一窗口不受影响；没有项目或远程项目时不显示任意本地项目。
3. 有草稿时切换项目，确认旧草稿保留、保存禁用；拒绝重新读取保留草稿，确认后只读新项目。
4. 在可清理的测试项目中，显式执行新增、编辑、删除和保存，独立回读原生记忆；确认另一项目未被修改。当前任务没有执行这些真实数据操作。
