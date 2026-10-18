# KnowStack 0.4.3 删除确认与聊天输入验证

> 本版移除了系统确认框调用，浏览器回归通过；尚未安装到真实 PI-Desktop 验证 Windows／Electron 的焦点恢复。没有操作真实记忆或聊天草稿。

## 问题与修复

用户确认受影响的是**聊天消息输入框**，不是记忆条目输入框；点击差异审查卡片、切换右侧内容后可恢复。旧删除处理使用同步 `window.confirm()`，会创建宿主窗口之外的系统模态对话框；删除处理本身没有修改聊天 DOM 或禁用聊天输入框。

因此本版移除该系统模态路径：删除、放弃草稿、重新读取全部改为编辑器内部的非阻塞确认框。与窗口焦点有关的 Electron／Windows 底层故障未在独立 Electron 环境中复现，不能把 Chrome 模拟测试当作它的实机根因证明。

- 确认前不删除，取消／Esc／点击确认框外部只取消确认。
- 默认聚焦“取消”，Tab 在确认按钮间循环；背景编辑器仅在确认期间 `inert`，结束后解除并恢复焦点。
- 确认框和编辑器共用原宿主图层，关闭／卸载一起清理，不改变宿主聊天节点或窗口焦点。
- 确认期间项目改变时，旧删除操作不会应用到新项目的同 ID 条目。
- 删除仍只是草稿变化，必须点击保存才写入原生记忆。原项目跟随、快照冲突检查、回读验证和 Agent 只追加行为不变。

## 证据 → 结论 → 位置

| 证据 | 结论 | 位置 |
| --- | --- | --- |
| 新增测试在旧实现失败：`native confirm called` | 能捕获原系统确认调用路径；不等于已自动复现 Electron 聊天失焦 | `tests/memory-browser.html` |
| 修复后记忆界面 1100×900、390×850 各 20 项通过 | 删除／放弃确认、键盘、焦点恢复、项目切换保护和卸载清理通过；系统确认调用数为 0 | `renderer/memory-ui.mjs`、`tests/memory-browser.html` |
| 设置页 1100×850、390×850 各 10 项通过 | 设置功能无回归；两类浏览器交互共 60 项通过 | `tests/settings-browser.html` |
| 8 组 CDP 输入场景通过，每组 3 次可信 input 事件 | 取消删除、Esc、删除后保存、删除后放弃草稿，返回模拟聊天框后能输入中文、字母并退格；不是直接给字段赋值冒充输入 | `tests/memory-input-cdp.cjs` |
| Node 完整回归 126 项通过，语法检查和 `git diff --check` 通过 | 当前自动化检查未发现旧功能回归；仅 LF/CRLF 提示 | `tests/*.test.cjs`、正式入口与 Renderer 模块 |

页内确认截图（模拟项目）：[桌面](confirmation-0.4.3.png) · [窄屏](confirmation-0.4.3-narrow.png)。

## 复现自动化检查

Node.js 22+，本机安装 Chrome，从项目根目录执行：

```bash
for file in knowstack-main.js memory-service.js project-settings.js knowstack-extension.js renderer/*.mjs tests/memory-input-cdp.cjs; do
  node --check "$file" || exit 1
done
node --test tests/*.test.cjs
node tests/memory-input-cdp.cjs
git diff --check
```

CDP 脚本默认使用 Windows Chrome 标准安装路径，可通过 `CHROME_PATH` 指定。它只启动独立浏览器配置、读取本项目测试页及模拟数据；不会连接 PI-Desktop 或发送聊天。输出 `passed: 8`、`failed: 0`，同时运行桌面／窄屏记忆页回归并生成确认框截图。设置页可单独打开 `tests/settings-browser.html` 运行，每个视口应为 10 项通过。

使用 `PluginCheck(directory=".")` 和 `PluginPack(directory=".")` 验证并生成 `dist/local.project-memory-api-probe-0.4.3.piplug`，没有新增权限。

## 实际宿主待确认

安装／重新加载 0.4.3 后，在可清理的测试记忆中分别取消和确认删除，保存并关闭编辑器，再点击聊天框输入文字，确认**不需要切换侧边栏内容**也能继续输入；同时核对原生记忆中仅有显式保存的修改。如果旧窗口已经处于无法输入状态，可先使用用户已验证的侧边栏切换方式恢复，再加载新版。
