/**
 * dsh-plugin-zh-cn — browser half.
 *
 * ONE job: the translation-model card on this plugin's page in
 * 设置 → 插件 (the `plugins.bundle.config` seat, keyed by the package name).
 *
 * The card reads and writes this plugin's own Loader row Config through the
 * host-owned `configForms` service, so nothing here touches files directly:
 *   - provider / model     → which model translates plugin titles (+ model)
 *   - fallbackToAccount    → fall back to the DeepSeek account route when the
 *                            selected/default model is unavailable
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

		function ensureStyles() {
			if (typeof document === "undefined" || document.getElementById(STYLE_ID)) {
				return function () {};
			}
			var style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = [
				".zhcn-card{display:flex;flex-direction:column;gap:14px;padding:16px;border:1px solid var(--dsw-alias-line-secondary,rgba(128,128,128,.24));border-radius:12px;background:var(--dsw-alias-bg-secondary,transparent)}",
				".zhcn-cardTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}",
				".zhcn-cardHint{margin-top:4px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary,inherit)}",
				".zhcn-field{display:flex;flex-direction:column;gap:6px}",
				".zhcn-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,inherit)}",
				".zhcn-input{width:100%;box-sizing:border-box;padding:8px 10px;font-size:13px;font-family:inherit;color:inherit;background:var(--dsw-alias-bg-primary,transparent);border:1px solid var(--dsw-alias-line-secondary,rgba(128,128,128,.3));border-radius:8px;outline:none}",
				".zhcn-input:focus{border-color:var(--dsw-alias-line-brand,rgba(64,128,255,.8))}",
				".zhcn-row{display:flex;align-items:flex-start;gap:10px}",
				".zhcn-row input[type=checkbox]{margin-top:3px;flex:none}",
				".zhcn-rowText{display:flex;flex-direction:column;gap:2px}",
				".zhcn-actions{display:flex;align-items:center;gap:10px}",
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
					type: "text",
					value: props.value,
					placeholder: props.placeholder,
					spellCheck: false,
					onChange: function (event) {
						props.onChange(event.target.value);
					},
				}),
			);
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

			var draftState = useState({ provider: "", model: "", fallbackToAccount: true });
			var draft = draftState[0];
			var setDraft = draftState[1];

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
			var current = snapshot && snapshot.value && typeof snapshot.value === "object" ? snapshot.value : null;
			var currentProvider = current && typeof current.provider === "string" ? current.provider : "";
			var currentModel = current && typeof current.model === "string" ? current.model : "";
			var currentFallback = current && current.fallbackToAccount === false ? false : true;

			useEffect(function () {
				setDraft({ provider: currentProvider, model: currentModel, fallbackToAccount: currentFallback });
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [currentProvider, currentModel, currentFallback]);

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
				Promise.resolve()
					.then(function () { return form.set("provider", draft.provider.trim()); })
					.then(function () { return form.set("model", draft.model.trim()); })
					.then(function () { return form.set("fallbackToAccount", draft.fallbackToAccount === true); })
					.then(function () {
						setStatus({ text: "已保存，下一轮启动生效。", tone: "ok" });
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
					.then(function () { return form.set("provider", ""); })
					.then(function () { return form.set("model", ""); })
					.then(function () { return form.set("fallbackToAccount", true); })
					.then(function () {
						setStatus({ text: "已恢复默认：跟随「设置 → 模型」里的默认模型。", tone: "ok" });
					})
					.catch(function (error) {
						var message = error && error.message ? error.message : String(error);
						setStatus({ text: "恢复失败：" + message, tone: "error" });
					})
					.then(function () { setBusy(false); });
			}

			var followDefault = draft.provider.trim() === "" && draft.model.trim() === "";

			return E(
				"div",
				{ className: "zhcn-card", "data-plugin": PACKAGE_NAME },
				E(
					"div",
					null,
					E("div", { className: "zhcn-cardTitle" }, "翻译模型"),
					E(
						"div",
						{ className: "zhcn-cardHint" },
						"插件启动时用这个模型把已安装插件的英文名称与描述译成简体中文。留空则跟随「设置 → 模型」里的默认模型；" +
							"选中「模型不可用时回退到 DeepSeek 账号」时，读不到默认模型也会用 DeepSeek 账号的 deepseek-flash 兜底。",
					),
				),
				E(Field, {
					label: "Provider（如 deepseek-account，留空跟随默认）",
					value: draft.provider,
					placeholder: "deepseek-account",
					onChange: function (value) { patch({ provider: value }); },
				}),
				E(Field, {
					label: "Model（如 deepseek-flash，留空跟随默认）",
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
						E(
							"span",
							{ className: "zhcn-cardHint", style: { marginTop: 0 } },
							followDefault
								? "当前：跟随默认模型"
								: "当前：固定使用 " + (draft.provider.trim() || "（provider 未填）") + " / " + (draft.model.trim() || "（model 未填）"),
						),
					),
				),
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
