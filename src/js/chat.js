import { escapeHtml } from './utils.js'
import { IDENTIDAD } from './constants.js'

let marked
let DOMPurify
let Prism
let listo = false

async function cargarMarked() {
  if (marked) return
  const mod = await import('marked')
  marked = mod.marked
  DOMPurify = (await import('dompurify')).default
}

async function cargarPrism() {
  if (Prism) return
  const mod = await import('prismjs')
  Prism = mod.default
  await Promise.all([
    import('prismjs/components/prism-javascript'),
    import('prismjs/components/prism-typescript'),
    import('prismjs/components/prism-python'),
    import('prismjs/components/prism-css'),
    import('prismjs/components/prism-json'),
    import('prismjs/components/prism-bash'),
    import('prismjs/components/prism-jsx'),
    import('prismjs/components/prism-tsx'),
    import('prismjs/components/prism-markup'),
    import('prismjs/components/prism-sql'),
    import('prismjs/components/prism-java'),
    import('prismjs/components/prism-c'),
    import('prismjs/components/prism-go'),
    import('prismjs/components/prism-rust'),
    import('prismjs/components/prism-yaml'),
  ])
}

const ALIAS = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', html: 'markup', xml: 'markup', yml: 'yaml' }

function resaltar(codigo, lang) {
  const idioma = ALIAS[lang] || lang
  if (Prism?.languages?.[idioma]) {
    try {
      return Prism.highlight(codigo, Prism.languages[idioma], idioma)
    } catch { /* cae al escape plano */ }
  }
  return escapeHtml(codigo)
}

const ICONO_COPIAR = '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 10H2a1 1 0 01-1-1V2a1 1 0 011-1h7a1 1 0 011 1v1M5 13h7a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v7a1 1 0 001 1z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const ICONO_OK = '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

export async function initRenderer() {
  if (listo) return
  await cargarMarked()
  await cargarPrism().catch(() => {})
  const renderer = new marked.Renderer()

  renderer.code = function ({ text, lang }) {
    const idioma = (lang || 'texto').toLowerCase()
    return `<div class="code-wrap">
      <div class="code-head">
        <span>${escapeHtml(idioma)}</span>
        <button class="code-copy-btn msg-action" type="button" data-accion="copiar-codigo">${ICONO_COPIAR}<span>Copiar</span></button>
      </div>
      <pre><code class="language-${escapeHtml(idioma)}">${resaltar(text, idioma)}</code></pre>
    </div>`
  }

  renderer.codespan = function ({ text }) {
    return `<code>${escapeHtml(text)}</code>`
  }

  marked.setOptions({ renderer, breaks: true, gfm: true })
  listo = true
}

export async function markdown(texto) {
  if (!texto) return ''
  await cargarMarked()
  await cargarPrism().catch(() => {})
  const bruto = await marked.parse(texto)
  const limpio = DOMPurify.sanitize(bruto, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'a', 'ul', 'ol', 'li', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span', 'button', 'sup', 'sub',
      'svg', 'path',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-accion', 'data-cita', 'aria-hidden', 'aria-expanded', 'stroke', 'fill', 'viewBox', 'width', 'height', 'd', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
  })
  // El modelo marca sus referencias como 【3】; se vuelven chips que saltan a la fuente.
  return limpio.replace(/【(\d+)】/g, (_, n) => `<sup class="cita" data-cita="${n}">${n}</sup>`)
}

/* ------------------------------------------------------------------ */
/* Fuentes citadas                                                     */
/* ------------------------------------------------------------------ */

export function bloqueFuentes(fuentes) {
  if (!fuentes?.length) return ''
  const items = fuentes.map((f, i) => {
    const etiqueta = f.url ? 'a' : 'span'
    const attrs = f.url ? ` href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer"` : ''
    const score = f.score != null ? `<span class="fuente-score">${f.score.toFixed(2)}</span>` : ''
    const chevron = f.texto
      ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : ''
    return `<div class="fuente" data-fuente="${i + 1}">
      <div class="fuente-head">
        <span class="fuente-num">${i + 1}</span>
        <${etiqueta} class="fuente-nombre"${attrs}>${escapeHtml(f.nombre)}</${etiqueta}>
        ${score}
        ${f.texto ? `<button class="fuente-toggle" type="button" data-accion="ver-fuente" aria-expanded="false" aria-label="Ver fragmento">${chevron}</button>` : ''}
      </div>
      ${f.texto ? `<div class="fuente-texto" hidden>${escapeHtml(f.texto)}</div>` : ''}
    </div>`
  }).join('')

  return `<div class="fuentes">
    <div class="fuentes-titulo">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 1.5h5.5L10 4v6.5H2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M3.5 5h5M3.5 7h5M3.5 9h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      Fuentes · ${fuentes.length}
    </div>
    ${items}
  </div>`
}

/* ------------------------------------------------------------------ */
/* Razonamiento                                                        */
/* ------------------------------------------------------------------ */

export function bloqueRazonamiento(texto) {
  if (!texto) return ''
  return `<details class="razonamiento">
    <summary class="razonamiento-cabeza">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>Razonamiento</span>
    </summary>
    <div class="razonamiento-texto">${escapeHtml(texto)}</div>
  </details>`
}

/* ------------------------------------------------------------------ */
/* Mensajes                                                            */
/* ------------------------------------------------------------------ */

function hora(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function acciones(rol) {
  if (rol === 'assistant') {
    return `<div class="msg-tools">
      <button class="msg-action" type="button" data-accion="copiar">${ICONO_COPIAR}<span>Copiar</span></button>
      <button class="msg-action" type="button" data-accion="regenerar">Rehacer</button>
      <span class="msg-hora" data-hora>${''}</span>
    </div>`
  }
  return `<div class="msg-tools">
    <span class="msg-hora" data-hora>${''}</span>
    <button class="msg-action" type="button" data-accion="editar">Editar</button>
  </div>`
}

function avatar(rol) {
  if (rol === 'assistant') {
    return `<div class="msg-avatar" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.7 4.3 4.3 1.7-4.3 1.7L8 13.5 6.3 9.2 2 7.5l4.3-1.7z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
    </div>`
  }
  return ''
}

function nombre(rol, msg) {
  if (rol !== 'assistant') return ''
  const modelo = msg.modelo && msg.modelo !== 'reprebot' ? `· ${msg.modeloLabel || msg.modelo}` : ''
  return `<div class="msg-name"><span>${IDENTIDAD.nombre}</span>${modelo ? `<span class="sello">${escapeHtml(modelo.replace('· ', ''))}</span>` : ''}</div>`
}

export async function crearMensaje(msg) {
  const fila = document.createElement('div')
  fila.className = `msg-row ${msg.role === 'user' ? 'usuario' : 'asistente'}`
  fila.dataset.id = msg.id

  const cuerpo = msg.role === 'assistant'
    ? await markdown(msg.content)
    : escapeHtml(msg.content || '').replace(/\n/g, '<br>')

  const extra = msg.role === 'assistant'
    ? bloqueRazonamiento(msg.reasoning) + bloqueFuentes(msg.sources)
    : ''

  fila.innerHTML = `
    ${avatar(msg.role)}
    <div class="msg-col">
      ${nombre(msg.role, msg)}
      <div class="msg-body">${extra}${cuerpo}</div>
      ${acciones(msg.role)}
    </div>`
  fila.querySelector('[data-hora]').textContent = hora(msg.timestamp)
  return fila
}

export function crearMensajeStreaming(id, msg = {}) {
  const fila = document.createElement('div')
  fila.className = 'msg-row asistente'
  fila.dataset.id = id
  fila.innerHTML = `
    ${avatar('assistant')}
    <div class="msg-col">
      ${nombre('assistant', msg)}
      <div class="msg-body">
        <div data-zona-razonamiento></div>
        <div data-zona-texto><span class="escribiendo"><span class="punto"></span><span class="punto"></span><span class="punto"></span></span></div>
        <div data-zona-fuentes></div>
      </div>
      ${acciones('assistant')}
    </div>`
  fila.querySelector('[data-hora]').textContent = hora()
  return fila
}

export function escribirEscribiendo(fila, activo) {
  const zona = fila.querySelector('[data-zona-texto]')
  if (!zona) return
  zona.innerHTML = activo
    ? '<span class="escribiendo"><span class="punto"></span><span class="punto"></span><span class="punto"></span></span>'
    : ''
}

/** Aviso transitorio (p. ej. servidor despertando). Se borra al llegar texto. */
export function pintarEstado(fila, texto) {
  const zona = fila.querySelector('[data-zona-texto]')
  if (!zona) return
  zona.innerHTML = `<span class="estado-conexion">${escapeHtml(texto)}</span><span class="escribiendo"><span class="punto"></span><span class="punto"></span><span class="punto"></span></span>`
}

export async function pintarTexto(fila, texto, enCurso) {
  const zona = fila.querySelector('[data-zona-texto]')
  if (!zona) return
  const html = await markdown(texto)
  zona.innerHTML = html + (enCurso ? '<span class="cursor-stream"></span>' : '')
}

export function pintarFuentes(fila, fuentes) {
  const zona = fila.querySelector('[data-zona-fuentes]')
  if (zona) zona.innerHTML = bloqueFuentes(fuentes)
}

export function pintarRazonamiento(fila, texto) {
  const zona = fila.querySelector('[data-zona-razonamiento]')
  if (zona) zona.innerHTML = bloqueRazonamiento(texto)
}

export function limpiarStreaming(fila) {
  fila.querySelector('[data-zona-texto]')?.querySelector('.cursor-stream')?.remove()
}

export function etiquetaModelo(id) {
  return id
}

export function formatoFecha(ts) {
  const d = new Date(ts)
  const dias = Math.floor((Date.now() - d) / 86400000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias} días`
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}