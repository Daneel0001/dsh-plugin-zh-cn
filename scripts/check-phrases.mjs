#!/usr/bin/env node
/**
 * 词表自检：不依赖 DSH，任何 Node ≥ 20 环境都能跑。
 *
 *   node scripts/check-phrases.mjs
 *
 * 校验项：
 *   1. 词表非空，且每个键都是合法的裸包名；
 *   2. 每条都有非空的 title 与 description；
 *   3. title 不超过 24 个字符、description 不超过 160 个字符；
 *   4. title 不以 `@` 或 `dsh-` / `cordis-` 前缀残留开头（说明忘了去前缀）；
 *   5. 本插件自己的条目存在，且是第一条（自举）。
 *
 * 退出码：0 通过，1 失败。
 */
import { BUILT_IN_PHRASES } from '../lib/phrases.js';

const MAX_TITLE = 24;
const MAX_DESCRIPTION = 160;
const SELF = 'dsh-plugin-zh-cn';

/** 合法裸包名：`name` 或 `@scope/name`，只含小写字母、数字、`-`、`_`、`.`、`~`。 */
const BARE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;

const problems = [];
const entries = Object.entries(BUILT_IN_PHRASES ?? {});

if (entries.length === 0) {
  problems.push('词表为空');
}

const keys = Object.keys(BUILT_IN_PHRASES ?? {});
if (keys[0] !== SELF) {
  problems.push(`第一条应为自举条目 "${SELF}"，实际是 "${keys[0] ?? '(无)'}"`);
}

for (const [key, value] of entries) {
  if (typeof key !== 'string' || !BARE_NAME.test(key)) {
    problems.push(`非法包名：${JSON.stringify(key)}`);
    continue;
  }
  if (value === null || typeof value !== 'object') {
    problems.push(`${key}: 条目不是对象`);
    continue;
  }

  const { title, description } = value;
  if (typeof title !== 'string' || title.trim() === '') {
    problems.push(`${key}: title 缺失或为空`);
  } else {
    if ([...title].length > MAX_TITLE) {
      problems.push(`${key}: title 过长（${[...title].length} > ${MAX_TITLE}）：${title}`);
    }
    if (/^[@]/.test(title) || /^(?:dsh|cordis)(?:-plugin)?-/.test(title)) {
      problems.push(`${key}: title 疑似残留包名前缀：${title}`);
    }
    if (/\n/.test(title)) {
      problems.push(`${key}: title 含换行`);
    }
  }

  if (typeof description !== 'string' || description.trim() === '') {
    problems.push(`${key}: description 缺失或为空`);
  } else {
    if ([...description].length > MAX_DESCRIPTION) {
      problems.push(`${key}: description 过长（${[...description].length} > ${MAX_DESCRIPTION}）`);
    }
    if (/\n/.test(description)) {
      problems.push(`${key}: description 含换行`);
    }
  }

  const unknown = Object.keys(value).filter((k) => k !== 'title' && k !== 'description');
  if (unknown.length > 0) {
    problems.push(`${key}: 含未知字段 ${unknown.join(', ')}`);
  }
}

if (problems.length > 0) {
  console.error(`✗ 词表自检失败，共 ${problems.length} 个问题：`);
  for (const line of problems) console.error(`  - ${line}`);
  process.exit(1);
}

console.log(`✓ 词表自检通过：${entries.length} 条，键唯一且结构合法。`);
console.log(`  自举条目：${BUILT_IN_PHRASES[SELF].title} — ${BUILT_IN_PHRASES[SELF].description}`);
