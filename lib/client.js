/**
 * dsh-plugin-zh-cn — browser half.
 *
 * ONE job: the translation-backend card on this plugin's page in
 * 设置 → 插件 (the `plugins.bundle.config` seat, keyed by the package name).
 *
 * Layout mirrors the 设置 → 模型 page: one rounded row per backend
 * (微软翻译 / 自定义 API / DSH 模型), each with an 编辑 button that expands the
 * fields of that backend; the selected row is the backend actually used.
 *
 * All reads and writes go through the host-owned `configForms` service — this
 * file never touches files directly:
 *   - backend           → 'bing' | 'api' | 'llm'
 *   - bingEndpoint      → 微软翻译页地址（留空 cn.bing.com）
 *   - apiBaseUrl        → OpenAI 兼容 base URL（含 /v1）
 *   - apiKey            → API Key
 *   - apiModel          → API 模型名
 *   - provider / model  → DSH llm 后端的渠道与模型（留空跟随默认）
 *   - fallbackToAccount → DSH 模型读不到时是否回退到账号渠道
 *
 * Hand-written ModuleLoader bundle (no build step):
 *   - ONE window.__ModuleLoader__.load({...}) call, id = package name;
 *   - require restricted to the client-module baseline (react);
 *   - plain React.createElement, no JSX/TS;
 *   - dsh.client.inject lists the packages that must load first.
 */

window.__ModuleLoader__.load({
	id: "dsh-plugin-zh-cn",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");
		var E = React.createElement;
		var useState = React.useState;
		var useEffect = React.useEffect;

		/** The Loader row id this plugin's patch declares (its configForms key). */
		var ROW_ID = "zh-cn-plugin-locale";
		/** The package name: the `plugins.bundle.config` seat key. */
		var PACKAGE_NAME = "dsh-plugin-zh-cn";
		var STYLE_ID = "zhcn-config-style";

		/** 后端列表：顺序就是界面上的顺序。 */
		var BACKENDS = [
			{
				key: "bing",
				icon: "文",
				title: "微软翻译",
				desc: "免费、不用账号、不用 API Key，开箱即用",
				hint: "翻译页地址（一般不用改）",
				field: "bingEndpoint",
				placeholder: "https://cn.bing.com",
			},
			{
				key: "api",
				icon: "钥",
				title: "自定义 API",
				desc: "任意 OpenAI 兼容接口：DeepSeek、OpenAI、自建网关",
				hint: "API Key（只保存在本机 profile 的配置里）",
			},
			{
				key: "llm",
				icon: "模",
				title: "DSH 里的模型",
				desc: "用「设置 → 模型」里的模型翻译；账号渠道可能受限",
			},
		];

		function ensureStyles() {
			if (typeof document === "undefined" || document.getElementById(STYLE_ID)) {
				return function () {};
			}
			var style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = [
				".zhcn-wrap{display:flex;flex-direction:column;gap:10px;padding:2px 0}",
				".zhcn-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}",
				".zhcn-sub{margin:6px 0 4px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-tertiary,inherit)}",
				".zhcn-option{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--dsw-alias-line-secondary,rgba(128,128,128,.24));border-radius:14px;background:var(--dsw-alias-bg-secondary,rgba(128,128,128,.06));cursor:pointer}",
				".zhcn-option[data-active=true]{border-color:var(--dsw-alias-line-brand,rgba(64,128,255,.9));box-shadow:0 0 0 1px var(--dsw-alias-line-brand,rgba(64,128,255,.35)) inset}",
				".zhcn-icon{flex:none;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:var(--dsw-alias-label-secondary,inherit);background:var(--dsw-alias-bg-tertiary,rgba(128,128,128,.14))}",
				".zhcn-optionBody{flex:1;min-width:0}",
				".zhcn-optionTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}",
				".zhcn-optionDesc{margin-top:2px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,inherit)}",
				".zhcn-editBtn{flex:none;padding:6px 12px;font-size:13px;font-family:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-line-secondary,rgba(128,128,128,.35));border-radius:8px;cursor:pointer}",
				".zhcn-editor{display:flex;flex-direction:column;gap:10px;margin:2px 0 6px 48px;padding:14px 16px;border:1px dashed var(--dsw-alias-line-secondary,rgba(128,128,128,.3));border-radius:12px}",
				".zhcn-field{display:flex;flex-direction:column;gap:6px}",
				".zhcn-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,inherit)}",
				".zhcn-input{width:100%;box-sizing:border-box;padding:8px 10px;font-size:13px;font-family:inherit;color:inherit;background:var(--dsw-alias-bg-primary,transparent);border:1px solid var(--dsw-alias-line-secondary,rgba(128,128,128,.3));border-radius:8px;outline:none}",
				".zhcn-input:focus{border-color:var(--dsw-alias-line-brand,rgba(64,128,255,.8))}",
				".zhcn-row{display:flex;align-items:flex-start;gap:10px}",
				".zhcn-row input[type=checkbox]{margin-top:3px;flex:none}",
				".zhcn-rowText{display:flex;flex-direction:column;gap:2px}",
				".zhcn-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
				".zhcn-btn{padding:7px 14px;font-size:13px;font-family:inherit;color:#fff;background:var(--dsw-alias-bg-brand,#3b82f6);border:0;border-radius:8px;cursor:pointer}",
				".zhcn-btn:disabled{opacity:.55;cursor:default}",
				".zhcn-btnGhost{padding:7px 12px;font-size:13px;font-family:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-line-secondary,rgba(128,128,128,.3));border-radius:8px;cursor:pointer}",
				".zhcn-status{font-size:12px;color:var(--dsw-alias-label-tertiary,inherit)}",
				".zhcn-status[data-tone=error]{color:var(--dsw-alias-label-danger,#e5484d)}",
				".zhcn-status[data-tone=ok]{color:var(--dsw-alias-label-success,#30a46c)}",
			].join("\n");
			document.head.appendChild(style);
			return function () {
				try { style.remove(); } catch (error) { /* best effort */ }
			};
		}

		/** Plain text field. */
		function Field(props) {
			return E(
				"label",
				{ className: "zhcn-field" },
				E("span", { className: "zhcn-label" }, props.label),
				E("input", {
					className: "zhcn-input",
					type: props.secret === true ? "password" : "text",
					value: props.value,
					placeholder: props.placeholder,
					spellCheck: false,
					autoComplete: "off",
					onChange: function (event) {
						props.onChange(event.target.value);
					},
				}),
			);
		}

		var EMPTY_DRAFT = {
			backend: "bing",
			bingEndpoint: "",
			apiBaseUrl: "",
			apiKey: "",
			apiModel: "",
			provider: "",
			model: "",
			fallbackToAccount: true,
		};

		function textOf(value, fallback) {
			return typeof value === "string" ? value : fallback;
		}

		/** The card itself. */
		function ConfigCard(props) {
			var ctx = props.ctx;

			var formState = useState(null);
			var form = formState[0];
			var setForm = formState[1];

			var tickState = useState(0);
			var bumpTick = tickState[1];
			void tickState[0];

			var draftState = useState(EMPTY_DRAFT);
			var draft = draftState[0];
			var setDraft = draftState[1];

			/** Which backend's editor is open (null = all collapsed). */
			var editState = useState(null);
			var editing = editState[0];
			var setEditing = editState[1];

			var statusState = useState({ text: "", tone: "muted" });
			var status = statusState[0];
			var setStatus = statusState[1];

			var busyState = useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];

			useEffect(function () {
				ensureStyles()();
				return undefined;
			}, []);

			useEffect(function () {
				var forms;
				try {
					forms = ctx && typeof ctx.get === "function" ? ctx.get("configForms") : undefined;
				} catch (error) {
					forms = undefined;
				}
				if (!forms || typeof forms.get !== "function") return undefined;
				var found;
				try { found = forms.get(ROW_ID); } catch (error) { return undefined; }
				if (!found || typeof found.getSnapshot !== "function") return undefined;
				setForm(found);
				if (typeof found.subscribe !== "function") return undefined;
				var unsubscribe = found.subscribe(function () { bumpTick(function (n) { return n + 1; }); });
				return typeof unsubscribe === "function" ? unsubscribe : undefined;
			}, []);

			// Mirror the host value into the drafts whenever the snapshot changes.
			var snapshot = null;
			try { snapshot = form && typeof form.getSnapshot === "function" ? form.getSnapshot() : null; } catch (error) { snapshot = null; }
			var current = snapshot && snapshot.value && typeof snapshot.value === "object" ? snapshot.value : {};
			var hostBackend = textOf(current.backend, "bing");
			var hostBing = textOf(current.bingEndpoint, "");
			var hostApiBaseUrl = textOf(current.apiBaseUrl, "");
			var hostApiKey = textOf(current.apiKey, "");
			var hostApiModel = textOf(current.apiModel, "");
			var hostProvider = textOf(current.provider, "");
			var hostModel = textOf(current.model, "");
			var hostFallback = current.fallbackToAccount === false ? false : true;

			useEffect(function () {
				setDraft({
					backend: hostBackend === "api" || hostBackend === "llm" ? hostBackend : "bing",
					bingEndpoint: hostBing,
					apiBaseUrl: hostApiBaseUrl,
					apiKey: hostApiKey,
					apiModel: hostApiModel,
					provider: hostProvider,
					model: hostModel,
					fallbackToAccount: hostFallback,
				});
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [hostBackend, hostBing, hostApiBaseUrl, hostApiKey, hostApiModel, hostProvider, hostModel, hostFallback]);

			function patch(patchObject) {
				setDraft(function (previous) {
					var next = Object.assign({}, previous);
					for (var key in patchObject) next[key] = patchObject[key];
					return next;
				});
				setStatus({ text: "", tone: "muted" });
			}

			function save() {
				if (!form || typeof form.set !== "function") {
					setStatus({ text: "当前 profile 不支持保存插件配置。", tone: "error" });
					return;
				}
				setBusy(true);
				setStatus({ text: "正在保存…", tone: "muted" });
				var writes = [
					["backend", draft.backend],
					["bingEndpoint", draft.bingEndpoint.trim()],
					["apiBaseUrl", draft.apiBaseUrl.trim()],
					["apiKey", draft.apiKey.trim()],
					["apiModel", draft.apiModel.trim()],
					["provider", draft.provider.trim()],
					["model", draft.model.trim()],
					["fallbackToAccount", draft.fallbackToAccount === true],
				];
				var chain = Promise.resolve();
				for (var index = 0; index < writes.length; index += 1) {
					chain = chain.then(
						(function (pair) {
							return function () { return form.set(pair[0], pair[1]); };
						})(writes[index]),
					);
				}
				chain
					.then(function () {
						setStatus({ text: "已保存，下一轮启动生效。", tone: "ok" });
						setEditing(null);
					})
					.catch(function (error) {
						var message = error && error.message ? error.message : String(error);
						setStatus({ text: "保存失败：" + message, tone: "error" });
					})
					.then(function () { setBusy(false); });
			}

			function reset() {
				if (!form || typeof form.set !== "function") {
					setStatus({ text: "当前 profile 不支持保存插件配置。", tone: "error" });
					return;
				}
				setBusy(true);
				setStatus({ text: "正在恢复默认…", tone: "muted" });
				Promise.resolve()
					.then(function () { return form.set("backend", "bing"); })
					.then(function () { return form.set("bingEndpoint", ""); })
					.then(function () { return form.set("apiBaseUrl", "https://api.deepseek.com/v1"); })
					.then(function () { return form.set("apiKey", ""); })
					.then(function () { return form.set("apiModel", "deepseek-chat"); })
					.then(function () { return form.set("provider", ""); })
					.then(function () { return form.set("model", ""); })
					.then(function () { return form.set("fallbackToAccount", true); })
					.then(function () {
						setStatus({ text: "已恢复默认：微软翻译（免费）。", tone: "ok" });
						setEditing(null);
					})
					.catch(function (error) {
						var message = error && error.message ? error.message : String(error);
						setStatus({ text: "恢复失败：" + message, tone: "error" });
					})
					.then(function () { setBusy(false); });
			}

			/** The fields of one backend, shown while its row is being edited. */
			function editor(backend) {
				if (backend === "bing") {
					return E(
						"div",
						{ className: "zhcn-editor" },
						E(Field, {
							label: "翻译页地址（一般不用改，留空 = cn.bing.com）",
							value: draft.bingEndpoint,
							placeholder: "https://cn.bing.com",
							onChange: function (value) { patch({ bingEndpoint: value }); },
						}),
					);
				}
				if (backend === "api") {
					return E(
						"div",
						{ className: "zhcn-editor" },
						E(Field, {
							label: "Base URL（含 /v1）",
							value: draft.apiBaseUrl,
							placeholder: "https://api.deepseek.com/v1",
							onChange: function (value) { patch({ apiBaseUrl: value }); },
						}),
						E(Field, {
							label: "API Key（只保存在本机 profile 的配置里）",
							value: draft.apiKey,
							placeholder: "sk-…",
							secret: true,
							onChange: function (value) { patch({ apiKey: value }); },
						}),
						E(Field, {
							label: "模型名",
							value: draft.apiModel,
							placeholder: "deepseek-chat",
							onChange: function (value) { patch({ apiModel: value }); },
						}),
					);
				}
				return E(
					"div",
					{ className: "zhcn-editor" },
					E(Field, {
						label: "Provider（留空 = 跟随「设置 → 模型」的默认模型）",
						value: draft.provider,
						placeholder: "deepseek-account",
						onChange: function (value) { patch({ provider: value }); },
					}),
					E(Field, {
						label: "Model（留空 = 跟随默认）",
						value: draft.model,
						placeholder: "deepseek-flash",
						onChange: function (value) { patch({ model: value }); },
					}),
					E(
						"label",
						{ className: "zhcn-row" },
						E("input", {
							type: "checkbox",
							checked: draft.fallbackToAccount === true,
							onChange: function (event) { patch({ fallbackToAccount: event.target.checked }); },
						}),
						E(
							"span",
							{ className: "zhcn-rowText" },
							E("span", { className: "zhcn-label" }, "模型不可用时回退到 DeepSeek 账号"),
						),
					),
				);
			}

			var rows = BACKENDS.map(function (backend) {
				var active = draft.backend === backend.key;
				var open = editing === backend.key;
				return E(
					"div",
					{ key: backend.key },
					E(
						"div",
						{
							className: "zhcn-option",
							"data-active": active ? "true" : "false",
							onClick: function () { patch({ backend: backend.key }); },
						},
						E("span", { className: "zhcn-icon" }, backend.icon),
						E(
							"div",
							{ className: "zhcn-optionBody" },
							E("div", { className: "zhcn-optionTitle" }, backend.title),
							E("div", { className: "zhcn-optionDesc" }, backend.desc),
						),
						E(
							"button",
							{
								className: "zhcn-editBtn",
								type: "button",
								onClick: function (event) {
									event.stopPropagation();
									patch({ backend: backend.key });
									setEditing(open ? null : backend.key);
								},
							},
							open ? "收起" : "编辑",
						),
					),
					open ? editor(backend.key) : null,
				);
			});

			var currentName = "微软翻译";
			for (var index = 0; index < BACKENDS.length; index += 1) {
				if (BACKENDS[index].key === draft.backend) currentName = BACKENDS[index].title;
			}

			return E(
				"div",
				{ className: "zhcn-wrap", "data-plugin": PACKAGE_NAME },
				E("div", { className: "zhcn-title" }, "翻译模型"),
				E(
					"div",
					{ className: "zhcn-sub" },
					"插件启动时用选中的后端把已安装插件的英文名称与描述译成简体中文。当前：" + currentName,
				),
				E("div", { className: "zhcn-wrap", style: { gap: 8 } }, rows),
				E(
					"div",
					{ className: "zhcn-actions" },
					E("button", { className: "zhcn-btn", type: "button", disabled: busy, onClick: save }, "保存"),
					E("button", { className: "zhcn-btnGhost", type: "button", disabled: busy, onClick: reset }, "恢复默认"),
					E(
						"span",
						{ className: "zhcn-status", "data-tone": status.tone },
						status.text || (form ? "" : "配置表单未就绪（configForms 服务不可用）。"),
					),
				),
			);
		}

		exports.name = "dsh-plugin-zh-cn/client";
		exports.inject = ["slots"];

		exports.apply = function (ctx) {
			var slots = ctx && ctx.slots;
			if (!slots || typeof slots.inject !== "function") {
				console.warn("[zh-cn/client] slots service unavailable; config card idle");
				return;
			}
			var injected = function () {
				return { ctx: ctx };
			};
			try {
				slots.inject("plugins.bundle.config", function () {
					return slots.register(
						{
							name: "plugins.bundle.config",
							key: PACKAGE_NAME,
							inject: injected,
						},
						ConfigCard,
					);
				});
			} catch (error) {
				console.warn("[zh-cn/client] config card registration failed:", error && error.message ? error.message : error);
			}
		};

		return module.exports;
	},
});
