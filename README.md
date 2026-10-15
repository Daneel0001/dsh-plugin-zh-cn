# dsh-plugin-zh-cn

把 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）**已安装插件**的显示名与描述以**简体中文**呈现。

它走的是 DSH 自己的插件本地化协议 —— 也就是官方内置插件（「智能体团队」「自动化任务」「语音输入」……）显示中文的**同一条通路**：为缺少语言字典的插件补上一对 `locale/en.json` + `locale/zh.json`。

**不是**替换界面文案，**不是**包装或改写任何插件代码，**不是**修改 DSH 内部服务。

```
安装前   billion-context      A context-compression plugin — small context windows…
安装后   无限上下文            上下文压缩插件：100K 上下文即可够用，token 用量减少 5 倍…
```

> **English**: Render installed DSH plugin titles and descriptions in Simplified Chinese
> through DSH's own localization protocol — by giving every installed plugin that lacks
> one an official `locale/en.json` + `locale/zh.json` pair. English and other locales are
> rendered **byte-for-byte identically to before**. See [English summary](#english-summary).

---

## 效果与保证

| 界面语言 | 插件标题 | 插件描述 |
| --- | --- | --- |
| 中文 | 中文标题 | 中文描述 |
| English / 其它 | **与安装前逐字相同** | **与安装前逐字相同** |

- 内置词表覆盖 **185 个插件**：全部官方内置包，以及常见的第三方插件
  （billion-context、dsh-browser、cc-safety-net、dsh-prompt-optimizer、
  dsh-thinking-language、dsh-univer-office……）。
- **词表里没有的插件保持原样**，不会被改动一个字节。
- 严格模式（默认开启）下，标题与描述**都**有译文才写入，**不会出现半中半英**。
- 已经自带 `locale/` 字典的插件（含全部官方插件）**一律跳过**，绝不覆盖别人的翻译。
- 插件名与描述来自本地词表：**不联网、不调用任何模型**，运行期开销只是启动时的一次写盘。

## 安装

### 从插件市场安装（推荐）

在 DSH 桌面版的「插件」页点「添加插件」，填入本仓库地址即可：

```
github:Daneel0001/dsh-plugin-zh-cn
```

装好后 **重启 Harness**。客户端模块图是在渲染页面时写进 `index.html` 的，仅刷新页面不会把新插件送进已打开的窗口。

### 手动安装

```powershell
# 1. 把 tgz 放进 profile 的 plugins 目录
Copy-Item .\dsh-plugin-zh-cn-1.4.0.tgz "$env:DSH_PROFILE_DIR\plugins\"

# 2. 在 <profile>/package.json 里登记两处
#    dependencies:        "dsh-plugin-zh-cn": "file:<profile>/plugins/dsh-plugin-zh-cn-1.4.0.tgz"
#    dsh.profile.bundles: 追加 "dsh-plugin-zh-cn"

# 3. 用 pnpm 真正安装（这一步才会写入 lockfile 与 .modules.yaml）
node "$pnpm" install --dir "$env:DSH_PROFILE_DIR"
```

> **必须走第 3 步。** 只把 tgz 放进 `plugins/`、再手工复制目录到 `node_modules/` 是**不够**的：
> DSH 组合 profile 时以 pnpm 的安装结果为依据，未进入 `pnpm-lock.yaml` /
> `node_modules/.modules.yaml` 的包会被静默跳过 —— 插件看起来装好了，却完全不生效。

### 生效时机

`readPluginMeta` 每次调用都**实时读文件**，所以插件跑过一次之后：

- **刷新页面**即可看到中文，不必为了看到效果而重启；
- 新装一个插件后，**下次启动**时它会被自动补上字典。

## 卸载

在插件设置里关掉「插件简体中文化」，然后重启。

插件为每个包写入的字典文件都带一个 `$dshPluginZhCn` 标记；插件被移除或禁用时，清理回调会删除**带标记的文件**、撤销自己加进 `exports` 的那一项，并收走自己创建的空 `locale/` 目录。

**你自己改过的字典**（标记被去掉，或内容被手工修改过）会被完整保留，不会被误删。

## 配置

```yaml
- id: zh-cn-plugin-locale
  name: dsh-plugin-zh-cn
  config:
    enabled: true        # 总开关
    target: zh           # 目标语言主标签；DSH 内置中文的 id 是 zh
    strict: true         # 严格模式：标题或描述缺译文就整包保持原样
    overwrite: false     # 是否覆盖别人已放置的同名字典（默认不覆盖）
    phraseFiles: []      # 追加词表（JSON 文件绝对路径）
    roots: []            # 额外的 profile 查找起点；留空则自动定位
```

追加词表格式（键用裸包名，`@scope/name` 或 `name`）：

```json
{
  "my-plugin": { "title": "我的插件", "description": "一句话说明这个插件做什么。" }
}
```

文件读取失败、结构不合法都只记录警告，不影响 DSH 启动。可参考
[`examples/phrases.example.json`](examples/phrases.example.json)。

## 工作原理

DSH 显示插件名称与描述时，宿主端用 `pluginPackages.metaOf(specifier)` 读取该插件**所在目录下**的语言字典：

```
<pkg>/locale/en.json     ← 字典入口，必须存在，DSH 用它发现整个目录
<pkg>/locale/zh.json     ← 简体中文
```

每个文件形如：

```json
{ "meta": { "title": "…", "description": "…" } }
```

只要 `locale/en.json` 存在，`dsh-app-boot` 就会把同目录下所有 `<lang>.json` 收集成一份语言表，把 `title` / `description` 变成 `{ en, zh, … }` 这样的 `LocalizedText`；界面渲染时用 `dsh-client-locale` 的 `resolveText()` 按「当前语言 → fallback 链（`zh` 的 fallback 是 `en`）」取值。

`locale/*.json` 必须被该包的 `exports` 暴露，因为资源解析走 Node ESM resolver。

本插件在启动时扫描 profile 的 `node_modules/`，为词表里**已安装且还没有字典**的插件补上这两个文件；`en` 字段写的是 DSH 在没有字典时的显示名规则（`moduleShortName()`，即去掉作用域名与 `cordis:` / `cordis-plugin-` / `dsh-` / `dsh-host-` / `dsh-client-` 前缀），因此**非中文界面的显示结果与安装前逐字相同**。

### 为什么不用「包装 `metaOf` 返回值」？

更轻的直觉做法是给 `pluginPackages.metaOf` 套一层投影、直接返回带 `zh` 的 `LocalizedText` 对象。

实测在桌面版上这条路的返回值**确实被改写成功**（调用栈确认经过了包装），但界面拿到的仍是英文：官方机制的数据通路是「**包内字典 → `readPluginMeta` → `LocalizedText`**」，绕过文件系统直接构造对象会在后续环节落回原文。

所以本插件直接走同一条通路，不依赖任何内部实现细节。

## 安全与副作用

- 写入范围**仅限**：`<已安装插件>/locale/en.json`、`<已安装插件>/locale/zh.json`，
  以及在必要时为 `<已安装插件>/package.json` 的 `exports` 增加一项
  `"./locale/*.json": "./locale/*.json"`。
- **只处理词表里列出的包**；其它包不会被读取或修改。
- **绝不覆盖**别人已放置的字典：目标文件存在且不带本插件标记时跳过。
- `exports` 若不是子路径映射表（例如写成单个字符串），该包整体跳过，不做半截改动。
- 单个包写入中途失败会**回滚**该包已写入的文件，保持原样。
- 每个包独立处理，任何异常都被捕获并降级为一条警告，**不会影响 DSH 启动**。
- 全程不联网、不执行外部命令、不修改 profile 自身配置。

## 发布到 GitHub

本目录**已经是一个初始化好的 git 仓库**（分支 `main`，含首次提交 `feat: dsh-plugin-zh-cn 1.4.0`），
`package.json` 与 `CHANGELOG.md` 里的仓库地址也已指向 `Daneel0001/dsh-plugin-zh-cn`，可以直接推送。

```bash
# 1. 在 GitHub 上新建一个空仓库 dsh-plugin-zh-cn
#    （不要勾选 Add README / .gitignore / license，保持空仓库）

# 2. 关联远端并推送
git remote add origin https://github.com/Daneel0001/dsh-plugin-zh-cn.git
git push -u origin main

# 3. 打 tag、发 Release，并把 tgz 作为附件上传
git tag v1.4.0
git push origin v1.4.0
```

推送后发一个 Release，把 `dsh-plugin-zh-cn-1.4.0.tgz` 作为附件上传，
用户就能用 `github:Daneel0001/dsh-plugin-zh-cn` 直接在插件市场安装。

> CI（`.github/workflows/ci.yml`）会在 Node 22 / 24 上跑语法检查、JSON 校验与词表自检 ——
> 不需要任何依赖安装。

## 开发

```bash
# 词表自检 + 语法检查（任何 Node ≥ 20，无需依赖）
npm run check
npm run check:syntax

# 验收测试（45 项）：必须从已安装位置运行，因为要解析宿主提供的 schemastery
npm test
# 或者显式指定安装位置：
node <profile>/node_modules/dsh-plugin-zh-cn/test/acceptance.mjs
```

测试全部在系统临时目录里跑（显式传入 `roots` 会**独占**查找范围），因此**永远不会碰真实 profile**。

仓库还带一个不依赖 DSH 的自检脚本，可在任何 Node ≥ 20 环境运行：

```bash
node scripts/check-phrases.mjs     # 校验词表结构与键的唯一性
```

导出：`apply`、`Config`、`inject`、`name`，以及供测试使用的纯函数
`buildDictionary`、`moduleShortName`、`normalizeTarget`、`readPhraseFile`、
`sanitizePhrases`，和标记常量 `MARK`。

### 目录结构

```
lib/index.js              宿主插件：定位 profile、注入字典、注册清理回调
lib/phrases.js            内置词表（185 条，纯数据）
locale/en.json            本插件自身的英文字典（自举）
locale/zh.json            本插件自身的中文字典（自举）
cordis.patch.yml          bundle 补丁：把插件行插进组合配置树
test/acceptance.mjs       45 项验收测试
scripts/check-phrases.mjs 词表自检（CI 用）
examples/                 追加词表示例
```

## English summary

`dsh-plugin-zh-cn` renders the titles and descriptions of installed DSH plugins in
Simplified Chinese by using DSH's own localization protocol — the same mechanism the
official bundled plugins use.

At startup it scans the profile's `node_modules/`, and for every plugin listed in its
built-in catalogue (185 entries) that has no `locale/` directory yet, it writes an
official `locale/en.json` + `locale/zh.json` pair and exposes them through the package's
`exports`. Files are tagged with a `$dshPluginZhCn` marker so they can be removed
precisely on uninstall. Nothing else is read, written, or overwritten, and English
locales render **byte-for-byte identically to before** the plugin was installed.

No network access, no model calls, no patching of other plugins' code.

## 许可

[MIT](LICENSE)
