import { PROVIDER_CONFIGS } from './shared/providers.mjs'

const ALLOWED_ORIGINS = [
  'https://kalachat.app',
  'https://kalachat.netlify.app',
  'http://localhost:5173',
  'http://localhost:4321',
]

const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 30
const requestLog = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const entry = requestLog.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    requestLog.set(ip, { windowStart: now, count: 1 })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT_MAX
}

function isOriginAllowed(request) {
  const origin = request.headers.get('origin') || request.headers.get('referer') || ''
  if (!origin) return false
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!isOriginAllowed(req)) {
    return new Response('Forbidden', { status: 403 })
  }

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  if (isRateLimited(ip)) {
    return new Response('Too many requests', { status: 429 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid request body', { status: 400 })
  }

  const { provider, messages } = body
  if (!provider || !messages) {
    return new Response('Missing provider or messages', { status: 400 })
  }

  const config = PROVIDER_CONFIGS[provider]
  if (!config) {
    return new Response(`Unknown provider: ${provider}`, { status: 400 })
  }

  const group = config.group
  const apiKey = body.apiKey || process.env[`API_KEY_${group.toUpperCase()}`] || ''
  if (!apiKey) {
    return new Response(`API key not configured for ${config.group}`, {
      status: 503,
    })
  }

  if (config.type === 'gemini') {
    return proxyGemini(messages, config, apiKey)
  }
  return proxyOpenAI(messages, config, apiKey)
}

async function proxyOpenAI(messages, config, apiKey) {
  const url = `${config.baseUrl}/chat/completions`
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (config.group === 'openrouter') {
    headers['HTTP-Referer'] = 'https://kalachat.app'
    headers['X-Title'] = 'KalaChat'
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

async function proxyGemini(messages, config, apiKey) {
  const url = `${config.baseUrl}/models/${config.model}:streamGenerateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

export const config = {
  path: '/api/chat',
}
