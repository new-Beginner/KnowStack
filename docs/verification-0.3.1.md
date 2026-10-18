# KnowStack 0.3.1 界面修复验证

## 先提交，再修复

按用户要求，先将既有实现提交为 `bf9b27c`（`feat(knowstack): add native memory workflow and project settings`），提交前 94 项 Node 测试通过，工作区干净；随后进行本次界面修复。没有推送远端。

## 根因与证据

1. 用户截图中的插件页显示 v0.2.2。只读核对宿主插件注册表，KnowStack 的注册版本确为 0.2.2、来源为 dev、路径指向当前仓库；公开设置描述已是新内容。宿主插件列表以注册表为版本来源，但设置与 Renderer 描述会从运行时加载对象补充，因此旧版本标签不能单独证明旧源码仍在运行。
2. 检查本机宿主的 `openLayer()` 实现，返回的挂载节点为 `position:fixed; top:0; left:0; width:0; height:0`。0.3.0 遮罩使用 `position:absolute; inset:0`，依赖父节点尺寸；原浏览器测试却使用了全屏父节点，遗漏宿主兼容条件。
3. 将测试页挂载点改成宿主的真实零尺寸结构，增加覆盖视口和 `elementFromPoint` 命中断言。修复前测试失败：遮罩实际为 48×48，视口为 1084×755。
4. 将正式遮罩改成 `position:fixed; inset:0; box-sizing:border-box`。不改宿主挂载节点、注册表、权限或记忆写入规则。

## 最终验证

| 检查 | 结果 |
| --- | --- |
| 9 个正式入口／模块 `node --check` | 通过 |
| `node --test tests/*.test.cjs` | 94 项通过，0 项失败 |
| Chrome 桌面窗口 1100×850 | 10 项通过，0 项失败 |
| Chrome 窄屏窗口 390×850 | 10 项通过，0 项失败 |
| `git diff --check` | 通过；只有 Git 行尾转换提示 |

浏览器回归加载正式 UI 模块，使用宿主零尺寸挂载结构和模拟项目数据；验证遮罩覆盖可用视口、开关指针命中、名称与开关排列、保存反馈、错误保护、焦点循环、其他插件入口隔离和长列表滚动。截图：[桌面](settings-0.3.1.png)、[窄屏](settings-0.3.1-narrow.png)。这些不是运行中宿主的实机截图。

复现：按 [基础验证说明](verification-0.3.0.md) 运行 `tests/settings-browser.html?autorun`，本版 `#results` 应显示 `passed: 10`、`failed: 0`。

## 升级与未完成验收

安装包为 `dist/local.project-memory-api-probe-0.3.1.piplug`；manifest、Renderer 握手、测试版本断言与包名同步为 0.3.1。安装后在插件页 KnowStack 行点击右侧齿轮，应打开项目名＋开关弹窗。

本轮没有使用桌面控制操作 PI-Desktop 自身（该技能明确禁止），没有直接修改宿主注册表，也没有可用的既有插件重新加载专用工具。因此未执行真实宿主安装／重新加载及点击弹窗验收，不能将上述浏览器回归表述为用户当前窗口已经修复。若宿主仍显示旧注册版本，请通过插件页安装 0.3.1 包完成更新。
