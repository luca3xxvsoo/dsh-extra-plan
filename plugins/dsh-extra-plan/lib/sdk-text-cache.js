// @local/dsh-extra-plan lib/sdk-text-cache.js
// agent-keyed、仅内存的 SDK 文本缓存；不持有 sessionId，也不缓存 PromptAssembly。

const hasOwn = Object.prototype.hasOwnProperty
const FINGERPRINT_FAILED = Symbol('sdk-schema-fingerprint-failed')

function isWeakKey(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
}

function numberTag(value) {
  if (Number.isNaN(value)) return 'NaN'
  if (value === Infinity) return '+Infinity'
  if (value === -Infinity) return '-Infinity'
  if (Object.is(value, -0)) return '-0'
  return String(value)
}

function isArrayIndexKey(key) {
  if (key === '') return false
  const number = Number(key)
  return Number.isInteger(number) && number >= 0 && number < 4294967295 && String(number) === key
}

// 只接受 renderer 可见的 JSON-like 数据；字段顺序、数组顺序、字段存在性均保留。
// 任何 getter、symbol、非枚举字段、循环引用或非 plain object 都保守地放弃签名。
function encode(value, active) {
  if (value === null) return ['null']
  if (value === undefined) return ['undefined']
  if (typeof value === 'boolean') return ['boolean', value]
  if (typeof value === 'string') return ['string', value]
  if (typeof value === 'number') return ['number', numberTag(value)]
  if (typeof value !== 'object') return FINGERPRINT_FAILED
  if (active.has(value)) return FINGERPRINT_FAILED
  active.add(value)
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value)
      const enumerableKeys = Object.keys(value)
      for (const key of ownKeys) {
        if (key === 'length') continue
        if (typeof key !== 'string' || !enumerableKeys.includes(key)) return FINGERPRINT_FAILED
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || descriptor.enumerable !== true) return FINGERPRINT_FAILED
      }
      const items = []
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index)
        if (!hasOwn.call(value, key)) {
          items.push(['hole'])
          continue
        }
        const encoded = encode(value[index], active)
        if (encoded === FINGERPRINT_FAILED) return FINGERPRINT_FAILED
        items.push(['value', encoded])
      }
      const extras = []
      for (const key of enumerableKeys) {
        if (isArrayIndexKey(key)) continue
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) return FINGERPRINT_FAILED
        const encoded = encode(value[key], active)
        if (encoded === FINGERPRINT_FAILED) return FINGERPRINT_FAILED
        extras.push([key, encoded])
      }
      return ['array', value.length, items, extras]
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== null && prototype !== Object.prototype) return FINGERPRINT_FAILED
    const ownKeys = Reflect.ownKeys(value)
    const enumerableKeys = Object.keys(value)
    for (const key of ownKeys) {
      if (typeof key !== 'string' || !enumerableKeys.includes(key)) return FINGERPRINT_FAILED
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || descriptor.enumerable !== true) return FINGERPRINT_FAILED
    }
    const properties = []
    for (const key of enumerableKeys) {
      const encoded = encode(value[key], active)
      if (encoded === FINGERPRINT_FAILED) return FINGERPRINT_FAILED
      properties.push([key, encoded])
    }
    return ['object', prototype === null ? 'null' : 'object', properties]
  } catch (error) {
    return FINGERPRINT_FAILED
  } finally {
    active.delete(value)
  }
}

export function sdkSchemasFingerprint(schemas) {
  try {
    const encoded = encode(schemas, new Set())
    if (encoded === FINGERPRINT_FAILED) return undefined
    return JSON.stringify(encoded)
  } catch (error) {
    return undefined
  }
}

export function sdkTextCacheEntryMatches(entry, fingerprint, language, renderer) {
  return entry !== null
    && typeof entry === 'object'
    && entry.fingerprint === fingerprint
    && entry.language === language
    && entry.renderer === renderer
}

function renderUncached(schemas, renderer) {
  return Promise.resolve()
    .then(() => {
      if (typeof renderer !== 'function') throw new TypeError('extra-plan: SDK renderer must be a function')
      return renderer(schemas)
    })
    .then((text) => {
      if (typeof text !== 'string') throw new TypeError('extra-plan: SDK renderer must return text')
      return text
    })
}

export function createSdkTextCache() {
  const entries = new WeakMap()

  function dispose(agent) {
    if (isWeakKey(agent)) entries.delete(agent)
  }

  function getOrCreate(agent, schemas, language, renderer) {
    const fingerprint = sdkSchemasFingerprint(schemas)
    if (!isWeakKey(agent) || fingerprint === undefined || typeof language !== 'string' || typeof renderer !== 'function') {
      return renderUncached(schemas, renderer)
    }

    const current = entries.get(agent)
    if (sdkTextCacheEntryMatches(current, fingerprint, language, renderer)) {
      if (hasOwn.call(current, 'text')) return Promise.resolve(current.text)
      if (current.promise !== undefined) return current.promise
    }

    const entry = { fingerprint, language, renderer, promise: undefined }
    entries.set(agent, entry)
    const promise = Promise.resolve()
      .then(() => renderer(schemas))
      .then((text) => {
        if (typeof text !== 'string') throw new TypeError('extra-plan: SDK renderer must return text')
        if (entries.get(agent) === entry) {
          delete entry.promise
          entry.text = text
        }
        return text
      })
      .catch((error) => {
        if (entries.get(agent) === entry) entries.delete(agent)
        throw error
      })
    entry.promise = promise
    return promise
  }

  return { getOrCreate, dispose }
}
