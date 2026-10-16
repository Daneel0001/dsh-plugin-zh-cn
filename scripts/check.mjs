/**
 * dsh-plugin-zh-cn — 静态自检（CI 与 prepack 使用）。
 *
 * 不联网、不依赖 DSH、不需要安装依赖：
 *
 *     node scripts/check.mjs
 *
 * 它守住三条底线：
 *   1. 仓库里的 JSON / YAML 清单都是合法的，且 cordis 补丁引用的包名与 package.json 一致；
 *   2. 所有模块都能通过语法检查，纯逻辑模块还能真的被 import；
 *   3. **没有硬编码的翻译词典** —— 这是本插件的核心承诺：译文只能来自
 *      DSH 内置的 llm 服务 + local-cache.json，不能藏在源码里。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let problems = 0;
const fail = (message) => {
  problems += 1;
  process.stdout.write(`  [FAIL] ${message}\n`);
};
const ok = (message) => process.stdout.write(`  [ok]   ${message}\n`);
const section = (title) => process.stdout.write(`\n${title}\n`);

/* ─────────────────────────── 1. 清单文件 ─────────────────────────── */

section('manifests');

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
ok(`package.json — ${manifest.name}@${manifest.version}`);

if (manifest.name !== 'dsh-plugin-zh-cn') fail('package.json 的 name 必须是 dsh-plugin-zh-cn');
if (typeof manifest.dsh?.bundle?.patch !== 'string') fail('package.json 缺少 dsh.bundle.patch');
if (manifest.main !== 'lib/index.js') fail('package.json 的 main 必须指向 lib/index.js');
if (manifest.exports?.['.'] !== './lib/index.js') fail('package.json 的 exports["."] 必须指向 lib/index.js');

for (const relative of ['locale/en.json', 'locale/zh.json']) {
  const file = join(root, relative);
  if (!existsSync(file)) {
    fail(`缺少语言字典 ${relative}`);
    continue;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const title = parsed?.meta?.title;
    if (typeof title !== 'string' || title === '') fail(`${relative} 缺少 meta.title`);
    else ok(`${relative} — ${title}`);
  } catch (error) {
    fail(`${relative} 不是合法 JSON: ${error?.message ?? error}`);
  }
}

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
if (!patch.includes(`name: ${manifest.name}`)) {
  fail('cordis.patch.yml 没有引用 package.json 的包名');
} else {
  ok('cordis.patch.yml 引用的包名一致');
}
if (!/- insert:/.test(patch)) fail('cordis.patch.yml 缺少 insert 段');

/* ─────────────────────── 2. 语法与可导入性 ─────────────────────── */

section('modules');

const libDir = join(root, 'lib');
const modules = readdirSync(libDir)
  .filter((name) => name.endsWith('.js'))
  .sort();

if (modules.length === 0) fail('lib/ 下没有任何模块');

for (const file of modules) {
  try {
    execFileSync(process.execPath, ['--check', join(libDir, file)], { stdio: 'pipe' });
    ok(`lib/${file} — syntax ok`);
  } catch (error) {
    fail(`lib/${file} 语法检查失败: ${String(error?.stderr ?? error?.message ?? error).trim()}`);
  }
}

// 本插件零运行时依赖，所有模块都应该能直接 import。
for (const file of ['text.js', 'cache.js', 'translate.js', 'inject.js', 'index.js']) {
  if (!modules.includes(file)) continue;
  try {
    await import(new URL(`../lib/${file}`, import.meta.url));
    ok(`lib/${file} — imports cleanly`);
  } catch (error) {
    fail(`lib/${file} 无法 import: ${error?.message ?? error}`);
  }
}

/* ─────────────────────── 3. 不许硬编码词典 ─────────────────────── */

section('no hard-coded dictionary');

const CJK = /[\u4e00-\u9fff]/u;

for (const file of modules) {
  const source = readFileSync(join(libDir, file), 'utf8');
  const lines = source.split(/\r?\n/);
  let suspicious = 0;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    // 注释、日志、提示词、正则里的中文都不算词典。
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    if (!CJK.test(line)) continue;
    // JSON 模板（提示词里的 {"name":"<中文名称>"}）不是词典。
    if (line.includes('{') || line.includes('}')) continue;
    // 词典的形态是「英文键 → 中文值」，例如 'billion-context': '十亿级上下文插件'
    const looksLikeEntry = /['"`][^'"`]*[A-Za-z][^'"`]*['"`]\s*:\s*['"`][^'"`]*[\u4e00-\u9fff]/.test(line);
    if (looksLikeEntry) {
      suspicious += 1;
      fail(`lib/${file}:${index + 1} 看起来像硬编码的翻译条目：${trimmed.slice(0, 90)}`);
    }
  }
  if (suspicious === 0) ok(`lib/${file} — no dictionary entries`);
}

if (existsSync(join(libDir, 'phrases.js'))) {
  fail('lib/phrases.js 仍然存在 —— 本插件不允许内置词表');
}
if (existsSync(join(libDir, 'phrases.json'))) {
  fail('lib/phrases.json 仍然存在 —— 本插件不允许内置词表');
}

/* ─────────────────────────── 结果 ─────────────────────────── */

process.stdout.write(`\n${problems === 0 ? 'check passed' : `check failed: ${problems} problem(s)`}\n`);
if (problems > 0) process.exitCode = 1;
