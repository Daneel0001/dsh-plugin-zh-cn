# dsh-plugin-zh-cn

把 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）**已安装插件**的显示名与描述，在启动时用 **DSH 设置里选定的模型**（`agentDefaultModel`）自动翻译成简体中文，并缓存到本地。

**没有硬编码词典，不调用任何第三方翻译 API，不碰 DOM。**

```
安装前   billion-context      A context-compression plugin — small context windows…
安装后   十亿级上下文插件       小上下文窗口即可容纳超大仓库上下文
```

> **English**: `dsh-plugin-zh-cn` renders installed DSH plugin titles and descriptions in
> Simplified Chinese. At startup it reads a local translation cache, projects
> `{ en }` plugin metadata into `{ en, zh }` so DSH's own `resolveText()` renders Chinese,
> and asks DSH's built-in `llm` service to translate any installed plugin the cache does not
> know yet. No third-party API, no built-in dictionary, no DOM manipulation. See
> [English summary](#english-summary).

---

## 效果与保证

| 界面语言 | 插件标题 | 插件描述 |
| --- | --- | --- |
| 中文 | 中文标题 | 中文描述 |
| English / 其它 | **与安装前逐字相同** | **与安装前逐字相同** |

- **零 DOM 改动**：不新增节点、不改 class、不改内联样式、不改任何文本节点。
- **零开关影响**：右侧启用/停用走 `entry.enabled` 与 `pluginManager.setPluginEnabled`，
  和元数据毫无交集。
- **不动别人的翻译**：元数据里已经带 `zh` 的插件（含全部官方内置插件）一律跳过，
  一个字节都不改。已经自带中文的内置选项（「语音输入」「终端」……）自然不会被碰。
- **失败即原样**：模型报错、超时、返回非法 JSON、译文不是中文 —— 任何一条都只让
  该插件保留英文，并记一条警告，**设置界面不会崩溃、不会白屏**。
- **严格模式（默认开）**：名称与描述都拿到译文才写入缓存，绝不出现半中半英。
- **可完全卸载**：插件被禁用或移除时，注入层通过 `ctx.effect` 的清理回调原样撤销。

## 安装

### 从插件市场安装（推荐）

在 DSH 桌面版的「插件」页点「添加插件」，填入本仓库地址：

```
github:Daneel0001/dsh-plugin-zh-cn
```

装好后 **重启 Harness**。客户端模块图是在渲染页面时写进 `index.html` 的，
仅刷新页面不会把新插件送进已打开的窗口。

### 手动安装

```powershell
# 1. 把 tgz 放进 profile 的 plugins 目录
Copy-Item .\dsh-plugin-zh-cn-2.0.0.tgz "$env:DSH_PROFILE_DIR\plugins\"

# 2. 在 <profile>/package.json 里登记两处
#    dependencies:        "dsh-plugin-zh-cn": "file:<profile>/plugins/dsh-plugin-zh-cn-2.0.0.tgz"
#    dsh.profile.bundles: 追加 "dsh-plugin-zh-cn"

# 3. 用 pnpm 真正安装（这一步才会写入 lockfile 与 .modules.yaml）
node "$pnpm" install --dir "$env:DSH_PROFILE_DIR"
```

> **必须走第 3 步。** 只把 tgz 放进 `plugins/`、再手工复制目录到 `node_modules/` 是**不够**的：
> DSH 组合 profile 时以 pnpm 的安装结果为依据，未进入 `pnpm-lock.yaml` /
> `node_modules/.modules.yaml` 的包会被静默跳过。

### 生效时机\n\n> **换了插件版本之后必须重启 DSH。** 实测在运行中的实例里用「禁用 → 启用」热重载插件，**不会**让 Node 重新加载模块（ESM 模块缓存命中），跑的还是旧代码；只有重启 Harness 才会真正换版本。\n\n- **第一次启动**：已缓存过的插件**立刻**就是中文；新发现的插件在后台翻译，
  本次启动仍显示英文。
- **第二次启动**：上次翻好的插件直接命中缓存，**一个请求都不发**。
- **想在第一次启动里就看到中文**：把一份现成的 `local-cache.json` 交给 `seedFiles`
  （格式见 [`examples/local-cache.example.json`](examples/local-cache.example.json)）。
- 也可以在后台翻译完成后**切换一次设置页或刷新窗口**：注入层是实时查缓存的，
  重新取数就能看到中文，不必重启。

## 工作原理

### 1. 拦截点：数据层，而不是 DOM

DSH 的插件列表渲染链是（均为 `app.asar` 内官方源码）：

```
客户端 UI 组件 PluginInventorySettingsTab
  └─ ctx.remote.pluginInventory.list()          dsh-client-ui-settings-plugin-inventory/lib/client.js
       └─ 宿主服务 pluginInventory.list()        dsh-host-plugin-inventory/lib/index.js
            └─ readPluginInventory(ctx)
                 ├─ ctx.loader.entries()        ← 「已安装」的插件行
                 └─ ctx.get('pluginPackages').metaOf(name, base) → { title, description }
```

而屏幕上真正出现的文字，只在客户端这一个出口被解析：

```js
// dsh-client-locale/lib/client.js
resolveText(text) {
  if (typeof text === 'string') return text;
  return this.fallbackChain(this.snapshot.active)
    .reduceRight((resolved, locale) => text[localeKey(locale)] ?? resolved, text.en);
}
```

`LocalizedText = string | { en: string, [locale]: string }` —— 中文界面取 `zh`，英文界面取 `en`。
**这正是官方内置插件显示「智能体团队」而英文界面仍显示原文的机制。**

所以本插件只做一件事：在数据层把 `meta.title` / `meta.description` 从 `{ en }` 补成 `{ en, zh }`。
包装两处返回值，任一生效即可：

| 目标 | 位置 | 说明 |
| --- | --- | --- |
| `pluginPackages.metaOf` | `dsh-app-boot` 的 cordis Service | `readPluginInventory` 的直接取数处 |
| `pluginInventory.list` | `dsh-host-plugin-inventory` 的 Remote 网关 | 界面调用的入口，兜底 |

### 为什么不用 MutationObserver 改文本节点？

事后补救。React 每次重渲染都会把改过的文本节点覆盖回去，需要持续对抗；
而且一旦插件的元数据或 DOM 结构稍有变化就容易误伤布局。
数据层注入则从根上解决问题：**DOM 从头到尾就没有被改过**，中文是 DSH 自己渲染出来的。

### 2. 缓存

运行时缓存位置（原子写入：先写 `.tmp` 再 rename）：

```
<DSH_PROFILE_DIR>/dsh-plugin-zh-cn/local-cache.json
# 例如 C:\Users\<你>\.dsh\profiles\desktop\dsh-plugin-zh-cn\local-cache.json
```

```json
{
  "version": 2,
  "generator": "dsh-plugin-zh-cn",
  "updatedAt": "2026-10-16T10:43:30.000Z",
  "entries": {
    "billion-context": {
      "en": { "title": "billion-context", "description": "A context-compression plugin — …" },
      "zh": { "title": "十亿级上下文插件", "description": "小上下文窗口即可…" },
      "model": "deepseek/deepseek-chat",
      "translatedAt": "2026-10-16T10:43:30.000Z"
    }
  }
}
```

- **增量**：按包名索引；`en` 是英文指纹，指纹没变就**一个请求都不发**，变了才重译。
- **只增不减**：每次写盘都是「读旧 → 合并新条目 → 原子替换」，
  历史条目（包括已经卸载的插件）永远保留，方便你回查和手工编辑。
- **兼容旧格式**：扁平词表 `{ "<包名>": { "title": "…", "description": "…" } }`
  会被当作中文译文直接吸收，可以作为初值平滑迁移。
- **多来源合并**：随包发布的 `local-cache.json` 与 `seedFiles` 都是**初值**，
  运行时缓存里的同键条目优先，绝不会被清空覆盖。

### 3. 翻译

只用 `ctx.get('llm').stream(...)`，模型取 `ctx.get('agentDefaultModel').currentSelection()`。
一次请求同时把名称与描述交给模型，要求它只回一个 JSON：

```
系统提示词（要点）
  只输出 {"name":"<中文名称>","desc":"<中文描述>"}，不要解释、不要 Markdown 围栏
  名称 ≤ 12 个汉字；描述 ≤ 40 个汉字、一句话
  API / Token / MCP / SSH / Git / JSON / LLM 等专有名词照抄不译
```

收到回复后会**先校验再落盘**：必须能解析出 JSON、译文必须真的含中文。
不满足就当作失败，保留英文原文。

## 配置

```yaml
- id: zh-cn-plugin-locale
  name: dsh-plugin-zh-cn
  config:
    enabled: true          # 总开关
    strict: true           # 名称+描述都有译文才写入缓存
    timeoutMs: 30000       # 单条翻译超时
    maxTokens: 512         # 单条翻译输出上限
    provider: ''           # 留空 = 用「设置 → 模型」里的默认模型
    model: ''
    cacheFile: ''          # 留空 = <profile>/dsh-plugin-zh-cn/local-cache.json
    seedFiles: []          # 额外的缓存初值（绝对路径），只合并、不覆盖
    maxPerStart: 500       # 每次启动最多新翻几个插件（默认实质上不限，一个全新 profile 也就几百条）
    delayMs: 200           # 两条翻译之间的间隔
    saveEvery: 8           # 每翻译成功几条落一次盘，中途退出不丢已完成的部分
    debug: false           # 把每条翻译结果写进 debug 日志
```

## 安全与副作用

- **只读**其它插件的 `package.json`；**不写入**任何其它插件的目录。
- 唯一会写的文件是 `local-cache.json`（及其 `.tmp`），位置就在插件自己的数据目录。
- 不联网（除 DSH 自己的模型调用外）、不执行外部命令、不改 profile 配置。
- 所有异常都被捕获并降级为一条 `warn` 日志，**不会影响 DSH 启动**。

## 卸载

在插件设置里关掉「插件简体中文化」，然后重启。

注入层随插件 fiber 一起卸载（`ctx.effect` 清理回调会还原被包装的两个方法）。
运行时缓存 `local-cache.json` 会留在 profile 里，想彻底清干净就手动删掉
`<DSH_PROFILE_DIR>/dsh-plugin-zh-cn/` 目录。

## 开发

```bash
npm run check          # 静态自检：清单、语法、可导入性，以及「不许硬编码词典」
npm run check:syntax   # 只做语法检查

npm test               # 47 项验收测试（含 8 项 apply 集成测试）
```

`npm test` 零依赖，在源码目录里就能跑完 47 项（含 8 项 `apply` 端到端集成测试）。
测试全部在系统临时目录里工作，**永远不会碰真实 profile**。

导出：`apply`、`resolveConfig`、`DEFAULTS`、`inject`、`name`，以及供测试使用的纯函数
`resolveCacheFile`、`nearestProfileDir`、`collectInstalledPlugins`、
`extractEnglish`、`alreadyLocalized`、`resolveSelection`、`runTranslationPass`。

### 目录结构

```
lib/index.js        插件入口：读缓存 → 装注入 → 异步扫描翻译
lib/inject.js       数据层注入：包装 metaOf / pluginInventory.list（实例 + 原型，动态 this）
lib/cache.js        local-cache.json 的读取、合并、原子写
lib/translate.js    llm 调用、提示词、JSON 解析与中文校验
lib/text.js         LocalizedText 工具与「值不值得翻译」的判定
locale/*.json       本插件自身的语言字典（自举）
cordis.patch.yml    bundle 补丁：把插件行插进组合配置树
test/acceptance.mjs 47 项验收测试
scripts/check.mjs   静态自检（CI / prepack）
examples/           local-cache.json 格式示例
```

## English summary

`dsh-plugin-zh-cn` renders the titles and descriptions of installed DSH plugins in
Simplified Chinese.

At startup the host half:

1. reads `<profile>/dsh-plugin-zh-cn/local-cache.json` synchronously, so the first render
   already has Chinese for everything it has seen before;
2. wraps `pluginPackages.metaOf` and `pluginInventory.list` — the exact functions the
   settings UI reads plugin metadata through — projecting `{ en }` into `{ en, zh }`.
   DSH's own `resolveText()` then renders Chinese on a Chinese UI and the original English
   everywhere else. **No DOM node, class, style, or the enable/disable toggle is touched.**
3. asynchronously scans the installed plugin list and asks DSH's built-in `llm` service
   (`ctx.get('llm')`, default model from `agentDefaultModel`) to translate any plugin the
   cache does not know, one request carrying both the name and the description, and
   expecting `{"name": …, "desc": …}`. Results are merged back into the cache.

No third-party translation API, no built-in dictionary, no network calls beyond DSH's own
model route. Any failure — timeout, bad JSON, non-Chinese output, model error — leaves the
English original in place and logs a warning.

## 许可

[MIT](LICENSE)
