/**
 * dsh-plugin-zh-cn — 用 DSH 内置的 `llm` 服务做翻译。
 *
 * 只用 `ctx.get('llm').stream(...)`，模型取 `ctx.get('agentDefaultModel').currentSelection()`；
 * 不联网第三方翻译 API、不内嵌任何词典。一次请求同时把「名称 + 描述」交给模型，
 * 要求它只回一个 JSON 对象：
 *
 *     {"name": "中文名称", "desc": "中文描述"}
 *
 * 任何失败（超时、非法 JSON、模型报错、译文不是中文）都会抛 `TranslationError`，
 * 由调用方降级为「保留英文原文」。
 */

import { clean, containsCjk } from './text.js';

/** 单条翻译的默认超时。 */
export const DEFAULT_TIMEOUT_MS = 60_000;

/** 单条翻译的默认输出上限。留足余量：推理型模型可能先吐一大段思考，再给 JSON。 */
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * 硬上限宽限：软超时到点后会 abort，但**适配器不响应 abort 时 abort 是没用的**
 * （实测遇到过：某条 `llm.stream()` 既不产数据也不结束，整轮翻译就此永久挂起）。
 * 所以软超时之后再等这么久，就用 Promise.race 直接放弃这一条，继续下一条。
 */
export const HARD_TIMEOUT_GRACE_MS = 5_000;

/** 系统提示词：定死「只回 JSON」的契约。 */
export const SYSTEM_PROMPT = [
  '你是软件界面本地化助手，为 DeepSeek Harness（DSH）的插件列表做简体中文本地化。',
  '你会收到一个插件的英文名称与英文描述，需要同时翻译成简体中文。',
  '只输出一个 JSON 对象，不要解释、不要 Markdown 代码围栏、不要多余空格换行：',
  '{"name":"<中文名称>","desc":"<中文描述>"}',
  '翻译要求：',
  '1. 名称要短、像产品名，不超过 12 个汉字，不要带引号。',
  '2. 描述要讲清这个插件做什么：原文短就写一句话；原文长（几十个词、多个分句）时写成一段也可以，最多 120 个汉字；不要为了压字数丢掉原文的功能点，也不要逐词硬译。句末不要加句号。',
  '3. 保留专有名词与技术缩写：API、Token、MCP、SSH、Git、DSL、JSON、LLM 等照抄不译。',
  '4. 不要输出英文原文，不要音译品牌名，不要添加原文没有的功能。',
  '5. 原文里的括号补充、版本号、范围限制（如 >=、rc）等关键信息要保留。',
  '6. 如果原描述为空字符串，则 "desc" 也返回空字符串。',
].join('\n');

/** 不能完成一次翻译时抛出的错误。 */
export class TranslationError extends Error {
  constructor(message, code = 'translate-failed') {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
  }
}

/** 组一次请求的用户消息。 */
export function buildUserPrompt({ title, description }) {
  const name = clean(title);
  const desc = clean(description);
  return [
    `插件英文名：${name}`,
    `插件英文描述：${desc === '' ? '(空)' : desc}`,
    '请输出 JSON：',
  ].join('\n');
}

/** 把原始回复截一小段放进错误信息 —— 「模型到底回了什么」是最关键的一手信息。 */
function snippet(raw, limit = 160) {
  const text = clean(raw);
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

/** 去掉 ```json 之类的围栏，并截出最外层的大括号。 */
function unwrapJson(raw) {
  let text = clean(raw);
  if (text === '') return '';
  text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return '';
  return text.slice(start, end + 1);
}

/**
 * 解析模型回复。
 *
 * 宽容的地方：接受 `name` / `title` / `zh` 三种键名，`desc` / `description` / `zhDesc` 三种键名，
 * 容忍围栏与前后废话。严格的地方：**译文必须含中文**，否则视为失败（宁可保留英文）。
 *
 * @returns `{ title: string, description: string }`
 * @throws TranslationError
 */
export function parseTranslation(raw) {
  const json = unwrapJson(raw);
  if (json === '') {
    // 模型偶尔会回纯文本（描述很长时尤其容易）。尽力从文本里取，取不出才报 bad-shape。
    const loose = parseLoose(raw);
    if (loose === undefined) {
      throw new TranslationError(`模型没有返回 JSON（原始回复：${snippet(raw) || '(空)'}）`, 'bad-shape');
    }
    return finalizeShape(loose);
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new TranslationError(`模型返回的不是合法 JSON: ${error?.message ?? error}`, 'bad-json');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TranslationError('模型返回的 JSON 不是对象', 'bad-shape');
  }

  const title = clean(parsed.name) || clean(parsed.title) || clean(parsed.zh);
  const description =
    clean(parsed.desc) || clean(parsed.description) || clean(parsed.zhDesc) || clean(parsed.summary);
  return finalizeShape({ title, description });
}

/**
 * 校验并单行化。**译文必须含中文** —— 宁可保留英文，也不把英文原文当成译文写进缓存。
 *
 * @throws TranslationError
 */
function finalizeShape({ title, description }) {
  const name = clean(title);
  const desc = clean(description);

  if (name === '' && desc === '') {
    throw new TranslationError('模型返回的内容里没有可用的名称与描述', 'empty');
  }
  if (name !== '' && !containsCjk(name)) {
    throw new TranslationError(`名称译文不是中文: ${name}`, 'not-chinese');
  }
  if (desc !== '' && !containsCjk(desc)) {
    throw new TranslationError(`描述译文不是中文: ${desc}`, 'not-chinese');
  }

  // 单行化，避免把换行带进插件列表的排版。
  const single = (value) => value.replace(/\s*\n+\s*/g, ' ').trim();
  return { title: single(name), description: single(desc) };
}

/**
 * 兜底解析：模型没给 JSON 时，从纯文本里尽力取。
 *
 * 支持带标签的（`名称：xxx` / `描述：xxx`）与裸文本（第一行当名称、其余当描述）两种形态。
 * 取出的内容仍要过 `finalizeShape` 的中文校验，所以**不会**把英文原文误当成译文；
 * 另外「行数多、篇幅长」的多半是模型的思考过程，一律不猜。
 */
function parseLoose(raw) {
  const text = clean(raw);
  if (text === '') return undefined;

  const labeledTitle = /(?:^|\n)\s*(?:名称|标题|name|title)\s*[:：]\s*(.+)/i.exec(text);
  const labeledDesc = /(?:^|\n)\s*(?:描述|简介|desc|description)\s*[:：]\s*([\s\S]+)/i.exec(text);
  if (labeledTitle !== null || labeledDesc !== null) {
    return {
      title: labeledTitle === null ? '' : labeledTitle[1],
      description: labeledDesc === null ? '' : labeledDesc[1],
    };
  }

  const lines = text
    .split('\n')
    .map((line) => clean(line))
    .filter((line) => line !== '');
  if (lines.length === 0 || lines.length > 4 || text.length > 400) return undefined;
  if (lines.length === 1) return { title: lines[0], description: '' };
  return { title: lines[0], description: lines.slice(1).join(' ') };
}

/** 把 AbortSignal 与超时合成一个信号。 */
function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  // 刻意不 unref：这是保命用的超时，必须保证会被触发。
  const timer = setTimeout(() => controller.abort(new Error(`翻译超时（${timeoutMs}ms）`)), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal !== undefined) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
    },
  };
}

/** 收集一次流式调用里所有文本增量，并记录终结性失败。 */
async function collectStream(stream) {
  let text = '';
  let failure;
  let finishKind;
  for await (const chunk of stream) {
    if (chunk === null || typeof chunk !== 'object') continue;
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      text += chunk.text;
    } else if (chunk.type === 'finish') {
      finishKind = chunk.reason?.kind;
      if (finishKind === 'error' || finishKind === 'aborted') failure = chunk.reason?.failure;
    }
  }
  return { text, failure, finishKind };
}

/**
 * 带**硬上限**的收集：无论如何都会返回或抛出，绝不会让调用方永久等待。
 *
 * 软超时（AbortController）负责礼貌地通知适配器；这一层负责保命 —— 到点直接
 * 放弃这一条，并主动 `return()` 那个流，让它有机会释放资源。
 */
async function collectStreamOrGiveUp(stream, hardTimeoutMs) {
  let timer;
  const giveUp = new Promise((_resolve, reject) => {
    // 刻意不 unref：unref 的 timer 不阻止事件循环退出，保命超时就可能永远不触发。
    timer = setTimeout(
      () => reject(new TranslationError(`翻译超时（硬上限 ${hardTimeoutMs}ms 未结束）`, 'timeout')),
      hardTimeoutMs,
    );
  });

  try {
    return await Promise.race([collectStream(stream), giveUp]);
  } finally {
    clearTimeout(timer);
    // 主动收尾，让上游流有机会释放连接 —— 但**绝不 await**：
    // 卡住的流往往正是卡在 await 上，等它的 return() 等于再挂一次。
    try {
      const closing = stream?.return?.();
      if (closing !== undefined && typeof closing.catch === 'function') closing.catch(() => {});
    } catch {
      /* 流已经收尾或无法收尾，都不影响我们已经做出的判断 */
    }
  }
}

/**
 * 翻译一个插件的名称与描述。
 *
 * @param llm        `ctx.get('llm')`
 * @param selection  `{ provider, model, reasoningEffort? }`
 * @param title      英文名称
 * @param description 英文描述（可为空串）
 * @returns `{ title, description }`（中文）
 * @throws TranslationError | Error
 */
export async function translatePlugin({
  llm,
  selection,
  title,
  description,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxTokens = DEFAULT_MAX_TOKENS,
  hardTimeoutMs,
  signal,
  logger,
}) {
  if (llm === undefined || typeof llm.stream !== 'function') {
    throw new TranslationError('DSH 没有提供 llm 服务', 'no-llm');
  }
  const provider = clean(selection?.provider);
  const model = clean(selection?.model);
  if (provider === '' || model === '') {
    throw new TranslationError('DSH 设置里没有可用的默认模型（agentDefaultModel 为空）', 'no-model');
  }

  const hard = Number.isFinite(hardTimeoutMs) && hardTimeoutMs > 0 ? hardTimeoutMs : timeoutMs + HARD_TIMEOUT_GRACE_MS;
  const deadline = withTimeout(signal, timeoutMs);
  try {
    const stream = llm.stream({
      provider,
      model,
      ...(clean(selection?.reasoningEffort) === '' ? {} : { reasoningEffort: selection.reasoningEffort }),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: buildUserPrompt({ title, description }) }] }],
      temperature: 0,
      maxTokens,
      signal: deadline.signal,
    });

    const { text, failure, finishKind } = await collectStreamOrGiveUp(stream, hard);
    if (failure !== undefined) {
      throw new TranslationError(
        `模型调用失败（${finishKind}）: ${failure?.code ?? ''} ${failure?.message ?? ''}`.trim(),
        'llm-failure',
      );
    }
    // 被 maxTokens 截断时，正文往往连 JSON 都没写完 —— 单独报出来，别和 bad-shape 混成一团。
    if (String(finishKind).includes('max')) {
      throw new TranslationError(
        `模型输出被 maxTokens=${maxTokens} 截断（原始回复：${snippet(text) || '(空)'}）`,
        'truncated',
      );
    }
    const result = parseTranslation(text);
    if (logger?.debug !== undefined) {
      logger.debug(`dsh-plugin-zh-cn: ${title} → ${result.title} / ${result.description}`);
    }
    return result;
  } catch (error) {
    if (error instanceof TranslationError) throw error;
    if (deadline.signal.aborted) {
      throw new TranslationError(`翻译超时（${timeoutMs}ms）`, 'timeout');
    }
    throw new TranslationError(`翻译调用异常: ${error?.message ?? error}`, 'thrown');
  } finally {
    deadline.dispose();
  }
}
