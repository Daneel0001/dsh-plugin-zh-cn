/**
 * dsh-plugin-zh-cn — 验收测试。
 *
 * 全部在一个临时目录里跑，绝不碰真实的 profile，也不需要任何依赖：
 *
 *     npm test
 *
 * 本插件零运行时依赖，因此在源码目录里就能跑完 43 项（含 5 项 `apply` 集成测试）。
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createTranslationCache, extractEntries, normalizeEntry, CACHE_FILE_NAME } from '../lib/cache.js';
import { createInjector } from '../lib/inject.js';
import { containsCjk, englishOf, isTranslatable, targetTextOf, withTarget } from '../lib/text.js';
import { parseTranslation, translatePlugin, TranslationError, SYSTEM_PROMPT } from '../lib/translate.js';

/* ───────────────────────────────── 迷你 runner ───────────────────────────────── */

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

/** 每个测试跑完后要执行的清理（撤销注入、还原被包装的原型）。 */
let activeCleanups = [];

function registerCleanup(fn) {
  activeCleanups.push(fn);
}

async function test(title, body) {
  try {
    await body();
    passed += 1;
    process.stdout.write(`  [ok]   ${title}\n`);
  } catch (error) {
    failed += 1;
    failures.push({ title, error });
    process.stdout.write(`  [FAIL] ${title}\n         ${error?.message ?? error}\n`);
  } finally {
    for (const cleanup of activeCleanups.reverse()) {
      try {
        cleanup();
      } catch {
        /* ignore */
      }
    }
    activeCleanups = [];
  }
}

function skip(title, why) {
  skipped += 1;
  process.stdout.write(`  [skip] ${title} — ${why}\n`);
}

function section(title) {
  process.stdout.write(`\n${title}\n`);
}

function tempDir(label) {
  return mkdtempSync(join(tmpdir(), `zh-cn-${label}-`));
}

/** 缓存文件里的条目数；文件不存在或读不出来都算 0。 */
function entryCount(file) {
  try {
    return Object.keys(JSON.parse(readFileSync(file, 'utf8')).entries).length;
  } catch {
    return 0;
  }
}

/* ──────────────────────────────── 假 DSH ──────────────────────────────── */

function makeLogger() {
  const lines = [];
  const push = (level) => (message) => lines.push(`[${level}] ${message}`);
  return { lines, info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug') };
}

/** 假的 llm 服务：把一段文本当作流式回复。 */
function makeLlm(reply, { fail } = {}) {
  const calls = [];
  return {
    calls,
    stream(options) {
      calls.push(options);
      return (async function* stream() {
        if (fail !== undefined) {
          yield {
            type: 'finish',
            reason: { kind: 'error', failure: { code: fail.code ?? 'boom', message: fail.message ?? 'boom' } },
          };
          return;
        }
        const text = typeof reply === 'function' ? reply(options) : reply;
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text };
        yield { type: 'block-end', index: 0, block: { type: 'text', text } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      })();
    },
  };
}

/** 假 pluginPackages：`metaOf` 刻意放在**原型**上，验证原型包装这条路。 */
class FakePackages {
  constructor(table) {
    this.table = table;
  }
  metaOf(specifier) {
    return this.table[specifier];
  }
}

/** 假 pluginInventory：`list` 同样在原型上。 */
class FakeInventory {
  constructor(entries) {
    this._entries = entries;
  }
  async list() {
    return { entries: this._entries.map((entry) => ({ ...entry })), managementAvailable: true };
  }
}

function makeCtx({ packages, inventory, llm, selection, profileDir, logger } = {}) {
  const disposers = [];
  const ctx = {
    logger: logger ?? makeLogger(),
    baseUrl: profileDir === undefined ? undefined : `file:///${profileDir.replace(/\\/g, '/')}/`,
    get(name) {
      if (name === 'pluginPackages') return packages;
      if (name === 'pluginInventory') return inventory;
      if (name === 'llm') return llm;
      if (name === 'agentDefaultModel') return { currentSelection: () => selection };
      return undefined;
    },
    effect(callback) {
      const dispose = callback();
      if (typeof dispose === 'function') disposers.push(dispose);
      return () => {};
    },
    disposers,
  };
  // 测试结束后自动撤销注入，避免一个用例包装过的原型影响下一个用例。
  registerCleanup(() => {
    for (const dispose of [...disposers].reverse()) dispose();
  });
  return ctx;
}

const pluginEntries = [
  {
    entryId: 'e1',
    moduleName: 'billion-context',
    enabled: true,
    fiberPhase: 'active',
    meta: { title: 'billion-context', description: 'A context-compression plugin — small context windows.' },
  },
  {
    entryId: 'e2',
    moduleName: '@deepseek-ai/dsh-experimental-voice-input',
    enabled: true,
    fiberPhase: 'active',
    meta: {
      title: { en: 'Voice Input', zh: '语音输入' },
      description: { en: 'Dictate prompts.', zh: '用语音输入提示词。' },
    },
  },
  {
    entryId: 'e3',
    moduleName: 'dsh-browser',
    enabled: false,
    fiberPhase: 'active',
    meta: { title: 'dsh-browser', description: 'Browse the web from DSH.' },
  },
];

const goodReply = '{"name":"十亿级上下文插件","desc":"小上下文窗口即可容纳超大仓库上下文"}';

function englishFingerprint(entry) {
  return { title: englishOf(entry.meta.title), description: englishOf(entry.meta.description) };
}

/* ──────────────────────────────── text.js ──────────────────────────────── */

section('text.js');

await test('isTranslatable accepts an English title', () => {
  assert.equal(isTranslatable('billion-context'), true);
});

await test('isTranslatable rejects empty / whitespace / non-strings', () => {
  assert.equal(isTranslatable(''), false);
  assert.equal(isTranslatable('   '), false);
  assert.equal(isTranslatable(undefined), false);
  assert.equal(isTranslatable(null), false);
});

await test('isTranslatable rejects text that already contains Chinese', () => {
  assert.equal(isTranslatable('语音输入'), false);
  assert.equal(isTranslatable('终端'), false);
  assert.equal(isTranslatable('Voice 输入'), false);
});

await test('isTranslatable rejects text without any latin letter', () => {
  assert.equal(isTranslatable('12345'), false);
  assert.equal(isTranslatable('---'), false);
});

await test('containsCjk distinguishes scripts', () => {
  assert.equal(containsCjk('中文'), true);
  assert.equal(containsCjk('中文 and english'), true);
  assert.equal(containsCjk('plain english'), false);
});

await test('englishOf reads a plain string, { en } and { en, zh }', () => {
  assert.equal(englishOf('dsh-browser'), 'dsh-browser');
  assert.equal(englishOf({ en: 'Browser' }), 'Browser');
  assert.equal(englishOf({ en: 'Browser', zh: '浏览器' }), 'Browser');
  assert.equal(englishOf({ zh: '浏览器' }), '');
  assert.equal(englishOf(undefined), '');
});

await test('targetTextOf finds zh regardless of case', () => {
  assert.equal(targetTextOf({ en: 'x', zh: '中文' }), '中文');
  assert.equal(targetTextOf({ en: 'x', 'zh-CN': '中文' }), '中文');
  assert.equal(targetTextOf({ en: 'x' }), '');
});

await test('withTarget merges zh while keeping en and other locales', () => {
  assert.deepEqual(withTarget('dsh-browser', '浏览器'), { en: 'dsh-browser', zh: '浏览器' });
  assert.deepEqual(withTarget({ en: 'Browser', ja: 'ブラウザ' }, '浏览器'), {
    en: 'Browser',
    ja: 'ブラウザ',
    zh: '浏览器',
  });
  assert.equal(withTarget('dsh-browser', ''), undefined);
  assert.equal(withTarget('dsh-browser', '   '), undefined);
});

/* ──────────────────────────────── cache.js ──────────────────────────────── */

section('cache.js');

await test('normalizeEntry understands the native format', () => {
  const entry = normalizeEntry({
    en: { title: 'dsh-browser', description: 'Browse.' },
    zh: { title: '浏览器', description: '浏览网页。' },
    model: 'deepseek/deepseek-chat',
    translatedAt: '2026-10-16T00:00:00.000Z',
  });
  assert.equal(entry.zh.title, '浏览器');
  assert.equal(entry.en.description, 'Browse.');
  assert.equal(entry.model, 'deepseek/deepseek-chat');
});

await test('normalizeEntry understands a flat phrase table as Chinese', () => {
  const entry = normalizeEntry({ title: '我的插件', description: '一句话说明。' });
  assert.equal(entry.zh.title, '我的插件');
  assert.equal(entry.en.title, '');
});

await test('extractEntries ignores the document envelope', () => {
  const entries = extractEntries({
    version: 2,
    generator: 'dsh-plugin-zh-cn',
    updatedAt: 'x',
    entries: { 'a-plugin': { title: '甲', description: '甲说明' } },
  });
  assert.deepEqual(Object.keys(entries), ['a-plugin']);
});

await test('a fresh cache matches nothing', () => {
  const dir = tempDir('cache-empty');
  try {
    const cache = createTranslationCache({ file: join(dir, CACHE_FILE_NAME) });
    cache.load();
    assert.equal(cache.size, 0);
    assert.equal(cache.match('billion-context', { title: 'billion-context', description: 'x' }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('put then match round-trips', () => {
  const dir = tempDir('cache-put');
  try {
    const cache = createTranslationCache({ file: join(dir, CACHE_FILE_NAME) });
    cache.load();
    cache.put(
      'billion-context',
      { title: 'billion-context', description: 'A plugin.' },
      { title: '十亿级上下文插件', description: '一个插件。' },
      'm/x',
    );
    assert.deepEqual(cache.match('billion-context', { title: 'billion-context', description: 'A plugin.' }), {
      title: '十亿级上下文插件',
      description: '一个插件。',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('a changed English fingerprint invalidates the cache entry', () => {
  const dir = tempDir('cache-fingerprint');
  try {
    const cache = createTranslationCache({ file: join(dir, CACHE_FILE_NAME) });
    cache.load();
    cache.put('p', { title: 'p', description: 'Old text.' }, { title: '旧', description: '旧文本。' }, 'm');
    assert.equal(cache.match('p', { title: 'p', description: 'New text.' }), undefined);
    assert.notEqual(cache.match('p', { title: 'p', description: 'Old text.' }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('save writes the file and load reads it back', () => {
  const dir = tempDir('cache-save');
  try {
    const file = join(dir, 'nested', CACHE_FILE_NAME);
    const first = createTranslationCache({ file });
    first.load();
    first.put(
      'dsh-browser',
      { title: 'dsh-browser', description: 'Browse.' },
      { title: '浏览器', description: '浏览网页。' },
      'm/x',
    );
    assert.equal(first.save(), true);
    assert.equal(existsSync(file), true);

    const second = createTranslationCache({ file });
    second.load();
    assert.equal(second.size, 1);
    assert.deepEqual(second.match('dsh-browser', { title: 'dsh-browser', description: 'Browse.' }), {
      title: '浏览器',
      description: '浏览网页。',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('save merges instead of clearing existing entries', () => {
  const dir = tempDir('cache-merge');
  try {
    const file = join(dir, CACHE_FILE_NAME);
    writeFileSync(
      file,
      JSON.stringify({ version: 2, entries: { 'old-plugin': { title: '旧插件', description: '旧的。' } } }),
      'utf8',
    );
    const cache = createTranslationCache({ file });
    cache.load();
    assert.equal(cache.size, 1);
    cache.put('new-plugin', { title: 'new-plugin', description: 'New.' }, { title: '新插件', description: '新的。' }, 'm');
    cache.save();

    const disk = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(Object.keys(disk.entries).sort(), ['new-plugin', 'old-plugin']);
    assert.equal(disk.generator, 'dsh-plugin-zh-cn');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('a seed file contributes initial values without overriding the live cache', () => {
  const dir = tempDir('cache-seed');
  try {
    const seed = join(dir, 'seed.json');
    const file = join(dir, 'live', CACHE_FILE_NAME);
    writeFileSync(seed, JSON.stringify({ 'seed-plugin': { title: '种子插件', description: '来自种子。' } }), 'utf8');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({ entries: { 'seed-plugin': { en: { title: 'seed-plugin' }, zh: { title: '运行时插件' } } } }),
      'utf8',
    );

    const cache = createTranslationCache({ file, seeds: [seed] });
    cache.load();
    assert.equal(cache.peek('seed-plugin').zh.title, '运行时插件');
    assert.equal(cache.size, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ─────────────────────────────── translate.js ─────────────────────────────── */

section('translate.js');

await test('parseTranslation accepts a clean JSON reply', () => {
  assert.deepEqual(parseTranslation('{"name":"十亿级上下文插件","desc":"小上下文窗口即可够用"}'), {
    title: '十亿级上下文插件',
    description: '小上下文窗口即可够用',
  });
});

await test('parseTranslation strips markdown fences and surrounding prose', () => {
  const raw = '好的，结果如下：\n```json\n{"name":"浏览器","desc":"在 DSH 里浏览网页"}\n```\n希望有帮助。';
  assert.deepEqual(parseTranslation(raw), { title: '浏览器', description: '在 DSH 里浏览网页' });
});

await test('parseTranslation accepts alternate key names', () => {
  assert.deepEqual(parseTranslation('{"title":"安全网","description":"拦截危险命令"}'), {
    title: '安全网',
    description: '拦截危险命令',
  });
});

await test('parseTranslation tolerates an empty description', () => {
  assert.deepEqual(parseTranslation('{"name":"浏览器","desc":""}'), { title: '浏览器', description: '' });
});

await test('parseTranslation rejects a non-JSON reply', () => {
  assert.throws(() => parseTranslation('I cannot translate this.'), TranslationError);
});

await test('parseTranslation rejects an English translation', () => {
  assert.throws(() => parseTranslation('{"name":"Browser","desc":"Browse the web"}'), TranslationError);
});

await test('parseTranslation rejects an empty reply', () => {
  assert.throws(() => parseTranslation('{}'), TranslationError);
});

await test('translatePlugin streams a request and returns the translation', async () => {
  const llm = makeLlm(goodReply);
  const result = await translatePlugin({
    llm,
    selection: { provider: 'deepseek', model: 'deepseek-chat' },
    title: 'billion-context',
    description: 'A context-compression plugin — small context windows.',
  });
  assert.deepEqual(result, { title: '十亿级上下文插件', description: '小上下文窗口即可容纳超大仓库上下文' });

  const request = llm.calls[0];
  assert.equal(request.provider, 'deepseek');
  assert.equal(request.model, 'deepseek-chat');
  assert.equal(request.system, SYSTEM_PROMPT);
  assert.match(request.messages[0].content[0].text, /billion-context/);
  assert.match(request.messages[0].content[0].text, /context-compression/);
  assert.equal(request.temperature, 0);
});

await test('translatePlugin raises when the model stream reports a failure', async () => {
  const llm = makeLlm(goodReply, { fail: { code: 'rate-limited', message: 'too many requests' } });
  await assert.rejects(
    () => translatePlugin({ llm, selection: { provider: 'p', model: 'm' }, title: 'x', description: 'y' }),
    (error) => error instanceof TranslationError && /rate-limited/.test(error.message),
  );
});

await test('translatePlugin raises without a model selection', async () => {
  await assert.rejects(
    () => translatePlugin({ llm: makeLlm(goodReply), selection: {}, title: 'x', description: 'y' }),
    (error) => error instanceof TranslationError && error.code === 'no-model',
  );
});

await test('translatePlugin raises without the llm service', async () => {
  await assert.rejects(
    () => translatePlugin({ llm: undefined, selection: { provider: 'p', model: 'm' }, title: 'x', description: 'y' }),
    (error) => error instanceof TranslationError && error.code === 'no-llm',
  );
});

await test('translatePlugin gives up on a stream that never produces nor finishes', async () => {
  // 实测在真实 DSH 里遇到过：某个 provider 的流既不产数据也不结束，
  // 而 AbortController 对它无效 —— 没有硬上限就会让整轮翻译永久挂起。
  const llm = {
    stream() {
      return (async function* neverEnds() {
        yield { type: 'block-start', index: 0, blockType: 'text' };
        await new Promise(() => {});
      })();
    },
  };
  const started = Date.now();
  await assert.rejects(
    () =>
      translatePlugin({
        llm,
        selection: { provider: 'p', model: 'm' },
        title: 'x',
        description: 'y',
        timeoutMs: 60,
        hardTimeoutMs: 200,
      }),
    (error) => error instanceof TranslationError && error.code === 'timeout',
  );
  assert.equal(Date.now() - started < 3000, true, '必须在硬上限内放弃，而不是永久挂起');
});

/* ──────────────────────────────── inject.js ──────────────────────────────── */

section('inject.js');

await test('projectMeta turns { en } into { en, zh }', () => {
  const injector = createInjector({
    lookup: (key) => (key === 'p' ? { title: '甲插件', description: '甲说明' } : undefined),
  });
  const meta = injector.projectMeta({ title: 'p', description: 'A plugin.' }, 'p');
  assert.deepEqual(meta.title, { en: 'p', zh: '甲插件' });
  assert.deepEqual(meta.description, { en: 'A plugin.', zh: '甲说明' });
});

await test('projectMeta leaves plugins that already carry Chinese untouched', () => {
  const injector = createInjector({ lookup: () => ({ title: '不该出现', description: '不该出现' }) });
  const original = { title: { en: 'Voice Input', zh: '语音输入' }, description: { en: 'Dictate.', zh: '语音输入。' } };
  assert.deepEqual(injector.projectMeta(original, 'voice'), original);
});

await test('projectMeta is a no-op when the cache has no match', () => {
  const injector = createInjector({ lookup: () => undefined });
  const original = { title: 'dsh-browser', description: 'Browse.' };
  assert.deepEqual(injector.projectMeta(original, 'dsh-browser'), original);
});

await test('projectMeta survives a throwing lookup', () => {
  const injector = createInjector({
    logger: makeLogger(),
    lookup: () => {
      throw new Error('cache exploded');
    },
  });
  assert.deepEqual(injector.projectMeta({ title: 'x' }, 'x'), { title: 'x' });
});

await test('projectSnapshot covers entries and agent-preset rows', () => {
  const injector = createInjector({ lookup: (key) => ({ title: `中:${key}`, description: `说明:${key}` }) });
  const snapshot = injector.projectSnapshot({
    entries: [{ moduleName: 'a', meta: { title: 'a' } }],
    agentPresets: [{ rows: [{ moduleName: 'b', meta: { title: 'b' } }] }],
  });
  assert.deepEqual(snapshot.entries[0].meta.title, { en: 'a', zh: '中:a' });
  assert.deepEqual(snapshot.agentPresets[0].rows[0].meta.title, { en: 'b', zh: '中:b' });
});

await test('install patches instance and prototype and reaches a real caller', () => {
  const packages = new FakePackages({ p: { title: 'p', description: 'A plugin.' } });
  const injector = createInjector({ lookup: () => ({ title: '甲插件', description: '甲说明' }) });
  try {
    const ctx = makeCtx({ packages });
    assert.equal(injector.install(ctx), true);
    assert.match(injector.status.metaOf, /prototype/);

    const meta = packages.metaOf('p');
    assert.deepEqual(meta.title, { en: 'p', zh: '甲插件' });
  } finally {
    injector.dispose();
  }
});

await test('a different instance of the same class is covered by the prototype patch', () => {
  const first = new FakePackages({ p: { title: 'p' } });
  const injector = createInjector({ lookup: () => ({ title: '甲', description: '甲说明' }) });
  try {
    injector.install(makeCtx({ packages: first }));

    const another = new FakePackages({ p: { title: 'p' } });
    assert.deepEqual(another.metaOf('p').title, { en: 'p', zh: '甲' });
  } finally {
    injector.dispose();
  }
});

await test('install patches a prototype async list and rewrites its snapshot', async () => {
  const inventory = new FakeInventory(pluginEntries);
  const injector = createInjector({
    lookup: (key) =>
      key === 'billion-context' ? { title: '十亿级上下文插件', description: '上下文压缩插件。' } : undefined,
  });
  try {
    injector.install(makeCtx({ inventory }));

    const snapshot = await inventory.list();
    assert.deepEqual(snapshot.entries[0].meta.title, { en: 'billion-context', zh: '十亿级上下文插件' });
    // 已有中文的内置插件原样放过
    assert.deepEqual(snapshot.entries[1].meta.title, { en: 'Voice Input', zh: '语音输入' });
    // 没有译文的插件保持原样
    assert.equal(snapshot.entries[2].meta.title, 'dsh-browser');
  } finally {
    injector.dispose();
  }
});

await test('install is idempotent and dispose restores the originals', async () => {
  const inventory = new FakeInventory(pluginEntries);
  const before = inventory.list;
  const injector = createInjector({ lookup: () => ({ title: '中', description: '中文说明' }) });
  const ctx = makeCtx({ inventory });
  injector.install(ctx);
  injector.install(ctx);
  assert.notEqual(inventory.list, before);

  injector.dispose();
  assert.equal(inventory.list, before);
  const snapshot = await inventory.list();
  assert.equal(snapshot.entries[0].meta.title, 'billion-context');
});

await test('install reports skipped when the services are absent', () => {
  const injector = createInjector({ lookup: () => undefined });
  assert.equal(injector.install(makeCtx({})), false);
  assert.equal(injector.status.metaOf, 'pending');
  assert.equal(injector.status.inventoryList, 'pending');
});

await test('projectBundleList rewrites bundle meta and its rows without mutating input', () => {
  const injector = createInjector({ lookup: (key) => ({ title: `中:${key}`, description: `说明:${key}` }) });
  const bundles = [
    {
      name: 'billion-context',
      meta: { title: 'billion-context' },
      rows: [{ moduleName: 'billion-context', meta: { title: 'billion-context' } }],
    },
  ];
  const next = injector.projectBundleList(bundles);
  assert.deepEqual(next[0].meta.title, { en: 'billion-context', zh: '中:billion-context' });
  assert.deepEqual(next[0].rows[0].meta.title, { en: 'billion-context', zh: '中:billion-context' });
  // 原对象保持不动（绝不污染宿主自己的数据）
  assert.equal(bundles[0].meta.title, 'billion-context');
});

await test('projectEntryList rewrites listPlugins entries', () => {
  const injector = createInjector({ lookup: (key) => ({ title: `中:${key}`, description: `说明:${key}` }) });
  const next = injector.projectEntryList([{ moduleName: 'dsh-browser', enabled: true, meta: { title: 'dsh-browser' } }]);
  assert.deepEqual(next[0].meta.title, { en: 'dsh-browser', zh: '中:dsh-browser' });
  assert.equal(next[0].enabled, true, 'enabled（右侧开关）必须原样保留');
});

await test('probe reports which injection paths actually catch a call', async () => {
  const packages = new FakePackages({ p: { title: 'p' } });
  const inventory = new FakeInventory(pluginEntries);
  const injector = createInjector({ lookup: () => undefined });
  try {
    injector.install(makeCtx({ packages, inventory }));
    const result = await injector.probe(makeCtx({ packages, inventory }));
    assert.equal(result.metaOf, 1, 'metaOf 这条通路应当被接住');
    assert.equal(result.inventoryList, 1, 'pluginInventory.list 这条通路应当被接住');
    assert.equal(result.listBundles, 0, '没有 pluginManager 时应当是 0');
    assert.equal(result.listPlugins, 0);
  } finally {
    injector.dispose();
  }
});

/* ──────────────────────────── apply（集成） ──────────────────────────── */

section('apply (integration)');

let applyModule;
try {
  applyModule = await import('../lib/index.js');
} catch (error) {
  applyModule = undefined;
  skip('apply integration', `cannot load lib/index.js (${error?.code ?? error?.message})`);
}

if (applyModule !== undefined) {
  const { apply, resolveSelectionWithWait } = applyModule;

  /** 轮询等待条件成立。 */
  async function waitFor(check, ms = 4000) {
    const deadline = Date.now() + ms;
    for (;;) {
      if (await check()) return true;
      if (Date.now() > deadline) return false;
      await new Promise((done) => setTimeout(done, 25));
    }
  }

  await test('apply injects Chinese through pluginInventory.list and writes the cache', async () => {
    const dir = tempDir('apply');
    try {
      const inventory = new FakeInventory(pluginEntries);
      const llm = makeLlm(goodReply);
      const ctx = makeCtx({
        inventory,
        llm,
        selection: { provider: 'deepseek', model: 'deepseek-chat' },
        profileDir: dir,
      });
      apply(ctx, { cacheFile: join(dir, CACHE_FILE_NAME), delayMs: 0 });

      assert.equal(
        await waitFor(() => entryCount(join(dir, CACHE_FILE_NAME)) >= 2),
        true,
        '两条待翻译的插件没有写进缓存',
      );

      const snapshot = await inventory.list();
      assert.deepEqual(snapshot.entries[0].meta.title, { en: 'billion-context', zh: '十亿级上下文插件' });
      assert.deepEqual(snapshot.entries[1].meta.title, { en: 'Voice Input', zh: '语音输入' });

      const disk = JSON.parse(readFileSync(join(dir, CACHE_FILE_NAME), 'utf8'));
      assert.equal(disk.entries['billion-context'].zh.title, '十亿级上下文插件');
      assert.equal(disk.entries['dsh-browser'].zh.title, '十亿级上下文插件');
      assert.equal(disk.entries['@deepseek-ai/dsh-experimental-voice-input'], undefined);
      assert.equal(llm.calls.length, 2, 'exactly the two untranslated plugins should be sent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('a second start reuses the cache and sends no request at all', async () => {
    const dir = tempDir('apply-second');
    try {
      const first = makeLlm(goodReply);
      apply(
        makeCtx({ inventory: new FakeInventory(pluginEntries), llm: first, selection: { provider: 'p', model: 'm' }, profileDir: dir }),
        { cacheFile: join(dir, CACHE_FILE_NAME), delayMs: 0 },
      );
      assert.equal(await waitFor(() => entryCount(join(dir, CACHE_FILE_NAME)) >= 2), true);
      assert.equal(first.calls.length, 2);

      const second = makeLlm(goodReply);
      const inventory = new FakeInventory(pluginEntries);
      apply(makeCtx({ inventory, llm: second, selection: { provider: 'p', model: 'm' }, profileDir: dir }), {
        cacheFile: join(dir, CACHE_FILE_NAME),
        delayMs: 0,
      });

      // 缓存命中的注入是同步的：界面第一次取数就已经是中文
      const snapshot = await inventory.list();
      assert.deepEqual(snapshot.entries[0].meta.title, { en: 'billion-context', zh: '十亿级上下文插件' });
      assert.equal(second.calls.length, 0, 'a cache hit must not trigger any model call');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('a failing model keeps the English text and never breaks the UI', async () => {
    const dir = tempDir('apply-fail');
    try {
      const inventory = new FakeInventory(pluginEntries);
      const llm = makeLlm(goodReply, { fail: { code: 'rate-limited', message: 'slow down' } });
      const logger = makeLogger();
      const ctx = makeCtx({ inventory, llm, selection: { provider: 'p', model: 'm' }, profileDir: dir, logger });
      apply(ctx, { cacheFile: join(dir, CACHE_FILE_NAME), delayMs: 0 });

      await new Promise((done) => setTimeout(done, 400));
      const snapshot = await inventory.list();
      assert.equal(snapshot.entries[0].meta.title, 'billion-context');
      assert.equal(entryCount(join(dir, CACHE_FILE_NAME)), 0, '失败的翻译绝不能写进缓存');
      assert.equal(
        logger.lines.some((line) => line.includes('rate-limited')),
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('enabled: false does nothing at all', async () => {
    const dir = tempDir('apply-disabled');
    try {
      const inventory = new FakeInventory(pluginEntries);
      const untouched = inventory.list;
      apply(makeCtx({ inventory, llm: makeLlm(goodReply), selection: { provider: 'p', model: 'm' }, profileDir: dir }), {
        enabled: false,
        cacheFile: join(dir, CACHE_FILE_NAME),
      });
      assert.equal(inventory.list, untouched);
      assert.equal(existsSync(join(dir, CACHE_FILE_NAME)), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('a seed cache is honored on the very first start', async () => {
    const dir = tempDir('apply-seed');
    try {
      const seed = join(dir, 'published', CACHE_FILE_NAME);
      mkdirSync(dirname(seed), { recursive: true });
      writeFileSync(
        seed,
        JSON.stringify({
          version: 2,
          entries: {
            'billion-context': {
              en: {
                title: 'billion-context',
                description: 'A context-compression plugin — small context windows.',
              },
              zh: { title: '十亿级上下文插件', description: '小上下文窗口即可够用' },
            },
          },
        }),
        'utf8',
      );

      const inventory = new FakeInventory(pluginEntries);
      const llm = makeLlm(goodReply);
      apply(makeCtx({ inventory, llm, selection: { provider: 'p', model: 'm' }, profileDir: dir }), {
        cacheFile: join(dir, 'runtime', CACHE_FILE_NAME),
        seedFiles: [seed],
        delayMs: 0,
      });

      const snapshot = await inventory.list();
      assert.deepEqual(snapshot.entries[0].meta.title, { en: 'billion-context', zh: '十亿级上下文插件' });
      assert.equal(llm.calls.length, 1, 'only dsh-browser still needs a translation');
      assert.deepEqual(englishFingerprint(pluginEntries[0]), {
        title: 'billion-context',
        description: 'A context-compression plugin — small context windows.',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('apply survives a bare context with no service at all', async () => {
    const dir = tempDir('apply-bare');
    try {
      const logger = makeLogger();
      // 没有 pluginPackages / pluginInventory / llm / agentDefaultModel 的裸 ctx：
      // 插件必须安静降级成「什么都不做」，而不是把异常抛回 DSH 的启动链路。
      apply(makeCtx({ profileDir: dir, logger }), { cacheFile: join(dir, CACHE_FILE_NAME), delayMs: 0 });
      await new Promise((done) => setTimeout(done, 200));
      assert.equal(entryCount(join(dir, CACHE_FILE_NAME)), 0, '没有任何服务时不应该翻译出任何条目');
      assert.equal(
        logger.lines.some((line) => line.includes('已加载')),
        true,
        '应当正常走完启动流程并记录一条 info',
      );
      assert.equal(
        logger.lines.some((line) => line.includes('初始化失败')),
        false,
        '不得把异常抛回 DSH 的启动链路',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('maxPerStart caps one startup and still persists what it did', async () => {
    const dir = tempDir('apply-cap');
    try {
      const inventory = new FakeInventory(pluginEntries);
      const llm = makeLlm(goodReply);
      apply(makeCtx({ inventory, llm, selection: { provider: 'p', model: 'm' }, profileDir: dir }), {
        cacheFile: join(dir, CACHE_FILE_NAME),
        maxPerStart: 1,
        delayMs: 0,
      });
      assert.equal(await waitFor(() => entryCount(join(dir, CACHE_FILE_NAME)) >= 1), true);
      const disk = JSON.parse(readFileSync(join(dir, CACHE_FILE_NAME), 'utf8'));
      assert.equal(Object.keys(disk.entries).length, 1, 'maxPerStart=1 时只应翻一条');
      assert.equal(llm.calls.length, 1);

      // 下一轮启动接着翻剩下的（缓存里的那条不再重翻）
      const second = makeLlm(goodReply);
      apply(
        makeCtx({ inventory: new FakeInventory(pluginEntries), llm: second, selection: { provider: 'p', model: 'm' }, profileDir: dir }),
        { cacheFile: join(dir, CACHE_FILE_NAME), maxPerStart: 5, delayMs: 0 },
      );
      assert.equal(await waitFor(() => Object.keys(JSON.parse(readFileSync(join(dir, CACHE_FILE_NAME), 'utf8')).entries).length >= 2), true);
      assert.equal(second.calls.length, 1, '已缓存的那条不该被重翻');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('resolveConfig fills defaults and rejects nonsense', () => {
    const { resolveConfig, DEFAULTS } = applyModule;
    const filled = resolveConfig(undefined);
    assert.equal(filled.enabled, true);
    assert.equal(filled.strict, true);
    assert.equal(filled.timeoutMs, DEFAULTS.timeoutMs);
    assert.deepEqual(filled.seedFiles, []);

    const messy = resolveConfig({
      enabled: 'yes',
      strict: false,
      timeoutMs: -5,
      maxPerStart: Number.NaN,
      cacheFile: '  C:/tmp/cache.json  ',
      seedFiles: ['  a.json  ', '', 42, null],
    });
    assert.equal(messy.enabled, true, '非布尔值退回默认值');
    assert.equal(messy.strict, false, '显式布尔值被采纳');
    assert.equal(messy.timeoutMs, DEFAULTS.timeoutMs, '负数退回默认值');
    assert.equal(messy.maxPerStart, DEFAULTS.maxPerStart, 'NaN 退回默认值');
    assert.equal(messy.cacheFile, 'C:/tmp/cache.json', '字符串被 trim');
    assert.deepEqual(messy.seedFiles, ['a.json'], '只保留非空字符串');
  });

  await test('resolveSelectionWithWait polls until the default model shows up', async () => {
    let calls = 0;
    const ctx = {
      get: () => ({
        currentSelection: () => (++calls < 3 ? {} : { provider: 'p', model: 'm' }),
      }),
    };
    const got = await resolveSelectionWithWait({ ctx, config: {}, attempts: 6, intervalMs: 5 });
    assert.equal(got?.provider, 'p', '应当等到 provider 出现');
    assert.equal(got?.model, 'm', '应当等到 model 出现');
    assert.ok(calls >= 3, '应当一直轮询到模型就绪');
  });

  await test('resolveSelectionWithWait gives up instead of translating without a model', async () => {
    const ctx = { get: () => ({ currentSelection: () => ({}) }) };
    const got = await resolveSelectionWithWait({ ctx, config: {}, attempts: 2, intervalMs: 5 });
    assert.equal(got, undefined, '超时后返回 undefined，由调用方保留英文原文');
  });

  await test('a flaky model is retried and still ends up translated', async () => {
    const dir = tempDir('retry');
    // 第一次调用直接报错、第二次才给出译文 —— 模拟 llm.stream 的偶发抖动。
    let attempts = 0;
    const flaky = {
      stream() {
        attempts += 1;
        return (async function* stream() {
          if (attempts === 1) {
            yield {
              type: 'finish',
              reason: { kind: 'error', failure: { code: 'flaky', message: 'first try blows up' } },
            };
            return;
          }
          yield { type: 'block-start', index: 0, blockType: 'text' };
          yield { type: 'text-delta', index: 0, text: goodReply };
          yield { type: 'block-end', index: 0, block: { type: 'text', text: goodReply } };
          yield { type: 'finish', reason: { kind: 'stop' } };
        })();
      },
    };
    const inventory = new FakeInventory([
      { moduleName: 'flaky-plugin', meta: { title: 'Flaky Plugin', description: 'A plugin that fails once' } },
    ]);
    const cacheFile = join(dir, CACHE_FILE_NAME);
    const ctx = makeCtx({
      inventory,
      llm: flaky,
      selection: { provider: 'deepseek', model: 'deepseek-chat' },
      profileDir: dir,
    });
    apply(ctx, { cacheFile, delayMs: 0 });

    const stored = await waitFor(() => {
      try {
        return JSON.parse(readFileSync(cacheFile, 'utf8')).entries?.['flaky-plugin'] !== undefined;
      } catch {
        return false;
      }
    });
    assert.equal(stored, true, '重试之后应当仍然写入译文');
    assert.equal(attempts, 2, '第一次失败后应当再试一次');
    assert.equal(
      JSON.parse(readFileSync(cacheFile, 'utf8')).entries['flaky-plugin'].zh.title,
      '十亿级上下文插件',
    );
  });
}

/* ───────────────────────────────── 结果 ───────────────────────────────── */

process.stdout.write(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
if (failures.length > 0) {
  process.stdout.write('\nFailures:\n');
  for (const { title, error } of failures) {
    process.stdout.write(`- ${title}\n  ${error?.stack ?? error}\n`);
  }
  process.exitCode = 1;
}
