/**
 * dsh-plugin-zh-cn 的验收测试。
 *
 * 全部在临时目录里跑：显式传入 `roots` 会**独占**查找范围（见 lib/index.js 的
 * `collectProfileDirs`），因此测试永远不会碰真实的 profile，也不需要管理员权限。
 *
 * 从**已安装位置**运行（这样 `@deepseek-ai/schemastery` 能正常解析）：
 *
 *     node <profile>/node_modules/dsh-plugin-zh-cn/test/acceptance.mjs
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  apply,
  buildDictionary,
  MARK,
  moduleShortName,
  normalizeTarget,
  readPhraseFile,
  sanitizePhrases,
} from '../lib/index.js';

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${label}\n       ${error?.message ?? error}`);
  }
}

/** 造一个临时 profile 目录（含 node_modules）。 */
function makeProfile() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-zh-accept-'));
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  return root;
}

/** 在临时 profile 里造一个假插件包。 */
function makePackage(profile, pkgName, manifest = {}) {
  const dir = join(profile, 'node_modules', ...pkgName.split('/'));
  mkdirSync(dir, { recursive: true });
  const value = {
    name: pkgName,
    version: '1.0.0',
    description: `${pkgName} does something useful`,
    ...manifest,
  };
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return dir;
}

/** 写一份临时词表文件并返回路径。 */
function makePhrases(profile, table) {
  const file = join(profile, 'phrases.json');
  writeFileSync(file, `${JSON.stringify(table, null, 2)}\n`, 'utf8');
  return file;
}

/** 极简 ctx：只实现 apply 真正用到的能力，并收集清理回调。 */
function makeCtx() {
  const disposers = [];
  return {
    disposers,
    logger: { info() {}, warn() {}, error() {} },
    effect(setup) {
      disposers.push(setup());
    },
    get() {
      return undefined;
    },
  };
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/* ───────────────────────────── 1. 纯函数 ───────────────────────────── */

console.log('\n[1] moduleShortName 与 DSH 客户端规则一致');
check('去作用域并去 dsh-host- 前缀', () => {
  assert.equal(moduleShortName('@deepseek-ai/dsh-host-plugin-inventory'), 'plugin-inventory');
});
check('去作用域并去 dsh-client-ui- 前缀', () => {
  assert.equal(moduleShortName('@deepseek-ai/dsh-client-ui-settings'), 'ui-settings');
});
check('第三方包名原样保留', () => {
  assert.equal(moduleShortName('billion-context'), 'billion-context');
});
check('去掉 dsh- 前缀', () => {
  assert.equal(moduleShortName('dsh-browser'), 'browser');
});
check('去掉 cordis: 与 cordis-plugin- 前缀', () => {
  assert.equal(moduleShortName('cordis:foo'), 'foo');
  assert.equal(moduleShortName('cordis-plugin-bar'), 'bar');
});
check('@scope/pkg 去作用域', () => {
  assert.equal(moduleShortName('@scope/pkg'), 'pkg');
});

console.log('\n[2] normalizeTarget 取小写主标签');
check('zh-CN → zh', () => assert.equal(normalizeTarget('zh-CN'), 'zh'));
check('空值回落到 zh', () => assert.equal(normalizeTarget(''), 'zh'));
check('ZH → zh', () => assert.equal(normalizeTarget('ZH'), 'zh'));

console.log('\n[3] sanitizePhrases 只收合法条目');
check('丢弃空值、数组、非法条目', () => {
  const out = sanitizePhrases({
    good: { title: '好', description: '很好' },
    '': { title: 'x' },
    _meta: { title: 'x' },
    bad: null,
    arr: ['x'],
    partial: { title: '只有标题' },
  });
  assert.deepEqual(Object.keys(out).sort(), ['good', 'partial']);
  assert.equal(out.good.title, '好');
  assert.equal(out.partial.description, undefined);
});
check('非对象输入返回空表', () => {
  assert.deepEqual(sanitizePhrases(null), {});
  assert.deepEqual(sanitizePhrases([]), {});
});

console.log('\n[4] buildDictionary 的取舍');
const manifest = { name: 'my-widget', description: 'A widget plugin' };
check('严格模式：译文齐全时给出 en + zh', () => {
  const dict = buildDictionary('my-widget', manifest, { title: '我的部件', description: '一个部件' }, 'zh', true);
  assert.equal(dict.en.meta.title, 'my-widget');
  assert.equal(dict.en.meta.description, 'A widget plugin');
  assert.equal(dict.zh.meta.title, '我的部件');
  assert.equal(dict.en[MARK], true);
  assert.equal(dict.zh[MARK], true);
});
check('严格模式：描述缺译文则整包不翻译', () => {
  assert.equal(buildDictionary('my-widget', manifest, { title: '我的部件' }, 'zh', true), undefined);
});
check('非严格模式：只有标题译文时也写入', () => {
  const dict = buildDictionary('my-widget', manifest, { title: '我的部件' }, 'zh', false);
  assert.equal(dict.zh.meta.title, '我的部件');
  assert.equal(dict.zh.meta.description, undefined);
});
check('包本身没有描述时，只有标题译文也算齐全', () => {
  const dict = buildDictionary('my-widget', { name: 'my-widget' }, { title: '我的部件' }, 'zh', true);
  assert.equal(dict.zh.meta.title, '我的部件');
  assert.equal(dict.en.meta.description, undefined);
});
check('完全没有译文时不写入', () => {
  assert.equal(buildDictionary('my-widget', manifest, {}, 'zh', false), undefined);
});
check('@scope 包的 en 标题同样经过 moduleShortName', () => {
  const dict = buildDictionary(
    '@scope/thing',
    { name: '@scope/thing', description: 'x' },
    { title: '东西', description: '一个东西' },
    'zh',
    true,
  );
  assert.equal(dict.en.meta.title, 'thing');
});

console.log('\n[5] readPhraseFile 遇到坏文件只告警');
check('坏 JSON 返回空表而不抛错', () => {
  const dir = makeProfile();
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json', 'utf8');
  const warnings = [];
  assert.deepEqual(readPhraseFile(bad, { warn: (m) => warnings.push(m) }), {});
  assert.equal(warnings.length, 1);
  rmSync(dir, { recursive: true, force: true });
});

/* ───────────────────── 6. 端到端：注入 / 幂等 / 还原 ───────────────────── */

console.log('\n[6] 端到端：写入官方形态的字典');
const profileA = makeProfile();
const pkgA = makePackage(profileA, 'my-widget', { exports: { '.': './index.js' } });
const phrasesA = makePhrases(profileA, { 'my-widget': { title: '我的部件', description: '一个很有用的部件' } });
const ctxA = makeCtx();
apply(ctxA, { roots: [profileA], phraseFiles: [phrasesA], strict: true });

check('写入了 locale/en.json 与 locale/zh.json', () => {
  assert.ok(existsSync(join(pkgA, 'locale', 'en.json')));
  assert.ok(existsSync(join(pkgA, 'locale', 'zh.json')));
});
check('en.json 的标题是 DSH 无字典时的显示名', () => {
  assert.equal(readJson(join(pkgA, 'locale', 'en.json')).meta.title, 'my-widget');
});
check('en.json 的描述与 package.json 逐字一致', () => {
  assert.equal(readJson(join(pkgA, 'locale', 'en.json')).meta.description, 'my-widget does something useful');
});
check('zh.json 是中文译文', () => {
  const zh = readJson(join(pkgA, 'locale', 'zh.json'));
  assert.equal(zh.meta.title, '我的部件');
  assert.equal(zh.meta.description, '一个很有用的部件');
});
check('两份字典都带本插件标记', () => {
  assert.equal(readJson(join(pkgA, 'locale', 'en.json'))[MARK], true);
  assert.equal(readJson(join(pkgA, 'locale', 'zh.json'))[MARK], true);
});
check('package.json 的 exports 补上了 ./locale/*.json', () => {
  const m = readJson(join(pkgA, 'package.json'));
  assert.equal(m.exports['./locale/*.json'], './locale/*.json');
  assert.equal(m.exports['.'], './index.js', '原有导出必须保留');
});

console.log('\n[7] 再次运行时幂等，并且仍可还原');
const beforeEn = readFileSync(join(pkgA, 'locale', 'en.json'), 'utf8');
const ctxA2 = makeCtx();
apply(ctxA2, { roots: [profileA], phraseFiles: [phrasesA], strict: true });
check('内容不变', () => {
  assert.equal(readFileSync(join(pkgA, 'locale', 'en.json'), 'utf8'), beforeEn);
});
check('dispose 后字典文件被删除', () => {
  assert.equal(ctxA2.disposers.length, 1);
  ctxA2.disposers[0]();
  assert.equal(existsSync(join(pkgA, 'locale', 'en.json')), false);
  assert.equal(existsSync(join(pkgA, 'locale', 'zh.json')), false);
});
check('dispose 后撤销了自己加的 exports 项，并保留原有导出', () => {
  const m = readJson(join(pkgA, 'package.json'));
  assert.equal(m.exports['./locale/*.json'], undefined);
  assert.equal(m.exports['.'], './index.js');
});
check('dispose 后清理了本插件创建的空 locale 目录', () => {
  assert.equal(existsSync(join(pkgA, 'locale')), false);
});

console.log('\n[8] 绝不动别人已有的字典');
const profileB = makeProfile();
const pkgB = makePackage(profileB, 'official-ish');
mkdirSync(join(pkgB, 'locale'), { recursive: true });
const foreign = { meta: { title: 'Hand written', description: 'by someone else' } };
writeFileSync(join(pkgB, 'locale', 'en.json'), `${JSON.stringify(foreign, null, 2)}\n`, 'utf8');
const phrasesB = makePhrases(profileB, { 'official-ish': { title: '官方风', description: '别人的字典' } });
const ctxB = makeCtx();
apply(ctxB, { roots: [profileB], phraseFiles: [phrasesB], strict: true });
check('别人的 en.json 一个字节都没改', () => {
  assert.deepEqual(readJson(join(pkgB, 'locale', 'en.json')), foreign);
});
check('没有为它新增 zh.json', () => {
  assert.equal(existsSync(join(pkgB, 'locale', 'zh.json')), false);
});

console.log('\n[9] 接管上次运行留下的字典');
const profileC = makeProfile();
const pkgC = makePackage(profileC, 'resumable', { exports: { '.': './index.js' } });
const phrasesC = makePhrases(profileC, { resumable: { title: '可续', description: '可续的部件' } });
const ctxC1 = makeCtx();
apply(ctxC1, { roots: [profileC], phraseFiles: [phrasesC], strict: true });
check('首次运行写入成功', () => assert.ok(existsSync(join(pkgC, 'locale', 'zh.json'))));
// 模拟「上一次进程被杀掉，没来得及 dispose」：直接换一个新的 ctx 再跑一次。
const ctxC2 = makeCtx();
apply(ctxC2, { roots: [profileC], phraseFiles: [phrasesC], strict: true });
check('接管后仍能完整还原', () => {
  ctxC2.disposers[0]();
  assert.equal(existsSync(join(pkgC, 'locale', 'zh.json')), false);
  assert.equal(existsSync(join(pkgC, 'locale', 'en.json')), false);
  assert.equal(readJson(join(pkgC, 'package.json')).exports['./locale/*.json'], undefined);
});

console.log('\n[10] 不改动用户手改过的字典');
const profileD = makeProfile();
const pkgD = makePackage(profileD, 'hand-edited', { exports: { '.': './index.js' } });
const phrasesD = makePhrases(profileD, { 'hand-edited': { title: '手改', description: '手改的部件' } });
const ctxD = makeCtx();
apply(ctxD, { roots: [profileD], phraseFiles: [phrasesD], strict: true });
// 用户把标记去掉并自己改了译文
const edited = readJson(join(pkgD, 'locale', 'zh.json'));
delete edited[MARK];
edited.meta.title = '用户自己改的标题';
writeFileSync(join(pkgD, 'locale', 'zh.json'), `${JSON.stringify(edited, null, 2)}\n`, 'utf8');
ctxD.disposers[0]();
check('标记被去掉的字典不会被删除', () => {
  assert.ok(existsSync(join(pkgD, 'locale', 'zh.json')));
  assert.equal(readJson(join(pkgD, 'locale', 'zh.json')).meta.title, '用户自己改的标题');
});

console.log('\n[11] 无法安全写入时保持原样');
const profileE = makeProfile();
const pkgE = makePackage(profileE, 'broken', { exports: { '.': './index.js' } });
// 让 zh.json 无法写入：先占位成一个目录
mkdirSync(join(pkgE, 'locale', 'zh.json'), { recursive: true });
const phrasesE = makePhrases(profileE, { broken: { title: '坏', description: '坏的部件' } });
const ctxE = makeCtx();
apply(ctxE, { roots: [profileE], phraseFiles: [phrasesE], strict: true });
check('没有留下半截写入', () => {
  assert.equal(existsSync(join(pkgE, 'locale', 'en.json')), false);
});
check('exports 也没有被改动', () => {
  assert.equal(readJson(join(pkgE, 'package.json')).exports['./locale/*.json'], undefined);
});

console.log('\n[12] 结构不支持的包直接跳过');
const profileF = makeProfile();
const pkgF = makePackage(profileF, 'string-exports', { exports: './index.js' });
const phrasesF = makePhrases(profileF, { 'string-exports': { title: '字符串导出', description: '不支持' } });
const ctxF = makeCtx();
apply(ctxF, { roots: [profileF], phraseFiles: [phrasesF], strict: true });
check('exports 是字符串时不写入任何文件', () => {
  assert.equal(existsSync(join(pkgF, 'locale')), false);
  assert.equal(readJson(join(pkgF, 'package.json')).exports, './index.js');
});

console.log('\n[13] 没有 exports 字段时也能工作');
const profileG = makeProfile();
const pkgG = makePackage(profileG, 'no-exports');
const phrasesG = makePhrases(profileG, { 'no-exports': { title: '无导出', description: '没有导出字段' } });
const ctxG = makeCtx();
apply(ctxG, { roots: [profileG], phraseFiles: [phrasesG], strict: true });
check('字典写入了，package.json 未被改动', () => {
  assert.ok(existsSync(join(pkgG, 'locale', 'zh.json')));
  assert.equal(readJson(join(pkgG, 'package.json')).exports, undefined);
});
check('依然可以干净还原', () => {
  ctxG.disposers[0]();
  assert.equal(existsSync(join(pkgG, 'locale')), false);
});

console.log('\n[14] 隔离性与健壮性');
const profileH = makeProfile();
const phrasesH = makePhrases(profileH, { ghost: { title: '幽灵', description: '不存在的包' } });
const ctxH = makeCtx();
check('词表里有、但没安装的包被安静忽略', () => {
  apply(ctxH, { roots: [profileH], phraseFiles: [phrasesH], strict: true });
  assert.equal(existsSync(join(profileH, 'node_modules', 'ghost')), false);
});
check('词表文件不存在时只告警', () => {
  const warnings = [];
  const ctx = makeCtx();
  ctx.logger.warn = (m) => warnings.push(m);
  apply(ctx, { roots: [profileH], phraseFiles: [join(profileH, 'nope.json')], strict: true });
  assert.equal(warnings.length, 1);
});
check('enabled=false 时什么都不做', () => {
  const ctx = makeCtx();
  apply(ctx, { enabled: false, roots: [profileH] });
  assert.equal(ctx.disposers.length, 0);
});
check('目标语言为 en 时拒绝执行', () => {
  const warnings = [];
  const ctx = makeCtx();
  ctx.logger.warn = (m) => warnings.push(m);
  apply(ctx, { target: 'en', roots: [profileH], phraseFiles: [phrasesH] });
  assert.equal(warnings.length, 1);
  assert.equal(ctx.disposers.length, 0);
});
check('传入不存在的 roots 时安静返回（只告警一次）', () => {
  const warnings = [];
  const ctx = makeCtx();
  ctx.logger.warn = (m) => warnings.push(m);
  // 这个路径既不存在、祖先里也没有 node_modules，所以定位必然失败。
  const nowhere = join(tmpdir(), `dsh-zh-nowhere-${Date.now()}`);
  apply(ctx, { roots: [nowhere], phraseFiles: [phrasesH] });
  assert.equal(ctx.disposers.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /未定位到 profile 目录/);
});
check('ctx 缺少 logger 等能力时也不抛错', () => {
  const root = makeProfile();
  const pkg = makePackage(root, 'bare-ctx');
  const file = makePhrases(root, { 'bare-ctx': { title: '裸', description: '裸的' } });
  apply({ effect() {} }, { roots: [root], phraseFiles: [file] });
  assert.ok(existsSync(join(pkg, 'locale', 'zh.json')));
  rmSync(root, { recursive: true, force: true });
});
check('显式 roots 独占查找范围（不会波及真实 profile）', () => {
  // 若实现退化成「自动探测 + roots 合并」，真实 profile 里的 billion-context
  // 会被顺手写入；这里用「只指定一个空 profile」来确认不会发生。
  const lone = makeProfile();
  const spy = makeCtx();
  apply(spy, { roots: [lone], phraseFiles: [phrasesH], strict: true });
  assert.ok(!existsSync(join(lone, 'node_modules', 'billion-context')));
  rmSync(lone, { recursive: true, force: true });
});

/* ───────────────────────────── 清理临时目录 ───────────────────────────── */

for (const dir of [profileA, profileB, profileC, profileD, profileE, profileF, profileG, profileH]) {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
