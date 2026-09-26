// Proxy mismo-origen hacia el backend RAG de Reprebot (Vercel Serverless).
// Mismo propósito que netlify/functions/reprebot.mjs: saltarse la allowlist
// de orígenes CORS del backend reenviando servidor-a-servidor.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const base = (process.env.REPREBOT_BASE_URL || 'https://api2.nikko.dev').replace(/\/+$/, '')
  const headers = { 'Content-Type': 'application/json' }
  const apiKey = req.headers['x-api-key']
  if (apiKey) headers['X-Api-Key'] = apiKey

  let upstream
  try {
    upstream = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body ?? {}),
    })
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`)
    return
  }

  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
    'Cache-Control': 'no-cache',
  })

  if (!upstream.body) {
    res.end()
    return
  }
  const reader = upstream.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
  } finally {
    try { reader.releaseLock() } catch { /* ya liberado */ }
    res.end()
  }
}
