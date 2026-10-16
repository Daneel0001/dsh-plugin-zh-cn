# 更新日志

本文件记录所有值得注意的变更。版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [2.0.2] — 2026-10-16

### 修复

- **修掉一个会让整轮翻译永久挂起的缺陷。** 实测在真实桌面版上遇到：某条 `llm.stream()`
  既不产出数据也不结束，`AbortController` 对它无效，于是翻译循环就此卡死
  （缓存停在第 35 条，七分钟零写入）。现在除了软超时（`timeoutMs`，负责礼貌地给
  适配器发 abort 信号）之外还有一层**硬上限**（`timeoutMs + 5s`），到点用
  `Promise.race` 直接放弃这一条、继续下一条。
- 两处超时定时器不再 `unref()` —— unref 的 timer 不阻止事件循环退出，
  保命超时反而可能永远不触发。收尾时的 `stream.return()` 也不再 `await`：
  卡住的流往往正是卡在 await 上，等它的 return() 等于再挂一次。
- 新增第 47 项测试：模拟一个「既不产数据也不结束」的流，断言插件会在硬上限内放弃。

### 变更

- 文档、字典与注释里的措辞统一为「**DSH 设置里选定的模型**
  （`ctx.agentDefaultModel`）+ **DSH 内置 API**（`ctx.llm`）」，
  不再混用「DSH 内置的模型」「DSH 自带模型」这类含糊说法。

## [2.0.1] — 2026-10-16

### 修复

- **默认 `maxPerStart` 从 20 提到 500。** 实测一个真实的桌面 profile 有 200+ 个 Loader 条目，
  20 条的上限意味着要重启十几次才能把整个插件列表翻完 —— 排在后半段的第三方插件
  （`billion-context`、`dsh-browser` 之类）要等很久才轮到。新默认值实质等于不限。

### 新增

- **定期落盘**：每成功翻译 `saveEvery`（默认 8）条就写一次缓存；
  翻译进行到一半退出 DSH，已经翻好的部分也不会丢。

## [2.0.0] — 2026-10-16

**机制重写：从「内置词表 + 写别人的 locale 字典」改为「LLM 增量翻译 + 数据层注入」。**

### 新增

- **用 DSH 内置的 `llm` 服务翻译**：启动时取 `agentDefaultModel` 的默认模型，
  一次请求同时提交插件名称与描述，要求模型返回 `{"name": …, "desc": …}`。
  译文必须先通过「能解析出 JSON」和「真的含中文」两道校验才会落盘。
- **本地翻译缓存 `local-cache.json`**（默认
  `<profile>/dsh-plugin-zh-cn/local-cache.json`）：按包名索引，`en` 作为英文指纹，
  命中即**一个请求都不发**；写入永远是「读旧 → 合并 → 原子替换」，历史条目只增不减。
- **增量翻译**：只处理缓存里没有的英文插件；`maxPerStart` 限制单次启动的翻译条数，
  其余留到下次启动。
- **数据层注入**：包装 `pluginPackages.metaOf` 与 `pluginInventory.list`
  （实例 + 原型都装，动态透传 `this`），把 `{ en }` 补成 `{ en, zh }`，
  由 DSH 自己的 `resolveText()` 渲染出中文。**完全不碰 DOM**：不改结构、不改样式、
  不改文本节点，右侧启用/停用开关也不受影响。
- **零回归**：英文界面取 `en`，显示结果与安装前逐字相同。
- **缓存初值与迁移**：随包发布的 `local-cache.json` 与 `seedFiles` 都是初值，
  只合并、不覆盖；旧的扁平词表格式会被当作中文译文直接吸收。
- `scripts/check.mjs`：静态自检，含**「不许硬编码词典」**的守卫。
- `examples/local-cache.example.json`：缓存格式示例。
- **零运行时依赖**：不再 import `@deepseek-ai/schemastery`，配置改由 `resolveConfig()` 自己
  规整。少一个 import 就少一种「依赖解析失败 → 插件整块加载不了」的可能，
  而本插件宁可降级也不该失败。

### 变更

- 配置项重做：`enabled` / `strict` / `timeoutMs` / `maxTokens` / `provider` / `model` /
  `cacheFile` / `seedFiles` / `maxPerStart` / `delayMs` / `debug`。
  旧的 `target` / `overwrite` / `phraseFiles` / `roots` 已移除。
- 验收测试从「写盘断言」重写为 47 项，覆盖文本判定、缓存合并与指纹、LLM 调用与
  失败降级、注入安装/幂等/还原，以及 5 项 `apply` 端到端集成测试。

### 移除

- `lib/phrases.js`（185 条硬编码词表）、`scripts/check-phrases.mjs`、
  `examples/phrases.example.json`。
  **本插件不再内置任何词典** —— 译文只可能来自 DSH 设置里选定的模型（`ctx.agentDefaultModel` + `ctx.llm`）和本地缓存。
- 不再向其它插件的目录写入 `locale/en.json` / `locale/zh.json`，也不再改动别人的
  `package.json` 的 `exports`。

## [1.4.0] — 2026-10-15

**面向 GitHub 发布的首个仓库版本。**

### 新增

- `scripts/check-phrases.mjs`：不依赖 DSH 的词表自检脚本，可在任何 Node ≥ 20 环境运行。
- `.github/workflows/ci.yml`：推送与 PR 时自动做语法检查、JSON 校验与词表自检。
- `examples/phrases.example.json`：追加词表示例。
- 完整的仓库文档：`CONTRIBUTING.md`、`CHANGELOG.md`、`.gitignore`、`.editorconfig`。

### 修复

- **修复 `README.md` 的字符编码损坏。** 之前的文件在写入时被以 GBK 重新解码，导致全部中文变成乱码；现已重写为 UTF-8 无 BOM。
- `package.json` 补充 `repository`、`homepage`、`bugs`、`author` 字段与 `scripts`。

## [1.3.1] — 2026-10-15

### 新增

- 词表新增 `cc-safety-net`（「安全网」），内置词表达到 **185 条**。

## [1.3.0] — 2026-10-15

**机制重写：从「包装宿主服务」改为「注入官方 locale 字典」。**

### 变更

- 插件不再包装 `pluginPackages.metaOf()` 的返回值，改为给已安装插件写入
  `locale/en.json` + `locale/zh.json`，并为其 `exports` 补充 `"./locale/*.json"`。
- 走 DSH 官方的 `readPluginMeta → LocalizedText → resolveText` 通路，
  与内置插件显示中文的机制完全一致。
- 写入的文件带 `$dshPluginZhCn` 标记；禁用或卸载时按标记精确回收。
- 新增配置项 `overwrite`（默认 `false`，绝不覆盖别人的字典）与 `roots`（限定查找范围）。

### 移除

- 删除 `metaOf` 投影逻辑（该方案在桌面版上返回值虽被改写成功，界面仍显示英文）。
- 项目不再包含任何客户端（浏览器端）模块。

## [1.2.0] — 2026-10-15

### 变更

- 除实例层外，额外包装服务原型的 `metaOf`。
- `apply` 支持服务尚未就绪时通过 `ctx.inject` 等待。

### 修复

- 修复 `package.json` 被以带 BOM 的 UTF-8 写入后 DSH 无法解析的问题。

## [1.1.0] — 2026-10-15

### 变更

- 文档明确：必须用 pnpm 真正安装，未登记进 lockfile 的包会被 DSH 静默跳过。

## [1.0.0] — 2026-10-15

### 新增

- 首个版本：通过包装 `pluginPackages.metaOf()`，把已安装插件的标题与描述投影为
  带 `zh` 的 `LocalizedText` 对象。

[1.4.0]: https://github.com/Daneel0001/dsh-plugin-zh-cn/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/Daneel0001/dsh-plugin-zh-cn/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/Daneel0001/dsh-plugin-zh-cn/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Daneel0001/dsh-plugin-zh-cn/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Daneel0001/dsh-plugin-zh-cn/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Daneel0001/dsh-plugin-zh-cn/releases/tag/v1.0.0
