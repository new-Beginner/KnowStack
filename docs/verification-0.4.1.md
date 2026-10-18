# KnowStack 0.4.1 右侧入口迁移验证

## 本次变化

- 移除左侧聊天栏底部的书本入口，改在右侧工作面板“新建”列表显示“项目记忆”。
- 复用宿主 `work-panel-launcher-row`、`work-panel-launcher-icon`、`work-panel-launcher-label` 样式，图标为 15×15px、2px 圆角线条；不覆盖宿主行的尺寸、配色或悬停效果。
- 保留原记忆编辑弹窗及新增、编辑、删除、保存功能，不改变原生记忆接口、存储、Agent 工具或权限。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| 入口迁移回归，修改前 | 失败：`not in right launcher`，确认测试能够捕获旧入口 |
| Chrome CDP 1100×900，记忆管理 | 15 项通过，0 失败 |
| Chrome CDP 390×850，记忆管理 | 15 项通过，0 失败 |
| 原设置页，1100×850 / 390×850 | 各 10 项通过，0 失败 |
| `node --test tests/*.test.cjs` | 110 项通过，0 失败 |
| 正式入口及 Renderer 模块 `node --check` | 通过 |
| `git diff --check` | 通过，仅 LF/CRLF 转换提示 |
| `PluginCheck` | 通过，仅既有高风险权限授权提示 |

新增检查验证入口只在右侧列表、左侧无残留、文字标签完整、行尺寸与相邻项一致、SVG 实际尺寸为 15×15px。原有交互回归继续覆盖只读加载、草稿编辑、删除确认、统一保存、项目切换、并发冲突、失败保护、键盘、重挂载及卸载。

浏览器使用模拟项目、正式 UI 模块和宿主零尺寸弹层结构，没有修改真实项目记忆。截图：[右侧入口](launcher-0.4.1.png)、[窄屏入口](launcher-0.4.1-narrow.png)、[原记忆界面](memory-0.4.1.png)、[窄屏记忆界面](memory-0.4.1-narrow.png)。这些不是运行中 PI-Desktop 的实机截图。

## 接入边界

宿主正式 `contributes.views` 用于独立插件页面。本版为复用现有 Renderer 记忆读写与原弹窗，仅迁移 DOM 适配入口至 `.work-panel-launcher-list`，不引入独立页面或新权限。宿主 DOM 改变时可能需要更新；打开右侧工作面板的新建（＋）列表后才会出现入口。升级时旧 Renderer 的卸载清理会移除左侧旧按钮。

版本元数据、Renderer 握手、测试断言和包名同步为 0.4.1，安装包为 `dist/local.project-memory-api-probe-0.4.1.piplug`。

尚未安装/重新加载到真实宿主并验证入口点击或真实记忆增删改；安装新包后，应确认左侧旧图标消失，右侧“新建”列表出现“项目记忆”，点击后仍打开原记忆编辑器。

## 复现

```bash
for file in knowstack-main.js memory-service.js project-settings.js knowstack-extension.js renderer/*.mjs; do
  node --check "$file" || exit 1
done
node --test tests/*.test.cjs
git diff --check
```

在允许本地 ES 模块的 Chrome 中打开 `tests/memory-browser.html` 并运行交互回归，应显示 `passed: 15`、`failed: 0`；设备视口分别设为 1100×900 和 390×850，并核对 `innerWidth`。设置页测试 `tests/settings-browser.html` 应各显示 10 项通过。
