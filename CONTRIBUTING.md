# 贡献指南

感谢你有兴趣改进 `dsh-plugin-zh-cn`。

## 最常见的贡献：补一条翻译

词表在 [`lib/phrases.js`](lib/phrases.js)，按包名字母序排列，每条形如：

```js
"billion-context": {
  "title": "无限上下文",
  "description": "上下文压缩插件：100K 上下文即可够用，token 用量减少 5 倍，单会话可延续数月（数十亿 token），并兼顾压缩质量，兼容 pi、OpenCode、Codex、Claude Code 等智能体"
},
```

提交前请确认：

1. **键是裸包名** —— `name` 或 `@scope/name`，与 `node_modules/<键>` 的目录名逐字一致。
2. **`title` 简短** —— 建议不超过 10 个汉字，它会直接显示在插件列表的标题位置。
3. **`description` 是一句话** —— 建议不超过 80 个汉字，说明这个插件**做什么**。
4. **专名保留原文** —— `DeepSeek Harness`、`Cordis`、`Loader`、`Remote`、`MCP`、
   `SQLite`、`Playwright`、`Univer`、`OpenAI`、`PTC` 等不要翻译。
5. **不要以「这是一个……」开头** —— 描述直接写功能。

## 开发环境

不需要安装任何依赖即可做大部分改动。

```bash
# 词表自检（任何 Node ≥ 20 均可运行）
node scripts/check-phrases.mjs

# 语法检查
node --check lib/index.js
node --check lib/phrases.js
```

完整验收测试需要在装有 DSH 的机器上、**从已安装位置**运行（因为要解析宿主提供的
`@deepseek-ai/schemastery`）：

```bash
node <profile>/node_modules/dsh-plugin-zh-cn/test/acceptance.mjs
# 期望输出：45 checks passed, 0 failed
```

## 提交前

- 跑一遍 `node scripts/check-phrases.mjs` 与两个 `node --check`。
- 改了用户可见行为就更新 `README.md`；改了插件行为就在 `CHANGELOG.md` 顶部加一条。
- 改动 `lib/` 后请**升版本号**（`package.json`）—— DSH 按版本缓存客户端模块图。

## 拉取请求

- 一个 PR 只做一件事。
- 标题写清楚：`fix: …`、`feat: …`、`docs: …`、`phrases: 新增 N 条翻译`。
- 说明**为什么**改，而不只是改了什么。

## 边界

这个插件的全部价值建立在「**绝不破坏别人**」上。任何改动都必须满足：

- 只写 `<已安装插件>/locale/en.json`、`<已安装插件>/locale/zh.json`，
  以及必要时为该包 `exports` 增加 `"./locale/*.json"` 一项。
- 只认**带 `$dshPluginZhCn` 标记**的文件为自有文件，绝不覆盖别人的翻译。
- 任何异常都降级为警告，**不得影响 DSH 启动**。
- 不联网、不执行外部命令、不修改 profile 自身配置。

涉及上述边界的 PR 会被重点审查。
