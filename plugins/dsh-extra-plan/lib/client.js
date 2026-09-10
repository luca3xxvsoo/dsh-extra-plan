window.__ModuleLoader__.load({
  id: "@local/dsh-extra-plan",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    const NS = "dsh-extra-plan-settings";
    const PRO_CONFIG_URL = "/api/dsh-extra-plan-settings/pro-config";

    const zh = {
      cardTitle: "按需规划模式配置",
      cardDescription: "配置 pro 规划模块的参数。",
      proSection: "pro规划模块",
      plannerModel: "使用模型",
      plannerModelHint: "留空 = 继承主会话模型",
      plannerPromptSuffix: "额外引导",
      exploreBudget: "探查额度",
      anchoredBootstrap: "anchored开关",
      runcodeCatchGate: "run_code 容错检查",
      webFetch: "web_fetch开关",
      toolPresentationMode: "工具呈现模式",
      toolPresentationModeNative: "默认",
      toolPresentationModeBoth: "混合",
      toolPresentationModePtc: "纯PTC模式",
      save: "保存",
      saving: "保存中…",
      saved: "已保存，需重启 Harness 后生效",
      saveFailed: "保存失败：",
      loading: "加载中…",
      loadFailed: "加载失败",
      trueValue: "True",
      falseValue: "False"
    };

    const en = {
      cardTitle: "Extra Plan Configuration",
      cardDescription: "Configure pro planner settings.",
      proSection: "Pro Planner",
      plannerModel: "Planner Model",
      plannerModelHint: "Leave empty to inherit the main-session model",
      plannerPromptSuffix: "Extra Prompt Suffix",
      exploreBudget: "Explore Budget",
      anchoredBootstrap: "Anchored Bootstrap",
      runcodeCatchGate: "RunCode Catch Guard",
      webFetch: "Web Fetch",
      toolPresentationMode: "Tool Presentation Mode",
      toolPresentationModeNative: "Native",
      toolPresentationModeBoth: "Both",
      toolPresentationModePtc: "Pure PTC",
      save: "Save",
      saving: "Saving…",
      saved: "Saved. Restart Harness to take effect.",
      saveFailed: "Save failed: ",
      loading: "Loading…",
      loadFailed: "Load failed",
      trueValue: "True",
      falseValue: "False"
    };

    const css =
      '.esp-wrap{display:flex;flex-direction:column;gap:20px;max-width:760px;color:var(--dsw-alias-label-primary)}' +
      '.esp-section{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}' +
      '.esp-sectionTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0}' +
      '.esp-field{display:flex;flex-direction:column;gap:6px;padding:4px 0}' +
      '.esp-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary)}' +
      '.esp-input,.esp-select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;width:100%;box-sizing:border-box}' +
      '.esp-input:focus,.esp-select:focus{border-color:var(--dsw-alias-brand-primary);outline:none}' +
      '.esp-textarea{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;width:100%;box-sizing:border-box;resize:vertical;min-height:80px}' +
      '.esp-textarea:focus{border-color:var(--dsw-alias-brand-primary);outline:none}' +
      '.esp-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:8px}' +
      '.esp-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary);border-radius:8px;padding:5px 12px;font-size:13px;white-space:nowrap}' +
      '.esp-btnPrimary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}' +
      '.esp-btn:disabled{opacity:.5;cursor:default}' +
      '.esp-ok{color:var(--dsw-alias-brand-primary);font-size:12px;margin:0}' +
      '.esp-err{color:var(--dsw-alias-label-error);font-size:12px;margin:0}' +
      '.esp-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:0}' +
      '.esp-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:0}';

    function apply(ctx) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-extra-plan-settings";
      tag.textContent = css;
      document.head.appendChild(tag);
      ctx.effect(() => () => tag.remove(), "dsh-extra-plan-settings: css");
      const el = React.createElement;
      const t = ctx.locale.bind(NS);

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-extra-plan-settings: dictionaries");

      function ProConfigTab() {
        const [configStatus, setConfigStatus] = React.useState("loading");
        const [draft, setDraft] = React.useState(null);
        const [fields, setFields] = React.useState([]);
        const [saving, setSaving] = React.useState(false);
        const [message, setMessage] = React.useState({ kind: "", text: "" });

        React.useEffect(function () {
          let cancelled = false;
          fetch(PRO_CONFIG_URL, { headers: { accept: "application/json" } })
            .then(function (res) {
              return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
                return data;
              });
            })
            .then(function (data) {
              if (cancelled) return;
              const fields = Array.isArray(data.fields) ? data.fields : [];
              const values = data.values && typeof data.values === "object" ? data.values : {};
              const nextDraft = {};
              for (const field of fields) {
                if (field && field.separate === undefined) {
                  nextDraft[field.key] = Object.prototype.hasOwnProperty.call(values, field.key)
                    ? values[field.key]
                    : field.default;
                }
              }
              setFields(fields);
              setDraft(nextDraft);
              setConfigStatus("ready");
            })
            .catch(function (err) {
              if (cancelled) return;
              setConfigStatus("error");
            });
          return function () { cancelled = true; };
        }, []);

        function setField(key, value) {
          setDraft(function (prev) { return Object.assign({}, prev, { [key]: value }); });
          setMessage({ kind: "", text: "" });
        }

        async function save() {
          if (configStatus !== "ready" || !draft || saving) return;
          setSaving(true);
          setMessage({ kind: "", text: "" });
          const body = {};
          for (const field of fields) {
            if (!field || field.separate !== undefined) continue;
            const value = draft[field.key];
            body[field.key] = field.type === "integer" ? Number(value) : value;
          }
          try {
            const res = await fetch(PRO_CONFIG_URL, {
              method: "PUT",
              headers: { "content-type": "application/json", "accept": "application/json" },
              body: JSON.stringify(body)
            });
            const data = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
            setMessage({ kind: "ok", text: t("saved") });
          } catch (e) {
            setMessage({ kind: "error", text: t("saveFailed") + " " + String((e && e.message) || e) });
          } finally {
            setSaving(false);
          }
        }

        if (configStatus === "loading") {
          return el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("proSection")),
            el("p", { className: "esp-empty" }, t("loading"))
          );
        }
        if (configStatus === "error") {
          return el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("proSection")),
            el("p", { className: "esp-err" }, t("loadFailed"))
          );
        }
        if (!draft) {
          return el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("proSection")),
            el("p", { className: "esp-empty" }, t("loading"))
          );
        }

        function optionLabel(field, option) {
          const localeKey = field.optionLocale && field.optionLocale[String(option)];
          if (localeKey) return t(localeKey);
          if (typeof option === "boolean") return option ? t("trueValue") : t("falseValue");
          return String(option);
        }

        function optionValue(field, raw) {
          if (!Array.isArray(field.options)) return raw;
          for (const option of field.options) {
            if (String(option) === raw) return option;
          }
          return raw;
        }

        function renderField(field) {
          if (!field || field.separate !== undefined) return null;
          const key = field.key;
          const value = draft[key];
          let control;
          if (field.control === "textarea") {
            control = el("textarea", {
              className: "esp-textarea",
              value: value === undefined ? "" : value,
              onChange: function (e) { setField(key, e.target.value); }
            });
          } else if (field.control === "number") {
            control = el("input", {
              className: "esp-input",
              type: "number",
              min: field.min === undefined ? undefined : String(field.min),
              step: field.step === undefined ? undefined : String(field.step),
              value: value === undefined ? "" : value,
              onChange: function (e) { setField(key, e.target.value); }
            });
          } else if (field.control === "select") {
            const options = Array.isArray(field.options) ? field.options : [];
            control = el("select", {
              className: "esp-select",
              value: value === undefined ? "" : String(value),
              onChange: function (e) { setField(key, optionValue(field, e.target.value)); }
            }, options.map(function (option) {
              return el("option", { key: String(option), value: String(option) }, optionLabel(field, option));
            }));
          } else {
            control = el("input", {
              className: "esp-input",
              type: "text",
              value: value === undefined ? "" : value,
              onChange: function (e) { setField(key, e.target.value); }
            });
          }
          return el("label", { className: "esp-field", key: key },
            el("span", { className: "esp-label" }, t(field.locale)),
            control,
            // T4：plannerModel 留空 = 显式清空 = 继承主会话模型（其余字段无此语义，只在
            // 该字段下渲染提示；字段 key/locale 同名 plannerModel，见描述表）。
            field.locale === "plannerModel" ? el("p", { className: "esp-hint" }, t("plannerModelHint")) : null
          );
        }

        const proFields = fields.filter(function (field) { return field && field.separate === undefined; });
        return el("div", { className: "esp-section" },
          el("p", { className: "esp-sectionTitle" }, t("proSection")),
          proFields.map(renderField),
          message.text ? el("p", { className: message.kind === "ok" ? "esp-ok" : "esp-err" }, message.text) : null,
          el("div", { className: "esp-actions" },
            el("button", {
              className: "esp-btn esp-btnPrimary",
              disabled: saving,
              onClick: save
            }, saving ? t("saving") : t("save"))
          )
        );
      }

      function ExtraPlanCard() {
        const [open, setOpen] = React.useState(false);

        return el("li", {
          className: "YyYd_a_card" + (open ? " YyYd_a_cardOpen" : "")
        },
          el("button", {
            type: "button",
            className: "YyYd_a_header",
            "aria-expanded": open,
            onClick: function () { setOpen(!open); }
          },
            el("span", { className: "YyYd_a_headText" },
              el("span", { className: "YyYd_a_name" }, t("cardTitle")),
              el("span", { className: "YyYd_a_description" }, t("cardDescription"))
            ),
            el("span", {
              className: "YyYd_a_chevron" + (open ? " YyYd_a_chevronOpen" : ""),
              style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px" }
            },
              el("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none" },
                el("path", { d: "M4 6l3 3 3-3", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })
              )
            )
          ),
          open ? el("div", { className: "YyYd_a_body" },
            el(ExtraPlanSettingsTab)
          ) : null
        );
      }

      function ExtraPlanSettingsTab() {
        return el("div", { className: "esp-wrap" },
          el(ProConfigTab)
        );
      }

      // 注册在 settings.plugin.item 插槽（「插件配置」tab 的卡片插槽），
      // key 与 settings 命名空间名一致。此插槽与 DSH 内置 BashCard 等同一插槽。
      // ConfigurablePluginsTab 取 settings 命名空间列表与已注册 card key 的交集
      // 来决定渲染哪些卡片。
      //
      // 使用 ctx.slots.inject 而非 ctx.slots.register：inject 等待插槽被声明
      // 后再注册（DSH 内置卡片、dsh-web-search-netflying 等均用此模式）。
      // register 是立即注册，在 v0.1.2-rc1 中 settings.plugin.item 插槽声明
      // 晚于本 client.js 加载，立即注册被丢弃。
      ctx.slots.inject("settings.plugin.item", function* () {
        yield ctx.slots.register({
          name: "settings.plugin.item",
          key: "dsh-extra-plan",
          locale: NS,
          inject: () => ({})
        }, ExtraPlanCard);
      });
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    return module.exports;
  }
});