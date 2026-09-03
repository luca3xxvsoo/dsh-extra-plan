window.__ModuleLoader__.load({
  id: "@local/dsh-extra-plan",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    const NS = "dsh-extra-plan-settings";
    const PRO_CONFIG_URL = "/api/dsh-extra-plan-settings/pro-config";
    const QQBOT_STATUS_URL = "/api/dsh-extra-plan-settings/qqbot-status";
    const QQBOT_CONFIG_URL = "/api/dsh-extra-plan-settings/qqbot-config";
    const FLASHGUIDE_CONFIG_URL = "/api/dsh-extra-plan-settings/flash-guide-config";

    const zh = {
      cardTitle: "按需规划模式配置",
      cardDescription: "配置 pro 规划模块和 qqbot 兼容插件的参数。",
      proSection: "pro规划模块",
      plannerModel: "使用模型",
      plannerPromptSuffix: "额外引导",
      exploreBudget: "探查额度",
      anchoredBootstrap: "anchored开关",
      webFetch: "web_fetch开关",
      toolPresentationMode: "工具呈现模式",
      toolPresentationModeNative: "默认",
      toolPresentationModeBoth: "混合",
      toolPresentationModeCode: "纯PTC模式",
      save: "保存",
      saving: "保存中…",
      saved: "已保存，需重启 Harness 后生效",
      saveFailed: "保存失败：",
      loading: "加载中…",
      loadFailed: "加载失败",
      qqbotSection: "qqbot兼容插件",
      qqbotUnavailable: "qqbot 环境未就绪，不展示配置项。",
      approvalEnabled: "越权申请开关",
      flashGuideEnabled: "启用 flash 引导",
      configLoadFailed: "配置加载失败："
    };

    const en = {
      cardTitle: "Extra Plan Configuration",
      cardDescription: "Configure pro planner and qqbot compatibility plugin settings.",
      proSection: "Pro Planner",
      plannerModel: "Planner Model",
      plannerPromptSuffix: "Extra Prompt Suffix",
      exploreBudget: "Explore Budget",
      anchoredBootstrap: "Anchored Bootstrap",
      webFetch: "Web Fetch",
      toolPresentationMode: "Tool Presentation Mode",
      toolPresentationModeNative: "Native",
      toolPresentationModeBoth: "Both",
      toolPresentationModeCode: "Pure PTC",
      save: "Save",
      saving: "Saving…",
      saved: "Saved. Restart Harness to take effect.",
      saveFailed: "Save failed: ",
      loading: "Loading…",
      loadFailed: "Load failed",
      qqbotSection: "QQ Bot Compat",
      qqbotUnavailable: "QQ Bot environment is not ready. No configuration items are displayed.",
      approvalEnabled: "Approval Required",
      flashGuideEnabled: "Enable Flash Guide",
      configLoadFailed: "Config load failed: "
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
        const [flashStatus, setFlashStatus] = React.useState("loading");
        const [flashDisabled, setFlashDisabled] = React.useState(false);
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
              setDraft({
                plannerModel: typeof data.plannerModel === "string" ? data.plannerModel : "",
                plannerPromptSuffix: typeof data.plannerPromptSuffix === "string" ? data.plannerPromptSuffix : "",
                exploreBudget: typeof data.exploreBudget === "number" ? data.exploreBudget : 18,
                anchoredBootstrap: data.anchoredBootstrap === true,
                webFetch: data.webFetch === true,
                toolPresentationMode: typeof data.toolPresentationMode === "string" ? data.toolPresentationMode : "native"
              });
              setConfigStatus("ready");
            })
            .catch(function (err) {
              if (cancelled) return;
              setConfigStatus("error");
            });
          return function () { cancelled = true; };
        }, []);

        // flash 引导开关：随 pro规划区一起加载（数据源独立：profile 用户层 disabled 条目）。
        React.useEffect(function () {
          let cancelled = false;
          fetch(FLASHGUIDE_CONFIG_URL, { headers: { accept: "application/json" } })
            .then(function (res) {
              return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
                return data;
              });
            })
            .then(function (data) {
              if (cancelled) return;
              if (data.available !== true) { setFlashStatus("hidden"); return; }
              setFlashDisabled(data.disabled === true);
              setFlashStatus("ready");
            })
            .catch(function () {
              if (cancelled) return;
              setFlashStatus("hidden");
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
          const body = {
            plannerModel: String(draft.plannerModel).trim(),
            plannerPromptSuffix: String(draft.plannerPromptSuffix),
            exploreBudget: Number(draft.exploreBudget),
            anchoredBootstrap: draft.anchoredBootstrap === true,
            webFetch: draft.webFetch === true,
            toolPresentationMode: draft.toolPresentationMode || "native"
          };
          try {
            const res = await fetch(PRO_CONFIG_URL, {
              method: "PUT",
              headers: { "content-type": "application/json", "accept": "application/json" },
              body: JSON.stringify(body)
            });
            const data = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
            if (flashStatus === "ready") {
              const fRes = await fetch(FLASHGUIDE_CONFIG_URL, {
                method: "PUT",
                headers: { "content-type": "application/json", "accept": "application/json" },
                body: JSON.stringify({ disabled: flashDisabled })
              });
              const fData = await fRes.json().catch(function () { return {}; });
              if (!fRes.ok) throw new Error(fData.error || ("HTTP " + fRes.status));
            }
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

        return el("div", { className: "esp-section" },
          el("p", { className: "esp-sectionTitle" }, t("proSection")),
          el("label", { className: "esp-field" },
            el("span", { className: "esp-label" }, t("plannerModel")),
            el("input", {
              className: "esp-input",
              type: "text",
              value: draft.plannerModel,
              onChange: function (e) { setField("plannerModel", e.target.value); }
            })
          ),
          el("label", { className: "esp-field" },
            el("span", { className: "esp-label" }, t("plannerPromptSuffix")),
            el("textarea", {
              className: "esp-textarea",
              value: draft.plannerPromptSuffix,
              onChange: function (e) { setField("plannerPromptSuffix", e.target.value); }
            })
          ),
          el("label", { className: "esp-field" },
            el("span", { className: "esp-label" }, t("exploreBudget")),
            el("input", {
              className: "esp-input",
              type: "number",
              min: "1",
              step: "1",
              value: draft.exploreBudget,
              onChange: function (e) { setField("exploreBudget", e.target.value); }
            })
          ),
          el("label", { className: "esp-field" },
            el("span", { className: "esp-label" }, t("anchoredBootstrap")),
            el("select", {
              className: "esp-select",
              value: draft.anchoredBootstrap === true ? "true" : "false",
              onChange: function (e) { setField("anchoredBootstrap", e.target.value === "true"); }
            },
              el("option", { value: "true" }, "True"),
              el("option", { value: "false" }, "False")
            )
          ),
          flashStatus === "ready" ? el("label", { className: "esp-field" },
            el("span", { className: "esp-label" }, t("flashGuideEnabled")),
            el("select", {
              className: "esp-select",
              value: flashDisabled ? "false" : "true",
              onChange: function (e) { setFlashDisabled(e.target.value !== "true"); }
            },
              el("option", { value: "true" }, "True"),
              el("option", { value: "false" }, "False")
            )
          ) : null,
          el("label", { className: "esp-field" },
            el("span", { className: "esp-label" }, t("webFetch")),
            el("select", {
              className: "esp-select",
              value: draft.webFetch === true ? "true" : "false",
              onChange: function (e) { setField("webFetch", e.target.value === "true"); }
            },
              el("option", { value: "true" }, "True"),
              el("option", { value: "false" }, "False")
            )
          ),
          el("label", { className: "esp-field" },
            el("span", { className: "esp-label" }, t("toolPresentationMode")),
            el("select", {
              className: "esp-select",
              value: draft.toolPresentationMode || "native",
              onChange: function (e) { setField("toolPresentationMode", e.target.value); }
            },
              el("option", { value: "native" }, t("toolPresentationModeNative")),
              el("option", { value: "both" }, t("toolPresentationModeBoth")),
              el("option", { value: "code" }, t("toolPresentationModeCode"))
            )
          ),
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

      function QqbotConfigTab() {
        const [status, setStatus] = React.useState("loading"); // loading | ready | unavailable | error
        const [approvalEnabled, setApprovalEnabled] = React.useState(null);
        const [saving, setSaving] = React.useState(false);
        const [message, setMessage] = React.useState({ kind: "", text: "" });

        React.useEffect(function () {
          let cancelled = false;
          fetch(QQBOT_STATUS_URL, { headers: { accept: "application/json" } })
            .then(function (res) {
              return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
                return data;
              });
            })
            .then(function (data) {
              if (cancelled) return;
              if (data.available !== true) {
                setStatus("unavailable");
                return;
              }
              // qqbot 可用，再拉配置
              return fetch(QQBOT_CONFIG_URL, { headers: { accept: "application/json" } })
                .then(function (res) {
                  return res.json().catch(function () { return {}; }).then(function (data2) {
                    if (!res.ok) throw new Error(data2.error || ("HTTP " + res.status));
                    return data2;
                  });
                })
                .then(function (configData) {
                  if (cancelled) return;
                  setApprovalEnabled(configData.approvalEnabled === true);
                  setStatus("ready");
                });
            })
            .catch(function (err) {
              if (cancelled) return;
              setStatus("error");
            });
          return function () { cancelled = true; };
        }, []);

        async function save() {
          if (status !== "ready" || approvalEnabled === null || saving) return;
          setSaving(true);
          setMessage({ kind: "", text: "" });
          try {
            const res = await fetch(QQBOT_CONFIG_URL, {
              method: "PUT",
              headers: { "content-type": "application/json", "accept": "application/json" },
              body: JSON.stringify({ approvalEnabled: approvalEnabled })
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

        if (status === "unavailable") {
          return el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("qqbotSection")),
            el("p", { className: "esp-hint" }, t("qqbotUnavailable"))
          );
        }
        if (status === "loading") {
          return el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("qqbotSection")),
            el("p", { className: "esp-empty" }, t("loading"))
          );
        }
        if (status === "error") {
          return el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("qqbotSection")),
            el("p", { className: "esp-err" }, t("configLoadFailed"))
          );
        }

        return el("div", { className: "esp-section" },
          el("p", { className: "esp-sectionTitle" }, t("qqbotSection")),
          el("label", { className: "esp-field" },
            el("span", { className: "esp-label" }, t("approvalEnabled")),
            el("select", {
              className: "esp-select",
              value: approvalEnabled === true ? "true" : "false",
              onChange: function (e) { setApprovalEnabled(e.target.value === "true"); }
            },
              el("option", { value: "true" }, "True"),
              el("option", { value: "false" }, "False")
            )
          ),
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
          el(ProConfigTab),
          el(QqbotConfigTab)
        );
      }

      ctx.slots.register({
        name: "settings.plugin.item",
        key: "dsh-extra-plan",
        locale: NS,
        inject: () => ({})
      }, ExtraPlanCard);
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    return module.exports;
  }
});