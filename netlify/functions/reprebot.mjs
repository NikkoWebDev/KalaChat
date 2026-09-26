// Proxy mismo-origen hacia el backend RAG de Reprebot.
//
// Por qué existe: el backend tiene allowlist de orígenes CORS, así que el
// navegador solo puede llamarlo directo desde orígenes permitidos
// (http://localhost:5173). Esta función reenvía servidor-a-servidor, donde
// no aplica CORS, y devuelve el stream tal cual al frontend.
//
// La clave personal (X-Api-Key) viaja solo navegador→función→backend.

const BASE = (process.env.REPREBOT_BASE_URL || 'https://api2.nikko.dev').replace(/\/+$/, '')

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid request body', { status: 400 })
  }

  const headers = { 'Content-Type': 'application/json' }
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) headers['X-Api-Key'] = apiKey

  let upstream
  try {
    upstream = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
