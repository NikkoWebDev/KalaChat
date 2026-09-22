export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function iconoInflar(clase, contenido, tam = 20) {
  return `<svg class="${clase}" width="${tam}" height="${tam}" viewBox="0 0 20 20" fill="none" aria-hidden="true">${contenido}</svg>`
}

export function textoSeguro(node) {
  return node?.textContent?.trim() || ''
}

/** Captura el texto visible de la burbuja sin las fuentes citadas ni el razonamiento. */
export function textoDeMensaje(fila) {
  const cuerpo = fila.querySelector('[data-zona-texto]') || fila.querySelector('.msg-body')
  if (!cuerpo) return ''
  return (cuerpo.innerText ?? cuerpo.textContent ?? '').trim()
}

export async function copiar(texto) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto)
      return true
    } catch { /* cae al metodo viejo */ }
  }
  const area = document.createElement('textarea')
  area.value = texto
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  area.remove()
  return ok
}

export function descargar(nombre, contenido, tipo = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slug(texto, max = 48) {
  return String(texto || 'conversacion')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'conversacion'
}

/** Evita scroll forzado cuando el usuario esta leyendo mas arriba. */
export function cercaDelFondo(contenedor, margen = 140) {
  if (!contenedor) return true
  return contenedor.scrollHeight - contenedor.scrollTop - contenedor.clientHeight < margen
}

export function alFondo(contenedor, suave = false) {
  if (!contenedor) return
  contenedor.scrollTo({ top: contenedor.scrollHeight, behavior: suave ? 'smooth' : 'auto' })
}