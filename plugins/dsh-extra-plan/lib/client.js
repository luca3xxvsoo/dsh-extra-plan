window.__ModuleLoader__.load({
  id: "@local/dsh-extra-plan",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    // settings 命名空间 = profile 行 id（dsh-extra-plan-settings）；同时用作 configForms 键、
    // plugins.row.config 键的 rowId 段与 locale 命名空间。
    const NS = "dsh-extra-plan-settings";
    // 设置行的 plugins.row.config 注册键：宿主 rowConfigKey(bundle, rowId) = `${bundle}#${rowId}`。
    // bundle 段 = profile 内包名（@local/dsh-extra-plan），rowId 段 = 设置行 id（= NS）。
    const ROW_CONFIG_KEY = "@local/dsh-extra-plan#dsh-extra-plan-settings";
    // 2 项宿主行设置（webFetch / toolPresentationMode）：**权威值落 settings 行**
    // （dsh-extra-plan-settings 行 config，与上面 8 项同源，跨升级/重装不丢）；
    // 声明行 plugins 内 tool-web / tool-presentation 子行只是投影（消费方是宿主行装载期快照）。
    // 提交：2 项并入官方 configForms 一次 mutate（与 8 项同一事务 + revision fencing）；
    // 本插件的 PUT 仅把新值投影到声明行子行（幂等）。
    const PRO_CONFIG_URL = "/api/dsh-extra-plan-settings/pro-config";

    const zh = {
      cardTitle: "按需规划模式配置",
      cardDescription: "配置按需规划模式的参数",
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
      hostRowsFailed: "保存失败",
      rollbackFailed: "保存失败",
      loading: "加载中…",
      loadFailed: "加载失败",
      unavailable: "该配置命名空间当前未由宿主提供，暂时无法编辑。",
      readOnly: "本部署的设置为只读。",
      overridden: "已覆盖",
      reset: "恢复默认",
      trueValue: "True",
      falseValue: "False"
    };

    const en = {
      cardTitle: "Extra Plan Configuration",
      cardDescription: "Configure pro planner settings.",
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
      hostRowsFailed: "Save failed.",
      rollbackFailed: "Save failed.",
      loading: "Loading…",
      loadFailed: "Load failed",
      unavailable: "The Host does not serve this settings namespace right now.",
      readOnly: "This deployment stores settings read-only.",
      overridden: "Overridden",
      reset: "Reset to default",
      trueValue: "True",
      falseValue: "False"
    };

    // 8 项 UI 设置（settings 行 dsh-extra-plan-settings 的 volatile 字段）：客户端自带的
    // 呈现元数据（控件/选项/locale/提示）。数组内 general 组在前、pro 组在后：
    // pro 组首项 = crossProviderPlannerModel（README「pro规划」口径 L94-99）；
    // general 组的 runcodeCatchGate 留在组末（其渲染位置由 render 段派生，见下）。
    // 写入一律交回宿主表单（ownerProps.form.mutate），不由本插件直接落盘。
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

    // 2 项宿主行设置（权威值在 settings 行 dsh-extra-plan-settings config；
    // 声明行 plugins 内 tool-web / tool-presentation 子行为投影，消费方是宿主行装载期快照）。
    const HOST_ROW_FIELDS = Object.freeze([
      { key: "webFetch", control: "select", options: [true, false], locale: "webFetch", hint: "是否开启web_fetch ｜ 重启生效" },
      { key: "toolPresentationMode", control: "select", options: ["native", "ptc", "both"], optionLocale: { native: "toolPresentationModeNative", ptc: "toolPresentationModePtc", both: "toolPresentationModeBoth" }, locale: "toolPresentationMode", hint: "工具呈现方式切换（默认/混合/PTC模式） ｜ 重启生效" }
    ]);

    const css =
      '.esp-wrap{display:flex;flex-direction:column;gap:20px;max-width:760px;color:var(--dsw-alias-label-primary)}' +
      '.esp-section{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:0}' +
      '.esp-sectionTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.5;margin:0 0 2px}' +
      '.esp-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}' +
      '.esp-fieldHead{display:flex;align-items:center;gap:8px}' +
      '.esp-label{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}' +
      '.esp-badge{font-size:11px;line-height:1.4;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l3);border-radius:6px;padding:0 6px}' +
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

      function renderControl(field, value, disabled, onChange) {
        if (field.control === "textarea") {
          return el("textarea", {
            className: "esp-textarea",
            disabled: disabled,
            value: value === undefined || value === null ? "" : String(value),
            onChange: function (e) { onChange(e.target.value); }
          });
        }
        if (field.control === "number") {
          return el("input", {
            className: "esp-input",
            type: "number",
            disabled: disabled,
            min: field.min === undefined ? undefined : String(field.min),
            step: field.step === undefined ? undefined : String(field.step),
            value: value === undefined || value === null ? "" : String(value),
            onChange: function (e) { onChange(e.target.value); }
          });
        }
        if (field.control === "select") {
          const options = Array.isArray(field.options) ? field.options : [];
          return el("select", {
            className: "esp-select",
            disabled: disabled,
            value: value === undefined || value === null ? "" : String(value),
            onChange: function (e) { onChange(optionValue(field, e.target.value)); }
          }, options.map(function (option) {
            return el("option", { key: String(option), value: String(option) }, optionLabel(field, option));
          }));
        }
        return el("input", {
          className: "esp-input",
          type: "text",
          disabled: disabled,
          value: value === undefined || value === null ? "" : String(value),
          onChange: function (e) { onChange(e.target.value); }
        });
      }

      // 单卡双区块：8 项 UI 设置直接消费宿主提供的表单
      // （ownerProps.form = ConfigPageForm{state, mutate}）；2 项宿主行设置自绘控件 + 专用 PUT（仅投影）。
      // 全卡唯一保存按钮 → saveAll：先 PUT 纯投影 2 项宿主行（幂等，失败即中止、10 项零写入），
      // 再走官方 configForms 一次 mutate 10 项（8 项 UI + 2 项宿主行，事务 + revision fencing）；
      // mutate 失败回滚投影。
      function ExtraPlanForm(props) {
        const form = props.form;
        const snapshot = form !== undefined && form !== null ? form.state : undefined;
        const value = snapshot !== undefined && snapshot !== null ? snapshot.value : undefined;
        const writable = snapshot !== undefined && snapshot !== null ? snapshot.writable === true : false;
        const revision = snapshot !== undefined && snapshot !== null ? snapshot.revision : undefined;
        const status = snapshot !== undefined && snapshot !== null ? snapshot.status : "unavailable";
        const [draft, setDraft] = React.useState(null);
        const [hostDraft, setHostDraft] = React.useState(null);
        const [hostStatus, setHostStatus] = React.useState("loading");
        const [saving, setSaving] = React.useState(false);
        const [message, setMessage] = React.useState({ kind: "", text: "" });
        // 投影回滚基准（加载时 values 的 webFetch/toolPresentationMode）：mutate 失败时用它再 PUT 一次原值。
        const hostSnapshot = React.useRef(null);

        React.useEffect(function () {
          const next = {};
          for (const field of EXTRA_FIELDS) {
            const raw = value !== undefined && value !== null ? value[field.key] : undefined;
            next[field.key] = raw === undefined ? "" : raw;
          }
          setDraft(next);
        }, [value]);

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
              const values = data.values && typeof data.values === "object" ? data.values : {};
              const next = {};
              for (const field of HOST_ROW_FIELDS) {
                next[field.key] = Object.prototype.hasOwnProperty.call(values, field.key) ? values[field.key] : undefined;
              }
              hostSnapshot.current = { webFetch: next.webFetch, toolPresentationMode: next.toolPresentationMode };
              setHostDraft(next);
              setHostStatus("ready");
            })
            .catch(function () {
              if (cancelled) return;
              setHostStatus("error");
            });
          return function () { cancelled = true; };
        }, []);

        if (status === "loading" || draft === null) {
          return el("div", { className: "esp-section" },
            el("p", { className: "esp-empty" }, t("loading"))
          );
        }
        if (status === "unavailable") {
          return el("div", { className: "esp-section" },
            el("p", { className: "esp-empty" }, t("unavailable"))
          );
        }

        function fieldValue(field) {
          const raw = draft[field.key];
          if (field.control === "number") {
            const n = Number(raw);
            return Number.isFinite(n) ? n : raw;
          }
          return raw;
        }

        // 部分失败：用投影回滚基准再发一次 PUT 原值（best-effort，不再抛错）。
        async function rollbackHostRows() {
          const base = hostSnapshot.current;
          if (base === null || base === undefined) {
            setMessage({ kind: "error", text: t("rollbackFailed") });
            return;
          }
          try {
            const res = await fetch(PRO_CONFIG_URL, {
              method: "PUT",
              headers: { "content-type": "application/json", "accept": "application/json" },
              body: JSON.stringify({ webFetch: base.webFetch, toolPresentationMode: base.toolPresentationMode })
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            setMessage({ kind: "error", text: t("savedPartial") });
          } catch {
            setMessage({ kind: "error", text: t("rollbackFailed") });
          }
        }

        async function saveAll() {
          if (form === undefined || form === null || typeof form.mutate !== "function" || saving) return;
          if (hostDraft === null) return;
          setSaving(true);
          setMessage({ kind: "", text: "" });
          // 第一步：PUT 仅投影 2 项宿主行到声明行子行（幂等）。投影无 revision fencing/回滚，
          // 失败即中止、10 项零写入，无半写风险。
          try {
            const res = await fetch(PRO_CONFIG_URL, {
              method: "PUT",
              headers: { "content-type": "application/json", "accept": "application/json" },
              // 投影体 = 本次保存的 2 项宿主行值（hostDraft 恒只含 HOST_ROW_FIELDS 两键；含其它键即 400）。
              body: JSON.stringify({ ...hostDraft })
            });
            const data = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
          } catch (e) {
            console.error("dsh-extra-plan-settings save failed:", e);
            setMessage({ kind: "error", text: t("hostRowsFailed") });
            setSaving(false);
            return;
          }
          // 第二步：官方 configForms 一次 mutate 10 项（8 项 UI + 2 项宿主行 set op，带读到的 revision 作为 fence）。
          const ops = EXTRA_FIELDS.map(function (field) {
            return { op: "set", path: [field.key], value: fieldValue(field) };
          }).concat(HOST_ROW_FIELDS.map(function (field) {
            return { op: "set", path: [field.key], value: hostDraft[field.key] };
          }));
          try {
            const accepted = await form.mutate(ops, revision);
            if (accepted === false) {
              await rollbackHostRows();
              return;
            }
            // 保存后状态刷新：2 项用本次保存值刷新；8 项由 form.state.value 变化触发既有 [value] effect。
            hostSnapshot.current = { webFetch: hostDraft.webFetch, toolPresentationMode: hostDraft.toolPresentationMode };
            setHostDraft({ webFetch: hostDraft.webFetch, toolPresentationMode: hostDraft.toolPresentationMode });
            setMessage({ kind: "ok", text: t("saved") });
          } catch {
            await rollbackHostRows();
          } finally {
            setSaving(false);
          }
        }

        // 区块渲染顺序 = README「可配置项」口径（L87-99）：
        // 通用区 = anchoredBootstrap → creativeMode → webFetch → toolPresentationMode → runcodeCatchGate；
        // pro 区 = crossProviderPlannerModel → plannerModel → plannerPromptSuffix → exploreBudget → otherAgentModel。
        // 实现：general 组里除 runcodeCatchGate 外的 2 项在前、2 项宿主行（HOST_ROW_FIELDS）居中、
        // runcodeCatchGate 收尾；字段总数仍 10（8 项 UI + 2 项宿主行），区块仍 2 个。
        const generalHeadFields = EXTRA_FIELDS.filter(function (field) { return field.section === "general" && field.key !== "runcodeCatchGate"; });
        const generalTailFields = EXTRA_FIELDS.filter(function (field) { return field.section === "general" && field.key === "runcodeCatchGate"; });
        const proFields = EXTRA_FIELDS.filter(function (field) { return field.section === "pro"; });
        function renderField(field, current, disabled, onChange) {
          return el("label", { className: "esp-field", key: field.key },
            el("span", { className: "esp-fieldHead" },
              el("span", { className: "esp-label" }, t(field.locale))
            ),
            renderControl(field, current, disabled, function (next) {
              onChange(next);
              setMessage({ kind: "", text: "" });
            }),
            el("p", { className: "esp-hint" }, field.hint)
          );
        }

        return el(React.Fragment, null,
          el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("generalSection")),
            generalHeadFields.map(function (field) {
              return renderField(field, draft[field.key], saving || !writable, function (next) {
                setDraft(function (prev) { return Object.assign({}, prev, { [field.key]: next }); });
              });
            }),
            hostStatus === "loading" ? el("p", { className: "esp-empty" }, t("loading")) : null,
            hostStatus === "error" ? el("p", { className: "esp-err" }, t("loadFailed")) : null,
            hostDraft === null ? null : HOST_ROW_FIELDS.map(function (field) {
              return renderField(field, hostDraft[field.key], saving || !writable || hostDraft === null, function (next) {
                setHostDraft(function (prev) { return Object.assign({}, prev, { [field.key]: next }); });
              });
            }),
            generalTailFields.map(function (field) {
              return renderField(field, draft[field.key], saving || !writable, function (next) {
                setDraft(function (prev) { return Object.assign({}, prev, { [field.key]: next }); });
              });
            })
          ),
          el("div", { className: "esp-section" },
            el("p", { className: "esp-sectionTitle" }, t("proSection")),
            proFields.map(function (field) {
              return renderField(field, draft[field.key], saving || !writable, function (next) {
                setDraft(function (prev) { return Object.assign({}, prev, { [field.key]: next }); });
              });
            })
          ),
          el("div", { className: "esp-cardFooter" },
            writable ? null : el("p", { className: "esp-hint" }, t("readOnly")),
            message.text ? el("p", { className: message.kind === "ok" ? "esp-ok" : "esp-err" }, message.text) : null,
            el("div", { className: "esp-actions" },
              el("button", {
                className: "esp-btn esp-btnPrimary",
                disabled: saving || !writable || hostDraft === null,
                onClick: saveAll
              }, saving ? t("saving") : t("save"))
            )
          )
        );
      }

      function SettingsCard(props) {
        const t = props.t !== undefined && props.t !== null ? props.t : (key) => key;
        if (props.view === "summary") return t("cardDescription");
        return el("div", { className: "esp-wrap" },
          el(ExtraPlanForm, { form: props.form })
        );
      }

      // 注册面（dsh 0.1.7-rc.1 / 0.1.7-rc.2）：Plugins 页「已安装包 → 行详情页」的 keyed 插槽 plugins.row.config。
      // 宿主 plugins.item 是官方设置页专用列表（挂那里会落进「官方」分组）；旧版 settings.plugin.item 插槽在 0.1.7 已废。
      // key = ROW_CONFIG_KEY（宿主 rowConfigKey(bundle,rowId) 形态）；keyed 插槽按 key 定位、不认 order/label。
      // whileServed：只有宿主确实提供该 settings 命名空间时才注册卡片，
      // 没有该命名空间的部署不显示任何痕迹。
      ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject("plugins.row.config", () => ctx.slots.register({
        name: "plugins.row.config",
        key: ROW_CONFIG_KEY,
        label: () => t("cardTitle"),
        locale: NS,
        inject: () => ({})
      }, SettingsCard))), "dsh-extra-plan-settings: plugins row config");
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "configForms"];
    return module.exports;
  }
});
