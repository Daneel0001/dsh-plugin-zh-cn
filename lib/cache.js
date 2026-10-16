/**
 * dsh-plugin-zh-cn — 本地翻译缓存（local-cache.json）。
 *
 * 缓存是「已经问过模型的翻译」的唯一真相：命中即直接注入，一个请求都不发。
 * 文件格式刻意保持人可读、可手工修，并且**合并优先**——任何写入都是
 * 「读旧的 → 合并新条目 → 原子替换」，绝不整文件清空。
 *
 *   {
 *     "version": 2,
 *     "generator": "dsh-plugin-zh-cn",
 *     "updatedAt": "2026-10-16T10:43:30.000Z",
 *     "entries": {
 *       "billion-context": {
 *         "en": { "title": "billion-context", "description": "A context-compression …" },
 *         "zh": { "title": "十亿级上下文插件", "description": "小上下文窗口即可…" },
 *         "model": "deepseek/deepseek-chat",
 *         "translatedAt": "2026-10-16T10:43:30.000Z"
 *       }
 *     }
 *   }
 *
 * 兼容两种「旧格式」作为初值：
 *   1. 扁平词表 `{ "<包名>": { "title": "…", "description": "…" } }`（视为中文译文）
 *   2. 只有 `{ "<包名>": { "zh": { … } } }` 的残缺记录
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { clean, isPlainObject } from './text.js';

/** 缓存格式版本。 */
export const CACHE_VERSION = 2;

/** 缓存文件名。 */
export const CACHE_FILE_NAME = 'local-cache.json';

/** 生成者标记，便于用户分辨这个文件是谁写的。 */
export const CACHE_GENERATOR = 'dsh-plugin-zh-cn';

/** 读取一个 JSON 对象文件；任何失败都返回 undefined（并且只告警一次）。 */
export function readJsonFile(file, logger, what = 'JSON') {
  try {
    if (!existsSync(file)) return undefined;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return isPlainObject(parsed) ? parsed : undefined;
  } catch (error) {
    logger?.warn?.(`dsh-plugin-zh-cn: 无法读取${what} ${file}: ${error?.message ?? error}`);
    return undefined;
  }
}

/** 从一条原始记录里抽出 `{ title, description }`（任一字段可为空串）。 */
function pickPair(value) {
  if (!isPlainObject(value)) return undefined;
  const title = clean(value.title) || clean(value.name);
  const description = clean(value.description) || clean(value.desc);
  if (title === '' && description === '') return undefined;
  return { title, description };
}

/**
 * 把一条原始缓存记录规整成内部形状；认不出来则返回 undefined。
 *
 * 认得出三种：本插件格式、扁平词表格式（中文）、只有 zh 的半截记录。
 */
export function normalizeEntry(raw) {
  if (!isPlainObject(raw)) return undefined;

  const zh = pickPair(raw.zh) ?? pickPair(raw);
  if (zh === undefined) return undefined;

  // 只有「扁平词表」形态才没有 en；此时把 en 视作未知，交给调用方按需重译。
  const en = pickPair(raw.en);
  return {
    en: en ?? { title: '', description: '' },
    zh,
    model: clean(raw.model),
    translatedAt: clean(raw.translatedAt) || clean(raw.updatedAt),
  };
}

/** 从一份缓存文档里取出 `entries` 表（兼容没有 entries 包装的扁平词表）。 */
export function extractEntries(document) {
  if (!isPlainObject(document)) return {};
  const source = isPlainObject(document.entries) ? document.entries : document;
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'version' || key === 'generator' || key === 'updatedAt' || key === 'lastRun' || key.startsWith('$')) continue;
    const entry = normalizeEntry(value);
    if (entry !== undefined) out[key] = entry;
  }
  return out;
}

/** 两份 en 指纹是否等价（空字段视为通配，避免旧格式被判成「过期」而反复重译）。 */
function sameFingerprint(left, right) {
  for (const field of ['title', 'description']) {
    const a = clean(left?.[field]);
    const b = clean(right?.[field]);
    if (a !== '' && b !== '' && a !== b) return false;
    if ((a === '') !== (b === '')) {
      // 一侧缺失：只有当另一侧也缺失，或缺失的一侧是 en 时才放过。
      if (a !== '' || b !== '') {
        const loose = clean(right?.[field]) === '';
        if (!loose) return false;
      }
    }
  }
  return true;
}

/**
 * 一个进程内、可读可写的翻译表。
 *
 * @param file    运行时缓存文件的绝对路径
 * @param seeds   额外的初值文件（例如随包发布的 local-cache.json）
 * @param logger  cordis logger
 * @param now     取当前时间戳的函数（测试可注入）
 */
export function createTranslationCache({ file, seeds = [], logger, now = () => new Date().toISOString() } = {}) {
  /** @type {Record<string, { en: {title: string, description: string}, zh: {title: string, description: string}, model: string, translatedAt: string }>} */
  let entries = {};
  let loadedFrom = [];
  let lastRun;

  /** 合并一批条目：已存在的条目永不被空值覆盖。 */
  function absorb(incoming, source) {
    let added = 0;
    for (const [key, entry] of Object.entries(incoming)) {
      const existing = entries[key];
      if (existing === undefined) {
        entries[key] = entry;
        added += 1;
        continue;
      }
      entries[key] = {
        en: {
          title: clean(entry.en?.title) || clean(existing.en?.title),
          description: clean(entry.en?.description) || clean(existing.en?.description),
        },
        zh: {
          title: clean(entry.zh?.title) || clean(existing.zh?.title),
          description: clean(entry.zh?.description) || clean(existing.zh?.description),
        },
        model: clean(entry.model) || clean(existing.model),
        translatedAt: clean(entry.translatedAt) || clean(existing.translatedAt),
      };
    }
    if (added > 0 && source !== undefined) loadedFrom.push(`${source}(+${added})`);
    return added;
  }

  return {
    /** 运行时缓存文件路径。 */
    file,

    /** 同步加载：先读种子初值，再读运行时缓存（运行时优先合并）。 */
    load() {
      entries = {};
      loadedFrom = [];
      for (const seed of seeds) {
        if (typeof seed !== 'string' || seed === '' || !existsSync(seed)) continue;
        absorb(extractEntries(readJsonFile(seed, logger, '缓存初值')), seed);
      }
      if (typeof file === 'string' && file !== '' && existsSync(file)) {
        absorb(extractEntries(readJsonFile(file, logger, '翻译缓存')), file);
      }
      return this;
    },

    /** 命中一条翻译；`en` 指纹对不上则视为未命中。 */
    match(key, en) {
      const entry = entries[key];
      if (entry === undefined) return undefined;
      if (!sameFingerprint(entry.en, en)) return undefined;
      const title = clean(entry.zh?.title);
      const description = clean(entry.zh?.description);
      if (title === '' && description === '') return undefined;
      return { title, description };
    },

    /** 只读地看一眼某条记录（不看指纹）。 */
    peek(key) {
      return entries[key];
    },

    /**
     * 记录最近一轮扫描/翻译的状态。它会被写进 `local-cache.json` 的 `lastRun`，
     * 是排查「为什么这个插件没变中文」时最直接的一手信息。
     */
    noteRun(info) {
      lastRun = { at: now(), ...info };
      return lastRun;
    },

    /** 写入 / 合并一条翻译结果。 */
    put(key, en, zh, model) {
      const previous = entries[key];
      entries[key] = {
        en: {
          title: clean(en?.title),
          description: clean(en?.description),
        },
        zh: {
          title: clean(zh?.title) || clean(previous?.zh?.title),
          description: clean(zh?.description) || clean(previous?.zh?.description),
        },
        model: clean(model) || clean(previous?.model),
        translatedAt: now(),
      };
      return entries[key];
    },

    /** 合并一批来自外部文件的条目（例如安装时随包带来的旧缓存）。 */
    absorb,

    /** 当前条目数。 */
    get size() {
      return Object.keys(entries).length;
    },

    /** 命中的来源描述，用于启动日志。 */
    get loadedFrom() {
      return [...loadedFrom];
    },

    /** 序列化成磁盘文档。 */
    toDocument() {
      const sorted = {};
      for (const key of Object.keys(entries).sort()) sorted[key] = entries[key];
      return {
        version: CACHE_VERSION,
        generator: CACHE_GENERATOR,
        updatedAt: now(),
        ...(lastRun === undefined ? {} : { lastRun }),
        entries: sorted,
      };
    },

    /**
     * 原子写盘：先写 `.tmp`，再 rename 覆盖；rename 失败时退化成直接写。
     * 任何失败都只告警 —— 缓存写不进去绝不能让 DSH 起不来。
     */
    save() {
      if (typeof file !== 'string' || file === '') return false;
      const body = `${JSON.stringify(this.toDocument(), null, 2)}\n`;
      const temporary = `${file}.tmp`;
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(temporary, body, 'utf8');
        try {
          renameSync(temporary, file);
        } catch (error) {
          logger?.warn?.(`dsh-plugin-zh-cn: 原子替换缓存失败，改为直接写入: ${error?.message ?? error}`);
          writeFileSync(file, body, 'utf8');
          try {
            rmSync(temporary, { force: true });
          } catch {
            /* ignore */
          }
        }
        return true;
      } catch (error) {
        logger?.warn?.(`dsh-plugin-zh-cn: 写入缓存失败 ${file}: ${error?.message ?? error}`);
        return false;
      }
    },
  };
}
