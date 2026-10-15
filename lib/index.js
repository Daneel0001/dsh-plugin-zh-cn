/**
 * dsh-plugin-zh-cn — 让「已安装插件」在 DeepSeek Harness 的插件列表里
 * 显示简体中文的标题与描述。
 *
 * ── 机制：走 DSH 官方的插件元数据本地化协议 ─────────────────────────────────
 *
 * DSH 显示一个插件的名称与描述时，宿主端由 `pluginPackages.metaOf(specifier)`
 * 读取该插件的 `locale/` 目录：
 *
 *     <pkg>/locale/en.json   ← 语言字典的入口，必须存在
 *     <pkg>/locale/zh.json   ← 简体中文
 *     每个文件形如 { "meta": { "title": "...", "description": "..." } }
 *
 * 只要存在 `locale/en.json`，`dsh-app-boot` 就会把同目录下所有
 * `locale/<lang>.json` 收集成一份语言表，把 `title`/`description` 变成
 * `{ en, zh, ... }` 这样的 LocalizedText；界面渲染时由 `dsh-client-locale`
 * 的 `resolveText()` 按「当前语言 → fallback 链（zh 的 fallback 是 en）」取值。
 * 于是中文界面显示中文、其它语言界面显示 `en` —— 这正是 DSH 官方
 * `@deepseek-ai/dsh-experimental-*` 等插件呈现中文的方式。
 *
 * 本插件做的事情就是：为「还没有语言字典的已安装插件」补上这两个文件，
 * 并确保包的 `exports` 允许子路径解析（`"./locale/*.json"`）。
 *
 * ── 为什么不改界面、不包装服务 ─────────────────────────────────────────────
 *
 * 另一种看似更轻的办法是包装 `pluginPackages.metaOf` 的返回值。实测在桌面版
 * 上这条路不通：包装确实被执行、也返回了 `{ en, zh }`，但界面取到的仍是英文。
 * 官方机制走的是「包内字典 → readPluginMeta → LocalizedText」这条数据通路，
 * 因此本插件直接复用同一条通路，不依赖任何内部实现细节。
 *
 * ── 四条硬约束 ─────────────────────────────────────────────────────────────
 *
 * 1. 零回归：写入 `en.json` 的标题使用 DSH 客户端在「没有任何字典时」的显示名
 *    规则 `moduleShortName()`，所以非中文界面看到的文字与安装本插件之前逐字相同。
 *
 * 2. 未完成即原样：词表里没有该插件、缺少译文、包已被 DSH 排除、写入失败 —— 任何
 *    一种情况都让该包保持原样；单包写入中途失败时会把已写入的文件回滚。
 *
 * 3. 绝不动别人的字典：如果包已经自带 `locale/en.json`（例如官方插件），或用户
 *    自己放了字典，一律跳过，一个字节都不改。
 *
 * 4. 可完全卸载：本插件生成的每个字典文件都带一个 `$dshPluginZhCn` 标记；插件被
 *    移除或禁用时，`ctx.effect` 的清理回调会删掉带标记的文件、撤销自己加的
 *    `exports` 项，并清理自己创建的空目录。手工改过的字典（标记被去掉）会被留下。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Schema from '@deepseek-ai/schemastery';
import { BUILT_IN_PHRASES } from './phrases.js';

/** cordis 插件名（与 cordis.patch.yml 的 id 对应）。 */
const name = 'zh-cn-plugin-locale';

/**
 * 刻意不声明 cordis 注入依赖：本插件不消费任何服务，只在启动时做一次文件级
 * 补全。声明 `inject` 反而可能因条件长期不满足而让插件静默不生效。
 */
const inject = [];

/** 写入字典文件的标记；卸载时据此判断「这个文件是本插件生成的」。 */
const MARK = '$dshPluginZhCn';

/** 需要在包的 exports 里补上的子路径映射。 */
const LOCALE_EXPORT_KEY = './locale/*.json';
const LOCALE_EXPORT_VALUE = './locale/*.json';

/** 语言字典入口文件固定为 en.json（DSH 用它来发现整个目录）。 */
const BASE_LOCALE = 'en';

const Config = Schema.object({
  /** 总开关。 */
  enabled: Schema.boolean().default(true),
  /** 目标语言；DSH 内置中文的 id 是 `zh`。 */
  target: Schema.string().default('zh'),
  /**
   * 严格模式：标题与描述必须都有译文才写入，绝不出现半中半英。默认开启。
   * 关闭后，有译文的字段单独替换。
   */
  strict: Schema.boolean().default(true),
  /** 是否覆盖已经被别人写过的字典（默认不覆盖）。 */
  overwrite: Schema.boolean().default(false),
  /** 追加词表文件的绝对路径列表（JSON：`{ "<包名>": { title, description } }`）。 */
  phraseFiles: Schema.array(Schema.string()).default([]),
  /** 额外的查找起点（默认自动定位当前 profile 目录）。 */
  roots: Schema.array(Schema.string()).default([]),
});

/* ─────────────────────────── 纯函数：文本处理 ─────────────────────────── */

/**
 * DSH 客户端在「没有任何语言字典」时给插件标题使用的显示名规则
 * （`dsh-client-ui-settings-plugin-inventory/lib/client.js` 的 `moduleShortName`）。
 * 逐字复刻，用于保证 `en` 值与安装本插件之前完全一致。
 */
function moduleShortName(moduleName) {
  if (typeof moduleName !== 'string' || moduleName === '') return '';
  const scoped =
    moduleName.startsWith('@') && moduleName.includes('/')
      ? moduleName.slice(moduleName.indexOf('/') + 1)
      : moduleName;
  return scoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '');
}

/** 把语言标签归一成 DSH 字典键：小写主标签（`zh-CN` → `zh`）。 */
function normalizeTarget(target) {
  const value = typeof target === 'string' && target.trim() !== '' ? target.trim() : 'zh';
  return value.split('-')[0].toLowerCase();
}

/** 校验并规整一份词表：只接受 `{ 包名: { title?, description? } }`，忽略非法条目。 */
function sanitizePhrases(raw) {
  const out = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || key === '' || key.startsWith('_')) continue;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const entry = {};
    if (typeof value.title === 'string' && value.title.trim() !== '') entry.title = value.title.trim();
    if (typeof value.description === 'string' && value.description.trim() !== '') {
      entry.description = value.description.trim();
    }
    if (entry.title !== undefined || entry.description !== undefined) out[key] = entry;
  }
  return out;
}

/** 读取一份追加词表文件；任何失败都只告警，不影响其它词表。 */
function readPhraseFile(file, logger) {
  try {
    return sanitizePhrases(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    logger?.warn?.(`dsh-plugin-zh-cn: 无法读取词表 ${file}: ${error?.message ?? error}`);
    return {};
  }
}

/* ─────────────────────── 字典构造（纯函数，便于测试） ─────────────────────── */

/**
 * 为一个插件算出两份字典的内容。
 *
 * @param pkgName  词表键 / 包名
 * @param manifest 该包 package.json 解析结果
 * @param entry    词表条目 `{ title?, description? }`
 * @param target   目标语言键（如 `zh`）
 * @param strict   严格模式
 * @returns `{ en, zh }`，或在「不该写入 / 没有可写内容」时返回 undefined
 */
function buildDictionary(pkgName, manifest, entry, target, strict) {
  const declaredName =
    typeof manifest?.name === 'string' && manifest.name !== '' ? manifest.name : pkgName;
  const declaredDescription =
    typeof manifest?.description === 'string' ? manifest.description.trim() : '';

  const zhTitle = typeof entry?.title === 'string' && entry.title !== '' ? entry.title : undefined;
  const zhDescription =
    typeof entry?.description === 'string' && entry.description !== '' ? entry.description : undefined;

  // 严格模式：描述存在却没有译文 —— 宁可整包不翻译，也不出现半中半英。
  if (strict && declaredDescription !== '' && zhDescription === undefined) return undefined;
  if (zhTitle === undefined && zhDescription === undefined) return undefined;

  const en = { meta: {} };
  // 与「没有任何字典时」界面显示的字符串逐字一致，保证非中文界面零回归。
  const shortName = moduleShortName(declaredName);
  if (shortName !== '') en.meta.title = shortName;
  if (declaredDescription !== '') en.meta.description = declaredDescription;
  if (Object.keys(en.meta).length === 0) return undefined;
  en[MARK] = true;

  const zh = { meta: {} };
  if (zhTitle !== undefined) zh.meta.title = zhTitle;
  if (zhDescription !== undefined) zh.meta.description = zhDescription;
  zh[MARK] = true;

  return { en, [target]: zh };
}

/* ─────────────────────────── 目录发现与包定位 ─────────────────────────── */

/** asar 归档内的路径一律不处理（只读，且官方包本来就自带字典）。 */
function isInsideArchive(dir) {
  return typeof dir === 'string' && dir.includes('.asar');
}

/** 把一个 file: URL 或普通路径变成绝对路径；失败返回 undefined。 */
function toAbsolutePath(value) {
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

/**
 * 从任意起点向上找一个「含 node_modules 的目录」，也就是 profile 目录。
 * 兼容两种安装形态：`<profile>/node_modules/<pkg>` 与 pnpm 的 `.pnpm` 布局。
 */
function nearestProfileDir(start) {
  let current = toAbsolutePath(start);
  for (let depth = 0; current !== undefined && depth < 12; depth += 1) {
    if (isInsideArchive(current)) return undefined;
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

/**
 * 收集所有可能的 profile 目录（去重、保序）。
 *
 * 若显式配置了 `roots`，则**只用**它们：这样既能让使用者精确指定范围，也让
 * 自动化测试可以在临时目录里跑，而绝不会碰真实的 profile。
 */
function collectProfileDirs(ctx, config) {
  const starts = [];

  const requested = Array.isArray(config.roots) ? config.roots : [];
  const explicit = [];
  for (const value of requested) {
    const dir = nearestProfileDir(value);
    if (dir !== undefined && !explicit.includes(dir)) explicit.push(dir);
  }
  // 显式给定了 roots 就只认它们：即使一个都定位不到，也不再退回去猜别的目录，
  // 免得「本想限定范围」反而写到了真实 profile 上。
  if (requested.length > 0) return explicit;

  if (process.env.DSH_PROFILE_DIR) starts.push(process.env.DSH_PROFILE_DIR);
  if (process.env.DSH_PROFILE) starts.push(process.env.DSH_PROFILE);

  for (const url of [ctx?.baseUrl, ctx?.root?.baseUrl]) {
    if (typeof url === 'string') starts.push(url);
  }

  // 本插件自己就装在 <profile>/node_modules/dsh-plugin-zh-cn/lib/index.js，
  // 因此从自身位置向上找一定能落到 profile 目录。
  try {
    starts.push(dirname(dirname(fileURLToPath(import.meta.url))));
  } catch {
    /* ignore */
  }

  const dirs = [];
  for (const start of starts) {
    const dir = nearestProfileDir(start);
    if (dir !== undefined && !dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

/** 在给定的 profile 目录里定位某个包；找不到返回 undefined。 */
function resolvePackageDir(pkgName, profileDirs) {
  if (typeof pkgName !== 'string' || pkgName === '') return undefined;
  for (const profileDir of profileDirs) {
    const candidate = join(profileDir, 'node_modules', pkgName);
    if (isInsideArchive(candidate)) continue;
    try {
      if (existsSync(join(candidate, 'package.json'))) return candidate;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/* ─────────────────────────── 写入 / 接管 / 还原 ─────────────────────────── */

/** 读取一个 JSON 文件；失败或结构不对返回 undefined。 */
function readJson(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** 该文件是否由本插件生成（带标记）。 */
function isOurs(file) {
  const value = readJson(file);
  return value !== undefined && value[MARK] === true;
}

/** 序列化成稳定、可读、无 BOM 的 JSON 文本。 */
function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * 为一个包写入字典。
 *
 * 返回一份「还原记录」；返回 undefined 表示这个包未被改动（找不到、已有别人的
 * 字典、exports 结构无法安全修改、或写入失败并已回滚）。
 */
function injectPackage(pkgDir, dictionary, target, overwrite, logger) {
  const manifestPath = join(pkgDir, 'package.json');
  const manifestText = (() => {
    try {
      return readFileSync(manifestPath, 'utf8');
    } catch {
      return undefined;
    }
  })();
  if (manifestText === undefined) return undefined;

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return undefined;
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return undefined;

  const localeDir = join(pkgDir, 'locale');
  const basePath = join(localeDir, `${BASE_LOCALE}.json`);
  const targetPath = join(localeDir, `${target}.json`);

  const baseExists = existsSync(basePath);
  const targetExists = target === BASE_LOCALE ? true : existsSync(targetPath);

  // 别人的字典一律不碰；只有「本插件此前生成的」或用户显式开启 overwrite 时才接管。
  if (!overwrite) {
    const owned = (baseExists && isOurs(basePath)) || (targetExists && isOurs(targetPath));
    if ((baseExists || targetExists) && !owned) return undefined;
  }

  // exports 若存在但不是「子路径映射表」，加键会破坏解析，直接放弃这个包。
  const exportsField = manifest.exports;
  let exportsPatch = false;
  if (exportsField !== undefined) {
    if (typeof exportsField !== 'object' || exportsField === null || Array.isArray(exportsField)) {
      logger?.warn?.(`dsh-plugin-zh-cn: ${basename(pkgDir)} 的 exports 结构不支持子路径，已跳过`);
      return undefined;
    }
    // 这一个键只要「是我们加的」或「值与我们写入的一致」，卸载时就该由我们撤销。
    // （后者覆盖「上一次运行加的、这次又被看到」的情形，保证多次启动叠加后仍能还原。）
    if (
      exportsField[LOCALE_EXPORT_KEY] === undefined ||
      exportsField[LOCALE_EXPORT_KEY] === LOCALE_EXPORT_VALUE
    ) {
      exportsPatch = true;
    }
  }

  const createdDir = !existsSync(localeDir);
  const record = {
    pkgDir,
    localeDir,
    createdDir,
    manifestPath,
    exportsPatch,
    files: [],
  };

  /** 记录一份文件的原状，便于回滚与还原。 */
  const stage = (file, content) => {
    let previous;
    try {
      if (existsSync(file)) previous = readFileSync(file, 'utf8');
    } catch {
      previous = undefined;
    }
    record.files.push({ path: file, content, previous });
  };

  const rollback = () => {
    for (const item of [...record.files].reverse()) {
      try {
        if (item.previous === undefined) rmSync(item.path, { force: true });
        else writeFileSync(item.path, item.previous, 'utf8');
      } catch {
        /* 回滚尽力而为 */
      }
    }
    if (record.createdDir) {
      try {
        rmdirSync(localeDir);
      } catch {
        /* 目录非空就留着 */
      }
    }
  };

  try {
    mkdirSync(localeDir, { recursive: true });

    for (const [lang, content] of Object.entries(dictionary)) {
      const file = join(localeDir, `${lang}.json`);
      const text = serialize(content);
      if (existsSync(file)) {
        let current;
        try {
          current = readFileSync(file, 'utf8');
        } catch {
          current = undefined;
        }
        if (current === text) {
          // 内容已一致（上一次运行留下的）：不重复写盘，但仍登记，卸载时才能清掉。
          record.files.push({ path: file, content: text, previous: undefined });
          continue;
        }
        // 文件存在但并非本插件所写（用户手工放置或改过标记）：尊重它，绝不覆盖。
        if (!isOurs(file)) {
          logger?.warn?.(
            `dsh-plugin-zh-cn: ${basename(pkgDir)} 的 ${lang}.json 不是本插件生成的，已保留原文件`,
          );
          continue;
        }
      }
      stage(file, text);
      writeFileSync(file, text, 'utf8');
    }

    if (exportsPatch) {
      manifest.exports = { ...exportsField, [LOCALE_EXPORT_KEY]: LOCALE_EXPORT_VALUE };
      writeFileSync(manifestPath, serialize(manifest), 'utf8');
    }
  } catch (error) {
    rollback();
    logger?.warn?.(`dsh-plugin-zh-cn: 写入 ${basename(pkgDir)} 的字典失败，已回滚: ${error?.message ?? error}`);
    return undefined;
  }

  return record;
}

/** 撤销一次 `injectPackage`：删掉自己写的文件、撤销 exports、清理空目录。 */
function revertPackage(record, logger) {
  for (const item of record.files) {
    try {
      if (!existsSync(item.path)) continue;
      // 手工改过的字典（标记被去掉）保留，不夺走用户的修改。
      if (!isOurs(item.path)) continue;
      if (item.previous === undefined) rmSync(item.path, { force: true });
      else writeFileSync(item.path, item.previous, 'utf8');
    } catch (error) {
      logger?.warn?.(`dsh-plugin-zh-cn: 还原 ${item.path} 失败: ${error?.message ?? error}`);
    }
  }

  if (record.exportsPatch) {
    try {
      const manifest = readJson(record.manifestPath);
      if (
        manifest !== undefined &&
        manifest.exports !== undefined &&
        typeof manifest.exports === 'object' &&
        !Array.isArray(manifest.exports) &&
        manifest.exports[LOCALE_EXPORT_KEY] === LOCALE_EXPORT_VALUE
      ) {
        delete manifest.exports[LOCALE_EXPORT_KEY];
        writeFileSync(record.manifestPath, serialize(manifest), 'utf8');
      }
    } catch (error) {
      logger?.warn?.(`dsh-plugin-zh-cn: 还原 exports 失败: ${error?.message ?? error}`);
    }
  }

  // 目录空了就收走。不限于「本次创建」：上一次运行可能已经建过它，
  // 而那次没有机会执行清理（例如进程被直接结束）。rmdirSync 只在目录
  // 确实为空时成功，因此不会误删别人的文件。
  try {
    rmdirSync(record.localeDir);
  } catch {
    /* 目录非空（还有别人的字典或用户改过的文件）就留着 */
  }
}

/* ─────────────────────────────── 插件入口 ─────────────────────────────── */

function apply(ctx, config = {}) {
  if (config.enabled === false) return;

  const logger = ctx?.logger;
  try {
    const target = normalizeTarget(config.target);
    if (target === BASE_LOCALE) {
      logger?.warn?.('dsh-plugin-zh-cn: 目标语言不能是 en，未做任何改动');
      return;
    }

    const catalogue = { ...sanitizePhrases(BUILT_IN_PHRASES) };
    let extra = 0;
    for (const file of config.phraseFiles ?? []) {
      for (const [key, value] of Object.entries(readPhraseFile(file, logger))) {
        catalogue[key] = value;
        extra += 1;
      }
    }

    const total = Object.keys(catalogue).length;
    if (total === 0) {
      logger?.warn?.('dsh-plugin-zh-cn: 词表为空，未做任何改动');
      return;
    }

    const profileDirs = collectProfileDirs(ctx, config);
    if (profileDirs.length === 0) {
      logger?.warn?.('dsh-plugin-zh-cn: 未定位到 profile 目录，未做任何改动');
      return;
    }

    const records = [];
    let injected = 0;
    let adopted = 0;

    for (const [pkgName, entry] of Object.entries(catalogue)) {
      const pkgDir = resolvePackageDir(pkgName, profileDirs);
      if (pkgDir === undefined) continue;

      const manifest = readJson(join(pkgDir, 'package.json'));
      if (manifest === undefined) continue;

      const dictionary = buildDictionary(pkgName, manifest, entry, target, config.strict !== false);
      if (dictionary === undefined) continue;

      const already = isOurs(join(pkgDir, 'locale', `${BASE_LOCALE}.json`));
      const record = injectPackage(
        pkgDir,
        dictionary,
        target,
        config.overwrite === true,
        logger,
      );
      if (record === undefined) continue;

      records.push(record);
      injected += 1;
      if (already) adopted += 1;
    }

    // 即使一个包都没处理，也注册清理回调：本次没有痕迹，将来 disable 时也无需还原。
    ctx.effect(
      () => () => {
        for (const record of records) revertPackage(record, logger);
      },
      'dsh-plugin-zh-cn: 移除已注入的简体中文字典',
    );

    if (injected > 0) {
      logger?.info?.(
        `dsh-plugin-zh-cn: 已为 ${injected} 个插件补齐「${target}」字典` +
          (adopted > 0 ? `（其中 ${adopted} 个接管自上次运行）` : '') +
          (extra > 0 ? `；追加词表贡献 ${extra} 条` : '') +
          '。新安装的插件在下次启动时会自动处理。',
      );
    } else {
      logger?.info?.(
        `dsh-plugin-zh-cn: 没有需要处理的插件（词表 ${total} 条，已安装插件均已自带字典或缺少译文）`,
      );
    }
  } catch (error) {
    // 任何意外都不能影响 DSH 启动。
    logger?.warn?.(`dsh-plugin-zh-cn: 初始化失败，未做任何改动: ${error?.message ?? error}`);
  }
}

export {
  apply,
  buildDictionary,
  Config,
  inject,
  MARK,
  moduleShortName,
  name,
  normalizeTarget,
  readPhraseFile,
  sanitizePhrases,
};
