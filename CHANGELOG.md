# 更新日志

本文件记录所有值得注意的变更。版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

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
