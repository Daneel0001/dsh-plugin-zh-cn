/**
 * dsh-plugin-zh-cn — 数据层注入：让插件列表「自动」变成中文。
 *
 * 这一层**完全不动 DOM**。它只包装返回插件元数据的几个函数，把其中的
 * `meta.title` / `meta.description` 从 `{ en }` 补成 `{ en, zh }`。
 *
 * 设置页里「插件」列表的渲染链（均已核对官方源码）：
 *
 *   dsh-client-ui-plugin-manager / dsh-client-ui-settings-plugin-inventory
 *     → ctx.remote.pluginManager.listBundles() / listPlugins() / pluginInventory.list()
 *       → 宿主：BundleInfo.meta / PluginInventoryEntry.meta
 *         ← 两条通路最终都取自 `ctx.get('pluginPackages').metaOf(name, base)`
 *     → 客户端 `resolveText(meta.title)`：`{ en, zh }` 在中文界面取 zh、英文界面取 en
 *
 * 所以一共铺四层，任一生效即可：
 *
 *   1. `pluginPackages.metaOf`        —— 真正的数据源头（`dsh-app-boot` 的 cordis Service）
 *   2. `pluginManager.listBundles`    —— 「官方 / 已安装」分组用的 bundle 列表
 *   3. `pluginManager.listPlugins`    —— Loader 条目列表（带 enabled，即右侧开关）
 *   4. `pluginInventory.list`         —— 插件清单 Remote 网关
 *
 * 每一层都**实例 + 原型都装**，并记录「到底有没有被调用到」的计数器，
 * 供 `probe()` 在启动后自检 —— 这一条是踩过坑之后加的：光看「装上了」不够，
 * 必须能区分「没装上」和「装上了但界面没走这条路」。
 */

import { isPlainObject, targetTextOf, withTarget, TARGET_KEYS } from './text.js';

/** 打在包装函数上的标记，用来识别「这层皮是我们套的」并保证幂等。 */
export const PATCH_MARK = Symbol.for('dsh-plugin-zh-cn#patched');

/** 要铺的四条通路。 */
export const TARGETS = Object.freeze([
  { key: 'metaOf', service: 'pluginPackages', method: 'metaOf', kind: 'meta' },
  { key: 'listBundles', service: 'pluginManager', method: 'listBundles', kind: 'bundles' },
  { key: 'listPlugins', service: 'pluginManager', method: 'listPlugins', kind: 'entries' },
  { key: 'inventoryList', service: 'pluginInventory', method: 'list', kind: 'snapshot' },
]);

/** 取出一个对象上的方法；不是函数就返回 undefined。 */
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
 * 上的那层皮会被**任何一个实例**调用，写死 `bind(owner)` 会把 `this` 钉在原型上。
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
 * @param lookup    `(moduleName, meta) => { title, description } | undefined`
 * @param onProject 每投影一条 meta 就回调一次（用于写入 lastRender 诊断）
 */
export function createInjector({ lookup, logger, keys = TARGET_KEYS, onProject } = {}) {
  /** 已经装好的还原函数。 */
  const restores = [];
  /** 每个目标的安装结果，用于启动日志与诊断。 */
  const status = { metaOf: 'pending', listBundles: 'pending', listPlugins: 'pending', inventoryList: 'pending' };
  /** 每个目标**真正被调用到**的次数 —— probe 靠它判断包装是否有效。 */
  const counters = { metaOf: 0, listBundles: 0, listPlugins: 0, inventoryList: 0 };
  /** 被包装过的对象，避免重复包装。 */
  const patched = new Set();

  function note(counterName, moduleName, hit) {
    if (typeof onProject === 'function') {
      try {
        onProject({ counter: counterName, module: moduleName, hit });
      } catch {
        /* 诊断永远不能影响注入本身 */
      }
    }
  }

  /** 逐字段补中文：已经有中文的字段原样放过（绝不覆盖别人的翻译）。 */
  function projectMeta(meta, moduleName, counterName) {
    if (!isPlainObject(meta)) return meta;
    // 整条已有目标语言 → 说明这个插件本来就带中文（含全部官方内置插件），整体不动。
    if (targetTextOf(meta.title, keys) !== '' || targetTextOf(meta.description, keys) !== '') return meta;

    let zh;
    try {
      zh = lookup(moduleName, meta);
    } catch (error) {
      logger?.warn?.(`dsh-plugin-zh-cn: 查询译文失败 ${moduleName}: ${error?.message ?? error}`);
      note(counterName, moduleName, false);
      return meta;
    }
    note(counterName, moduleName, zh !== undefined);
    if (zh === undefined) return meta;

    const next = { ...meta };
    const title = withTarget(meta.title, zh.title, keys);
    if (title !== undefined) next.title = title;
    const description = withTarget(meta.description, zh.description, keys);
    if (description !== undefined) next.description = description;
    return next;
  }

  /** `pluginInventory.list()` 的快照。 */
  function projectSnapshot(snapshot, counterName) {
    if (!isPlainObject(snapshot)) return snapshot;
    const next = { ...snapshot };

    if (Array.isArray(snapshot.entries)) {
      next.entries = snapshot.entries.map((entry) => {
        if (!isPlainObject(entry) || !isPlainObject(entry.meta)) return entry;
        return { ...entry, meta: projectMeta(entry.meta, entry.moduleName, counterName) };
      });
    }
    if (Array.isArray(snapshot.agentPresets)) {
      next.agentPresets = snapshot.agentPresets.map((preset) => {
        if (!isPlainObject(preset) || !Array.isArray(preset.rows)) return preset;
        return {
          ...preset,
          rows: preset.rows.map((row) => {
            if (!isPlainObject(row) || !isPlainObject(row.meta)) return row;
            return { ...row, meta: projectMeta(row.meta, row.moduleName, counterName) };
          }),
        };
      });
    }
    return next;
  }

  /** `pluginManager.listPlugins()` 的条目数组。 */
  function projectEntryList(entries, counterName) {
    if (!Array.isArray(entries)) return entries;
    return entries.map((entry) => {
      if (!isPlainObject(entry) || !isPlainObject(entry.meta)) return entry;
      return { ...entry, meta: projectMeta(entry.meta, entry.moduleName, counterName) };
    });
  }

  /** `pluginManager.listBundles()` 的 bundle 数组（含每个 bundle 的 rows）。 */
  function projectBundleList(bundles, counterName) {
    if (!Array.isArray(bundles)) return bundles;
    return bundles.map((bundle) => {
      if (!isPlainObject(bundle)) return bundle;
      const next = { ...bundle };
      if (isPlainObject(bundle.meta)) next.meta = projectMeta(bundle.meta, bundle.name, counterName);
      if (Array.isArray(bundle.rows)) {
        next.rows = bundle.rows.map((row) => {
          if (!isPlainObject(row) || !isPlainObject(row.meta)) return row;
          return { ...row, meta: projectMeta(row.meta, row.moduleName ?? row.rowId, counterName) };
        });
      }
      return next;
    });
  }

  /**
   * 按目标类型造一个包装函数。
   *
   * 计数器打在**包装函数入口**：只要这层皮被调用到就算数 —— 探针靠它区分
   * 「没贴上」与「贴上了但界面走的是别的路」，不该被「这条记录恰好没有 meta」
   * 这类细节干扰。
   */
  function makeProjector(target) {
    if (target.kind === 'meta') {
      return (original, fallback) =>
        function patchedMetaOf(...args) {
          const self = this ?? fallback;
          counters[target.key] += 1;
          return projectMeta(original.apply(self, args), args[0], target.key);
        };
    }
    return (original, fallback) =>
      async function patchedList(...args) {
        const self = this ?? fallback;
        counters[target.key] += 1;
        const value = await original.apply(self, args);
        if (target.kind === 'snapshot') return projectSnapshot(value, target.key);
        if (target.kind === 'bundles') return projectBundleList(value, target.key);
        return projectEntryList(value, target.key);
      };
  }

  /**
   * 把一层包装同时装到实例与原型上。
   *
   * 两处都装是刻意的：`ctx.get()` 拿到的是 cordis reflect 里的服务值，可能被
   * `getTraceable` 包过；原型那层能覆盖所有实例，实例那层在原型被冻结时仍然有效。
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

  return {
    /**
     * 尝试把四条通路都装上。**幂等**：重复调用只补装缺的那部分。
     * @returns 本轮是否至少有一层是新装上的
     */
    install(ctx) {
      let changed = false;
      for (const target of TARGETS) {
        if (status[target.key] !== 'pending') continue;
        let owner;
        try {
          owner = ctx?.get?.(target.service);
        } catch {
          owner = undefined;
        }
        if (owner === undefined || owner === null) continue;
        try {
          const where = installBoth(owner, target.method, makeProjector(target));
          if (where !== 'skipped') {
            status[target.key] = where;
            changed = true;
          }
        } catch (error) {
          logger?.warn?.(
            `dsh-plugin-zh-cn: 包装 ${target.service}.${target.method} 失败: ${error?.message ?? error}`,
          );
        }
      }
      return changed;
    },

    /**
     * 自检：主动把四条通路各调用一次，返回每个通路**真正被包装函数接住**的次数。
     *
     * `1` 表示这层皮确实生效了；`0` 表示调用没经过我们（服务还没就绪、或者
     * 界面走的是另一条路）。
     */
    async probe(ctx) {
      const result = {};
      const run = async (name, key, action) => {
        const before = counters[key];
        try {
          await action();
        } catch {
          /* 探针失败不影响判定：计数器没涨就是没接住 */
        }
        result[name] = counters[key] - before;
      };

      await run('metaOf', 'metaOf', () => {
        const packages = ctx?.get?.('pluginPackages');
        if (typeof packages?.metaOf !== 'function') return undefined;
        return packages.metaOf('dsh-plugin-zh-cn', ctx?.baseUrl);
      });
      await run('listBundles', 'listBundles', () => ctx?.get?.('pluginManager')?.listBundles?.());
      await run('listPlugins', 'listPlugins', () => ctx?.get?.('pluginManager')?.listPlugins?.());
      await run('inventoryList', 'inventoryList', () => ctx?.get?.('pluginInventory')?.list?.());
      return result;
    },

    /** 安装结果，写进启动日志与 lastRender。 */
    get status() {
      return { ...status };
    },

    /** 每个通路被接住的累计次数。 */
    get counters() {
      return { ...counters };
    },

    /** 是否有任何一条通路装上了。 */
    get anyInstalled() {
      return TARGETS.some((target) => status[target.key] !== 'pending' && status[target.key] !== 'skipped');
    },

    /** 供测试直接调用。 */
    projectMeta,
    projectSnapshot,
    projectEntryList,
    projectBundleList,

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
      for (const target of TARGETS) status[target.key] = 'pending';
    },
  };
}
