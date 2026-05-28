import { PROVIDER_CONFIGS } from './shared/providers.mjs'

function isOriginAllowed(request) {
  const origin = request.headers.get('origin') || ''
  if (!origin) return false
  try {
    const url = new URL(origin)
    const host = url.hostname
    if (host === 'localhost' || host.endsWith('.netlify.app') || host.endsWith('.app')) return true
  } catch { return false }
  return false
}

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

  const { provider, messages, systemPrompt, thinking } = body
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

  if (!config.baseUrl) {
    return new Response(`Provider "${provider}" has no base URL. Set ${config.group === 'pro' ? 'PRO_BASE_URL' : config.group.toUpperCase() + '_BASE_URL'} in Netlify env vars.`, { status: 400 })
  }
  if (!config.model) {
    return new Response(`Provider "${provider}" has no model configured. Check environment variables.`, { status: 400 })
  }

  try {
    if (config.type === 'gemini') {
      return await proxyGemini(messages, config, apiKey, systemPrompt)
    }
    return await proxyOpenAI(messages, config, apiKey, systemPrompt, thinking)
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 })
  }
}

async function proxyOpenAI(messages, config, apiKey, systemPrompt, thinking) {
  const url = `${config.baseUrl}/chat/completions`
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (config.group === 'openrouter') {
    headers['HTTP-Referer'] = 'https://kalachat.app'
    headers['X-Title'] = 'KalaChat'
  }

  const fullMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const body = {
    model: config.model,
    messages: fullMessages,
    stream: true,
    max_tokens: 4096,
  }

  if (thinking) {
    body.reasoning_effort = 'high'
    body.thinking = { type: 'enabled' }
  } else {
    body.temperature = 0.7
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return new Response(text, { status: response.status })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''

  const readable = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') continue
            if (!data) continue

            try {
              const parsed = JSON.parse(data)
              const choice = parsed.choices?.[0]
              if (!choice) continue
              const delta = choice.delta || {}
              if (delta.reasoning_content) {
                const chunk = `data: ${JSON.stringify({ type: 'reasoning', text: delta.reasoning_content })}\n\n`
                controller.enqueue(encoder.encode(chunk))
              }
              const content = delta.content || choice.text || ''
              if (content) {
                const chunk = `data: ${JSON.stringify({ type: 'content', text: content })}\n\n`
                controller.enqueue(encoder.encode(chunk))
              }
            } catch { /* skip */ }
          }
        }
      } finally {
        reader.releaseLock()
        controller.close()
      }
    },
  })

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

async function proxyGemini(messages, config, apiKey, systemPrompt) {
  const url = `${config.baseUrl}/models/${config.model}:streamGenerateContent?key=${apiKey}`

  const body = {
    contents: messages,
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  }
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
