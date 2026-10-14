window.__ModuleLoader__.load({
  id: "dsh-extra-plan",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    // 技术 ID 与 ConfigForms namespace 保持兼容；bundle slot key 是包名，不能当作 namespace。
    const NS = "dsh-extra-plan-settings";
    const BUNDLE_NAME = "dsh-extra-plan";

    const zh = {
      cardTitle: "按需规划模式全局管理",
      cardDescription: "统一管理按需规划模式的配置、预设核对与界面加载。",
      proSection: "pro规划",
      generalSection: "通用设置",
      plannerModel: "pro规划 | 使用模型",
      crossProviderPlannerModel: "跨提供方",
      plannerPromptSuffix: "pro规划 | 额外引导",
      exploreBudget: "pro规划 | 探查额度",
      otherAgentModel: "其他子代理 | 使用模型",
      anchoredBootstrap: "anchored开关",
      creativeMode: "创造模式开关",
      runcodeCatchGate: "run_code 容错检查",
      webFetch: "web_fetch开关",
      toolPresentationMode: "工具呈现模式",
      toolPresentationModeNative: "默认",
      toolPresentationModeBoth: "混合",
      toolPresentationModePtc: "PTC模式",
      save: "保存",
      saving: "保存中…",
      saved: "已保存",
      savedPartial: "保存失败",
      loading: "加载中…",
      unavailable: "该配置命名空间当前未由宿主提供，暂时无法编辑。",
      readOnly: "本部署的设置为只读。",
      trueValue: "True",
      falseValue: "False"
    };

    const en = {
      cardTitle: "Extra Plan Global Manager",
      cardDescription: "Manage configuration, preset checks, and UI loading for Extra Plan.",
      proSection: "Pro Planner",
      generalSection: "General Settings",
      plannerModel: "Pro Planner | Model",
      crossProviderPlannerModel: "Cross-Provider Planner Model",
      plannerPromptSuffix: "Pro Planner | Extra Prompt Suffix",
      exploreBudget: "Pro Planner | Explore Budget",
      otherAgentModel: "Other Agents | Model",
      anchoredBootstrap: "Anchored Bootstrap",
      creativeMode: "Creative Mode",
      runcodeCatchGate: "RunCode Catch Guard",
      webFetch: "Web Fetch",
      toolPresentationMode: "Tool Presentation Mode",
      toolPresentationModeNative: "Native",
      toolPresentationModeBoth: "Both",
      toolPresentationModePtc: "Pure PTC",
      save: "Save",
      saving: "Saving…",
      saved: "Saved.",
      savedPartial: "Save failed.",
      loading: "Loading…",
      unavailable: "The Host does not serve this settings namespace right now.",
      readOnly: "This deployment stores settings read-only.",
      trueValue: "True",
      falseValue: "False"
    };

    // 字段顺序、校验与 descriptor 合同保持一份；两项宿主设置也在同一 ConfigForms mutate 中提交。
    const EXTRA_FIELDS = Object.freeze([
      { key: "anchoredBootstrap", control: "select", options: [true, false], locale: "anchoredBootstrap", section: "general", hint: "首轮极简工具 + 提示词 ｜ 新会话/新子代理生效" },
      { key: "creativeMode", control: "select", options: [true, false], locale: "creativeMode", section: "general", hint: "是否开启dsh官方创造模式 ｜ 重启生效" },
      { key: "runcodeCatchGate", control: "select", options: [true, false], locale: "runcodeCatchGate", section: "general", hint: "PTC模式下，增加每个工具调用需要try catch的闸门。通过限制+建议的模式保障仅单个调用报错 ｜ 立即生效" },
      { key: "crossProviderPlannerModel", control: "select", options: [true, false], locale: "crossProviderPlannerModel", section: "pro", hint: "允许跨提供方选择模型。开启时将以 其他提供方 - 主会话提供方 - deepseek官方 的顺序，获取可用模型。关闭时仅从主会话提供方获取。默认关闭 ｜ 新会话/新子代理生效" },
      { key: "plannerModel", control: "text", locale: "plannerModel", section: "pro", hint: "pro规划默认使用模型。未匹配/置空时：使用主会话模型 ｜ 新会话/新子代理生效" },
      { key: "plannerPromptSuffix", control: "textarea", locale: "plannerPromptSuffix", section: "pro", hint: "在主会话发送给pro规划的任务结尾，拼接上的内容。可能能增加pro规划的智商（未验证）。可置空 ｜ 立即生效" },
      { key: "exploreBudget", control: "number", min: 1, step: 1, locale: "exploreBudget", section: "pro", hint: "允许pro规划调用工具的次数，避免后台无限制调用。同时限制一次runcode内可调用的工具上限数 ｜ 立即生效" },
      { key: "otherAgentModel", control: "text", locale: "otherAgentModel", section: "pro", hint: "其他子代理默认使用模型。未匹配/置空时：使用主会话模型 ｜ 新会话/新子代理生效" }
    ]);

    const HOST_ROW_FIELDS = Object.freeze([
      { key: "webFetch", control: "select", options: [true, false], locale: "webFetch", hint: "是否开启web_fetch ｜ 重启生效" },
      { key: "toolPresentationMode", control: "select", options: ["native", "ptc", "both"], optionLocale: { native: "toolPresentationModeNative", ptc: "toolPresentationModePtc", both: "toolPresentationModeBoth" }, locale: "toolPresentationMode", hint: "工具呈现方式切换（默认/混合/PTC模式） ｜ 重启生效" }
    ]);
    const ALL_FIELDS = Object.freeze(EXTRA_FIELDS.concat(HOST_ROW_FIELDS));

    const css =
      '.esp-wrap{display:flex;flex-direction:column;gap:20px;max-width:760px;color:var(--dsw-alias-label-primary)}' +
      '.esp-section{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:0}' +
      '.esp-sectionTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.5;margin:0 0 2px}' +
      '.esp-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}' +
      '.esp-fieldHead{display:flex;align-items:center;gap:8px}' +
      '.esp-label{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}' +
      '.esp-field + .esp-field{border-top:.5px solid var(--dsw-alias-border-l2)}' +
      '.esp-input,.esp-select{height:34px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font:inherit;font-size:13px;width:100%;box-sizing:border-box}' +
      '.esp-textarea{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 12px;font:inherit;font-size:13px;width:100%;box-sizing:border-box;resize:vertical;min-height:80px}' +
      '.esp-input:focus-visible,.esp-select:focus-visible,.esp-textarea:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}' +
      '.esp-cardFooter{border-top:.5px solid var(--dsw-alias-border-l2);padding:12px 0 4px;display:flex;align-items:center;gap:8px}' +
      '.esp-actions{display:flex;justify-content:flex-end;gap:8px;margin-left:auto}' +
      '.esp-btn{appearance:none;font:inherit;cursor:pointer;border:.5px solid var(--dsw-alias-border-l4);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:8px;padding:5px 12px;font-size:13px;white-space:nowrap}' +
      '.esp-btnPrimary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}' +
      '.esp-btn:disabled{opacity:.5;cursor:default}' +
      '.esp-ok{color:var(--dsw-alias-brand-primary);font-size:12px;margin:0}' +
      '.esp-err{color:var(--dsw-alias-label-error);font-size:12px;margin:0}' +
      '.esp-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin:0}' +
      '.esp-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:0}' +
      '.esp-panelTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.5;margin:0}' +
      '.esp-panelHint{font-size:13px;color:var(--dsw-alias-label-tertiary);line-height:1.5;margin:0}';

    function apply(ctx) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-extra-plan-settings";
      tag.textContent = css;
      document.head.appendChild(tag);
      ctx.effect(() => () => tag.remove(), "dsh-extra-plan-settings: css");
      const el = React.createElement;
      const t = ctx.locale.bind(NS);
      const sharedForm = ctx.configForms.get(NS);


      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-extra-plan-settings: dictionaries");

      function useSharedConfigForm() {
        const [snapshot, setSnapshot] = React.useState(function () { return sharedForm.getSnapshot(); });
        React.useEffect(function () {
          const update = function () { setSnapshot(sharedForm.getSnapshot()); };
          update();
          return sharedForm.subscribe(update);
        }, []);
        return {
          state: snapshot,
          mutate: function (ops, revision) { return sharedForm.mutate(ops, revision); }
        };
      }

      function optionLabel(field, option) {
        const localeKey = field.optionLocale && field.optionLocale[String(option)];
        if (localeKey) return t(localeKey);
        if (typeof option === "boolean") return option ? t("trueValue") : t("falseValue");
        return String(option);
      }

      function optionValue(field, raw) {
        if (!Array.isArray(field.options)) return raw;
        for (const option of field.options) if (String(option) === raw) return option;
        return raw;
      }

      function renderControl(field, value, disabled, onChange) {
        if (field.control === "textarea") return el("textarea", {
          className: "esp-textarea", disabled: disabled,
          value: value === undefined || value === null ? "" : String(value),
          onChange: function (e) { onChange(e.target.value); }
        });
        if (field.control === "number") return el("input", {
          className: "esp-input", type: "number", disabled: disabled,
          min: field.min === undefined ? undefined : String(field.min),
          step: field.step === undefined ? undefined : String(field.step),
          value: value === undefined || value === null ? "" : String(value),
          onChange: function (e) { onChange(e.target.value); }
        });
        if (field.control === "select") return el("select", {
          className: "esp-select", disabled: disabled,
          value: value === undefined || value === null ? "" : String(value),
          onChange: function (e) { onChange(optionValue(field, e.target.value)); }
        }, field.options.map(function (option) {
          return el("option", { key: String(option), value: String(option) }, optionLabel(field, option));
        }));
        return el("input", {
          className: "esp-input", type: "text", disabled: disabled,
          value: value === undefined || value === null ? "" : String(value),
          onChange: function (e) { onChange(e.target.value); }
        });
      }

      function ExtraPlanForm(props) {
        const form = props.configForm;
        const snapshot = form !== undefined && form !== null ? form.state : undefined;
        const value = snapshot !== undefined && snapshot !== null ? snapshot.value : undefined;
        const writable = snapshot !== undefined && snapshot !== null ? snapshot.writable === true : false;
        const revision = snapshot !== undefined && snapshot !== null ? snapshot.revision : undefined;
        const status = snapshot !== undefined && snapshot !== null ? snapshot.status : "unavailable";
        const [draft, setDraft] = React.useState(null);
        const [saving, setSaving] = React.useState(false);
        const [message, setMessage] = React.useState({ kind: "", text: "" });

        React.useEffect(function () {
          const next = {};
          for (const field of ALL_FIELDS) {
            const raw = value !== undefined && value !== null ? value[field.key] : undefined;
            next[field.key] = raw === undefined ? "" : raw;
          }
          setDraft(next);
        }, [value]);

        if (status === "loading" || draft === null) return el("div", { className: "esp-section" }, el("p", { className: "esp-empty" }, t("loading")));
        if (status === "unavailable") return el("div", { className: "esp-section" }, el("p", { className: "esp-empty" }, t("unavailable")));

        function fieldValue(field) {
          const raw = draft[field.key];
          if (field.control === "number") {
            const number = Number(raw);
            return Number.isFinite(number) ? number : raw;
          }
          return raw;
        }

        async function saveAll() {
          if (form === undefined || form === null || typeof form.mutate !== "function" || saving || !writable || draft === null || status !== "ready") return;
          setSaving(true);
          setMessage({ kind: "", text: "" });
          const ops = ALL_FIELDS.map(function (field) {
            return { op: "set", path: [field.key], value: fieldValue(field) };
          });
          try {
            const accepted = await form.mutate(ops, revision);
            setMessage(accepted === true ? { kind: "ok", text: t("saved") } : { kind: "error", text: t("savedPartial") });
          } catch {
            setMessage({ kind: "error", text: t("savedPartial") });
          } finally {
            setSaving(false);
          }
        }

        function renderField(field, current, disabled, onChange) {
          return el("label", { className: "esp-field", key: field.key },
            el("span", { className: "esp-fieldHead" }, el("span", { className: "esp-label" }, t(field.locale))),
            renderControl(field, current, disabled, function (next) {
              onChange(next);
              setMessage({ kind: "", text: "" });
            }),
            el("p", { className: "esp-hint" }, field.hint)
          );
        }

        const generalHeadFields = EXTRA_FIELDS.filter(function (field) { return field.section === "general" && field.key !== "runcodeCatchGate"; });
        const generalTailFields = EXTRA_FIELDS.filter(function (field) { return field.section === "general" && field.key === "runcodeCatchGate"; });
        const proFields = EXTRA_FIELDS.filter(function (field) { return field.section === "pro"; });
        const disabled = saving || !writable;
        return el(React.Fragment, null,
          el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("generalSection")),
            generalHeadFields.map(function (field) { return renderField(field, draft[field.key], disabled, function (next) { setDraft(function (prev) { return Object.assign({}, prev, { [field.key]: next }); }); }); }),
            HOST_ROW_FIELDS.map(function (field) { return renderField(field, draft[field.key], disabled, function (next) { setDraft(function (prev) { return Object.assign({}, prev, { [field.key]: next }); }); }); }),
            generalTailFields.map(function (field) { return renderField(field, draft[field.key], disabled, function (next) { setDraft(function (prev) { return Object.assign({}, prev, { [field.key]: next }); }); }); })
          ),
          el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("proSection")),
            proFields.map(function (field) { return renderField(field, draft[field.key], disabled, function (next) { setDraft(function (prev) { return Object.assign({}, prev, { [field.key]: next }); }); }); })
          ),
          el("div", { className: "esp-cardFooter" },
            writable ? null : el("p", { className: "esp-hint" }, t("readOnly")),
            message.text ? el("p", { className: message.kind === "ok" ? "esp-ok" : "esp-err" }, message.text) : null,
            el("div", { className: "esp-actions" }, el("button", {
              className: "esp-btn esp-btnPrimary", disabled: disabled, onClick: saveAll
            }, saving ? t("saving") : t("save")))
          )
        );
      }

      function SettingsCard(props) {
        const copy = props.translate !== undefined && props.translate !== null ? props.translate : function (key) { return key; };

        return el("section", { className: "esp-wrap", "data-plugin-section": "dsh-extra-plan-settings-global" },
          el("h4", { className: "esp-panelTitle" }, copy("cardTitle")),
          el("p", { className: "esp-panelHint" }, copy("cardDescription")),
          el(ExtraPlanForm, { configForm: props.configForm })
        );
      }

      function hasBundleConfigEntry() {

        try {
          return typeof ctx.slots.entries === "function" && ctx.slots.entries("plugins.bundle.config").some(function (entry) {
            return entry.options !== undefined && entry.options.key === BUNDLE_NAME;
          });
        } catch { return false; }
      }

      function DetailSettingsSection(props) {
        const configForm = useSharedConfigForm();
        const subject = props !== undefined && props !== null ? props.subject : undefined;
        const isBundle = subject !== undefined && subject !== null && subject.kind === "bundle" && subject.pkg !== undefined && subject.pkg.name === BUNDLE_NAME;
        if (!isBundle || hasBundleConfigEntry()) return null;
         return el(SettingsCard, { configForm: configForm, translate: t });
      }

      function safeInject(name, register) {
        try { return ctx.slots.inject(name, register); } catch { return undefined; }
      }

      function registerClientSurfaces() {
        const detailOff = safeInject("plugins.detail.section", function () {
          return ctx.slots.register({ name: "plugins.detail.section", id: "dsh-extra-plan-settings-global", order: 100, label: function () { return t("cardTitle"); }, locale: NS }, DetailSettingsSection);
        });
        return function () {
          if (typeof detailOff === "function") detailOff();
        };
      }

      // 设置表单仅经 plugins.detail.section 渲染于 bundle 页行列表之后；若本包 bundle.config 槽被任何一方注册，DetailSettingsSection 让位以保持唯一表单。
      ctx.effect(() => ctx.configForms.whileServed([NS], registerClientSurfaces), "dsh-extra-plan-settings: same-page config surfaces");
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "configForms"];
    return module.exports;
  }
});
