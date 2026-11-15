# 更新日志

本文件记录所有值得注意的变更。版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [2.3.0] — 2026-11-15

**翻译后端可以选了：微软翻译（免费）/ 自定义 API / DSH 里的模型。账号渠道翻译不了的问题绕开了。**

### 新增

- 三种可切换的翻译后端（`backend` 配置项，默认 `bing`）：
  - `bing`（默认）—— 微软翻译免费接口（`cn.bing.com`），不用账号、不用 API Key；
  - `api` —— 任意 OpenAI 兼容接口（`apiBaseUrl` + `apiKey` + `apiModel`，默认 DeepSeek）；
  - `llm` —— 仍走 DSH 的 `llm` 服务（旧行为，模型解析与回退逻辑不变）。
- `lib/translate.js` 新增 `translateViaBing()`、`translateViaApi()`、`normalizeEndpoint()`，
  以及常量 `DEFAULT_BING_ENDPOINT`、`DEFAULT_API_BASE_URL`、`DEFAULT_API_MODEL`、`BING_USER_AGENT`；
  Bing 的 `IG` / `IID` / `params_AbusePreventionHelper` 会话按 5 分钟缓存，401/403/429 自动换会话重试。
- 配置项：`backend`、`bingEndpoint`、`apiBaseUrl`、`apiKey`、`apiModel`（均带默认值，`Config` 同步校验）。

### 变更

- 插件详情页的配置卡片改成「设置 → 模型」那种样式：一行一个后端（图标 + 名称 + 说明 + 「编辑」按钮），
  点「编辑」展开该后端的字段，选中行高亮；保存 / 恢复默认写在卡片底部。
- 只有 `backend: "llm"` 才会等待 `llm` 服务与默认模型（`bing` / `api` 启动即可翻，不再受启动顺序影响）。
- `api` 缺 API Key 时不再空转重试：写 `phase: "no-api-key"` 快照并提示。

### 说明

- 为什么加 `bing` / `api`：DSH 账号渠道只对自己允许的目的地签发 token
  （`resolveToken(endpoint)`），插件发起的请求会得到 `ACCOUNT_SIGN_IN_REQUIRED`，
  所以「用 DSH 账号翻译」对个别插件（实测 `dsh-kb-lite`）必然失败。

## [2.2.0] — 2026-11-15

**插件页真的能配置翻译模型了：补上浏览器侧配置卡片。**

### 修复

- 更正 2.1.0 的错误说法：DSH **不会**因为插件导出 `Config` 就自动在「设置 → 插件」里渲染表单。
  插件页的 `plugins.bundle.config` / `plugins.row.config` 是给插件自己挂 UI 的扩展点，
  必须由插件带浏览器侧模块注册卡片（`dsh-gitbash-shell`、`dshmarket`、`dsh-univer-office` 都是这么做的）。
  只加 `Config` 的结果是：页面上什么入口都没有。

### 新增

- 新增 `./client` 浏览器侧模块（`lib/client.js`，手写 ModuleLoader bundle，无构建步骤），
  注册 `plugins.bundle.config`（key = `dsh-plugin-zh-cn`），在插件详情页渲染「翻译模型」卡片：
  - `provider` / `model` 两个输入框（留空跟随「设置 → 模型」里的默认模型）；
  - 「模型不可用时回退到 DeepSeek 账号」开关（写 `fallbackToAccount`）；
  - 保存 / 恢复默认；保存走宿主 `configForms` → configEditor，写入本插件行的 `config`。
- `package.json` 增加 `"./client"` 导出与 `dsh.client`（`platform: "web"`，注入
  `@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-settings`）。

### 测试

- `node --check lib/client.js`、`scripts/check.mjs`、`test/acceptance.mjs` 全部通过（60 passed，1 skipped）。

## [2.1.1] — 2026-11-15

**修复「每次重启都翻不了」的真正原因：启动早期拿不到 `llm` 服务就整轮放弃。**

### 修复

- `runTranslationPass` 不再在 `ctx.get('llm') === undefined` 时直接 return，
  改为用新增的 `waitForService()` 轮询等 `llm` 注册（最多约 20 秒）。
- 等不到时写 `phase: "no-llm"` 快照，并按 `retryDelayMs` 自动重试（与 no-model 同一套重试）。
- 这解释并修掉了 `local-cache.json` 里长期出现的 `phase: "start"`、`translated: 0`：
  之前每次启动插件都抢在 `llm` 注册之前跑完扫描，缓存里只剩英文。

### 测试

- 新增 1 项：`llm` 晚注册时 `waitForService` 能等到它。
- **60 项通过 + 1 项按环境跳过**。

## [2.1.0] — 2026-11-14

**插件页可以配置翻译模型了；「未就绪」不再让整轮翻译白跑。**

### 新增

- **导出 `Config`（Schemastery schema）**：DSH 会在「设置 → 插件」里按它渲染配置表单，
  也能在 profile 的 `cordis.patch.yml` 里写。新增字段 `fallbackToAccount`、`retryDelayMs`，
  `provider` / `model` 有了正式的表单入口 —— 填 `deepseek-account` / `deepseek-flash`
  即可固定用 DSH 账号 API 翻译。
- **模型解析三级回退**：config 显式值 → 「设置 → 模型」的默认模型 →
  `deepseek-account/deepseek-flash` 兜底（`fallbackToAccount: true`，默认开启）。
- **自动重试**：没等到可用模型时，按 `retryDelayMs`（默认 3 分钟）自动重试，
  不再「本轮直接放弃」。

### 修复

- 排查「`dsh-kb-lite` 一直是英文」时定位到：启动早期 `agentDefaultModel.currentSelection()`
  读不到默认模型，`lastRun` 停在 `phase: "start"`、`model: "(未就绪)"`、`translated: 0`，
  缓存里永远没有新插件（如 `dsh-kb-lite`、`dsh-pet`）的译文。三级回退 + 自动重试解决了它。

### 测试

- 新增 4 项：账号渠道兜底、`fallbackToAccount: false` 保持旧行为、显式 config 优先、
  Config schema 字段（在装了 schemastery 的环境里才跑）。
- 原「轮询等待默认模型」两项改为显式传 `fallbackToAccount: false`。
- 合计 **59 项通过 + 1 项按环境跳过**。

## [2.0.8] — 2026-10-16

### 修复

- **`bad-shape 模型没有返回 JSON` 现在有兜底。** 实测 `dsh-plugin-wallpaper-engine`
  （描述约 500 字符）时，模型直接回了纯文本而不是 JSON。现在解析分三级：
  1. 剥掉 markdown 围栏、截出最外层大括号后按 JSON 解析（原有行为）；
  2. 解析不出来时**从纯文本里尽力取** —— 支持 `名称：… / 描述：…` 标签形态，以及
     「第一行当名称、其余当描述」的裸文本形态；
  3. 取出的内容仍要过**必须含中文**的校验，所以**不会**把英文原文误当成译文；
     而「行数多、篇幅长」的多半是模型的思考过程，一律不猜，直接报 `bad-shape`。
- **区分「截断」与「格式错误」**：`finish.reason` 是 `max-tokens` 时抛 `truncated`，
  不再和 `bad-shape` 混为一谈；两种情况都会在错误信息里带上模型原始回复的片段。
- `maxTokens` 1024 → **4096**：推理型模型可能先输出一大段思考再给 JSON，需要更大余量。

### 测试

- 新增 3 项：带标签的纯文本、两行裸文本都能救回；像思考过程的长文本拒绝猜。
  共 **56 项全绿**。

## [2.0.7] — 2026-10-16

**按反馈放宽「可翻译文本的长度」。**

### 变更

- **放宽输出与超时**：`maxTokens` 512 → **1024**，`timeoutMs` 30000 → **60000**。
  描述很长的插件（例如 `dsh-plugin-wallpaper-engine`，原文约 500 字符、多个分句）
  需要更宽的输出空间和更长的等待时间。
- **提示词放宽描述长度**：从「不超过 40 个汉字」改为「原文短就写一句话；原文长可以写成一段，
  最多 120 个汉字；不要为了压字数丢掉原文的功能点，也不要逐词硬译」，并要求保留原文里的
  括号补充、版本号与范围限制（如 `>=`、`rc`）。
- **重试次数 2 → 3**。
- **新增 `lastRun.failures`**：把本轮失败的「包名 + 原因」写进 `local-cache.json`，
  下次再遇到翻不出来的插件时不必靠猜。

### 已知

- 本次改动**尚未跑测试、未打包、未安装**：当前会话的命令执行器不可用
  （`bash` / `pwsh` / `cmd.exe` 全部 `spawn ... ENOENT`，而 `bash.exe` 文件本身存在），
  无法运行 node。环境恢复后需要补跑 `npm test`、重新打包并安装。

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
