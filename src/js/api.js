import { parseSSEStream } from './utils.js'
import { API_DEFAULTS } from './constants.js'

function env(key) {
  return import.meta.env[key] || ''
}

const OPENROUTER_BASE = env('VITE_OPENROUTER_BASE_URL')

const ENV_KEYS = {
  openrouter: env('VITE_OPENROUTER_API_KEY'),
  gemini: env('VITE_GEMINI_API_KEY'),
  pro: env('VITE_PRO_API_KEY'),
}

const PROVIDER_CONFIGS = {
  'openrouter-free': {
    baseUrl: OPENROUTER_BASE,
    model: env('VITE_OPENROUTER_MODEL_FREE'),
    type: 'openai', label: 'OpenRouter', mode: 'free', badge: 'Mejor', group: 'openrouter',
  },
  'openrouter-nemotron': {
    baseUrl: OPENROUTER_BASE,
    model: env('VITE_OPENROUTER_MODEL_NEMOTRON'),
    type: 'openai', label: 'Nemotron 3 Super', mode: 'free', badge: null, group: 'openrouter',
  },
  'openrouter-gptoss': {
    baseUrl: OPENROUTER_BASE,
    model: env('VITE_OPENROUTER_MODEL_GPTOSS'),
    type: 'openai', label: 'GPT-OSS 120B', mode: 'free', badge: null, group: 'openrouter',
  },
  'openrouter-minimax': {
    baseUrl: OPENROUTER_BASE,
    model: env('VITE_OPENROUTER_MODEL_MINIMAX'),
    type: 'openai', label: 'Minimax M2.5', mode: 'free', badge: null, group: 'openrouter',
  },
  'openrouter-dolphin': {
    baseUrl: OPENROUTER_BASE,
    model: env('VITE_OPENROUTER_MODEL_DOLPHIN'),
    type: 'openai', label: 'Dolphin Mistral', mode: 'free', badge: 'Sin censura', group: 'openrouter',
  },
  gemini: {
    baseUrl: env('VITE_GEMINI_BASE_URL'),
    model: env('VITE_GEMINI_MODEL'),
    type: 'gemini', label: 'Gemini Flash', mode: 'free', badge: null, group: 'gemini',
  },
  v4: {
    baseUrl: env('VITE_PRO_BASE_URL'),
    model: env('VITE_PRO_MODEL_V4'),
    type: 'openai', label: 'Model v4', mode: 'pro', badge: null, group: 'pro',
  },
  'v4-pro': {
    baseUrl: env('VITE_PRO_BASE_URL'),
    model: env('VITE_PRO_MODEL_V4_PRO'),
    type: 'openai', label: 'Model v4 Pro', mode: 'pro', badge: null, group: 'pro',
  },
}

let settingsOverrides = {}

function getCustomApiKey(providerId, group) {
  if (settingsOverrides[group]?.apiKey) return settingsOverrides[group].apiKey
  if (settingsOverrides[providerId]?.apiKey) return settingsOverrides[providerId].apiKey
  return ''
}

export function getProviderConfig(providerId) {
  const base = PROVIDER_CONFIGS[providerId]
  if (!base) return null

  let apiKey = getCustomApiKey(providerId, base.group)
  if (!apiKey) apiKey = ENV_KEYS[base.group] || ''

  return { ...base, apiKey }
}

export function setSettingsOverrides(overrides) {
  settingsOverrides = overrides
}

export function getAvailableProviders(mode) {
  return Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.mode === mode)
    .map(([id]) => ({ id, ...getProviderConfig(id) }))
}

export function getDefaultProvider(mode) {
  const providers = getAvailableProviders(mode)
  return providers.length > 0 ? providers[0].id : null
}

export function isProviderConfigured(providerId) {
  const cfg = PROVIDER_CONFIGS[providerId]
  if (!cfg) return false
  if (getCustomApiKey(providerId, cfg.group)) return true
  if (ENV_KEYS[cfg.group]) return true
  return false
}

function toApiMessages(messages, providerType) {
  if (providerType === 'gemini') {
    return messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
  }
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

function extractContent(parsed, providerType) {
  if (providerType === 'gemini') {
    const candidates = parsed.candidates
    if (!candidates?.length) return ''
    return candidates[0].content?.parts?.[0]?.text || ''
  }
  return parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || ''
}

async function fetchStream(url, body, headers, signal) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Error API (${response.status}): ${text || response.statusText}`)
  }
  return response
}

export async function* streamChat(messages, { provider, signal } = {}) {
  const config = getProviderConfig(provider)
  if (!config) throw new Error(`Provider "${provider}" no configurado`)

  const apiMessages = toApiMessages(messages, config.type)

  if (!config.apiKey) {
    yield* streamViaProxy(apiMessages, provider, signal)
    return
  }

  if (config.type === 'gemini') {
    yield* streamGemini(apiMessages, config, signal)
  } else {
    yield* streamOpenAI(apiMessages, config, signal)
  }
}

async function* streamViaProxy(messages, provider, signal) {
  const body = { provider, messages }
  const customKey = getCustomApiKey(provider, PROVIDER_CONFIGS[provider]?.group)
  if (customKey) body.apiKey = customKey

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Error API (${response.status}): ${text || response.statusText}`)
  }

  const cfg = PROVIDER_CONFIGS[provider]
  const reader = response.body.getReader()

  for await (const data of parseSSEStream(reader)) {
    if (!data) continue
    try {
      const parsed = JSON.parse(data)
      const text = extractContent(parsed, cfg?.type)
      if (text) yield text
    } catch { /* skip unparseable */ }
  }
}

async function* streamOpenAI(messages, config, signal) {
  const url = `${config.baseUrl}/chat/completions`
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
  }
  if (config.group === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'KalaChat'
  }

  const response = await fetchStream(url, {
    model: config.model,
    messages,
    stream: true,
    temperature: API_DEFAULTS.temperature,
    max_tokens: API_DEFAULTS.maxTokens,
  }, headers, signal)

  for await (const data of parseSSEStream(response.body.getReader())) {
    if (!data) continue
    try {
      const parsed = JSON.parse(data)
      const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || ''
      if (delta) yield delta
    } catch { /* skip */ }
  }
}

async function* streamGemini(messages, config, signal) {
  const url = `${config.baseUrl}/models/${config.model}:streamGenerateContent?key=${config.apiKey}`
  const response = await fetchStream(url, {
    contents: messages,
    generationConfig: { temperature: API_DEFAULTS.temperature, maxOutputTokens: API_DEFAULTS.maxTokens },
  }, {}, signal)

  for await (const data of parseSSEStream(response.body.getReader())) {
    if (!data) continue
    try {
      const parsed = JSON.parse(data)
      const candidates = parsed.candidates
      if (!candidates?.length) continue
      const text = candidates[0].content?.parts?.[0]?.text
      if (text) yield text
    } catch { /* skip */ }
  }
}

export async function chatCompletion(messages, { provider, signal } = {}) {
  let full = ''
  for await (const chunk of streamChat(messages, { provider, signal })) {
    full += chunk
  }
  return full
}
