import { parseSSEStream } from './utils.js'
import { API_DEFAULTS, SYSTEM_PROMPTS } from './constants.js'

const OPENROUTER_BASE = import.meta.env.VITE_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'

const ENV_KEYS = {
  openrouter: import.meta.env.VITE_OPENROUTER_API_KEY || '',
  gemini: import.meta.env.VITE_GEMINI_API_KEY || '',
  pro: import.meta.env.VITE_PRO_API_KEY || '',
}

const PROVIDER_CONFIGS = {
  'openrouter-free': {
    baseUrl: OPENROUTER_BASE,
    model: import.meta.env.VITE_OPENROUTER_MODEL_FREE || 'openrouter/free',
    type: 'openai', label: 'KALA OpenRouter', mode: 'free', badge: 'Mejor', group: 'openrouter',
  },
  'openrouter-nemotron': {
    baseUrl: OPENROUTER_BASE,
    model: import.meta.env.VITE_OPENROUTER_MODEL_NEMOTRON || 'nvidia/nemotron-3-super-120b-a12b:free',
    type: 'openai', label: 'Nemotron 3', mode: 'free', badge: null, group: 'openrouter',
  },
  'openrouter-gptoss': {
    baseUrl: OPENROUTER_BASE,
    model: import.meta.env.VITE_OPENROUTER_MODEL_GPTOSS || 'openai/gpt-oss-120b:free',
    type: 'openai', label: 'GPT-OSS', mode: 'free', badge: null, group: 'openrouter',
  },
  'openrouter-minimax': {
    baseUrl: OPENROUTER_BASE,
    model: import.meta.env.VITE_OPENROUTER_MODEL_MINIMAX || 'minimax/minimax-m2.5:free',
    type: 'openai', label: 'Minimax', mode: 'free', badge: null, group: 'openrouter',
  },
  'openrouter-dolphin': {
    baseUrl: OPENROUTER_BASE,
    model: import.meta.env.VITE_OPENROUTER_MODEL_DOLPHIN || 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    type: 'openai', label: 'Dolphin', mode: 'free', badge: 'Sin censura', group: 'openrouter',
  },
  gemini: {
    baseUrl: import.meta.env.VITE_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash',
    type: 'gemini', label: 'Gemini Flash', mode: 'free', badge: null, group: 'gemini',
  },
  v4: {
    baseUrl: import.meta.env.VITE_PRO_BASE_URL || 'https://api.deepseek.com',
    model: import.meta.env.VITE_PRO_MODEL_V4 || 'deepseek-chat',
    type: 'openai', label: 'KALA PRO Flash', mode: 'pro', badge: 'Flash', group: 'pro',
  },
  'v4-pro': {
    baseUrl: import.meta.env.VITE_PRO_BASE_URL || 'https://api.deepseek.com',
    model: import.meta.env.VITE_PRO_MODEL_V4_PRO || 'deepseek-reasoner',
    type: 'openai', label: 'KALA PRO²', mode: 'pro', badge: 'PRO²', group: 'pro',
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
  return getAllProviders().filter(p => p.mode === mode)
}

export function getAllProviders() {
  return Object.entries(PROVIDER_CONFIGS)
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
  return true
}

function buildParts(msg) {
  const parts = [{ text: msg.content || '' }]
  if (msg.images?.length) {
    for (const img of msg.images) {
      parts.push({ inlineData: { mimeType: img.mime, data: img.base64 } })
    }
  }
  return parts
}

function buildContent(msg) {
  const content = [{ type: 'text', text: msg.content || '' }]
  if (msg.images?.length) {
    for (const img of msg.images) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${img.mime};base64,${img.base64}` },
      })
    }
  }
  return content
}

function toApiMessages(messages, providerType) {
  if (providerType === 'gemini') {
    return messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: buildParts(m),
    }))
  }
  return messages.map((m) => {
    if (m.images?.length) {
      return { role: m.role, content: buildContent(m) }
    }
    return { role: m.role, content: m.content }
  })
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

function getSystemPrompt(providerId) {
  return SYSTEM_PROMPTS[providerId] || SYSTEM_PROMPTS['openrouter-free']
}

export async function* streamChat(messages, { provider, signal, thinking } = {}) {
  const config = getProviderConfig(provider)
  if (!config) throw new Error(`Provider "${provider}" no configurado`)

  const systemPrompt = getSystemPrompt(provider)
  const apiMessages = toApiMessages(messages, config.type)

  if (!config.apiKey) {
    yield* streamViaProxy(apiMessages, provider, systemPrompt, signal, thinking)
    return
  }

  if (config.type === 'gemini') {
    yield* streamGemini(apiMessages, config, systemPrompt, signal)
  } else {
    const messagesWithSystem = [{ role: 'system', content: systemPrompt }, ...apiMessages]
    yield* streamOpenAI(messagesWithSystem, config, signal, thinking)
  }
}

async function* streamViaProxy(messages, provider, systemPrompt, signal, thinking) {
  const body = { provider, messages, systemPrompt }
  if (thinking) body.thinking = true
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

  for await (const data of parseSSEStream(response.body.getReader())) {
    if (!data) continue
    try {
      const parsed = JSON.parse(data)
      if (parsed.type === 'reasoning') {
        if (parsed.text) yield { type: 'reasoning', text: parsed.text }
      } else if (parsed.type === 'content') {
        if (parsed.text) yield { type: 'content', text: parsed.text }
      }
    } catch { /* skip */ }
  }
}

async function* streamOpenAI(messages, config, signal, thinking) {
  const url = `${config.baseUrl}/chat/completions`
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
  }
  if (config.group === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'KalaChat'
  }

  const body = {
    model: config.model,
    messages,
    stream: true,
    max_tokens: API_DEFAULTS.maxTokens,
  }

  if (thinking) {
    body.reasoning_effort = 'high'
    body.thinking = { type: 'enabled' }
  } else {
    body.temperature = API_DEFAULTS.temperature
  }

  const response = await fetchStream(url, body, headers, signal)

  for await (const data of parseSSEStream(response.body.getReader())) {
    if (!data) continue
    try {
      const parsed = JSON.parse(data)
      const choice = parsed.choices?.[0]
      if (!choice) continue
      const delta = choice.delta || {}
      if (delta.reasoning_content) {
        yield { type: 'reasoning', text: delta.reasoning_content }
      }
      const content = delta.content || choice.text || ''
      if (content) yield { type: 'content', text: content }
    } catch { /* skip */ }
  }
}

async function* streamGemini(messages, config, systemPrompt, signal) {
  const url = `${config.baseUrl}/models/${config.model}:streamGenerateContent?key=${config.apiKey}`
  const response = await fetchStream(url, {
    contents: messages,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: API_DEFAULTS.temperature, maxOutputTokens: API_DEFAULTS.maxTokens },
  }, {}, signal)

  for await (const data of parseSSEStream(response.body.getReader())) {
    if (!data) continue
    try {
      const parsed = JSON.parse(data)
      const candidates = parsed.candidates
      if (!candidates?.length) continue
      const text = candidates[0].content?.parts?.[0]?.text
      if (text) yield { type: 'content', text }
    } catch { /* skip */ }
  }
}

export async function chatCompletion(messages, { provider, signal } = {}) {
  let full = ''
  for await (const chunk of streamChat(messages, { provider, signal })) {
    if (chunk.type === 'content') full += chunk.text
  }
  return full
}
