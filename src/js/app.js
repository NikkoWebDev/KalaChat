import { dialogar, getModelo, setSettingsOverrides } from './api.js'
import {
  initRenderer, crearMensaje, crearMensajeStreaming, pintarTexto, pintarFuentes,
  pintarRazonamiento, pintarEstado, escribirEscribiendo, formatoFecha, markdown,
} from './chat.js'
import { escapeHtml, copiar, descargar, slug, cercaDelFondo, alFondo, textoDeMensaje } from './utils.js'
import { STORAGE_KEYS, DEFAULTS, UI, IDENTIDAD, SUGERENCIAS, MODELOS } from './constants.js'

const $ = sel => document.querySelector(sel)
const $$ = sel => document.querySelectorAll(sel)

let estado = { ...DEFAULTS, conversaciones: [] }
let adjuntos = []
let abortador = null
let generando = false
let convActual = null

const el = {}

const ICONO_ENVIAR = '<path d="M2.5 10L17 3.5 12 16l-2.6-4.6L2.5 10z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
const ICONO_PARAR = '<rect x="6" y="6" width="8" height="8" rx="1.5" fill="currentColor"/>'

/* ------------------------------------------------------------------ */
/* Estado persistente                                                  */
/* ------------------------------------------------------------------ */

function cargarEstado() {
  try {
    const bruto = localStorage.getItem(STORAGE_KEYS.STATE)
    if (bruto) {
      const guardado = JSON.parse(bruto)
      estado = { ...DEFAULTS, ...guardado, conversaciones: guardado.conversaciones || [] }
    }
  } catch { /* arranca limpio */ }

  if (!getModelo(estado.modelo)) estado.modelo = DEFAULTS.modelo
  convActual = estado.conversaciones.find(c => c.id === estado.currentId) || null
}

function guardarEstado() {
  try {
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify({
      theme: estado.theme,
      k: estado.k,
      modelo: estado.modelo,
      currentId: estado.currentId,
      conversaciones: estado.conversaciones.map(c => ({
        ...c,
        messages: c.messages.slice(-UI.maxStoredMessages),
      })),
    }))
  } catch { /* cuota llena o modo privado */ }
}

function guardarAjustes(payload) {
  try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(payload)) } catch { /* ignora */ }
}

function leerAjustes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}') } catch { return {} }
}

/* ------------------------------------------------------------------ */
/* Conversaciones                                                      */
/* ------------------------------------------------------------------ */

function nuevaConversacion() {
  const id = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const conv = {
    id,
    title: 'Nueva conversacion',
    messages: [],
    modelo: estado.modelo,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  estado.conversaciones.unshift(conv)
  estado.currentId = id
  convActual = conv
  guardarEstado()
  pintarLista()
  pintarMensajes()
  return conv
}

function abrirConversacion(id) {
  estado.currentId = id
  convActual = estado.conversaciones.find(c => c.id === id) || null
  guardarEstado()
  pintarLista()
  pintarMensajes()
  cerrarMenu()
}

function borrarConversacion(id, ev) {
  ev?.stopPropagation()
  const conv = estado.conversaciones.find(c => c.id === id)
  if (!conv) return
  if (conv.messages.length && !confirm(`¿Borrar "${conv.title}"? No se puede deshacer.`)) return

  estado.conversaciones = estado.conversaciones.filter(c => c.id !== id)
  if (estado.currentId === id) {
    const siguiente = estado.conversaciones[0]
    estado.currentId = siguiente?.id || null
    convActual = siguiente || null
  }
  guardarEstado()
  pintarLista()
  if (!convActual) nuevaConversacion()
  else pintarMensajes()
}

function renombrarConversacion(id) {
  const conv = estado.conversaciones.find(c => c.id === id)
  if (!conv) return
  const nuevo = prompt('Nuevo titulo', conv.title)
  if (!nuevo || !nuevo.trim()) return
  conv.title = nuevo.trim().slice(0, 80)
  guardarEstado()
  pintarLista()
}

function tituloDesde(texto) {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (!limpio) return 'Nueva conversacion'
  return limpio.length > UI.titleTruncateLength
    ? limpio.slice(0, UI.titleTruncateLength).trimEnd() + '…'
    : limpio
}

/* ------------------------------------------------------------------ */
/* Pintado                                                             */
/* ------------------------------------------------------------------ */

function pintarLista() {
  const cont = el.lista
  if (!cont) return

  const consulta = el.buscar?.value.trim().toLowerCase() || ''
  const visibles = estado.conversaciones.filter(c => {
    if (!consulta) return true
    return c.title.toLowerCase().includes(consulta) ||
      c.messages.some(m => m.content?.toLowerCase().includes(consulta))
  })

  if (!visibles.length) {
    cont.innerHTML = `<p class="px-3 py-6 text-center text-[12px]" style="color:var(--fg-suave)">${consulta ? 'Sin coincidencias' : 'Aun no hay conversaciones'}</p>`
    return
  }

  cont.innerHTML = visibles.map(c => {
    const modelo = MODELOS[c.modelo]?.label || IDENTIDAD.nombre
    return `<div class="conv-item" role="button" tabindex="0" data-id="${escapeHtml(c.id)}" aria-current="${c.id === estado.currentId}">
      <div class="conv-titulo">${escapeHtml(c.title)}</div>
      <div class="conv-meta"><span>${escapeHtml(formatoFecha(c.updatedAt))}</span><span>·</span><span>${escapeHtml(modelo)}</span></div>
      <button class="conv-borrar" type="button" data-accion="borrar-conv" aria-label="Borrar conversacion">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4m1 0v7.5a1 1 0 01-1 1H5a1 1 0 01-1-1V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      </button>
    </div>`
  }).join('')
}

let rafScroll = null
function bajar(suave = false) {
  if (rafScroll) cancelAnimationFrame(rafScroll)
  rafScroll = requestAnimationFrame(() => {
    alFondo(el.mensajes, suave)
    rafScroll = null
  })
}

async function pintarMensajes() {
  const cont = el.mensajes
  if (!cont) return
  const mensajes = convActual?.messages || []
  cont.innerHTML = ''
  el.vacio.hidden = mensajes.length > 0
  if (!mensajes.length) return

  const nodos = await Promise.all(mensajes.map(m => crearMensaje(m)))
  nodos.forEach(n => cont.appendChild(n))
  bajar()
}

function mostrarAviso(texto) {
  document.querySelector('.aviso')?.remove()
  const aviso = document.createElement('div')
  aviso.className = 'aviso'
  aviso.textContent = texto
  document.body.appendChild(aviso)
  setTimeout(() => aviso.remove(), UI.toastDuration)
}

/* ------------------------------------------------------------------ */
/* Selector de modelo (Kala AI 4.3 + Groq)                               */
/* ------------------------------------------------------------------ */

function pintarMenuModelos() {
  const cont = el.menuModelos
  if (!cont) return

  const grupos = [
    { titulo: 'Documental', ids: ['reprebot'] },
    { titulo: 'General', ids: ['groq'] },
  ]

  cont.innerHTML = grupos.map(g => {
    const items = g.ids.filter(id => MODELOS[id]).map(id => {
      const m = MODELOS[id]
      return `<button class="modelo-item" type="button" role="option" data-modelo="${escapeHtml(id)}" aria-selected="${id === estado.modelo}">
        <span class="min-w-0 flex-1">
          <span class="modelo-nombre block">${escapeHtml(m.label)}</span>
          <span class="modelo-desc block">${escapeHtml(m.descripcion)}</span>
        </span>
        ${m.sello ? `<span class="sello-gratis">${escapeHtml(m.sello)}</span>` : ''}
      </button>`
    }).join('')
    return `<div class="px-1 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider" style="color:var(--fg-suave)">${g.titulo}</div>${items}`
  }).join('')
}

function elegirModelo(id) {
  if (!MODELOS[id]) return
  estado.modelo = id
  if (convActual) convActual.modelo = id
  guardarEstado()
  pintarEtiquetaModelo()
  pintarMenuModelos()
}

function pintarEtiquetaModelo() {
  const m = getModelo(estado.modelo)
  if (el.modeloLabel) el.modeloLabel.textContent = m?.label || IDENTIDAD.nombre
  if (el.modeloSello) {
    el.modeloSello.textContent = m?.sello || 'Kala AI 4.3'
    el.modeloSello.className = `hidden shrink-0 sm:inline ${m?.modo === 'pro' ? 'sello-pro' : 'sello-gratis'}`
  }
}

/* ------------------------------------------------------------------ */
/* Dialogo                                                             */
/* ------------------------------------------------------------------ */

function bloqueosDeEntrada(activo) {
  el.enviar.disabled = activo ? false : !el.input.value.trim() && !adjuntos.length
  if (el.adjuntar) el.adjuntar.disabled = activo
  if (el.input) el.input.disabled = false
}

function ponerBotonParar() {
  el.enviar.classList.add('deteniendo')
  el.enviar.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none">${ICONO_PARAR}</svg>`
  el.enviar.setAttribute('aria-label', 'Detener generacion')
}

function ponerBotonEnviar() {
  el.enviar.classList.remove('deteniendo')
  el.enviar.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none">${ICONO_ENVIAR}</svg>`
  el.enviar.setAttribute('aria-label', 'Enviar mensaje')
}

async function enviarTexto(textoForzado) {
  if (generando) return

  const texto = (textoForzado ?? el.input.value).trim()
  if (!texto && !adjuntos.length) return

  const archivos = adjuntos.slice()
  adjuntos = []
  pintarAdjuntos()

  if (!convActual) nuevaConversacion()

  const partes = archivos.map(a => `[${a.nombre}]\n\`\`\`\n${a.contenido}\n\`\`\``).join('\n\n')
  const contenido = partes ? `${partes}\n\n${texto}` : texto

  const msgUsuario = { id: `m_${Date.now().toString(36)}`, role: 'user', content: contenido, timestamp: Date.now() }
  convActual.messages.push(msgUsuario)
  convActual.updatedAt = Date.now()
  if (convActual.messages.filter(m => m.role === 'user').length === 1) {
    convActual.title = tituloDesde(texto || archivos[0]?.nombre || 'Nueva conversacion')
  }

  el.input.value = ''
  el.input.style.height = 'auto'
  el.vacio.hidden = true
  el.mensajes.appendChild(await crearMensaje(msgUsuario))
  pintarLista()
  guardarEstado()
  bajar()

  await generar(convActual)
}

async function generar(conv) {
  const idBot = `m_${Date.now().toString(36)}b`
  const cfg = getModelo(estado.modelo)

  const fila = crearMensajeStreaming(idBot, { modelo: estado.modelo, modeloLabel: cfg?.label })
  el.mensajes.appendChild(fila)
  bajar()

  generando = true
  ponerBotonParar()
  bloqueosDeEntrada(true)
  abortador = new AbortController()

  let acumulado = ''
  let razonamiento = ''
  let fuentes = []
  let pintando = false
  let pendiente = false

  // Repinta a lo sumo una vez por frame: el markdown completo en cada chunk
  // bloquea el hilo principal cuando la respuesta pasa de ~1000 caracteres.
  const programarPintado = () => {
    pendiente = true
    if (pintando) return
    pintando = true
    requestAnimationFrame(async () => {
      pendiente = false
      await pintarTexto(fila, acumulado, true)
      pintando = false
      if (cercaDelFondo(el.contenedor)) bajar()
    })
  }

  const mensajesApi = conv.messages.map(m => ({ role: m.role, content: m.content }))

  try {
    for await (const evento of dialogar(mensajesApi, {
      modelo: estado.modelo,
      signal: abortador.signal,
      k: estado.k,
    })) {
      if (evento.tipo === 'fuentes') {
        fuentes = evento.fuentes
        pintarFuentes(fila, fuentes)
      } else if (evento.tipo === 'estado') {
        pintarEstado(fila, evento.texto)
      } else if (evento.tipo === 'razonamiento') {
        razonamiento += evento.texto
        pintarRazonamiento(fila, razonamiento)
      } else if (evento.tipo === 'texto') {
        if (!acumulado) escribirEscribiendo(fila, false)
        acumulado += evento.texto
        programarPintado()
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      acumulado = acumulado || ''
    } else {
      console.error(err)
      const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false
      const detalle = sinRed
        ? 'Sin conexión a internet. Revisa tu red e inténtalo de nuevo.'
        : err.message
      acumulado += acumulado ? `\n\n**Error:** ${detalle}` : `**No se pudo obtener respuesta.** ${detalle}`
      mostrarAviso(detalle)
    }
  } finally {
    generando = false
    abortador = null
    ponerBotonEnviar()
    bloqueosDeEntrada(false)
    if (pendiente) await pintarTexto(fila, acumulado, false)
    else await pintarTexto(fila, acumulado, false)
    if (razonamiento) pintarRazonamiento(fila, razonamiento)
    if (fuentes.length) pintarFuentes(fila, fuentes)
  }

  const msgBot = {
    id: idBot,
    role: 'assistant',
    content: acumulado,
    modelo: estado.modelo,
    modeloLabel: cfg?.label,
    timestamp: Date.now(),
    ...(razonamiento ? { reasoning: razonamiento } : {}),
    ...(fuentes.length ? { sources: fuentes } : {}),
  }
  conv.messages.push(msgBot)
  conv.updatedAt = Date.now()
  guardarEstado()
  pintarLista()
  fila.dataset.id = idBot
  if (cercaDelFondo(el.contenedor)) bajar()
}

async function regenerar(fila) {
  if (generando || !convActual) return
  const id = fila.dataset.id
  const indice = convActual.messages.findIndex(m => m.id === id)
  if (indice === -1) return

  convActual.messages = convActual.messages.slice(0, indice)
  await pintarMensajes()
  await generar(convActual)
}

const TEXTOS = new Set(['txt', 'md', 'json', 'csv', 'log', 'yml', 'yaml', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'h', 'cpp', 'go', 'rs', 'rb', 'php', 'sql', 'sh', 'rs', 'kt', 'swift', 'toml', 'ini', 'conf', 'env'])

async function adjuntarArchivos(lista) {
  for (const archivo of lista) {
    if (adjuntos.length >= 4) { mostrarAviso('Maximo 4 archivos'); break }
    if (archivo.size > 1024 * 1024) { mostrarAviso(`"${archivo.name}" pasa de 1 MB`); continue }
    const ext = archivo.name.split('.').pop()?.toLowerCase() || ''
    if (!TEXTOS.has(ext) && !archivo.type.startsWith('text/')) {
      mostrarAviso(`"${archivo.name}" no es texto plano`)
      continue
    }
    try {
      adjuntos.push({ nombre: archivo.name, contenido: await archivo.text() })
    } catch {
      mostrarAviso(`No se pudo leer "${archivo.name}"`)
    }
  }
  pintarAdjuntos()
  bloqueosDeEntrada(false)
}

function pintarAdjuntos() {
  const cont = el.chips
  if (!cont) return
  cont.hidden = adjuntos.length === 0
  cont.innerHTML = adjuntos.map((a, i) => {
    const ext = a.nombre.split('.').pop()?.toUpperCase() || 'TXT'
    return `<span class="chip">
      <span class="chip-ext">${escapeHtml(ext)}</span>
      <span class="chip-nombre">${escapeHtml(a.nombre)}</span>
      <button class="chip-quitar" type="button" data-quitar="${i}" aria-label="Quitar ${escapeHtml(a.nombre)}">&times;</button>
    </span>`
  }).join('')
}

/* ------------------------------------------------------------------ */
/* Tema y ajustes                                                      */
/* ------------------------------------------------------------------ */

function aplicarTema(tema) {
  estado.theme = tema
  document.documentElement.setAttribute('data-theme', tema)
  const meta = $('#theme-color-meta')
  if (meta) meta.content = tema === 'dark' ? '#0E1F1B' : '#F6EEE8'
  $$('.opcion-tema').forEach(b => {
    const activo = b.dataset.tema === tema
    b.setAttribute('aria-pressed', activo)
    b.style.borderColor = activo ? 'var(--acento)' : 'var(--linea)'
    b.style.color = activo ? 'var(--acento)' : 'var(--fg-suave)'
    b.style.background = activo ? 'color-mix(in srgb, var(--acento) 12%, transparent)' : 'transparent'
  })
  guardarEstado()
}

function abrirModal(modal) {
  if (!modal) return
  modal.classList.remove('hidden')
  modal.classList.add('flex')
}
function cerrarModal(modal) {
  if (!modal) return
  modal.classList.add('hidden')
  modal.classList.remove('flex')
}

function pintarInfoModelo() {
  const cont = el.infoModelo
  if (!cont) return
  const m = getModelo(estado.modelo)
  const hayClave = Boolean(m?.apiKey)
  cont.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-[13px] font-semibold">${escapeHtml(m?.label || IDENTIDAD.nombre)}</span>
      <span class="sello-gratis">${escapeHtml(m?.sello || 'Documental')}</span>
    </div>
    <p class="mt-1 text-[12px]" style="color:var(--fg-suave)">${escapeHtml(m?.descripcion || '')}</p>
    <p class="mt-1.5 text-[11px]" style="color:var(--fg-suave)">${IDENTIDAD.modelo} · documentos indexados en el servidor${hayClave ? ' · clave propia configurada' : ''}</p>`
}

/* ------------------------------------------------------------------ */
/* Exportar                                                            */
/* ------------------------------------------------------------------ */

function exportar(formato) {
  if (!convActual?.messages.length) { mostrarAviso('No hay nada que exportar'); return }
  const nombre = slug(convActual.title)

  if (formato === 'json') {
    descargar(`${nombre}.json`, JSON.stringify({
      titulo: convActual.title,
      modelo: MODELOS[convActual.modelo]?.label || IDENTIDAD.nombre,
      creada: new Date(convActual.createdAt).toISOString(),
      mensajes: convActual.messages.map(m => ({ rol: m.role, contenido: m.content, fuentes: m.sources || [] })),
    }, null, 2), 'application/json')
    return
  }

  const lineas = [
    `# ${convActual.title}`,
    '',
    `_${IDENTIDAD.nombre} · ${MODELOS[convActual.modelo]?.label || ''} · ${new Date(convActual.createdAt).toLocaleString('es-CO')}_`,
    '',
  ]
  convActual.messages.forEach(m => {
    lineas.push(`## ${m.role === 'user' ? 'Usuario' : IDENTIDAD.nombre}`, '', m.content, '')
    if (m.sources?.length) {
      lineas.push('**Fuentes**', '')
      m.sources.forEach(f => lineas.push(`- [${f.nombre}](${f.url || '#'})${f.score != null ? ` · ${f.score.toFixed(2)}` : ''}`))
      lineas.push('')
    }
  })
  descargar(`${nombre}.md`, lineas.join('\n'))
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

function cerrarMenu() {
  el.menuModelos?.classList.add('hidden')
  el.modeloBtn?.setAttribute('aria-expanded', 'false')
  el.velo?.classList.add('hidden')
  document.body.classList.remove('sidebar-open')
}

function alternarMenuModelos() {
  const menu = el.menuModelos
  if (!menu || !el.modeloBtn) return
  const abierto = !menu.classList.contains('hidden')
  if (abierto) {
    menu.classList.add('hidden')
    el.modeloBtn.setAttribute('aria-expanded', 'false')
    return
  }
  const rect = el.modeloBtn.getBoundingClientRect()
  menu.style.left = `${Math.max(8, rect.left)}px`
  menu.style.bottom = `${window.innerHeight - rect.top + 6}px`
  menu.classList.remove('hidden')
  el.modeloBtn.setAttribute('aria-expanded', 'true')
}

function abrirFuente(bloque, abrir) {
  const toggle = bloque?.querySelector('[data-accion="ver-fuente"]')
  const texto = bloque?.querySelector('.fuente-texto')
  if (!toggle || !texto) return
  toggle.setAttribute('aria-expanded', String(abrir))
  texto.hidden = !abrir
}

function alClicMensajes(ev) {
  const accion = ev.target.closest('[data-accion]')?.dataset.accion
  const fila = ev.target.closest('.msg-row')

  if (accion === 'copiar-codigo') {
    const btn = ev.target.closest('[data-accion]')
    const codigo = btn.closest('.code-wrap')?.querySelector('code')?.textContent || ''
    copiar(codigo).then(ok => {
      if (!ok) return
      btn.classList.add('hecho')
      btn.innerHTML = '<span>Copiado</span>'
      setTimeout(() => { btn.classList.remove('hecho'); btn.innerHTML = `${ICONO_COPIAR_MINI}<span>Copiar</span>` }, 1600)
    })
    return
  }

  if (ev.target.classList.contains('cita')) {
    const fuente = fila.querySelector(`[data-fuente="${ev.target.dataset.cita}"]`)
    if (!fuente) return
    abrirFuente(fuente, true)
    fuente.scrollIntoView({ behavior: 'smooth', block: 'center' })
    fuente.animate(
      [{ background: 'color-mix(in srgb, var(--acento) 28%, transparent)' }, { background: 'transparent' }],
      { duration: 1400, easing: 'ease-out' }
    )
    return
  }

  if (accion === 'ver-fuente') {
    const toggle = ev.target.closest('[data-accion]')
    const bloque = toggle.closest('.fuente')
    abrirFuente(bloque, toggle.getAttribute('aria-expanded') !== 'true')
    return
  }

  if (!fila) return

  if (accion === 'copiar') {
    const btn = ev.target.closest('[data-accion]')
    copiar(textoDeMensaje(fila)).then(ok => {
      if (!ok) return
      btn.classList.add('hecho')
      const original = btn.innerHTML
      btn.innerHTML = '<span>Copiado</span>'
      setTimeout(() => { btn.classList.remove('hecho'); btn.innerHTML = original }, 1500)
    })
    return
  }

  if (accion === 'regenerar') {
    regenerar(fila)
    return
  }

  if (accion === 'editar') {
    if (generando) return
    const id = fila.dataset.id
    const idx = convActual.messages.findIndex(m => m.id === id)
    if (idx === -1) return
    const actual = convActual.messages[idx].content
    const nuevo = prompt('Edita tu mensaje', actual)
    if (nuevo == null || !nuevo.trim() || nuevo === actual) return
    convActual.messages = convActual.messages.slice(0, idx)
    el.input.value = nuevo.trim()
    el.input.dispatchEvent(new Event('input'))
    el.input.focus()
  }
}

const ICONO_COPIAR_MINI = '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 10H2a1 1 0 01-1-1V2a1 1 0 011-1h7a1 1 0 011 1v1M5 13h7a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v7a1 1 0 001 1z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function atajos(ev) {
  const escribiendo = ['INPUT', 'TEXTAREA'].includes(ev.target.tagName)

  if (ev.key === 'Escape') {
    if (generando) { abortador?.abort(); return }
    cerrarModal(el.modalAjustes)
    cerrarMenu()
    return
  }

  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault()
    el.buscar?.focus()
    return
  }

  if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'o') {
    ev.preventDefault()
    nuevaConversacion()
    el.input?.focus()
    return
  }

  if (ev.key === '/' && !escribiendo) {
    ev.preventDefault()
    el.input?.focus()
  }
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

function cachear() {
  const ids = [
    'sidebar', 'velo', 'menu-btn', 'contenedor', 'mensajes', 'vacio',
    'input', 'enviar', 'adjuntar', 'archivos', 'chips', 'lista', 'buscar',
    'modelo-btn', 'modelo-label', 'modelo-sello', 'menu-modelos',
    'modal-ajustes', 'btn-ajustes', 'cerrar-ajustes',
    'info-modelo',
    'nueva-conv', 'ir-abajo', 'exportar-md', 'exportar-json',
    'clave-reprebot', 'clave-groq',
    'guardar-ajustes', 'k-fuentes', 'k-valor', 'limpiar-datos', 'sugerencias',
    'cerrar-sidebar',
  ]
  ids.forEach(id => { el[camel(id)] = document.getElementById(id) })
}

function camel(id) {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

function pintarSugerencias() {
  const cont = el.sugerencias
  if (!cont) return
  cont.innerHTML = SUGERENCIAS.map(s => `<button class="sugerencia" type="button" data-prompt="${escapeHtml(s.texto)}">
    <span>${escapeHtml(s.titulo)}</span>
    <span class="sugerencia-texto">${escapeHtml(s.texto)}</span>
  </button>`).join('')
}

async function arrancar() {
  cachear()
  cargarEstado()
  pintarSugerencias()
  pintarAdjuntos()

  await initRenderer()

  aplicarTema(estado.theme)
  pintarMenuModelos()
  pintarEtiquetaModelo()
  pintarLista()
  await pintarMensajes()

  if (!convActual) nuevaConversacion()

  // --- compositor ---
  el.input.addEventListener('input', () => {
    el.input.style.height = 'auto'
    el.input.style.height = Math.min(el.input.scrollHeight, UI.maxInputHeight) + 'px'
    bloqueosDeEntrada(false)
  })

  el.input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault()
      if (!generando && (el.input.value.trim() || adjuntos.length)) enviarTexto()
    }
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault()
      enviarTexto()
    }
  })

  el.enviar.addEventListener('click', () => {
    if (generando) abortador?.abort()
    else enviarTexto()
  })

  el.adjuntar?.addEventListener('click', () => el.archivos.click())
  el.archivos?.addEventListener('change', () => {
    if (el.archivos.files?.length) adjuntarArchivos(el.archivos.files)
    el.archivos.value = ''
  })

  el.chips?.addEventListener('click', ev => {
    const idx = ev.target.dataset.quitar
    if (idx == null) return
    adjuntos.splice(Number(idx), 1)
    pintarAdjuntos()
    bloqueosDeEntrada(false)
  })

  // --- sugerencias ---
  el.sugerencias?.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-prompt]')
    if (!btn) return
    enviarTexto(btn.dataset.prompt)
  })

  // --- modelos ---
  el.modeloBtn?.addEventListener('click', ev => {
    ev.stopPropagation()
    alternarMenuModelos()
  })

  el.menuModelos?.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-modelo]')
    if (!btn) return
    elegirModelo(btn.dataset.modelo)
    el.menuModelos.classList.add('hidden')
    el.modeloBtn?.setAttribute('aria-expanded', 'false')
  })

  document.addEventListener('click', ev => {
    if (!ev.target.closest('#menu-modelos') && !ev.target.closest('#modelo-btn')) {
      el.menuModelos?.classList.add('hidden')
      el.modeloBtn?.setAttribute('aria-expanded', 'false')
    }
  })

  // --- sidebar ---
  el.menuBtn?.addEventListener('click', () => {
    el.velo.classList.remove('hidden')
    document.body.classList.add('sidebar-open')
  })

  el.cerrarSidebar?.addEventListener('click', cerrarMenu)

  el.velo?.addEventListener('click', cerrarMenu)
  el.nuevaConv?.addEventListener('click', () => { nuevaConversacion(); cerrarMenu() })

  el.lista?.addEventListener('click', ev => {
    const borrar = ev.target.closest('[data-accion="borrar-conv"]')
    if (borrar) { borrarConversacion(borrar.closest('.conv-item').dataset.id, ev); return }
    const item = ev.target.closest('.conv-item')
    if (item) abrirConversacion(item.dataset.id)
  })

  el.lista?.addEventListener('dblclick', ev => {
    const item = ev.target.closest('.conv-item')
    if (item) renombrarConversacion(item.dataset.id)
  })

  el.buscar?.addEventListener('input', pintarLista)

  // --- mensajes ---
  el.mensajes.addEventListener('click', alClicMensajes)

  // --- ajustes ---
  el.btnAjustes?.addEventListener('click', () => {
    cerrarMenu()
    const ajustes = leerAjustes()
    el.claveReprebot.value = ajustes.reprebot?.apiKey || ''
    el.claveGroq.value = ajustes.groq?.apiKey || ''
    el.kFuentes.value = estado.k
    el.kValor.textContent = estado.k
    pintarInfoModelo()
    abrirModal(el.modalAjustes)
  })

  el.cerrarAjustes?.addEventListener('click', () => cerrarModal(el.modalAjustes))

  el.kFuentes?.addEventListener('input', () => {
    estado.k = Number(el.kFuentes.value)
    el.kValor.textContent = el.kFuentes.value
    guardarEstado()
  })

  el.guardarAjustes?.addEventListener('click', () => {
    const payload = {
      reprebot: { apiKey: el.claveReprebot.value.trim() },
      groq: { apiKey: el.claveGroq.value.trim() },
    }
    setSettingsOverrides(payload)
    guardarAjustes(payload)
    guardarEstado()
    pintarInfoModelo()
    pintarMenuModelos()

    const btn = el.guardarAjustes
    const original = btn.textContent
    btn.textContent = 'Guardado'
    btn.disabled = true
    setTimeout(() => { btn.textContent = original; btn.disabled = false }, 1400)
  })

  el.limpiarDatos?.addEventListener('click', () => {
    if (!confirm('Esto borra todas las conversaciones y claves de este navegador. ¿Seguir?')) return
    localStorage.removeItem(STORAGE_KEYS.STATE)
    localStorage.removeItem(STORAGE_KEYS.SETTINGS)
    location.reload()
  })

  // --- modales por fuera ---
  $$('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', ev => {
      if (ev.target === modal || ev.target.classList.contains('modal-backdrop')) cerrarModal(modal)
    })
  })

  // --- tema ---
  $$('.opcion-tema').forEach(b => b.addEventListener('click', () => aplicarTema(b.dataset.tema)))

  // --- exportar ---
  el.exportarMd?.addEventListener('click', () => exportar('md'))
  el.exportarJson?.addEventListener('click', () => exportar('json'))

  // --- ir abajo ---
  el.contenedor.addEventListener('scroll', () => {
    const mostrar = !cercaDelFondo(el.contenedor, 320)
    el.irAbajo?.classList.toggle('visible', mostrar)
  }, { passive: true })
  el.irAbajo?.addEventListener('click', () => bajar(true))

  document.addEventListener('keydown', atajos)

  const guardado = leerAjustes()
  setSettingsOverrides(guardado)
  pintarInfoModelo()
  pintarEtiquetaModelo()
  pintarMenuModelos()

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
}

export function bootstrap() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(arrancar, 0))
  } else {
    setTimeout(arrancar, 0)
  }
}

bootstrap()