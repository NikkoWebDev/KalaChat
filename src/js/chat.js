import { escapeHtml, escapeAttr } from './utils.js'

let marked
let DOMPurify
let Prism

async function ensureMarked() {
  if (!marked) {
    const mod = await import('marked')
    marked = mod.marked
    DOMPurify = (await import('dompurify')).default
  }
}

async function ensurePrism() {
  if (!Prism) {
    const mod = await import('prismjs')
    Prism = mod.default
    await Promise.all([
      import('prismjs/components/prism-javascript'),
      import('prismjs/components/prism-python'),
      import('prismjs/components/prism-css'),
      import('prismjs/components/prism-json'),
      import('prismjs/components/prism-bash'),
      import('prismjs/components/prism-typescript'),
      import('prismjs/components/prism-jsx'),
      import('prismjs/components/prism-tsx'),
      import('prismjs/components/prism-markup'),
    ])
  }
}

export async function initRenderer() {
  await ensureMarked()
  const renderer = new marked.Renderer()

  renderer.code = function ({ text, lang }) {
    const language = lang || 'plaintext'
    const langClass = `language-${language}`
    let highlighted

    try {
      if (Prism?.languages?.[language]) {
        highlighted = Prism.highlight(text, Prism.languages[language], language)
      } else {
        highlighted = escapeHtml(text)
      }
    } catch {
      highlighted = escapeHtml(text)
    }

    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-block-lang">${escapeHtml(language)}</span>
        <button class="code-copy-btn" data-code="${escapeAttr(text)}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 10H2a1 1 0 01-1-1V2a1 1 0 011-1h7a1 1 0 011 1v1M5 13h7a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v7a1 1 0 001 1z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Copiar
        </button>
      </div>
      <pre><code class="${langClass}">${highlighted}</code></pre>
    </div>`
  }

  renderer.codespan = function ({ text }) {
    return `<code class="inline-code">${escapeHtml(text)}</code>`
  }

  marked.setOptions({
    renderer,
    breaks: true,
    gfm: true,
  })
}

function setupReasoningToggle(container) {
  container.addEventListener('click', (e) => {
    const toggle = e.target.closest('.reasoning-toggle')
    if (!toggle) return
    const content = toggle.parentElement?.querySelector('.reasoning-content')
    if (!content) return
    const expanded = toggle.getAttribute('aria-expanded') === 'true'
    toggle.setAttribute('aria-expanded', !expanded)
    content.hidden = expanded
  })
}

export function setupMessageInteractions(container) {
  setupCopyButtons(container)
  setupReasoningToggle(container)
}

function setupCopyButtons(container) {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.code-copy-btn')
    if (!btn) return

    const code = btn.getAttribute('data-code')
    if (!code) return

    try {
      await navigator.clipboard.writeText(code)
      btn.classList.add('copied')
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Copiado`
      setTimeout(() => {
        btn.classList.remove('copied')
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 10H2a1 1 0 01-1-1V2a1 1 0 011-1h7a1 1 0 011 1v1M5 13h7a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v7a1 1 0 001 1z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Copiar`
      }, 2000)
    } catch { /* clipboard unavailable */ }
  })
}

export async function parseMarkdown(text) {
  await ensureMarked()

  const raw = marked.parse(text)
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre',
      'blockquote', 'hr', 'div', 'span', 'table', 'thead',
      'tbody', 'tr', 'th', 'td', 'svg', 'path', 'button',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'class', 'id',
      'data-code', 'data-language', 'style', 'stroke',
      'fill', 'viewBox', 'width', 'height', 'd',
    ],
    ALLOW_ARIA_ATTR: false,
  })
}

function renderImages(images) {
  if (!images?.length) return ''
  return images.map(img => {
    const dataUrl = `data:${img.mime};base64,${img.base64}`
    return `<div class="msg-image-wrap"><img src="${dataUrl}" alt="${escapeHtml(img.name)}" class="msg-image" loading="lazy" /></div>`
  }).join('')
}

export async function renderMessage(message) {
  const div = document.createElement('div')
  div.className = `message ${message.role}`
  div.dataset.messageId = message.id

  const content = message.role === 'assistant'
    ? await parseMarkdown(message.content)
    : escapeHtml(message.content).replace(/\n/g, '<br>')

  const imagesHtml = message.role === 'user' ? renderImages(message.images) : ''

  const time = message.timestamp
    ? formatTime(message.timestamp)
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const avatar = message.role === 'assistant'
    ? '<div class="message-avatar">K</div>'
    : '<div class="message-avatar">T</div>'

  const reasoningHtml = message.role === 'assistant' && message.reasoning
    ? renderReasoningBlock(message.reasoning)
    : ''

  div.innerHTML = `
    ${avatar}
    <div class="message-content">
      ${reasoningHtml}
      <div class="message-bubble">${imagesHtml}${content}</div>
      <div class="message-time">${time}</div>
    </div>`

  return div
}

export function renderStreamingMessage(messageId) {
  const div = document.createElement('div')
  div.className = 'message assistant'
  div.dataset.messageId = messageId
  div.innerHTML = `
    <div class="message-avatar">K</div>
    <div class="message-content">
      <div class="message-reasoning" id="reasoning-${messageId}" hidden>
        <button class="reasoning-toggle" aria-expanded="false" aria-label="Toggle reasoning">
          <svg class="reasoning-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Thinking</span>
          <span class="reasoning-dots"></span>
        </button>
        <div class="reasoning-content" id="reasoning-content-${messageId}"></div>
      </div>
      <div class="message-bubble" id="streaming-${messageId}">
        <span class="streaming-cursor"></span>
      </div>
    </div>`
  return div
}

export async function updateStreamingContent(messageId, text) {
  const el = document.getElementById(`streaming-${messageId}`)
  if (!el) return
  const md = await parseMarkdown(text)
  el.innerHTML = md + '<span class="streaming-cursor"></span>'
}

export async function finalizeStreamingContent(messageId, text) {
  const el = document.getElementById(`streaming-${messageId}`)
  if (!el) return
  el.innerHTML = await parseMarkdown(text)
}

export function showStreamingReasoning(messageId) {
  const el = document.getElementById(`reasoning-${messageId}`)
  if (el) el.hidden = false
  const dots = el?.querySelector('.reasoning-dots')
  if (dots) {
    let count = 0
    setInterval(() => {
      count = (count + 1) % 4
      dots.textContent = '.'.repeat(count)
    }, 400)
  }
}

export function updateStreamingReasoning(messageId, text) {
  const el = document.getElementById(`reasoning-content-${messageId}`)
  if (!el) return
  el.textContent = text
}

export function finalizeStreamingReasoning(messageId, text) {
  const el = document.getElementById(`reasoning-content-${messageId}`)
  if (!el) return
  el.textContent = text || ''
  const toggle = el.closest('.message-reasoning')?.querySelector('.reasoning-toggle')
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false')
    toggle.querySelector('.reasoning-dots')?.remove()
  }
}

export function renderReasoningBlock(reasoning) {
  if (!reasoning) return ''
  return `
    <div class="message-reasoning">
      <button class="reasoning-toggle" aria-expanded="false" aria-label="Toggle reasoning">
        <svg class="reasoning-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>Thinking</span>
      </button>
      <div class="reasoning-content">${escapeHtml(reasoning)}</div>
    </div>`
}

export function renderTypingIndicator(providerLabel) {
  const div = document.createElement('div')
  div.id = 'typing-indicator'
  div.className = 'typing-indicator'
  div.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    ${providerLabel ? `<span class="text-[10px] text-surface-300 ml-1">${escapeHtml(providerLabel)}</span>` : ''}`
  return div
}

export function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator')
  if (el) el.remove()
}

function formatTime(timestamp) {
  const d = new Date(timestamp)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatConversationDate(timestamp) {
  const d = new Date(timestamp)
  const now = new Date()
  const diff = now - d
  const days = Math.floor(diff / 86400000)

  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
