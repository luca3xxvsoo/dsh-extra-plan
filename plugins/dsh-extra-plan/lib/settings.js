// Host half of dsh-extra-plan-settings.
// Agent settings are described and patched by preset-settings.js.
// qqbot 自愈见独立插件 dsh-qqbot-user-questions（精简版），本设置页不涉及 qqbot。

import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import {
  SETTING_DEFINITIONS,
  TOOL_PRESENTATION_MODES,
  getSettingDefinition,
  parsePresetYaml,
  patchYamlScalar,
  publicSettingMetadata,
  validateSettingValue,
  normalizeSettingValue,
} from './preset-settings.js'

export const name = 'dsh-extra-plan-settings'
export const inject = []
export { TOOL_PRESENTATION_MODES }

const EXTRA_PLAN_NS = 'dsh-extra-plan'
const ExtraPlanSettingsSchema = z.object({})
const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_AGENT_FILE = join(HERE, '..', 'assets', 'presets', 'extra-plan', 'agent.cordis.yml')

function dshHomeDir() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
}

function agentCordisPath() {
  return join(dshHomeDir(), '.agent-presets', 'extra-plan', 'agent.cordis.yml')
}

function isLoopback(req) {
  const addr = req.socket && req.socket.remoteAddress
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      chunks.push(chunk)
      size += chunk.length
      if (size > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new Error('invalid JSON body')) }
    })
    req.on('error', reject)
  })
}

function readAgentMetadata(file) {
  const actualText = readFileSync(file, 'utf8')
  let defaultText = actualText
  try { defaultText = readFileSync(TEMPLATE_AGENT_FILE, 'utf8') } catch { /* installed package may be incomplete */ }
  return publicSettingMetadata(defaultText, actualText)
}

function proPayload(file) {
  const metadata = readAgentMetadata(file)
  return { ...metadata, ...metadata.values }
}

function writeTextAtomic(file, text) {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  const tmp = file + '.tmp-' + process.pid
  try {
    writeFileSync(tmp, text, 'utf8')
    renameSync(tmp, file)
  } catch (error) {
    try { rmSync(tmp, { force: true }) } catch { /* preserve original error */ }
    throw error
  }
}

function patchManagedFile(file, entries) {
  let text = readFileSync(file, 'utf8')
  for (const entry of entries) {
    const patched = patchYamlScalar(text, entry.definition, entry.value)
    if (!patched.ok) throw new Error(entry.definition.key + ' ' + patched.reason)
    text = patched.text
  }
  writeTextAtomic(file, text)
}

function createApiHandler() {
  return async (req, res) => {
    if (!isLoopback(req)) return json(res, 403, { error: 'forbidden: loopback only' })
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname
    try {
      if (req.method === 'GET' && path === '/api/dsh-extra-plan-settings/pro-config') {
        const file = agentCordisPath()
        try { return json(res, 200, proPayload(file)) }
        catch (error) {
          return json(res, 500, { error: 'failed to read agent.cordis.yml: ' + String(error && error.message || error) })
        }
      }

      if (req.method === 'PUT' && path === '/api/dsh-extra-plan-settings/pro-config') {
        const body = await readJsonBody(req)
        const input = body !== null && typeof body === 'object' ? body : {}
        const model = getSettingDefinition('plannerModel')
        const budget = getSettingDefinition('exploreBudget')
        if (!validateSettingValue(model, input.plannerModel)) {
          return json(res, 400, { error: 'plannerModel must be a non-empty string' })
        }
        if (!validateSettingValue(budget, input.exploreBudget)) {
          return json(res, 400, { error: 'exploreBudget must be a positive integer' })
        }
        const entries = []
        for (const definition of SETTING_DEFINITIONS) {
          if (definition.ui.separate !== undefined || !Object.prototype.hasOwnProperty.call(input, definition.key)) continue
          if (!validateSettingValue(definition, input[definition.key])) {
            return json(res, 400, { error: definition.key + ' has an invalid value' })
          }
          entries.push({ definition, value: normalizeSettingValue(definition, input[definition.key]) })
        }
        try {
          patchManagedFile(agentCordisPath(), entries)
          return json(res, 200, proPayload(agentCordisPath()))
        } catch (error) {
          const message = String(error && error.message || error)
          const status = message.includes(' missing') || message.includes(' ambiguous') ? 404 : 500
          return json(res, status, { error: 'failed to write agent.cordis.yml: ' + message })
        }
      }

      return json(res, 404, { error: 'not found' })
    } catch (error) {
      return json(res, 500, { error: String(error && error.message || error) })
    }
  }
}

export function apply(ctx) {
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.register(EXTRA_PLAN_NS, ExtraPlanSettingsSchema)
  })
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-extra-plan-settings',
      handler: createApiHandler(),
    }), 'dsh-extra-plan-settings: api route')
  })
}
