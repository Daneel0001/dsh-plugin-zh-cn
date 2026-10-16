# 贡献指南

感谢你有兴趣改进 `dsh-plugin-zh-cn`。

## 这个插件的底线

先说清楚，因为它决定了什么 PR 会被拒：

1. **不内置任何词典。** 译文只能来自两个地方：DSH 内置 `llm` 服务的实时翻译，
   以及 `local-cache.json`。往源码里塞中文映射表是**明确禁止**的
   （`scripts/check.mjs` 会自动拦下来）。
2. **不碰 DOM。** 不新增/删除节点，不改 class，不改内联样式，不改文本节点。
   中文是靠把 `{ en }` 补成 `{ en, zh }`、让 DSH 自己的 `resolveText()` 渲染出来的。
3. **不影响开关。** 启用/停用走 `entry.enabled`，与元数据无关，不要把它牵进来。
4. **不动别人的东西。** 只读其它插件的 `package.json`；唯一会写的是本插件自己的
   `local-cache.json`。已经带中文的插件（含全部官方内置插件）一律跳过。
5. **失败即原样。** 超时、报错、非法 JSON、译文不是中文 —— 一律保留英文 + 一条警告，
   不得影响 DSH 启动，更不得让设置界面白屏。

## 常见的贡献

### 改进提示词或解析

- 提示词在 [`lib/translate.js`](lib/translate.js) 的 `SYSTEM_PROMPT`。
- 解析在同一个文件的 `parseTranslation()`：它刻意宽容（接受 `name`/`title`/`zh`、
  容忍 Markdown 围栏），但在「译文必须含中文」上**刻意严格** —— 因为把英文原文
  当成译文写进缓存，比不翻译更糟。
- 改完请补测试。`test/acceptance.mjs` 里 `translate.js` 那一节就是为它准备的。

### 改进缓存

[`lib/cache.js`](lib/cache.js) 的三条不变式：

1. **合并优先** —— 任何写入都是「读旧 → 合并 → 原子替换」，历史条目只增不减。
2. **指纹有效** —— `en` 是英文原文；指纹变了才重译。
3. **坏文件不致命** —— 读不出来就当空缓存，只记一条警告。

### 同步官方机制的变化

数据层那两个包装点（`pluginPackages.metaOf`、`pluginInventory.list`）来自 DSH 官方包
`dsh-app-boot` / `dsh-host-plugin-inventory`。如果某个 DSH 版本改了元数据通路，
`lib/inject.js` 是唯一需要动的地方，而 `apply` 会把安装结果写进启动日志：

```
dsh-plugin-zh-cn: 已加载 12 条翻译（…/local-cache.json）；注入 metaOf=instance+prototype, inventory.list=instance+prototype
```

看到 `metaOf=pending` 就说明那层没贴上。

## 开发环境

不需要安装任何依赖即可做大部分改动。

```bash
npm run check          # 静态自检：清单 / 语法 / 可导入性 / 不许硬编码词典
npm run check:syntax   # 只做语法检查
```

完整验收测试零依赖，**在源码目录里直接跑**即可：

```bash
npm test
# 期望输出：47 passed, 0 failed, 0 skipped
```

测试全部在系统临时目录里工作，不会碰真实的 profile。

## 提交前

- `npm run check` 与 `npm test` 都要通过。
- 改了用户可见行为就更新 `README.md`；改了插件行为就在 `CHANGELOG.md` 顶部加一条。
- 改动 `lib/` 后请**升版本号**（`package.json`）—— DSH 按版本缓存客户端模块图。

## 拉取请求

- 一个 PR 只做一件事。
- 标题写清楚：`fix: …`、`feat: …`、`docs: …`。
- 说明**为什么**改，而不只是改了什么。
