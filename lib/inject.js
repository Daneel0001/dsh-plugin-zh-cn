/**
 * dsh-plugin-zh-cn — 数据层注入：让插件列表「自动」变成中文。
 *
 * 这一层**完全不动 DOM**。它只包装两个返回插件元数据的函数，把其中的
 * `meta.title` / `meta.description` 从 `{ en }` 补成 `{ en, zh }`：
 *
 *   1. `pluginPackages.metaOf(specifier, parentURL)`   ← `dsh-app-boot` 里的 cordis Service
 *      （`PluginPackages extends Service`，`metaOf` 是原型方法）
 *   2. `pluginInventory.list()`                        ← `dsh-host-plugin-inventory` 的 Remote 网关
 *
 * 界面侧 `settings.plugins.tab` 的渲染链是：
 *
 *   PluginInventorySettingsTab → ctx.remote.pluginInventory.list()
 *     → 宿主 readPluginInventory() → ctx.loader.entries() + packages.metaOf(...)
 *       → 客户端 ctx.locale.resolveText(meta.title)
 *
 * `resolveText` 会按「当前语言 → fallback 链」取值，所以补上 `zh` 之后：
 * 中文界面显示中文，英文界面**逐字不变**；DOM 结构、CSS、排版、以及右侧的
 * 启用/停用开关（走 `entry.enabled`，与 meta 毫无交集）都不可能受影响。
 *
 * 两处都装、都做「装上没装上」的自检，任一生效即可。
 */

import { isPlainObject, targetTextOf, withTarget, TARGET_KEYS } from './text.js';

/** 打在包装函数上的标记，用来识别「这层皮是我们套的」并保证幂等。 */
export const PATCH_MARK = Symbol.for('dsh-plugin-zh-cn#patched');

/** 取出一个对象上真正的属主（实例不行就退到原型）。 */
function readMethod(owner, methodName) {
  if (owner === null || (typeof owner !== 'object' && typeof owner !== 'function')) return undefined;
  try {
    const value = owner[methodName];
    return typeof value === 'function' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 给 `owner[methodName]` 套一层包装。
 *
 * `make(original, fallbackReceiver)` 必须返回一个**普通函数**：包装函数要把调用点的
 * `this` 原样透传给原方法。这一点对原型包装尤其关键 —— 装到 `PluginPackages.prototype`
 * 上的那层皮，会被**任何一个实例**调用，写死 `bind(owner)` 会把 `this` 钉在原型上。
 *
 * @returns `{ ok, already, restore }`；`ok === false` 表示这条路径用不了。
 */
function wrapMethod(owner, methodName, make) {
  const original = readMethod(owner, methodName);
  if (original === undefined) return { ok: false, already: false, restore() {} };
  if (original[PATCH_MARK] === true) return { ok: true, already: true, restore() {} };

  const hadOwn = Object.prototype.hasOwnProperty.call(owner, methodName);

  let wrapped;
  try {
    wrapped = make(original, owner);
  } catch {
    return { ok: false, already: false, restore() {} };
  }
  if (typeof wrapped !== 'function') return { ok: false, already: false, restore() {} };
  wrapped[PATCH_MARK] = true;

  try {
    owner[methodName] = wrapped;
  } catch {
    return { ok: false, already: false, restore() {} };
  }

  // 自检：读回来的必须是我们装上去的那个函数，否则这层皮没贴上。
  let attached = false;
  try {
    attached = owner[methodName] === wrapped;
  } catch {
    attached = false;
  }
  if (!attached) return { ok: false, already: false, restore() {} };

  return {
    ok: true,
    already: false,
    restore() {
      try {
        // 原来是继承来的方法，还原时要把我们自己加的自有属性删掉，
        // 而不是留一个指向旧函数的自有属性把原型挡住。
        if (hadOwn) owner[methodName] = original;
        else delete owner[methodName];
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * 造一个注入器。
 *
 * @param lookup `(moduleName, meta) => { title, description } | undefined`
 *               由插件入口提供：查缓存 + 处理失败降级。
 */
export function createInjector({ lookup, logger, keys = TARGET_KEYS }) {
  /** 已经装好的还原函数。 */
  const restores = [];
  /** 每个目标的安装结果，用于启动日志。 */
  const status = { metaOf: 'pending', inventoryList: 'pending' };
  /** 被包装过的对象，避免重复包装。 */
  const patched = new Set();

  /** 逐字段补中文：已经有中文的字段原样放过（绝不覆盖别人的翻译）。 */
  function projectMeta(meta, moduleName) {
    if (!isPlainObject(meta)) return meta;
    // 整条已有目标语言 → 说明这个插件本来就带中文（含全部官方内置插件），整体不动。
    if (targetTextOf(meta.title, keys) !== '' || targetTextOf(meta.description, keys) !== '') return meta;

    let zh;
    try {
      zh = lookup(moduleName, meta);
    } catch (error) {
      logger?.warn?.(`dsh-plugin-zh-cn: 查询译文失败 ${moduleName}: ${error?.message ?? error}`);
      return meta;
    }
    if (zh === undefined) return meta;

    const next = { ...meta };
    const title = withTarget(meta.title, zh.title, keys);
    if (title !== undefined) next.title = title;
    const description = withTarget(meta.description, zh.description, keys);
    if (description !== undefined) next.description = description;
    return next;
  }

  /** 把整份 inventory 快照里的每一行 meta 都过一遍。 */
  function projectSnapshot(snapshot) {
    if (!isPlainObject(snapshot)) return snapshot;
    const next = { ...snapshot };

    if (Array.isArray(snapshot.entries)) {
      next.entries = snapshot.entries.map((entry) => {
        if (!isPlainObject(entry) || !isPlainObject(entry.meta)) return entry;
        return { ...entry, meta: projectMeta(entry.meta, entry.moduleName) };
      });
    }
    if (Array.isArray(snapshot.agentPresets)) {
      next.agentPresets = snapshot.agentPresets.map((preset) => {
        if (!isPlainObject(preset) || !Array.isArray(preset.rows)) return preset;
        return {
          ...preset,
          rows: preset.rows.map((row) => {
            if (!isPlainObject(row) || !isPlainObject(row.meta)) return row;
            return { ...row, meta: projectMeta(row.meta, row.moduleName) };
          }),
        };
      });
    }
    return next;
  }

  /**
   * 把一层包装同时装到实例与原型上。
   *
   * 两处都装是刻意的：`ctx.get()` 在某些 cordis 版本里可能返回新的代理对象，
   * 那时只有原型上那层能救场；而原型被冻结时，实例上那层仍然有效。
   * 双重包装不会重复投影 —— 包装函数持有的是**包装前**的原始函数引用，
   * 且 `projectMeta` 对已经带中文的 meta 本身就是幂等的。
   *
   * @returns 'instance' | 'prototype' | 'instance+prototype' | 'already' | 'skipped'
   */
  function installBoth(target, methodName, make) {
    if (target === undefined || target === null || patched.has(target)) return 'skipped';
    patched.add(target);

    const places = [];
    const onInstance = wrapMethod(target, methodName, make);
    if (onInstance.ok) {
      restores.push(onInstance.restore);
      if (!onInstance.already) places.push('instance');
    }

    let proto;
    try {
      proto = Object.getPrototypeOf(target);
    } catch {
      proto = undefined;
    }
    if (proto !== null && proto !== undefined && !patched.has(proto)) {
      patched.add(proto);
      const onProto = wrapMethod(proto, methodName, make);
      if (onProto.ok) {
        restores.push(onProto.restore);
        if (!onProto.already) places.push('prototype');
      }
    }

    if (places.length > 0) return places.join('+');
    if (onInstance.ok) return 'already';
    return 'skipped';
  }

  /** 往一个对象上装 `metaOf` 包装（实例 + 原型）。 */
  function installMetaOf(target) {
    return installBoth(target, 'metaOf', (original, fallback) =>
      function metaOf(specifier, parentURL) {
        const self = this ?? fallback;
        return projectMeta(original.apply(self, [specifier, parentURL]), specifier);
      },
    );
  }

  /** 往一个对象上装 `list` 包装（实例 + 原型）。 */
  function installList(target) {
    return installBoth(target, 'list', (original, fallback) =>
      async function list(...args) {
        const self = this ?? fallback;
        return projectSnapshot(await original.apply(self, args));
      },
    );
  }

  return {
    /**
     * 尝试把两层包装都装上。**幂等**：重复调用只会补装缺的那部分。
     * @returns 本轮是否至少有一层是新装上的
     */
    install(ctx) {
      let changed = false;
      try {
        const packages = ctx?.get?.('pluginPackages');
        if (packages !== undefined && status.metaOf === 'pending') {
          const where = installMetaOf(packages);
          if (where !== 'skipped') {
            status.metaOf = where;
            changed = true;
          }
        }
      } catch (error) {
        logger?.warn?.(`dsh-plugin-zh-cn: 包装 pluginPackages.metaOf 失败: ${error?.message ?? error}`);
      }
      try {
        const inventory = ctx?.get?.('pluginInventory');
        if (inventory !== undefined && status.inventoryList === 'pending') {
          const where = installList(inventory);
          if (where !== 'skipped') {
            status.inventoryList = where;
            changed = true;
          }
        }
      } catch (error) {
        logger?.warn?.(`dsh-plugin-zh-cn: 包装 pluginInventory.list 失败: ${error?.message ?? error}`);
      }
      return changed;
    },

    /** 是否两条路都没装上（调用方据此发出醒目告警）。 */
    get failed() {
      return status.metaOf === 'failed' || status.inventoryList === 'failed';
    },

    /** 安装结果，写进启动日志。 */
    get status() {
      return { ...status };
    },

    /** 供测试直接调用。 */
    projectMeta,
    projectSnapshot,

    /** 撤销所有包装（禁用 / 卸载时）。 */
    dispose() {
      while (restores.length > 0) {
        const restore = restores.pop();
        try {
          restore();
        } catch {
          /* ignore */
        }
      }
      patched.clear();
      status.metaOf = 'pending';
      status.inventoryList = 'pending';
    },
  };
}
