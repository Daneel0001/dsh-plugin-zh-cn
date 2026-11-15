/**
 * dsh-plugin-zh-cn — 让「已安装插件」的显示名与描述自动变成简体中文。
 *
 * ── 它做什么 ────────────────────────────────────────────────────────────────
 *
 * DSH 启动时：
 *   1. 读取本地翻译缓存 `local-cache.json`，**同步**建好翻译表（首屏就是中文）；
 *   2. 在数据层装上注入（`pluginPackages.metaOf` + `pluginInventory.list`），
 *      把 `meta.title` / `meta.description` 从 `{ en }` 补成 `{ en, zh }`；
 *   3. 异步扫描「已安装插件」列表，对**缓存里没有的英文插件**用 `backend` 选定的
 *      后端翻译（默认 `bing` 免费接口；也可 `api` 自定义接口或 `llm` DSH 里的模型），
 *      结果合并写回缓存。
 *
 * 下一次启动时，那批新插件就已经在缓存里，直接以中文呈现，一个请求都不发。
 *
 * ── 四条硬约束 ─────────────────────────────────────────────────────────────
 *
 * 1. **不碰 DOM**：不改结构、不改 CSS、不改排版、不改任何文本节点，只让 DSH
 *    自己的 `resolveText()` 从 `{ en, zh }` 里取到中文。右侧启用/停用开关走
 *    `entry.enabled`，与 meta 无交集，不可能被影响。
 * 2. **不碰别人的翻译**：meta 上已经带 `zh` 的插件（含全部官方内置插件）一律跳过。
 * 3. **不内嵌词典**：译文全部来自 `backend` 选定的翻译后端
 *    （`bing` / `api` / `llm`），源码里不藏任何词典。
 * 4. **绝不阻塞启动**：缓存读失败、模型报错、超时、JSON 非法 —— 全部降级为
 *    「保留英文原文 + 一条警告」，任何异常都不会冒泡到 DSH 的启动链路。
 *
 * 另外本插件**没有必需的运行时依赖**：配置由下面的 `resolveConfig()` 自己规整，
 * `@deepseek-ai/schemastery` 只用于导出可选的 `Config` schema，用 `createRequire`
 * 同步 try-require，缺了就把 `Config` 降级为 `undefined`。多一个硬 import 就多一种
 * 「依赖解析失败 → 插件整块加载不了」的可能，而本插件宁可降级也不该失败。
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_FILE_NAME, createTranslationCache } from './cache.js';
import { createInjector } from './inject.js';
import { clean, englishOf, isPlainObject, targetTextOf } from './text.js';
import { DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS, translatePlugin } from './translate.js';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_API_MODEL,
  DEFAULT_BING_ENDPOINT,
  translateViaApi,
  translateViaBing,
} from './translate.js';

/** cordis 插件名（与 cordis.patch.yml 的行 id 对应）。 */
const name = 'zh-cn-plugin-locale';

/**
 * 刻意不声明硬依赖：本插件用 `ctx.get(...)` 可选访问所有服务，
 * 声明 `inject` 反而可能因为某个服务在启动早期还没就位而让插件静默不生效。
 */
const inject = [];

/** 配置默认值。 */
const DEFAULTS = Object.freeze({
  /** 总开关。 */
  enabled: true,
  /**
   * 翻译后端：
   * - `bing`（默认）：免费微软翻译，不需要账号、不需要 API Key；
   * - `api`：任意 OpenAI 兼容接口（DeepSeek / OpenAI / 自建网关）；
   * - `llm`：DeepSeek 账号 —— 用「设置 → 模型」里选中的模型，不需要再填任何配置。
   */
  backend: 'bing',
  /** Bing 翻译页地址；留空用 cn.bing.com。 */
  bingEndpoint: DEFAULT_BING_ENDPOINT,
  /** OpenAI 兼容接口的 base URL（含 /v1）。 */
  apiBaseUrl: DEFAULT_API_BASE_URL,
  /** API Key。 */
  apiKey: '',
  /** API 模型名。 */
  apiModel: DEFAULT_API_MODEL,
  /** 严格模式：名称与描述都拿到译文才写入缓存，避免半中半英。 */
  strict: true,
  /** 单条翻译的超时（毫秒）。 */
  timeoutMs: DEFAULT_TIMEOUT_MS,
  /** 单条翻译的输出上限（token）。 */
  maxTokens: DEFAULT_MAX_TOKENS,
  /** 兼容旧配置保留（卡片已不再暴露）：`llm` 后端的模型渠道，留空 = 跟随「设置 → 模型」。 */
  provider: '',
  model: '',
  /**
   * 兼容旧配置保留（卡片已不再暴露）：`llm` 后端在设置里读不到默认模型时，
   * 是否回退到 DSH 账号渠道（`deepseek-account/deepseek-flash`）。`llm` 后端本身就是
   * 账号渠道，所以默认开启。
   *
   * 关闭后插件就只认「设置 → 模型」与 config 里的显式值；两者都空时本轮不翻译。
   */
  fallbackToAccount: true,
  /** `llm` 后端没等到可用模型/服务时，隔多久自动重试一轮（毫秒）。 */
  retryDelayMs: 180_000,
  /** 缓存文件绝对路径；留空则自动放到 `<profile>/dsh-plugin-zh-cn/local-cache.json`。 */
  cacheFile: '',
  /** 额外的缓存初值文件（只合并，不覆盖）。 */
  seedFiles: [],
  /** 每次启动最多新翻译几个插件。默认实质上不限（一个全新 profile 也就几百条）。 */
  maxPerStart: 500,
  /** 两条翻译之间的间隔（毫秒），给速率限制留点余量。 */
  delayMs: 200,
  /** 每翻译成功几条就落一次盘，避免中途退出丢掉已完成的翻译。 */
  saveEvery: 8,
  /** 每条最多尝试几次。偶发的流卡住 / JSON 抖动，多试一次基本就过了。 */
  retry: 3,
  /** 是否把每条翻译写进 debug 日志。 */
  debug: false,
});

/* ─────────────────────────── 配置 schema（插件页表单） ─────────────────────────── */

/**
 * DSH 会用 `Config` 校验这条插件行的 config，并在「设置 → 插件」里据此生成配置表单。
 *
 * 这里刻意用 `createRequire` 同步加载并允许失败：DSH 运行时一定带
 * `@deepseek-ai/schemastery`（本插件在 package.json 里把它声明为依赖），
 * 而在没有安装依赖的纯 Node 环境（本仓库的验收测试直接 `import` 本模块）里
 * 拿不到它 —— 此时不导出可用 schema，`resolveConfig()` 的手写规整照样工作，
 * 插件不会因为缺依赖而加载失败。
 *
 * @returns {object | undefined} Schemastery schema，或 undefined
 */
function loadSchema() {
  try {
    const require = createRequire(import.meta.url);
    const mod = require('@deepseek-ai/schemastery');
    const schema = mod?.default ?? mod;
    return typeof schema?.object === 'function' ? schema : undefined;
  } catch {
    return undefined;
  }
}

const Schema = loadSchema();

/**
 * 插件配置 schema —— 「设置 → 插件」里这个插件的配置表单就是按它渲染的。
 *
 * 字段与 `DEFAULTS` 一一对应；`provider` / `model` 留空表示跟随
 * 「设置 → 模型」里的默认模型，想固定用 DSH 账号 API 翻译就填
 * `deepseek-account` / `deepseek-flash`。
 */
export const Config =
  Schema === undefined
    ? undefined
    : Schema.object({
        enabled: Schema.boolean().default(DEFAULTS.enabled).description('总开关：关掉后插件列表保持英文原文'),
        backend: Schema.union(['bing', 'api', 'llm'])
          .default(DEFAULTS.backend)
          .description(
            '翻译后端：bing = 免费微软翻译（不用账号、不用 key，开箱即用）；api = 自定义 OpenAI 兼容接口；llm = DeepSeek 账号（用「设置 → 模型」里选中的模型，不用配置）',
          ),
        bingEndpoint: Schema.string()
          .default(DEFAULTS.bingEndpoint)
          .description('微软翻译页地址，留空用 cn.bing.com（国内可直连）'),
        apiBaseUrl: Schema.string()
          .default(DEFAULTS.apiBaseUrl)
          .description('OpenAI 兼容接口的 base URL（含 /v1），如 https://api.deepseek.com/v1'),
        apiKey: Schema.string().default(DEFAULTS.apiKey).description('API Key（只写在本机 profile 的配置里）'),
        apiModel: Schema.string().default(DEFAULTS.apiModel).description('API 模型名，如 deepseek-chat'),
        provider: Schema.string()
          .default(DEFAULTS.provider)
          .description('仅 backend=llm 时生效：模型渠道；留空 = 用「设置 → 模型」里的默认模型（可填 deepseek-account）'),
        model: Schema.string()
          .default(DEFAULTS.model)
          .description('仅 backend=llm 时生效：模型名；留空 = 用「设置 → 模型」里的默认模型（可填 deepseek-flash）'),
        fallbackToAccount: Schema.boolean()
          .default(DEFAULTS.fallbackToAccount)
          .description('仅 backend=llm 时生效：「设置 → 模型」里没有可用默认模型时回退到 DSH 账号渠道（deepseek-account/deepseek-flash）'),
        strict: Schema.boolean().default(DEFAULTS.strict).description('严格模式：名称与描述都拿到译文才写入缓存'),
        timeoutMs: Schema.number().default(DEFAULTS.timeoutMs).description('单条翻译的超时（毫秒）'),
        maxTokens: Schema.number().default(DEFAULTS.maxTokens).description('单条翻译的输出上限（token，仅 api / llm 用）'),
        maxPerStart: Schema.number().default(DEFAULTS.maxPerStart).description('每次启动最多新翻译几个插件'),
        delayMs: Schema.number().default(DEFAULTS.delayMs).description('两条翻译之间的间隔（毫秒）'),
        retry: Schema.number().default(DEFAULTS.retry).description('每条翻译最多尝试几次'),
        retryDelayMs: Schema.number()
          .default(DEFAULTS.retryDelayMs)
          .description('backend=llm 时没等到可用模型/服务，隔多久自动重试一轮（毫秒）'),
        debug: Schema.boolean().default(DEFAULTS.debug).description('把每条翻译写进 debug 日志'),
      });

/**
 * 把原始配置规整成完整、类型安全的配置对象。
 *
 * 手写而不是只依赖 schema：这样插件零依赖，配置写错也只会退回默认值，不会让插件加载失败。
 */
export function resolveConfig(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
  const num = (value, fallback) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  const str = (value, fallback) => (typeof value === 'string' ? value.trim() : fallback);
  const oneOf = (value, allowed, fallback) =>
    typeof value === 'string' && allowed.includes(value) ? value : fallback;
  const strList = (value) =>
    Array.isArray(value)
      ? value.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
      : [];

  return {
    enabled: bool(source.enabled, DEFAULTS.enabled),
    backend: oneOf(source.backend, ['bing', 'api', 'llm'], DEFAULTS.backend),
    bingEndpoint: str(source.bingEndpoint, DEFAULTS.bingEndpoint),
    apiBaseUrl: str(source.apiBaseUrl, DEFAULTS.apiBaseUrl),
    apiKey: str(source.apiKey, DEFAULTS.apiKey),
    apiModel: str(source.apiModel, DEFAULTS.apiModel),
    strict: bool(source.strict, DEFAULTS.strict),
    timeoutMs: num(source.timeoutMs, DEFAULTS.timeoutMs),
    maxTokens: num(source.maxTokens, DEFAULTS.maxTokens),
    provider: str(source.provider, DEFAULTS.provider),
    model: str(source.model, DEFAULTS.model),
    fallbackToAccount: bool(source.fallbackToAccount, DEFAULTS.fallbackToAccount),
    retryDelayMs: num(source.retryDelayMs, DEFAULTS.retryDelayMs),
    cacheFile: str(source.cacheFile, DEFAULTS.cacheFile),
    seedFiles: strList(source.seedFiles),
    maxPerStart: num(source.maxPerStart, DEFAULTS.maxPerStart),
    delayMs: num(source.delayMs, DEFAULTS.delayMs),
    saveEvery: num(source.saveEvery, DEFAULTS.saveEvery),
    retry: Math.max(1, num(source.retry, DEFAULTS.retry)),
    debug: bool(source.debug, DEFAULTS.debug),
  };
}

/* ─────────────────────────── 路径工具（纯函数） ─────────────────────────── */

/** 把 file: URL 或普通路径变成绝对路径；失败返回 undefined。 */
export function toAbsolutePath(value) {
  if (typeof value !== 'string' || value === '') return undefined;
  let text = value;
  if (text.startsWith('file:')) {
    try {
      text = fileURLToPath(text);
    } catch {
      return undefined;
    }
  }
  if (!isAbsolute(text)) return undefined;
  return resolve(text);
}

/** 从任意起点向上找第一个「含 node_modules 的目录」，也就是 profile 目录。 */
export function nearestProfileDir(start) {
  let current = toAbsolutePath(start);
  for (let depth = 0; current !== undefined && depth < 12; depth += 1) {
    // asar 归档里的路径是只读的，不能当 profile。
    if (current.includes('.asar')) return undefined;
    try {
      if (existsSync(join(current, 'node_modules'))) return current;
    } catch {
      return undefined;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

/** 算出运行时缓存文件的绝对路径。 */
export function resolveCacheFile(ctx, config) {
  const explicit = clean(config?.cacheFile);
  if (explicit !== '') return resolve(explicit);

  const starts = [];
  if (process.env.DSH_PROFILE_DIR) starts.push(process.env.DSH_PROFILE_DIR);
  if (process.env.DSH_PROFILE) starts.push(process.env.DSH_PROFILE);
  for (const url of [ctx?.baseUrl, ctx?.root?.baseUrl]) {
    if (typeof url === 'string') starts.push(url);
  }
  try {
    starts.push(dirname(dirname(fileURLToPath(import.meta.url))));
  } catch {
    /* ignore */
  }

  for (const start of starts) {
    const dir = nearestProfileDir(start);
    if (dir !== undefined) return join(dir, 'dsh-plugin-zh-cn', CACHE_FILE_NAME);
  }
  return join(homedir(), '.dsh', 'plugin-data', 'dsh-plugin-zh-cn', CACHE_FILE_NAME);
}

/** 随包发布的那份 `local-cache.json`（作为初值合并，绝不覆盖用户后来的翻译）。 */
export function bundledCacheFile() {
  try {
    return join(dirname(dirname(fileURLToPath(import.meta.url))), CACHE_FILE_NAME);
  } catch {
    return undefined;
  }
}

/* ─────────────────────── 已安装插件清单（UI 的同一条通路） ─────────────────────── */

/**
 * 读出「已安装插件」清单。
 *
 * 首选 `pluginInventory.list()` —— 这正是设置界面的插件列表所用的同一个宿主服务；
 * 拿不到时退回直接遍历 Loader 的条目。
 *
 * @param rawList  **包装前**捕获的原始 `pluginInventory.list`（避免读到我们自己刚注入的中文）
 */
export async function collectInstalledPlugins({ ctx, rawList, logger }) {
  if (typeof rawList === 'function') {
    try {
      const snapshot = await rawList();
      if (isPlainObject(snapshot) && Array.isArray(snapshot.entries)) {
        return snapshot.entries
          .filter((entry) => isPlainObject(entry) && clean(entry.moduleName) !== '')
          .map((entry) => ({ key: clean(entry.moduleName), meta: entry.meta }));
      }
    } catch (error) {
      logger?.warn?.(`dsh-plugin-zh-cn: 读取 pluginInventory 失败，改用 Loader: ${error?.message ?? error}`);
    }
  }

  try {
    const loader = ctx?.get?.('loader');
    const packages = ctx?.get?.('pluginPackages');
    const entries = typeof loader?.entries === 'function' ? loader.entries() : [];
    const out = [];
    for (const entry of entries) {
      if (entry?.options?.group === true) continue;
      const moduleName = clean(entry?.options?.name);
      if (moduleName === '') continue;
      const base = entry?.parent?.tree?.ctx?.baseUrl;
      let meta;
      if (base !== undefined && typeof packages?.metaOf === 'function') {
        try {
          meta = packages.metaOf(moduleName, base);
        } catch {
          meta = undefined;
        }
      }
      out.push({ key: moduleName, meta });
    }
    return out;
  } catch (error) {
    logger?.warn?.(`dsh-plugin-zh-cn: 读取 Loader 条目失败: ${error?.message ?? error}`);
    return [];
  }
}

/** 从一条清单记录里取出「值得翻译的英文原文」。 */
export function extractEnglish(meta) {
  return {
    title: englishOf(meta?.title),
    description: englishOf(meta?.description),
  };
}

/** 该条目是否已经有目标语言（说明本来就带中文，绝不覆盖）。 */
export function alreadyLocalized(meta) {
  return targetTextOf(meta?.title) !== '' || targetTextOf(meta?.description) !== '';
}

/* ───────────────────────────── 翻译调度 ───────────────────────────── */

/** 设置里没有可用默认模型时的兜底：DSH 账号渠道的 flash。 */
export const ACCOUNT_FALLBACK = Object.freeze({ provider: 'deepseek-account', model: 'deepseek-flash' });

/**
 * 解析这次要用的模型，优先级从高到低：
 *
 *   1. config 里显式写的 `provider` / `model`；
 *   2. 「设置 → 模型」里的默认模型（`agentDefaultModel.currentSelection()`）；
 *   3. `fallbackToAccount` 开启时（默认开启），回退到 DSH 账号渠道的
 *      `deepseek-account/deepseek-flash`。
 *
 * 第 3 级是刻意加的：启动早期默认模型常常还没被读出来，以前整轮翻译会因此
 * 一条都不翻；现在只要有账号渠道兜底，翻译就不会卡在「未就绪」上。
 */
export function resolveSelection(ctx, config) {
  const configuredProvider = clean(config?.provider);
  const configuredModel = clean(config?.model);
  if (configuredProvider !== '' && configuredModel !== '') {
    return { provider: configuredProvider, model: configuredModel };
  }

  let fallback = {};
  try {
    fallback = ctx?.get?.('agentDefaultModel')?.currentSelection?.() ?? {};
  } catch {
    fallback = {};
  }

  const defaultProvider = clean(fallback.provider);
  const defaultModel = clean(fallback.model);
  const provider = configuredProvider !== '' ? configuredProvider : defaultProvider;
  const model = configuredModel !== '' ? configuredModel : defaultModel;

  if (provider !== '' && model !== '') {
    return { provider, model, reasoningEffort: fallback.reasoningEffort };
  }

  // 第三级：默认模型为空 / 不全 —— 回退到 DSH 账号渠道。
  if (config?.fallbackToAccount !== false) {
    const selection = {
      provider: configuredProvider !== '' ? configuredProvider : ACCOUNT_FALLBACK.provider,
      model: configuredModel !== '' ? configuredModel : ACCOUNT_FALLBACK.model,
    };
    // 只有「provider 与 model 都来自兜底」才标记，便于日志说明这不是用户显式配置的。
    if (configuredProvider === '' && configuredModel === '') selection.note = 'account-fallback';
    return selection;
  }

  return { provider, model, reasoningEffort: fallback.reasoningEffort };
}

/** 可被中止的等待。 */
function sleep(ms, signal) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((done) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      done();
    }, ms);
    // 刻意不 unref：unref 过的定时器在事件循环空转时根本不触发，会让等待永久挂起
    // （实测：独立进程里 resolveSelectionWithWait 直接卡死，测试也卡在 unsettled await）。
    // DSH 退出时由 signal.abort() 结束等待，不会拖住进程。
    const onAbort = () => {
      clearTimeout(timer);
      done();
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/** 把一次模型选择渲染成日志/缓存里用的标签。 */
function selectionLabel(selection) {
  const provider = clean(selection?.provider);
  const model = clean(selection?.model);
  return provider === '' || model === '' ? '(未就绪)' : `${provider}/${model}`;
}

/**
 * 等一个服务注册好。
 *
 * 踩过的坑：插件在启动早期 `apply`，那一刻 `ctx.get('llm')` 返回 undefined；
 * 旧代码直接放弃整轮翻译（缓存里只会留下 `phase: "start"`、`translated: 0`），
 * 于是**每次重启都翻不了** —— 已缓存的条目照旧，新插件永远停在英文。
 * 这里轮询到服务出现为止，超时后由调用方安排重试。
 *
 * @returns 服务对象，或等到超时后的 undefined
 */
export async function waitForService(ctx, name, { signal, attempts = 20, intervalMs = 1000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted === true) return undefined;
    const service = ctx?.get?.(name);
    if (service !== undefined && service !== null) return service;
    await sleep(intervalMs, signal);
  }
  return ctx?.get?.(name);
}

/**
 * 等到「DSH 设置里选定的模型」可用为止。
 *
 * 踩过的坑：插件是在启动早期 apply 的，那一刻 `agentDefaultModel.currentSelection()`
 * 还读不到用户在「设置 → 模型」里选的值，返回的是空 provider/model。不等待的话，
 * 整轮翻译会以 `no-model` 全部失败 —— 实测 114 条一条不剩。
 *
 * @returns 可用的 `{ provider, model, reasoningEffort? }`，或超时后的 undefined
 */
export async function resolveSelectionWithWait({ ctx, config, logger, signal, attempts = 24, intervalMs = 2500 }) {
  const immediate = resolveSelection(ctx, config);
  if (clean(immediate.provider) !== '' && clean(immediate.model) !== '') return immediate;

  const waitSeconds = Math.round((attempts * intervalMs) / 1000);
  logger?.info?.(`dsh-plugin-zh-cn: DSH 设置里的默认模型尚未就绪，等待中（最多约 ${waitSeconds} 秒）…`);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted === true) return undefined;
    await sleep(intervalMs, signal);
    const next = resolveSelection(ctx, config);
    if (clean(next.provider) !== '' && clean(next.model) !== '') {
      logger?.info?.(`dsh-plugin-zh-cn: 模型已就绪 —— ${next.provider}/${next.model}`);
      return next;
    }
  }
  return undefined;
}

/**
 * 扫描 + 增量翻译。只翻译「英文、且缓存里没有」的插件。
 *
 * @returns 统计结果（也用于日志）
 */
export async function runTranslationPass({ ctx, cache, config, logger, signal }) {
  const backend = config.backend;
  // 只有 llm 后端才需要「设置里的模型」；bing / api 不依赖 DSH 的模型服务。
  const selection = backend === 'llm' ? resolveSelection(ctx, config) : undefined;
  const entries = await collectInstalledPlugins({ ctx, rawList: config.rawList, logger });
  const maxPerStart = Number.isFinite(config.maxPerStart) ? Math.max(0, config.maxPerStart) : 500;

  const pending = [];
  let skippedLocalized = 0;
  let cachedHits = 0;
  let notTranslatable = 0;

  for (const item of entries) {
    const en = extractEnglish(item.meta);
    if (!isTranslatableSafe(en.title) && !isTranslatableSafe(en.description)) {
      notTranslatable += 1;
      continue;
    }
    if (alreadyLocalized(item.meta)) {
      skippedLocalized += 1;
      continue;
    }
    if (cache.match(item.key, en) !== undefined) {
      cachedHits += 1;
      continue;
    }
    pending.push({ key: item.key, en });
  }

  const stats = {
    total: entries.length,
    cachedHits,
    skippedLocalized,
    notTranslatable,
    pending: pending.length,
    translated: 0,
    failed: 0,
    deferred: Math.max(0, pending.length - maxPerStart),
    backend,
    model:
      backend === 'llm'
        ? selectionLabel(selection)
        : backend === 'api'
          ? `api:${config.apiModel}`
          : 'bing-mt',
    noModel: false,
    noLlm: false,
    misconfigured: false,
  };

  /** 本轮状态快照 —— 会写进 local-cache.json 的 lastRun，是最直接的一手诊断信息。 */
  const snapshot = (phase, extra = {}) => ({
    phase,
    backend,
    total: stats.total,
    pending: stats.pending,
    translated: stats.translated,
    failed: stats.failed,
    cachedHits: stats.cachedHits,
    skippedLocalized: stats.skippedLocalized,
    notTranslatable: stats.notTranslatable,
    deferred: stats.deferred,
    model: stats.model,
    ...extra,
  });

  // 先落一次「这一轮准备做什么」：即使随后某条翻译卡住，也能立刻从
  // lastRun 里看出待翻译总数、跳过数与当前卡住的条目。
  cache.noteRun(snapshot(pending.length === 0 ? 'done' : 'start'));
  cache.save();

  if (pending.length === 0) return stats;

  if (backend === 'api' && clean(config.apiKey) === '') {
    logger?.warn?.(
      'dsh-plugin-zh-cn: 翻译后端选的是 API，但还没有填 API Key。' +
        '去「设置 → 插件 → dsh-plugin-zh-cn → 翻译模型」里填，或把后端改回 bing（免费，不用 key）。',
    );
    stats.misconfigured = true;
    stats.deferred = pending.length;
    cache.noteRun(snapshot('no-api-key'));
    cache.save();
    return stats;
  }

  let llm;
  let ready = selection;
  if (backend === 'llm') {
    // `llm` 服务在启动早期可能还没注册（实测每次重启都会遇到）：等它出现，
    // 而不是直接放弃整轮 —— 否则缓存里永远只有 `phase: "start"`、`translated: 0`。
    llm = await waitForService(ctx, 'llm', { signal, attempts: 20, intervalMs: 1000 });
    if (llm === undefined) {
      logger?.warn?.(
        'dsh-plugin-zh-cn: DSH 的 llm 服务尚未就绪，本轮跳过翻译（英文原文保持不变），稍后自动重试。',
      );
      stats.noLlm = true;
      stats.deferred = pending.length;
      cache.noteRun(snapshot('no-llm'));
      cache.save();
      return stats;
    }

    // 真正开翻之前，先等「设置里的模型」就绪 —— 启动早期它可能还没被读出来。
    // 正常情况下 `resolveSelection` 的三级兜底已经给出模型，这里只覆盖
    // `fallbackToAccount: false`（只认设置里默认模型）的情况。
    if (clean(ready.provider) === '' || clean(ready.model) === '') {
      ready = await resolveSelectionWithWait({ ctx, config, logger, signal });
      if (ready === undefined) {
        logger?.warn?.(
          'dsh-plugin-zh-cn: 等不到「设置 → 模型」里的默认模型，本轮跳过翻译（英文原文保持不变）。' +
            '可以先去设置里选一个模型，或在本插件 config 里显式写 provider / model，' +
            '或者把 fallbackToAccount 保持为 true 以使用 DSH 账号渠道兜底。' +
            '也可以把翻译后端改成 bing（免费，不用账号）。',
        );
        stats.noModel = true;
        cache.noteRun(snapshot('no-model'));
        cache.save();
        return stats;
      }
      stats.model = selectionLabel(ready);
      cache.noteRun(snapshot('running', { note: 'model-ready' }));
      cache.save();
    } else if (ready.note === 'account-fallback') {
      logger?.info?.(
        `dsh-plugin-zh-cn: 「设置 → 模型」里暂时读不到默认模型，回退到 DSH 账号渠道 ${stats.model} 翻译。`,
      );
    }
  }

  const saveEvery = Number.isFinite(config.saveEvery) && config.saveEvery > 0 ? config.saveEvery : 8;
  let sinceSave = 0;

  const attemptsPerItem = Math.max(1, Math.round(config.retry));
  /** 本轮失败的条目（包名 + 原因），会写进 lastRun.failures，省得下次再猜。 */
  const failures = [];

  const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxTokens = Number.isFinite(config.maxTokens) ? config.maxTokens : DEFAULT_MAX_TOKENS;
  const debugLogger = config.debug === true ? logger : undefined;

  /** 单条翻译调用（同一个条目可能会被调用多次）。 */
  const translateOnce = (item) => {
    if (backend === 'bing') {
      return translateViaBing({
        title: item.en.title,
        description: item.en.description,
        endpoint: config.bingEndpoint,
        timeoutMs,
        signal,
        retry: 1,
        logger: debugLogger,
      });
    }
    if (backend === 'api') {
      return translateViaApi({
        title: item.en.title,
        description: item.en.description,
        baseUrl: config.apiBaseUrl,
        apiKey: config.apiKey,
        model: config.apiModel,
        timeoutMs,
        maxTokens,
        signal,
        logger: debugLogger,
      });
    }
    return translatePlugin({
      llm,
      selection: ready,
      title: item.en.title,
      description: item.en.description,
      timeoutMs,
      maxTokens,
      signal,
      logger: debugLogger,
    });
  };

  for (const item of pending.slice(0, maxPerStart)) {
    if (signal?.aborted === true) break;

    let stored = false;
    let lastError;
    // 偶发失败（llm.stream 卡住、模型返回的 JSON 抖一下）再试一次基本就过了：
    // 实测一轮 94 条里会有约 11 条这样挂掉，重试后只剩个位数。
    for (let attempt = 0; attempt < attemptsPerItem && !stored; attempt += 1) {
      if (signal?.aborted === true) break;
      try {
        const zh = await translateOnce(item);
        // 严格模式：描述存在却没译出来，就不写半截结果。
        if (config.strict !== false && item.en.description !== '' && clean(zh.description) === '') {
          lastError = new Error('模型没有给出描述译文');
          continue;
        }
        cache.put(item.key, item.en, zh, stats.model);
        stats.translated += 1;
        stored = true;
        sinceSave += 1;
        cache.noteRun(snapshot('running', { current: item.key }));
        logger?.info?.(`dsh-plugin-zh-cn: 「${item.en.title || item.key}」→「${zh.title || item.key}」`);
        // 定期落盘：翻了很久也不怕中途退出丢掉前面几十条。
        if (sinceSave >= saveEvery) {
          cache.save();
          sinceSave = 0;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!stored) {
      stats.failed += 1;
      // 失败一律保留英文原文，绝不让设置界面出问题。
      const detail = `${lastError?.code ?? ''} ${lastError?.message ?? lastError}`.trim();
      failures.push(`${item.key}: ${detail}`);
      cache.noteRun(snapshot('running', { current: item.key, lastError: `${item.key}: ${detail}` }));
      logger?.warn?.(`dsh-plugin-zh-cn: 翻译 ${item.key} 失败（保留英文）: ${detail}`);
    }

    await sleep(config.delayMs, signal);
  }

  cache.noteRun(
    snapshot(signal?.aborted === true ? 'aborted' : 'done', {
      ...(failures.length === 0 ? {} : { failures: failures.slice(-8) }),
    }),
  );
  cache.save();

  return stats;
}

/** `isTranslatable` 的安全包装（避免 undefined 之类把整轮扫描打断）。 */
function isTranslatableSafe(value) {
  try {
    return isTranslatableLoose(value);
  } catch {
    return false;
  }
}

/** 与 `text.js` 的 `isTranslatable` 等价，单独引一层是为了让上面那个 try 有意义。 */
function isTranslatableLoose(value) {
  const text = clean(value);
  if (text === '') return false;
  if (!/[A-Za-z]/.test(text)) return false;
  return !/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(text);
}

/* ─────────────────────────────── 插件入口 ─────────────────────────────── */

function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig);
  if (config.enabled === false) return;

  const logger = ctx?.logger;
  try {
    const cacheFile = resolveCacheFile(ctx, config);
    const seeds = [];
    const bundled = bundledCacheFile();
    if (bundled !== undefined) seeds.push(bundled);
    for (const extra of config.seedFiles) seeds.push(extra);

    // ① 同步读缓存：界面第一次取数时翻译表就已经在内存里了。
    const cache = createTranslationCache({ file: cacheFile, seeds, logger });
    cache.load();

    // ② 数据层注入：把 { en } 补成 { en, zh }。必须在界面取数之前完成。
    //
    // 这一层带「自检」：每条 meta 被投影时就计数，启动 1.5 秒后主动把四条通路各调一次
    // （probe），结果连同安装状态一起写进 local-cache.json 的 lastRender。
    // 排查「界面怎么还是英文」时，看这个字段就能区分三种情况：
    //   install.* = skipped        → 那层皮没贴上
    //   probe.* = 0                → 贴上了但调用没经过我们
    //   calls > 0 而 hits = 0      → 走到了，但缓存里没有对应译文
    let probe;
    const render = { calls: 0, hits: 0, misses: 0, samples: [] };
    let renderTimer;

    /** 把注入侧状态落盘一次（失败绝不能影响注入本身）。 */
    const flushRender = (extra = {}) => {
      try {
        cache.noteRender({
          install: injector.status,
          probe,
          calls: render.calls,
          hits: render.hits,
          misses: render.misses,
          samples: render.samples.slice(-6),
          ...extra,
        });
        cache.save();
      } catch {
        /* ignore */
      }
    };

    const injector = createInjector({
      logger,
      lookup(moduleName, meta) {
        const en = extractEnglish(meta);
        return cache.match(moduleName, en);
      },
      onProject(info) {
        render.calls += 1;
        if (info.hit) render.hits += 1;
        else render.misses += 1;
        if (render.samples.length < 60) {
          render.samples.push(`${info.counter ?? '?'}:${info.module ?? '?'}:${info.hit ? 'hit' : 'miss'}`);
        }
        // 防抖落盘：界面一次渲染会连着投影几百条，不能每条都写文件。
        if (renderTimer === undefined) {
          renderTimer = setTimeout(() => {
            renderTimer = undefined;
            flushRender({ note: 'rendered' });
          }, 800);
        }
      },
    });

    // 包装前先抓住原始函数：扫描阶段要读英文原文，读的必须是没被我们改过的值。
    let rawList;
    try {
      const inventory = ctx?.get?.('pluginInventory');
      if (inventory !== undefined && typeof inventory.list === 'function') {
        rawList = inventory.list.bind(inventory);
      }
    } catch {
      rawList = undefined;
    }

    injector.install(ctx);
    flushRender({ note: 'installed' });

    const controller = new AbortController();

    ctx.effect(
      () => {
        // 有些服务在极早期还没注册，1.5 秒后补装一次（幂等），然后跑一次自检探针。
        // 刻意不 unref：unref 的定时器在事件循环空转时不会触发（踩过这个坑）。
        const retry = setTimeout(async () => {
          try {
            injector.install(ctx);
            probe = await injector.probe(ctx);
          } catch {
            /* ignore */
          }
          flushRender({ note: 'probed' });
        }, 1500);

        return () => {
          clearTimeout(retry);
          if (renderTimer !== undefined) clearTimeout(renderTimer);
          controller.abort();
          injector.dispose();
        };
      },
      'dsh-plugin-zh-cn: 数据层注入',
    );

    const status = injector.status;
    logger?.info?.(
      `dsh-plugin-zh-cn: 已加载 ${cache.size} 条翻译（${cacheFile}）；注入 ` +
        `metaOf=${status.metaOf}, listBundles=${status.listBundles}, ` +
        `listPlugins=${status.listPlugins}, inventory.list=${status.inventoryList}`,
    );
    if (!injector.anyInstalled) {
      logger?.warn?.(
        'dsh-plugin-zh-cn: 四条注入通路暂时都没找到对应服务（pluginPackages / pluginManager / pluginInventory），' +
          '1.5 秒后会再试一次。',
      );
    }

    // ③ 异步扫描 + 增量翻译：绝不阻塞启动，任何异常都只记一条警告。
    //
    // 没等到可用模型（例如 `fallbackToAccount` 关掉、且「设置 → 模型」里还没选）时，
    // 不再「本轮直接放弃」：按 `retryDelayMs` 自动重试，直到模型出现或插件被卸载。
    let retryTimer;
    const scheduleRetry = () => {
      if (retryTimer !== undefined || controller.signal.aborted) return;
      const delay =
        Number.isFinite(config.retryDelayMs) && config.retryDelayMs > 0
          ? config.retryDelayMs
          : DEFAULTS.retryDelayMs;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (controller.signal.aborted) return;
        void runPass();
      }, delay);
      logger?.info?.(`dsh-plugin-zh-cn: ${Math.round(delay / 1000)} 秒后自动重试翻译。`);
    };

    const runPass = () =>
      runTranslationPass({
        ctx,
        cache,
        config: { ...config, rawList },
        logger,
        signal: controller.signal,
      })
        .then((stats) => {
          if (stats.pending === 0) {
            logger?.info?.(
              `dsh-plugin-zh-cn: 扫描 ${stats.total} 个已安装插件，没有需要新翻译的条目` +
                `（缓存命中 ${stats.cachedHits}，已有中文 ${stats.skippedLocalized}）。`,
            );
            return;
          }
          if (stats.translated > 0) cache.save();
          logger?.info?.(
            `dsh-plugin-zh-cn: 新翻译 ${stats.translated} 条（失败 ${stats.failed} 条，模型 ${stats.model}）；` +
              (stats.deferred > 0 ? `还有 ${stats.deferred} 条留到下次启动。` : '缓存已更新。'),
          );
          if (stats.noModel === true || stats.noLlm === true) scheduleRetry();
        })
        .catch((error) => {
          logger?.warn?.(`dsh-plugin-zh-cn: 翻译任务异常（已忽略）: ${error?.message ?? error}`);
        });

    const task = runPass();

    ctx.effect(
      () => () => {
        // 卸载时把在途任务交给 AbortController 收尾，并清掉待触发的重试。
        if (retryTimer !== undefined) {
          clearTimeout(retryTimer);
          retryTimer = undefined;
        }
        void task;
      },
      'dsh-plugin-zh-cn: 翻译任务',
    );
  } catch (error) {
    // 任何意外都不能影响 DSH 启动 —— 顶多是插件列表继续显示英文。
    logger?.warn?.(`dsh-plugin-zh-cn: 初始化失败（插件列表保持英文）: ${error?.message ?? error}`);
  }
}

export {
  apply,
  DEFAULTS,
  inject,
  name,
  CACHE_FILE_NAME,
  DEFAULT_TIMEOUT_MS,
  createTranslationCache,
  createInjector,
};
