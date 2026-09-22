import { IDENTIDAD, MODELOS, API_KEYS_ENV, REPREBOT_BASE_URL, SEGUIMIENTO, SYSTEM_PROMPTS, API_DEFAULTS } from './constants.js'

let overrides = {}

export function setSettingsOverrides(next) {
  overrides = next || {}
}

/** Los placeholders del .env (sk-or-placeholder, AIza-placeholder, …) no son claves reales. */
function claveValida(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/placeholder/i.test(s)) return ''
  if (/^(sk-or-)?placeholder$/i.test(s)) return ''
  if (s === 'sk-placeholder') return ''
  return s
}

export function getApiKey(grupo) {
  return claveValida(overrides[grupo]?.apiKey) || claveValida(API_KEYS_ENV[grupo])
}

function modeloConfig(id) {
  const base = MODELOS[id]
  if (!base) return null
  return { id, ...base, apiKey: base.tipo === 'reprebot' ? getApiKey('reprebot') : getApiKey(base.grupo) }
}

export function getModelo(id) {
  return modeloConfig(id)
}

export function getModelos() {
  return Object.keys(MODELOS).map(modeloConfig)
}

/** El unico modelo disponible es Kala AI 4.3 (reprebot). */
export function modeloDisponible(id) {
  const cfg = MODELOS[id]
  if (!cfg) return false
  if (cfg.tipo === 'reprebot') return true
  return Boolean(getApiKey(cfg.grupo))
}

/** Historial recortado para no inflar el prompt del RAG. */
function historialReciente(mensajes, max = 4) {
  return mensajes
    .filter(m => m.content && !m.error)
    .slice(-max)
    .map(m => `${m.role === 'user' ? 'Usuario' : IDENTIDAD.nombre}: ${m.content.slice(0, 900)}`)
    .join('\n\n')
}

function preguntaConContexto(mensajes) {
  const pregunta = mensajes[mensajes.length - 1].content
  const previos = mensajes.slice(0, -1)
  if (previos.length === 0) return pregunta
  const hilo = historialReciente(previos)
  if (!hilo) return pregunta
  return `Conversacion previa:\n${hilo}\n\n${SEGUIMIENTO}\n${pregunta}`
}

function normalizarFuente(s) {
  return {
    docId: s?.doc_id || '',
    nombre: s?.doc_name || 'Documento',
    texto: s?.text || '',
    score: typeof s?.score === 'number' ? s.score : null,
    url: s?.source_url || '',
    tipo: s?.doc_type || '',
  }
}

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms))
}

/** Falla de red a nivel fetch (típico: Render despertando, corte de red, bloqueador). */
function esFalloRed(err) {
  if (err?.name === 'TypeError') return true
  return /networkerror|failed to fetch|fetch failed|load failed|network request failed|offline/i.test(err?.message || '')
}

function sinConexion() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/* ==========================================================================
   Reprebot · /v1/chat/completions
   SSE propio: {type:"sources"} → {type:"delta"} → {type:"done"}
   ========================================================================== */

async function* dialogarReprebot(mensajes, { signal, k }) {
  if (sinConexion()) {
    throw new Error('Sin conexión a internet. Revisa tu red e inténtalo de nuevo.')
  }

  const url = `${REPREBOT_BASE_URL}/v1/chat/completions`
  const headers = { 'Content-Type': 'application/json' }
  const apiKey = getApiKey('reprebot')
  if (apiKey) headers['X-Api-Key'] = apiKey

  const body = { messages: [{ role: 'user', content: preguntaConContexto(mensajes) }], stream: true }
  const cuerpoK = Number(k)
  if (Number.isFinite(cuerpoK)) body.k = Math.min(20, Math.max(1, Math.trunc(cuerpoK)))

  // Render duerme el servicio en inactividad: el primer intento puede fallar
  // a nivel red o con 502/503/504 mientras despierta. Se reintenta avisando.
  const ESPERAS = [3000, 10000]
  let res = null

  for (let intento = 0; ; intento++) {
    if (intento > 0) {
      yield { tipo: 'estado', texto: `El servidor está despertando… (intento ${intento + 1})` }
    }

    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
        mode: 'cors',
      })
    } catch (err) {
      if (signal?.aborted) throw err
      if (sinConexion()) {
        throw new Error('Sin conexión a internet. Revisa tu red e inténtalo de nuevo.')
      }
      if (intento < ESPERAS.length && esFalloRed(err)) {
        await esperar(ESPERAS[intento])
        continue
      }
      throw new Error('No se pudo contactar el servidor de Reprebot. Reintenta en un minuto.')
    }

    if ([502, 503, 504].includes(res.status)) {
      if (intento < ESPERAS.length && !signal?.aborted) {
        await esperar(ESPERAS[intento])
        continue
      }
    }
    break
  }

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    let mensaje = detalle
    try {
      const parsed = JSON.parse(detalle)
      if (typeof parsed?.detail === 'string') mensaje = parsed.detail
    } catch { /* respuesta sin JSON */ }
    throw new Error(`La API respondio ${res.status}${mensaje ? `: ${mensaje.slice(0, 200)}` : ''}`)
  }

  const content = res.headers.get('content-type') || ''

  // El servicio devuelve JSON plano cuando no hay stream disponible
  if (content.includes('application/json')) {
    const data = await res.json()
    const fuentes = (data.sources || []).map(normalizarFuente)
    if (fuentes.length) yield { tipo: 'fuentes', fuentes }
    if (data.answer) yield { tipo: 'texto', texto: data.answer }
    return
  }

  let fuentes = []

  // Se recorre el cuerpo a mano y se parsea linea por linea: una sola pasada
  // en vez de un generador de segundo nivel.
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += dec.decode(value, { stream: true })
      const lineas = buffer.split('\n')
      buffer = lineas.pop() || ''

      for (const linea of lineas) {
        const limpia = linea.trim()
        if (!limpia.startsWith('data:')) continue
        const payload = limpia.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        let evento
        try { evento = JSON.parse(payload) } catch { continue }

        if (evento.type === 'sources') {
          fuentes = (evento.sources || []).map(normalizarFuente)
          if (fuentes.length) yield { tipo: 'fuentes', fuentes }
        } else if (evento.type === 'delta') {
          if (evento.text) yield { tipo: 'texto', texto: evento.text }
        } else if (evento.type === 'done') {
          return
        }
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* ya liberado */ }
  }
}

/* ==========================================================================
   Proveedor OpenAI-compatible (Groq)
   ========================================================================== */

async function* leerSSE(reader) {
  const dec = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += dec.decode(value, { stream: true })

      const lineas = buffer.split('\n')
      buffer = lineas.pop() || ''

      for (const linea of lineas) {
        const limpia = linea.trim()
        if (!limpia.startsWith('data:')) continue
        const payload = limpia.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          yield JSON.parse(payload)
        } catch { /* fragmento invalido */ }
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* ya liberado */ }
  }
}

async function* dialogarOpenAI(mensajes, cfg, { signal }) {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.modelo,
      messages: mensajes,
      stream: true,
      temperature: API_DEFAULTS.temperature,
      max_tokens: API_DEFAULTS.maxTokens,
    }),
    signal,
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`Error de Groq (${res.status}): ${detalle.slice(0, 200)}`)
  }

  for await (const evento of leerSSE(res.body.getReader())) {
    const delta = evento.choices?.[0]?.delta || {}
    const texto = delta.content || ''
    if (texto) yield { tipo: 'texto', texto }
  }
}

/* ==========================================================================
   Entrada publica: Kala AI 4.3 (reprebot) es el unico modelo.
   ========================================================================== */

/**
 * Un turno de conversacion. Emite {tipo:'estado'|'razonamiento'|'texto'|'fuentes'}.
 * El reintento ante el arranque en frio de Render vive dentro de dialogarReprebot.
 */
export async function* dialogar(mensajes, { modelo = 'reprebot', signal, k } = {}) {
  const cfg = modeloConfig(modelo)
  if (!cfg) throw new Error(`Modelo "${modelo}" desconocido`)

  if (cfg.tipo === 'reprebot') {
    yield* dialogarReprebot(mensajes, { signal, k })
    return
  }

  if (sinConexion()) {
    throw new Error('Sin conexión a internet. Revisa tu red e inténtalo de nuevo.')
  }
  if (!cfg.apiKey) throw new Error(`Configura la clave de ${cfg.label} en Ajustes`)
  const messages = [
    { role: 'system', content: SYSTEM_PROMPTS[cfg.id] || SYSTEM_PROMPTS.reprebot },
    ...mensajes.map(m => ({ role: m.role, content: m.content || '' })),
  ]
  try {
    yield* dialogarOpenAI(messages, cfg, { signal })
  } catch (err) {
    if (signal?.aborted) throw err
    if (esFalloRed(err)) {
      throw new Error('No se pudo contactar Groq. Revisa tu conexión o reintenta en un minuto.')
    }
    throw err
  }
}