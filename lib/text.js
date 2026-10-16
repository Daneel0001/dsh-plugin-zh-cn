/**
 * dsh-plugin-zh-cn — 文本与 LocalizedText 工具。
 *
 * DSH 的插件元数据是 `LocalizedText = string | { en: string, [locale: string]: string }`，
 * 客户端由 `dsh-client-locale` 的 `resolveText()` 按「当前语言 → fallback 链」取值：
 *
 *     resolveText(text) {
 *       if (typeof text === 'string') return text;
 *       return fallbackChain(active).reduceRight((r, l) => text[l] ?? r, text.en);
 *     }
 *
 * 因此只要把 `{ en }` 补成 `{ en, zh }`，中文界面自动显示中文，英文界面逐字不变。
 * 本文件只做纯文本判断，不碰任何服务。
 */

/** 中日韩文字（含假名）。用来识别「已经是中文/日文」的文本。 */
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

/** 拉丁字母：一句没有任何拉丁字母的文本没有翻译价值。 */
const LATIN_PATTERN = /[A-Za-z]/;

/** 目标语言的候选键（全部小写）。`zh-CN` / `zh-Hans` 都会归一到这里。 */
export const TARGET_KEYS = Object.freeze(['zh', 'zh-cn', 'zh-hans', 'zh-sg']);

/** 是不是一个普通的对象字面量（不是数组 / null / 类实例）。 */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 规整成去首尾空白的字符串；非字符串一律得到空串。 */
export function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** 文本里是否含中日韩文字。 */
export function containsCjk(value) {
  return CJK_PATTERN.test(String(value ?? ''));
}

/** 取 LocalizedText 里指定语言的字符串；没有则返回空串。 */
export function pickLocale(value, keys) {
  if (!isPlainObject(value)) return '';
  for (const key of keys) {
    for (const [candidate, text] of Object.entries(value)) {
      if (candidate.toLowerCase() === key) {
        const cleaned = clean(text);
        if (cleaned !== '') return cleaned;
      }
    }
  }
  return '';
}

/** 取 LocalizedText 的英文原文。字符串原样返回。 */
export function englishOf(value) {
  if (typeof value === 'string') return clean(value);
  if (!isPlainObject(value)) return '';
  return clean(value.en) || clean(value['en-US']) || clean(value['en-us']) || '';
}

/** 该 LocalizedText 是否已经有目标语言（说明别人已经翻译过了，不该覆盖）。 */
export function targetTextOf(value, keys = TARGET_KEYS) {
  return pickLocale(value, keys);
}

/** LocalizedText 里除了目标语言之外的所有键（保留原有的其它语言）。 */
export function otherLocales(value, keys = TARGET_KEYS) {
  const out = {};
  if (!isPlainObject(value)) return out;
  for (const [key, text] of Object.entries(value)) {
    if (keys.includes(key.toLowerCase())) continue;
    if (typeof text === 'string') out[key] = text;
  }
  return out;
}

/**
 * 一段文本是否**值得**送去翻译。
 *
 * 三个条件同时成立才算数：非空、含拉丁字母、不含中日韩文字。
 * 这条规则天然排除了「语音输入」「终端」这类本来就是中文的内置选项。
 */
export function isTranslatable(value) {
  const text = clean(value);
  if (text === '') return false;
  if (!LATIN_PATTERN.test(text)) return false;
  return !CJK_PATTERN.test(text);
}

/**
 * 把英文原文与中文译文组装成 DSH 认得的 LocalizedText。
 *
 * @param source 原始值（字符串或 `{ en, ... }`），用来保住其它语言。
 * @param zh     中文译文；为空则返回 undefined（调用方据此跳过）。
 * @returns `{ en, zh }` 或 undefined
 */
export function withTarget(source, zh, keys = TARGET_KEYS) {
  const translation = clean(zh);
  if (translation === '') return undefined;
  const english = englishOf(source) || clean(typeof source === 'string' ? source : '');
  const merged = { ...otherLocales(source, keys) };
  if (english !== '') merged.en = english;
  if (Object.keys(merged).length === 0) return undefined;
  // 只写主键 zh；resolveText 的 fallback 链认它。
  merged.zh = translation;
  return merged;
}
