// Host half of dsh-extra-plan-settings.
//
// - pro规划模块：读写 agent.cordis.yml 中 extra-plan 插件配置
// - qqbot兼容插件模块：条件展示，读写 cordis.patch.yml 中 qqbot-user-questions 配置
//
// webServer 通过 ctx.inject(['webServer'], ...) 条件注册，非 web profile 优雅降级为 no-op。

import yaml from 'js-yaml'
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-extra-plan-settings'
export const inject = []

const EXTRA_PLAN_NS = settingsNamespace('dsh-extra-plan')
const ExtraPlanSettingsSchema = z.object({})

// YAML schema 支持 !!js 表达式，确保 agent.cordis.yml 中 !!js 往返不丢失。
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
  predicate: (data) => data != null && typeof data === 'object' && typeof data.__jsExpr === 'string',
  represent: (data) => data.__jsExpr
})
const patchSchema = yaml.JSON_SCHEMA.extend(JsExpr)

// 从 ctx 的 settings 文档路径解析 DSH_HOME（settings.yaml 位于 DSH_HOME 根目录）。
// 注意：host 平面 inject=[] 下只能用 ctx.get('settings')（可选查找）；直接读
// ctx.settings 会被宿主 ctx 守卫以「未声明服务」抛错（API 500）。
function dshHomeDir(ctx) {
  const settings = ctx.get('settings')
  const doc = settings !== undefined && settings !== null && typeof settings.documentPath === 'string' ? settings.documentPath : ''
  if (doc !== '') return dirname(doc)
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
}

// 找出安装了主包（@local/dsh-extra-plan）的 profile 名列表。
function mainPluginProfiles(dshHome) {
  const root = join(dshHome, 'profiles')
  if (!existsSync(root)) return []
  const out = []
  for (const name of readdirSync(root)) {
    const probe = join(root, name, 'node_modules', '@local', 'dsh-extra-plan')
    if (existsSync(probe)) out.push(name)
  }
  return out
}

// 读取 profile 用户层 cordis.patch.yml 中 flash-guide 的 id-targeted 条目。
function readFlashGuideConfig(file) {
  const items = existsSync(file) ? yaml.load(readFileSync(file, 'utf8'), { schema: patchSchema }) : []
  const list = Array.isArray(items) ? items : []
  for (const item of list) {
    if (item && typeof item === 'object' && item.id === 'flash-guide') {
      return { list, item }
    }
  }
  return { list, item: null }
}

function agentCordisPath(ctx) {
  return join(dshHomeDir(ctx), '.agent-presets', 'extra-plan', 'agent.cordis.yml')
}

function cordisPatchPath(ctx) {
  return join(dshHomeDir(ctx), 'profiles', 'qqbot', 'cordis.patch.yml')
}

function qqbotDir(ctx) {
  return join(dshHomeDir(ctx), 'profiles', 'qqbot')
}

function qqbotUserQuestionsDir(ctx) {
  return join(dshHomeDir(ctx), 'profiles', 'qqbot', 'node_modules', '@local', 'dsh-qqbot-user-questions')
}

function isLoopback(req) {
  const addr = req.socket && req.socket.remoteAddress
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      chunks.push(c)
      size += c.length
      if (size > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

// 读取 agent.cordis.yml 并找到 extra-plan 插件配置。
function readExtraPlanConfig(file) {
  const content = readFileSync(file, 'utf8')
  const data = yaml.load(content, { schema: patchSchema })
  const plugins = Array.isArray(data) ? data : []

  for (const plugin of plugins) {
    if (!plugin || !plugin.config) continue
    // 处理 group 内的 config 数组
    const groupConfigs = Array.isArray(plugin.config) ? plugin.config : []
    for (const entry of groupConfigs) {
      if (entry && entry.id === 'extra-plan') {
        return { plugins, entry }
      }
    }
    // 直接匹配
    if (plugin.id === 'extra-plan') {
      return { plugins, entry: plugin }
    }
  }
  return { plugins, entry: null }
}

// 读取 agent.cordis.yml 并找到 tool-web 配置（用于 web_fetch 开关）。
function readToolWebConfig(file) {
  const content = readFileSync(file, 'utf8')
  const data = yaml.load(content, { schema: patchSchema })
  const plugins = Array.isArray(data) ? data : []

  for (const plugin of plugins) {
    if (plugin && plugin.id === 'tool-web') {
      return { plugins, entry: plugin }
    }
  }
  return { plugins, entry: null }
}

// 读取 agent.cordis.yml 并找到 tool-presentation 配置（用于 PTC 模式选择）。
function readToolPresentationConfig(file) {
  const content = readFileSync(file, 'utf8')
  const data = yaml.load(content, { schema: patchSchema })
  const plugins = Array.isArray(data) ? data : []

  for (const plugin of plugins) {
    if (plugin && plugin.id === 'tool-presentation') {
      return { plugins, entry: plugin }
    }
  }
  return { plugins, entry: null }
}

// 原子写入 YAML：先写 tmp 文件再 rename。
function writeYaml(file, data) {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  const content = yaml.dump(data, { schema: patchSchema, noRefs: true, lineWidth: -1 })
  const tmp = file + '.tmp-' + process.pid
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

// 读取 cordis.patch.yml 并找到 qqbot-user-questions 条目。
function readQqbotConfig(file) {
  const content = readFileSync(file, 'utf8')
  const data = yaml.load(content, { schema: patchSchema })
  const patches = Array.isArray(data) ? data : []

  for (const patch of patches) {
    if (!patch || !Array.isArray(patch.insert)) continue
    for (const entry of patch.insert) {
      if (entry && entry.id === 'qqbot-user-questions') {
        return { patches, patch, entry }
      }
    }
  }
  return { patches, patch: null, entry: null }
}

// 检查 qqbot 环境是否可用（三条件）。
function checkQqbotStatus(file) {
  // 条件1：profiles/qqbot 目录存在
  if (!existsSync(qqbotDir(file))) return false

  const pkgPath = join(qqbotDir(file), 'package.json')
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const bundles = pkg && pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)
      ? pkg.dsh.profile.bundles
      : []
    // 条件2：bundles 包含 @tencent-connect/dsh-qqbot
    if (!bundles.includes('@tencent-connect/dsh-qqbot')) return false
  } catch {
    return false
  }

  // 条件3：@local/dsh-qqbot-user-questions 目录存在
  if (!existsSync(qqbotUserQuestionsDir(file))) return false

  return true
}

// 构建统一路由处理器。
function createApiHandler(ctx) {
  return async (req, res) => {
    if (!isLoopback(req)) return json(res, 403, { error: 'forbidden: loopback only' })

    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname

    try {
      // ── pro规划配置 ──

      if (req.method === 'GET' && path === '/api/dsh-extra-plan-settings/pro-config') {
        const file = agentCordisPath(ctx)
        try {
          const { entry } = readExtraPlanConfig(file)
          if (!entry || !entry.config) {
            return json(res, 404, { error: 'extra-plan plugin not found in agent.cordis.yml' })
          }
          const config = entry.config
          // 读取 tool-web 的 fetch 配置
          const toolWebResult = readToolWebConfig(file)
          const webFetch = toolWebResult.entry && toolWebResult.entry.config 
            ? toolWebResult.entry.config.fetch === true 
            : false

          // 读取 tool-presentation 的 mode 配置
          const toolPresentationResult = readToolPresentationConfig(file)
          const toolPresentationMode = toolPresentationResult.entry && toolPresentationResult.entry.config 
            ? toolPresentationResult.entry.config.mode 
            : 'native'

          return json(res, 200, {
            plannerModel: typeof config.plannerModel === 'string' ? config.plannerModel : '',
            plannerPromptSuffix: typeof config.plannerPromptSuffix === 'string' ? config.plannerPromptSuffix : '',
            exploreBudget: typeof config.exploreBudget === 'number' ? config.exploreBudget : 0,
            anchoredBootstrap: config.anchoredBootstrap === true,
            webFetch: webFetch,
            toolPresentationMode: toolPresentationMode
          })
        } catch (err) {
          return json(res, 500, { error: 'failed to read agent.cordis.yml: ' + String((err && err.message) || err) })
        }
      }

      if (req.method === 'PUT' && path === '/api/dsh-extra-plan-settings/pro-config') {
        const body = await readJsonBody(req)

        // 验证 plannerModel 非空
        if (typeof body.plannerModel !== 'string' || body.plannerModel.trim() === '') {
          return json(res, 400, { error: 'plannerModel must be a non-empty string' })
        }
        // 验证 exploreBudget 为正整数
        const budget = Number(body.exploreBudget)
        if (!Number.isInteger(budget) || budget < 1) {
          return json(res, 400, { error: 'exploreBudget must be a positive integer' })
        }

        const file = agentCordisPath(ctx)
        try {
          const { plugins, entry } = readExtraPlanConfig(file)
          if (!entry) {
            return json(res, 404, { error: 'extra-plan plugin not found in agent.cordis.yml' })
          }

          // 原地修改
          entry.config.plannerModel = body.plannerModel.trim()
          entry.config.plannerPromptSuffix = typeof body.plannerPromptSuffix === 'string'
            ? body.plannerPromptSuffix
            : ''
          entry.config.exploreBudget = budget
          if (typeof body.anchoredBootstrap === 'boolean') {
            entry.config.anchoredBootstrap = body.anchoredBootstrap
          }

          // 写入 tool-web 的 fetch 配置
          if (typeof body.webFetch === 'boolean') {
            const toolWebResult = readToolWebConfig(file)
            if (toolWebResult.entry && toolWebResult.entry.config) {
              toolWebResult.entry.config.fetch = body.webFetch
            }
          }

          // 写入 tool-presentation 的 mode 配置
          if (typeof body.toolPresentationMode === 'string' && ['native', 'both', 'code'].includes(body.toolPresentationMode)) {
            const toolPresentationResult = readToolPresentationConfig(file)
            if (toolPresentationResult.entry && toolPresentationResult.entry.config) {
              toolPresentationResult.entry.config.mode = body.toolPresentationMode
            }
          }

          writeYaml(file, plugins)
          return json(res, 200, {
            plannerModel: entry.config.plannerModel,
            plannerPromptSuffix: entry.config.plannerPromptSuffix,
            exploreBudget: entry.config.exploreBudget,
            anchoredBootstrap: entry.config.anchoredBootstrap === true,
            webFetch: typeof body.webFetch === 'boolean' ? body.webFetch : false,
            toolPresentationMode: typeof body.toolPresentationMode === 'string' ? body.toolPresentationMode : 'native'
          })
        } catch (err) {
          return json(res, 500, { error: 'failed to write agent.cordis.yml: ' + String((err && err.message) || err) })
        }
      }

      // ── qqbot 状态检测 ──

      if (req.method === 'GET' && path === '/api/dsh-extra-plan-settings/qqbot-status') {
        try {
          const available = checkQqbotStatus(ctx)
          return json(res, 200, { available })
        } catch (err) {
          return json(res, 500, { error: 'failed to check qqbot status: ' + String((err && err.message) || err) })
        }
      }

      // ── qqbot 配置 ──

      if (req.method === 'GET' && path === '/api/dsh-extra-plan-settings/qqbot-config') {
        if (!checkQqbotStatus(ctx)) {
          return json(res, 404, { error: 'qqbot profile not available' })
        }
        const file = cordisPatchPath(ctx)
        try {
          const { entry } = readQqbotConfig(file)
          if (!entry || !entry.config) {
            return json(res, 404, { error: 'qqbot-user-questions not found in cordis.patch.yml' })
          }
          return json(res, 200, {
            approvalEnabled: entry.config.approvalEnabled === true
          })
        } catch (err) {
          return json(res, 500, { error: 'failed to read cordis.patch.yml: ' + String((err && err.message) || err) })
        }
      }

      if (req.method === 'PUT' && path === '/api/dsh-extra-plan-settings/qqbot-config') {
        if (!checkQqbotStatus(ctx)) {
          return json(res, 404, { error: 'qqbot profile not available' })
        }
        const body = await readJsonBody(req)

        // 验证 approvalEnabled 为布尔值
        if (typeof body.approvalEnabled !== 'boolean') {
          return json(res, 400, { error: 'approvalEnabled must be a boolean' })
        }

        const file = cordisPatchPath(ctx)
        try {
          const { patches, entry } = readQqbotConfig(file)
          if (!entry) {
            return json(res, 404, { error: 'qqbot-user-questions not found in cordis.patch.yml' })
          }

          entry.config.approvalEnabled = body.approvalEnabled
          writeYaml(file, patches)
          return json(res, 200, {
            approvalEnabled: entry.config.approvalEnabled
          })
        } catch (err) {
          return json(res, 500, { error: 'failed to write cordis.patch.yml: ' + String((err && err.message) || err) })
        }
      }

      // ── flash-guide 开关 ──

      if (req.method === 'GET' && path === '/api/dsh-extra-plan-settings/flash-guide-config') {
        try {
          const profiles = mainPluginProfiles(dshHomeDir(ctx))
          if (profiles.length === 0) {
            return json(res, 200, { available: false, disabled: false })
          }
          let allDisabled = true
          for (const profile of profiles) {
            const file = join(dshHomeDir(ctx), 'profiles', profile, 'cordis.patch.yml')
            const { item } = readFlashGuideConfig(file)
            if (!item || item.disabled !== true) {
              allDisabled = false
              break
            }
          }
          return json(res, 200, { available: true, disabled: allDisabled })
        } catch (err) {
          return json(res, 500, { error: 'failed to read flash-guide config: ' + String((err && err.message) || err) })
        }
      }

      if (req.method === 'PUT' && path === '/api/dsh-extra-plan-settings/flash-guide-config') {
        const body = await readJsonBody(req)
        if (typeof body.disabled !== 'boolean') {
          return json(res, 400, { error: 'disabled must be a boolean' })
        }
        try {
          const profiles = mainPluginProfiles(dshHomeDir(ctx))
          if (profiles.length === 0) {
            return json(res, 404, { error: 'extra-plan main plugin not installed in any profile' })
          }
          for (const profile of profiles) {
            const file = join(dshHomeDir(ctx), 'profiles', profile, 'cordis.patch.yml')
            const { list, item } = readFlashGuideConfig(file)
            if (item) {
              item.disabled = body.disabled
            } else {
              list.push({ id: 'flash-guide', disabled: body.disabled })
            }
            writeYaml(file, list)
          }
          return json(res, 200, { disabled: body.disabled })
        } catch (err) {
          return json(res, 500, { error: 'failed to write flash-guide config: ' + String((err && err.message) || err) })
        }
      }

      return json(res, 404, { error: 'not found' })
    } catch (error) {
      return json(res, 500, { error: String((error && error.message) || error) })
    }
  }
}

export function apply(ctx) {
  // 注册 settings 命名空间（回调式：settings 服务存在才注册，缺席优雅跳过——
  // 与官方 installSettingsSection 同构。host 平面挂载，宿主常驻服务，配置保存不依赖开会话）。
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.register(EXTRA_PLAN_NS, ExtraPlanSettingsSchema)
  })

  // 条件注册路由：仅在 webServer 可用时生效（优雅降级）。
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-extra-plan-settings',
      handler: createApiHandler(webCtx)
    }), 'dsh-extra-plan-settings: api route')
  })
}