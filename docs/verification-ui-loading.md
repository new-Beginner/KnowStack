# 项目记忆界面：三项最小修改与验证

> 本轮修改的是本地源码。验证使用真实 Chromium 加载正式视图组件，桥接数据为模拟项目；没有试改真实记忆，也未声称已经在正在运行的 PI-Desktop 窗口实测加载速度。没有更改权限、版本、后台存储、保存策略或宿主代码。本轮不发布新版本，旧 dist 包未重打。

## 1. 去掉重复选择框，保留自动跟随

**改动**：`renderer/memory-ui.mjs` 只在停靠且自动跟随时不挂载项目选择框，改用普通项目说明容器。当前项目路径、自动跟随说明及订阅逻辑保留。非停靠编辑器、提醒定位编辑器仍保留原控件。

**原因与依据**：HTML 标准将 `select` 定义为选项交互控件，而当前项目实际由既有上下文订阅决定；这个禁用控件不承担跟随行为。仅移除插件自己的 DOM，不修改宿主：

- [WHATWG HTML：select](https://html.spec.whatwg.org/multipage/form-elements.html#the-select-element)
- [PI-Desktop 插件 API：session、Panel events](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/07-plugins/03-plugin-api.md)

**手动验证**：打开项目记忆侧栏，确认没有下拉框，路径及“自动跟随”仍在；无草稿时切换项目，会更新为新项目内容。有未保存修改时切换项目，旧草稿应保留且保存按钮禁用；重新读取仍须先确认放弃草稿，不会自动保存。

**已验证**：侧栏浏览器用例检查无 `select`、项目说明/路径/状态保留，切换项目不丢草稿、不误保存；旧输入编辑器和提醒流程回归通过。

## 2. 收紧内容区及底栏

**改动**：仅调整 `.km-docked` 样式：编辑器改为内容高度、最大不超过侧栏；内容区从填满剩余空间的 `flex:1` 改为 `flex:initial`。保留内部滚动和 `min-height:0`，头部及底栏不被压缩。底栏状态/保存按钮优先同行，空间不足再换行，间距由 12px 收到 8px；提示文案和两只开关、刷新、添加、保存、确认流程全部保留。

**依据**：[W3C Flexbox §7.1.1](https://www.w3.org/TR/css-flexbox-1/#flex-initial) 明确 `initial` 等价于 `0 1 auto`：依据内容定尺寸、不吸收正剩余空间、空间不足时允许收缩；`none` 防止头尾收缩。只使用标准 Flexbox，没有硬编码列表高度、隐藏必要内容或更改其他配色/字体。

**手动验证**：分别查看空列表、少量记忆和长列表：空/短列表的保存区紧接内容，不再被推到底部；长列表仅内容区滚动，底栏可见。缩窄到 320/390px、降低高度、切换明暗主题，确认无横向溢出、文字遮挡，保存/删除确认仍可用。侧栏外没有内容的背景不以填充卡片或新增元素伪装消除。

**已验证**：1100×900（侧栏420px）、390×900、320×900、390×520，均检查明/暗两种主题；空列表编辑区高466–488px，底栏88–110px，不再强撑900px。长列表有内部滚动且底栏不超视口。已目视查看列表、空列表与矮栏截图。

截图均为模拟数据：`docs/verification-ui-loading/390-light-list.png`、`390-dark-empty.png`、`390-dark-short.png`。

## 3. 消除加载链路中不必要的串行等待

**已定位的原因**：原启动链路先 `await app.getAppearance` 才挂载编辑器；`context.ready()` 又等待包含开关读取的整个刷新完成，正文随后才开始读取。开关读取在服务中也要等待会话核验/Renderer 队列。这些等待叠加，但主题和开关并不是只读正文的依赖。

**改动**：

- `renderer/memory-view.mjs`：立即挂载和加载；按官方建议先采用系统配色，再异步应用 `app.getAppearance` 和 `appearance:changed`。新事件优先于晚到初值；卸载后不更新页面，拒绝不形成未处理异常。
- `renderer/view-client.mjs`：分开项目身份就绪与完整刷新。正文仍等待项目身份核验，但不再等待开关；开关未确认时保持禁用。显式 `refresh()` 仍等待完整刷新，轮询间隔、项目绑定、读令牌、保存前核验和回读均未改变。

**依据**：

- [PI-Desktop：Work-panel views 与公开 pluginBridge](https://github.com/vastsa/PI-Desktop/blob/main/docs/plugin-development.md) §6.8。
- [PI-Desktop API：app、Panel UI、Panel events](https://github.com/vastsa/PI-Desktop/blob/main/docs/spec/07-plugins/03-plugin-api.md)：主题读取、系统配色回退、事件及本插件 `onPanelInvoke` 通道均有文档支持。没有增加宿主 API 或授权。
- [ECMAScript：Promise.prototype.then](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.prototype.then)：用标准 Promise 分别等待真实依赖和处理结果；不是假设新的宿主批处理、缓存或并行能力。

### 性能证据与边界

探针只在测试中为首次主题/项目/开关/正文响应分别加300/40/250/60ms延迟，记录调用开始、响应和正文状态。修改前后使用相同条件，六个相同宽度/主题场景的中位数：

| 指标 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 编辑器挂载 | 311.5ms | 0.6ms |
| 记忆正文就绪 | 684.85ms | 122.45ms |

修改前观察到主题→项目→开关→正文串行；修改后开关和正文在身份就绪后同时发起，正文先于慢开关返回。此数值证明消除了插件前端的额外等待，**不是实机性能承诺，也不能排除实际宿主还有其他耗时**；必要的原生读取和安全核验仍会耗时。测量不包含浏览器导航/模块下载时间。

**手动验证**：加载更新后的本地插件目录，关闭再打开项目记忆视图：应先出现加载提示而非等待主题的空白页；开关未确认前不可点击，随后显示真实状态。主题切换仍跟随宿主；在设置侧改开关后侧栏仍会同步。用相同项目与机器比较多次打开耗时，不要直接套用上述模拟毫秒数。若仍慢，应记录原生读取/公开错误步骤继续定位，不删安全核验或重复提交保存。

## 验证命令及结果

测试前将 `TMP`、`TEMP`、`TMPDIR` 指向会话实际 `PI_SCRATCH_DIR`；截图目录也在其中。首次新增用例在旧版上分别报“mode response must not gate project identity”和“redundant selector remains”，修改后通过。

```bash
export TMP="$PI_SCRATCH_DIR" TEMP="$PI_SCRATCH_DIR" TMPDIR="$PI_SCRATCH_DIR"
node --test tests/*.test.cjs
node tests/docked-cdp.cjs
node tests/settings-cdp.cjs
node tests/memory-input-cdp.cjs
node tests/outdated-cdp.cjs
for file in *.js renderer/*.mjs tests/*.cjs; do node --check "$file" || exit; done
git diff --check
```

- Node测试193项通过，0失败；含正文提前就绪、卸载晚响应、开关晚失败保留草稿并阻止保存。
- 侧栏104项检查通过（8种尺寸/主题组合×13项），无未捕获脚本异常；含开关同步、保留原ID及回读、手动删除、草稿隔离、主题事件和清理。
- 设置22项、旧编辑器8组输入检查、提醒22项通过。
- JS/MJS/CJS语法、`git diff --check`通过；Git仅提示原有Windows换行转换。
- `PluginCheck(directory=".")`通过；原有 `agent.tool.register`、`agent.extension`、`renderer.extension` 高风险授权提示未改变。

本轮正式代码仅改动上述三个Renderer文件；另有三份测试文件及本验证材料。已有其他未提交工作保留。没有自动安装、Git提交、权限扩展或真实项目记忆试写。正在运行的宿主窗口及其他平台未做UI实测；若宿主加载的是安装副本而非当前源码目录，需要走正常插件更新流程才能看到修改。
