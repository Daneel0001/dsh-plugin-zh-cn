# 更新日志

本文件记录所有值得注意的变更。版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [2.0.6] — 2026-10-16

### 修复

- **把注入铺到界面真正读取的每一条通路上。** 「官方 8 / 已安装 11」这种分组结构对应的是
  `pluginManager.listBundles()`，而此前只包装了 `pluginPackages.metaOf` 与
  `pluginInventory.list`，漏掉了 bundle 这条主路。现在四条通路全铺：
  `pluginPackages.metaOf`、`pluginManager.listBundles`、`pluginManager.listPlugins`、
  `pluginInventory.list`（每条都实例 + 原型都装、动态透传 `this`）。
- **新增注入自检 `lastRender`**（写进 `local-cache.json`）：记录四条通路各自的安装结果、
  启动 1.5 秒后主动探针（probe）是否真的被调用到、以及界面渲染时投影的命中 / 未命中计数
  与样本。以后「界面怎么还是英文」不必再猜：
  - `install.* = skipped` → 那层皮没贴上；
  - `probe.* = 0` → 贴上了，但调用没经过我们（界面走的是另一条路）；
  - `calls > 0` 而 `hits = 0` → 走到了，但缓存里没有对应译文。
- 修掉 `apply` 里补装定时器的 `unref()` —— 与 `sleep()` 那次同一个教训：unref 过的定时器
  在事件循环空转时不会触发，补装和探针都可能永远不执行。

### 测试

- 新增 3 项：bundle 列表投影、`listPlugins` 投影（并断言 `enabled` 原样保留、
  不影响右侧开关）、probe 计数。共 **53 项全绿**。

## [2.0.5] — 2026-10-16

### 新增

- **失败自动重试。** 单条翻译失败（偶发的 `llm.stream()` 卡住、模型返回的 JSON 抖一下、
  严格模式下描述没译出来）会**再试一次**。新增 `retry` 配置项，默认 2 次，设为 1 即关闭重试。

### 实测（真实桌面版，一轮完整运行）

- `total: 204 / pending: 94 / translated: 83 / failed: 11`，`model` 正确取到
  `deepseek-account/deepseek-flash`；缓存条目由 72 条增长到 **172 条**。
- 译文示例：`billion-context` → 「十亿上下文」、`dsh-browser` → 「浏览器自动化」、
  `dsh-thinking-language` → 「思考语言切换」、`dsh-univer-office` → 「Univer 办公协同」。
- 这一轮暴露出的 11 条偶发失败，正是本次重试要解决的问题。

## [2.0.4] — 2026-10-16

### 修复

- **修掉「重启后一条都没翻译成功」的缺陷。** 诊断数据（`local-cache.json` 里的 `lastRun`）
  显示 `pending: 114, translated: 0, failed: 114, model: "/"`：插件在**启动早期**去问
  `agentDefaultModel.currentSelection()` 时，用户在「设置 → 模型」里选定的模型**还没就绪**，
  于是 114 条全部以「没有模型」失败 —— 英文原文得以保留（界面没崩），但一条也没变中文。
  现在改为：拿不到模型就**轮询等待**（最多约 60 秒）等它就绪再开翻；确实等不到才落一次
  `phase: "no-model"` 并给出明确提示，不再把每条都算成失败。
- **修掉 `sleep()` 里 `timer.unref()` 造成的等待永久挂起。** unref 过的定时器在事件循环
  空转时根本不触发，`resolveSelectionWithWait` 会直接卡死（测试里表现为
  `unsettled top-level await`）。等待期间不再 unref，退出时由 `signal.abort()` 结束。

### 变更

- `maxPerStart` 默认值由 20 提高到 500：一次启动就能翻完全部待翻译插件。

### 测试

- 新增两项：模型延迟出现时能轮询到、超时后返回 `undefined` 而不是硬翻。共 49 项全绿。

## [2.0.3] — 2026-10-16

### 新增

- **`local-cache.json` 新增 `lastRun` 字段**，记录最近一轮扫描/翻译的状态：
  `phase`（start / running / done / aborted）、`total`、`pending`、`translated`、`failed`、
  `cachedHits`、`skippedLocalized`、`notTranslatable`、`current`（当前正在处理的包名）
  与 `lastError`。
  「某个插件为什么没变中文」这类问题，看一眼这个字段就有答案，不用去翻进程日志。
- 每轮开始时会**先落一次盘**（写 `phase: "start"` 的快照），因此即使随后某条翻译卡住，
  也一定能从磁盘上看到这一轮到底准备翻多少条。

### 说明

- 排查中发现：**`set_bundle` 热重载不会让 Node 重新加载插件模块**（ESM 模块缓存命中），
  所以换了版本的插件必须**重启 DSH** 才会真正换成新代码。这一点已写进 README。

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
