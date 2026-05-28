import { streamChat, getProviderConfig, getAllProviders, isProviderConfigured, setSettingsOverrides } from './api.js'
import {
  renderMessage, renderStreamingMessage, updateStreamingContent,
  finalizeStreamingContent, renderTypingIndicator, removeTypingIndicator,
  formatConversationDate, setupMessageInteractions, initRenderer,
  showStreamingReasoning, updateStreamingReasoning, finalizeStreamingReasoning,
} from './chat.js'
import { escapeHtml, fileToBase64 } from './utils.js'
import { STORAGE_KEYS, DEFAULTS, UI } from './constants.js'

let abortController = null
let state = { ...DEFAULTS }
let currentFiles = []

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

const el = {}

function cacheElements() {
  const ids = [
    'sidebar', 'sidebar-overlay', 'menu-btn', 'main', 'messages-list',
    'messages-container', 'empty-state', 'message-input', 'send-btn',
    'header', 'theme-btn', 'provider-selector', 'provider-dropdown',
    'provider-label', 'provider-badge', 'dropdown-free-group',
    'cost-modal',
    'cost-modal-accept', 'cost-modal-cancel', 'dont-show-again',
    'conversation-list', 'new-chat-btn-side', 'settings-btn',
    'settings-modal', 'settings-close', 'settings-save',
    'settings-openrouter', 'settings-gemini', 'settings-pro',
    'file-input', 'attach-btn', 'file-list', 'settings-provider-info',
    'thinking-track', 'thinking-label-text', 'thinking-label-wrap',
    'settings-thinking-track', 'settings-thinking-wrap', 'settings-thinking-label',
    'scroll-bottom-btn', 'theme-color-meta',
  ]
  ids.forEach(id => { el[id] = $(`#${id}`) })
  el.suggestionChips = $$('.suggestion-chip')
  el.settingsInputs = {
    openrouter: el['settings-openrouter'],
    gemini: el['settings-gemini'],
    pro: el['settings-pro'],
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE)
    if (raw) {
      const parsed = JSON.parse(raw)
      state = { ...DEFAULTS, ...parsed }
      return
    }
  } catch { /* ignore */ }
  state = { ...DEFAULTS }
}

function providerMode(id) {
  return getProviderConfig(id)?.mode || 'free'
}

function saveState() {
  try {
    const toStore = {
      mode: providerMode(state.provider),
      theme: state.theme,
      thinking: state.thinking,
      conversations: state.conversations.map(c => ({
        ...c,
        messages: c.messages.slice(-UI.maxStoredMessages)
      })),
      currentId: state.currentId,
      provider: state.provider,
      costWarningDismissed: state.costWarningDismissed,
    }
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(toStore))
  } catch { /* ignore */ }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  state.theme = theme
  updateThemeColorMeta()
  saveState()
  updateSettingsProviderInfo()
}

function updateThemeColorMeta() {
  const meta = el['theme-color-meta']
  if (!meta) return
  meta.content = state.theme === 'dark' ? '#0C0C0E' : '#F5F5F0'
}

function toggleSidebar() { document.body.classList.toggle('sidebar-open') }
function closeSidebar() { document.body.classList.remove('sidebar-open') }

function getCurrentConversation() {
  return state.conversations.find(c => c.id === state.currentId)
}

function createNewConversation() {
  const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const conv = {
    id,
    title: 'Nueva conversación',
    messages: [],
    provider: state.provider,
    mode: providerMode(state.provider),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  state.conversations.unshift(conv)
  state.currentId = id
  saveState()
  renderConversationList()
  switchToConversation(id)
  return conv
}

function switchToConversation(id) {
  state.currentId = id
  saveState()
  renderMessages()
  renderConversationList()
  closeSidebar()
}

function updateProviderUI() {
  const cfg = getProviderConfig(state.provider)

  if (cfg && el['provider-label'] && el['provider-badge']) {
    el['provider-label'].textContent = cfg.label
    const isFree = cfg.mode === 'free'
    el['provider-badge'].textContent = isFree ? 'Gratuito' : 'PRO'
    el['provider-badge'].className = `provider-cost ${isFree ? 'free-cost' : 'pro-cost'}`
  }

  el['dropdown-free-group']?.querySelectorAll('.dropdown-item').forEach(item => {
    item.setAttribute('aria-selected', item.dataset.provider === state.provider)
  })
  updateSettingsProviderInfo()
}

function buildDropdown() {
  const providers = getAllProviders()

  if (el['dropdown-free-group']) {
    el['dropdown-free-group'].innerHTML = providers.map(p => {
      const badge = p.mode === 'free' ? 'Gratis' : 'PRO'
      const badgeClass = p.mode === 'free' ? 'free-badge' : 'pro-badge'
      return `
        <button class="dropdown-item" data-provider="${escapeHtml(p.id)}" role="option" aria-selected="${p.id === state.provider}">
          <span class="dropdown-item-name">${escapeHtml(p.label)}${p.badge ? ` <span style="font-size:10px;color:var(--color-gold,#C8A87C);font-weight:600">· ${escapeHtml(p.badge)}</span>` : ''}</span>
          <span class="dropdown-item-badge ${badgeClass}">${badge}</span>
        </button>`
    }).join('')
  }

  el['dropdown-free-group']?.querySelectorAll('.dropdown-item').forEach(bindDropdownItem)
}

function bindDropdownItem(item) {
  item.addEventListener('click', () => {
    const providerId = item.dataset.provider
    const cfg = getProviderConfig(providerId)

    if (cfg?.mode === 'pro' && !state.costWarningDismissed) {
      showCostModal(() => {
        state.provider = providerId
        updateProviderUI()
        saveState()
      })
      el['provider-dropdown'].classList.add('hidden')
      return
    }

    state.provider = providerId
    updateProviderUI()
    saveState()
    el['provider-dropdown'].classList.add('hidden')
  })
}

function showModal(modal) {
  modal.classList.remove('hidden')
}

function hideModal(modal) {
  modal.classList.add('hidden')
}

function showCostModal(onAccept) {
  showModal(el['cost-modal'])
  el['dont-show-again'].checked = false

  const handleAccept = () => {
    if (el['dont-show-again'].checked) {
      state.costWarningDismissed = true
      saveState()
    }
    hideModal(el['cost-modal'])
    el['cost-modal-accept'].removeEventListener('click', handleAccept)
    el['cost-modal-cancel'].removeEventListener('click', handleCancel)
    onAccept?.()
  }

  const handleCancel = () => {
    hideModal(el['cost-modal'])
    el['cost-modal-accept'].removeEventListener('click', handleAccept)
    el['cost-modal-cancel'].removeEventListener('click', handleCancel)
  }

  el['cost-modal-accept'].addEventListener('click', handleAccept)
  el['cost-modal-cancel'].addEventListener('click', handleCancel)
}

function deleteConversation(id, e) {
  e.stopPropagation()
  const conv = state.conversations.find(c => c.id === id)
  if (!conv) return

  if (!confirm(`¿Eliminar "${conv.title}"? Esta acción no se puede deshacer.`)) return

  state.conversations = state.conversations.filter(c => c.id !== id)
  if (state.currentId === id) {
    if (state.conversations.length > 0) {
      state.currentId = state.conversations[0].id
    } else {
      state.currentId = null
      createNewConversation()
      return
    }
  }
  saveState()
  renderConversationList()
  renderMessages()
}

function renderConversationList() {
  if (!el['conversation-list']) return

  if (state.conversations.length === 0) {
    el['conversation-list'].innerHTML = '<div class="empty-conversations">Sin conversaciones aún</div>'
    return
  }

  el['conversation-list'].innerHTML = state.conversations
    .map(c => {
      const isActive = c.id === state.currentId
      const date = formatConversationDate(c.updatedAt)
      const modeDisplay = (getProviderConfig(c.provider)?.mode || c.mode) === 'free' ? 'Free' : 'PRO'
      return `
        <div class="conversation-item ${isActive ? 'active' : ''}" data-conv-id="${escapeHtml(c.id)}">
          <div class="conversation-item-title">${escapeHtml(c.title)}</div>
          <div class="conversation-item-meta">
            <span>${escapeHtml(date)}</span>
            <span>·</span>
            <span>${modeDisplay}</span>
          </div>
          <button class="delete-btn" data-conv-id="${escapeHtml(c.id)}" aria-label="Eliminar conversación">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4m1 0v7.5a1 1 0 01-1 1H5a1 1 0 01-1-1V4m2 3v3m3-3v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          </button>
        </div>`
    })
    .join('')

  el['conversation-list'].querySelectorAll('.conversation-item').forEach(item => {
    item.addEventListener('click', () => switchToConversation(item.dataset.convId))
  })
  el['conversation-list'].querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', e => deleteConversation(btn.dataset.convId, e))
  })
}

async function renderMessages() {
  if (!el['messages-list']) return
  const messages = getCurrentConversation()?.messages || []
  el['messages-list'].innerHTML = ''

  if (messages.length === 0) {
    if (el['empty-state']) el['empty-state'].style.display = 'flex'
    return
  }

  if (el['empty-state']) el['empty-state'].style.display = 'none'

  const fragments = await Promise.all(messages.map(msg => renderMessage(msg)))
  fragments.forEach(f => el['messages-list'].appendChild(f))

  scrollToBottom()
}

let scrollRafId = null
function scrollToBottom() {
  if (scrollRafId) cancelAnimationFrame(scrollRafId)
  scrollRafId = requestAnimationFrame(() => {
    if (el['messages-container']) {
      el['messages-container'].scrollTop = el['messages-container'].scrollHeight
    }
    scrollRafId = null
  })
}

function showToast(message) {
  const old = document.querySelector('.toast')
  if (old) old.remove()

  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => {
    if (toast.parentNode) toast.remove()
  }, UI.toastDuration)
}

async function sendMessage() {
  const text = el['message-input']?.value.trim() || ''
  if ((!text && currentFiles.length === 0) || state.sending) return

  let conv = getCurrentConversation()
  if (!conv) conv = createNewConversation()

  if (!isProviderConfigured(state.provider)) {
    const name = getProviderConfig(state.provider)?.label || state.provider
    showToast(`Configura API key para ${name} en Ajustes`)
    return
  }

  state.sending = true
  el['send-btn'].disabled = true
  el['send-btn'].classList.add('sending')
  el['message-input'].disabled = true
  if (el['empty-state']) el['empty-state'].style.display = 'none'

  const images = currentFiles.filter(f => f.type === 'image').map(f => ({
    name: f.name, base64: f.base64, mime: f.mime,
  }))
  const textFiles = currentFiles.filter(f => f.type !== 'image')

  let messageText = text

  if (textFiles.length > 0) {
    const fileBlocks = textFiles.map(f =>
      `[Archivo: ${f.name}]\n\`\`\`\n${f.content}\n\`\`\``
    ).join('\n\n')
    messageText = `${fileBlocks}\n\n${text}`
  }

  currentFiles = []
  renderFileList()

  const userMsg = {
    id: `msg_${Date.now()}`,
    role: 'user',
    content: messageText,
    timestamp: Date.now(),
    ...(images.length ? { images } : {}),
  }

  conv.messages.push(userMsg)
  conv.updatedAt = Date.now()

  if (conv.messages.filter(m => m.role === 'user').length === 1) {
    conv.title = text.length > UI.titleTruncateLength
      ? text.slice(0, UI.titleTruncateLength) + '…'
      : text
  }

  el['messages-list'].appendChild(await renderMessage(userMsg))
  el['message-input'].value = ''
  el['message-input'].style.height = 'auto'
  scrollToBottom()

  const currentProvider = getProviderConfig(state.provider)?.label || ''
  el['messages-list'].appendChild(renderTypingIndicator(currentProvider))
  scrollToBottom()

  const aiMsgId = `msg_${Date.now() + 1}`
  const aiMsgEl = renderStreamingMessage(aiMsgId)
  removeTypingIndicator()
  el['messages-list'].appendChild(aiMsgEl)
  scrollToBottom()

  let fullReasoning = ''
  let fullResponse = ''
  abortController = new AbortController()

  try {
    const messagesForApi = conv.messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.images?.length ? { images: m.images } : {}),
    }))

    for await (const chunk of streamChat(messagesForApi, {
      provider: state.provider,
      signal: abortController.signal,
      thinking: state.thinking,
    })) {
      if (chunk.type === 'reasoning') {
        if (!fullReasoning && chunk.text) showStreamingReasoning(aiMsgId)
        fullReasoning += chunk.text
        updateStreamingReasoning(aiMsgId, fullReasoning)
      } else {
        fullResponse += chunk.text
        updateStreamingContent(aiMsgId, fullResponse)
      }
      scrollToBottom()
    }

    if (fullReasoning) finalizeStreamingReasoning(aiMsgId, fullReasoning)
    await finalizeStreamingContent(aiMsgId, fullResponse)

    const aiMsg = {
      id: aiMsgId,
      role: 'assistant',
      content: fullResponse,
      ...(fullReasoning ? { reasoning: fullReasoning } : {}),
      timestamp: Date.now(),
      provider: state.provider,
    }
    conv.messages.push(aiMsg)
    conv.updatedAt = Date.now()
    saveState()
    renderConversationList()
  } catch (err) {
    if (err.name === 'AbortError') {
      if (fullResponse) {
        if (fullReasoning) finalizeStreamingReasoning(aiMsgId, fullReasoning)
        await finalizeStreamingContent(aiMsgId, fullResponse)
        conv.messages.push({
          id: aiMsgId,
          role: 'assistant',
          content: fullResponse + '\n\n*(generación detenida)*',
          ...(fullReasoning ? { reasoning: fullReasoning } : {}),
          timestamp: Date.now(),
          provider: state.provider,
        })
        saveState()
        renderConversationList()
      }
    } else {
      console.error('Error:', err)
      await finalizeStreamingContent(aiMsgId, `*Error al conectar con la API:* ${err.message}`)
      showToast('Error de conexión. Revisa tu API key.')
    }
  } finally {
    state.sending = false
    el['send-btn'].disabled = false
    el['send-btn'].classList.remove('sending')
    el['message-input'].disabled = false
    el['message-input'].focus()
    abortController = null
  }
}

const TEXT_EXTENSIONS = new Set([
  'txt','js','py','ts','jsx','tsx','css','scss','html','json','xml','yaml','yml',
  'toml','md','csv','log','sh','bash','zsh','env','gitignore','dockerfile','Dockerfile',
  'conf','ini','cfg','sql','rb','go','rs','java','cpp','c','h','hpp','php','swift',
  'kt','kts','scala','r','pl','lua','elixir','ex','exs','erl','hrl','clj','cljs',
  'groovy','gradle','makefile','Makefile','cmake','ps1','bat','cmd','vue','svelte',
  'astro','tex','rst','org','m','mm','f','f90','f95','f03','s','asm','prisma',
  'graphql','gql','proto','svg','tf','tfvars','hcl','lock','zig','nim','raku',
  'typ','tsv','properties','cfg','desktop','service','rules','patch','diff',
])

const IMAGE_EXTENSIONS = new Set(['jpg','jpeg','png','gif','webp','bmp','avif'])

function classifyFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext) return file.type.startsWith('text/') ? 'text' : null
  if (TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(file.name)) return 'text'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (file.type.startsWith('text/')) return 'text'
  if (file.type.startsWith('image/') && !file.type.includes('svg')) return 'image'
  return null
}

async function handleFileSelect(files) {
  for (const file of files) {
    if (currentFiles.length >= 5) {
      showToast('Máximo 5 archivos')
      break
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast(`"${file.name}" excede 2 MB`)
      continue
    }

    const type = classifyFile(file)
    if (!type) {
      showToast(`"${file.name}" no es compatible`)
      continue
    }

    try {
      if (type === 'image') {
        const base64 = await fileToBase64(file)
        const mime = file.type || 'image/png'
        currentFiles.push({ type: 'image', name: file.name, base64, mime })
      } else {
        const text = await file.text()
        currentFiles.push({ type: 'text', name: file.name, content: text })
      }
    } catch {
      showToast(`No se pudo leer "${file.name}"`)
    }
  }
  renderFileList()
  el['message-input']?.focus()
}

function renderFileList() {
  if (!el['file-list']) return
  if (currentFiles.length === 0) {
    el['file-list'].innerHTML = ''
    el['file-list'].hidden = true
    return
  }

  el['file-list'].hidden = false
  el['file-list'].innerHTML = currentFiles.map((f, i) =>
    `<span class="file-chip ${f.type === 'image' ? 'file-chip-image' : ''}" title="${escapeHtml(f.name)}">
      ${f.type === 'image'
        ? `<img src="data:${f.mime};base64,${f.base64}" class="file-chip-preview" alt="" />`
        : `<span class="file-chip-icon">${f.name.split('.').pop()}</span>`
      }
      <span class="file-chip-name">${escapeHtml(f.name)}</span>
      <button class="file-chip-remove" data-index="${i}" aria-label="Quitar ${escapeHtml(f.name)}">&times;</button>
    </span>`
  ).join('')

  el['file-list'].querySelectorAll('.file-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index)
      if (!isNaN(idx)) {
        currentFiles.splice(idx, 1)
        renderFileList()
      }
    })
  })
}

function loadSettingsIntoUI() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}')
    if (el.settingsInputs.openrouter) el.settingsInputs.openrouter.value = saved.openrouter?.apiKey || ''
    if (el.settingsInputs.gemini) el.settingsInputs.gemini.value = saved.gemini?.apiKey || ''
    if (el.settingsInputs.pro) el.settingsInputs.pro.value = saved.pro?.apiKey || ''
  } catch { /* use env defaults */ }
  updateSettingsProviderInfo()
}

function updateSettingsProviderInfo() {
  const prov = getProviderConfig(state.provider)
  const info = el['settings-provider-info']
  if (!info) return
  if (prov) {
    const isFree = prov.mode === 'free'
    info.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <span class="text-sm font-semibold">${escapeHtml(prov.label)}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${isFree ? 'bg-green-500/10 text-green-400' : 'bg-gold/10 text-gold'}">${isFree ? 'Gratuito' : 'PRO'}</span>
      </div>
      <div class="flex items-center gap-3 text-xs text-surface-300">
        <span>Tema: ${state.theme === 'dark' ? 'oscuro' : 'claro'}</span>
        <span>·</span>
        <span>Modelos: ${getAllProviders().length} disp.</span>
      </div>`
  } else {
    info.innerHTML = '<span class="text-xs text-surface-300">Ningún proveedor seleccionado</span>'
  }
}

function initProviders() {
  const all = getAllProviders()
  if (!state.provider || !all.find(p => p.id === state.provider)) {
    state.provider = all.find(p => p.mode === 'free')?.id || all[0]?.id || null
  }
}

function updateThinkingSwitch() {
  const isActive = state.thinking
  const tracks = [el['thinking-track'], el['settings-thinking-track']]
  tracks.forEach(track => {
    if (!track) return
    track.classList.toggle('active', isActive)
  })

  const labels = [el['thinking-label-text'], el['settings-thinking-label']]
  labels.forEach(label => {
    if (!label) return
    label.textContent = isActive ? 'Thinking' : 'No thinking'
    label.classList.toggle('active', isActive)
  })
}

function bindThinkingSwitch(trackEl) {
  if (!trackEl) return
  trackEl.addEventListener('click', (e) => {
    e.stopPropagation()
    state.thinking = !state.thinking
    updateThinkingSwitch()
    saveState()
  })
}

function setupScrollBottomBtn() {
  const container = el['messages-container']
  const btn = el['scroll-bottom-btn']
  if (!container || !btn) return

  let ticking = false
  container.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const threshold = container.scrollHeight - container.clientHeight - 300
        btn.classList.toggle('visible', container.scrollTop < threshold)
        ticking = false
      })
      ticking = true
    }
  })

  btn.addEventListener('click', scrollToBottom)
}

export function bootstrap() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0))
  } else {
    setTimeout(start, 0)
  }
}

async function start() {
  loadState()
  cacheElements()
  initProviders()

  setupMessageInteractions(el['messages-list'])

  // --- Provider dropdown (fixed positioning) ---
  if (el['provider-selector']) {
    el['provider-selector'].addEventListener('click', e => {
      e.stopPropagation()
      const dd = el['provider-dropdown']
      if (!dd) return
      if (dd.classList.contains('hidden')) {
        const rect = el['provider-selector'].getBoundingClientRect()
        dd.style.position = 'fixed'
        dd.style.top = (rect.bottom + 4) + 'px'
        dd.style.left = rect.left + 'px'
        dd.style.minWidth = Math.max(rect.width, 220) + 'px'
      }
      dd.classList.toggle('hidden')
    })
  }

  document.addEventListener('click', () => {
    if (el['provider-dropdown']) el['provider-dropdown'].classList.add('hidden')
  })

  // --- Theme toggle ---
  if (el['theme-btn']) {
    el['theme-btn'].addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark')
      updateSettingsThemeBtns()
    })
  }

  // --- Sidebar ---
  if (el['menu-btn']) el['menu-btn'].addEventListener('click', toggleSidebar)
  if (el['sidebar-overlay']) el['sidebar-overlay'].addEventListener('click', closeSidebar)

  // --- Settings ---
  if (el['settings-btn']) {
    el['settings-btn'].addEventListener('click', () => {
      closeSidebar()
      loadSettingsIntoUI()
      showModal(el['settings-modal'])
    })
  }

  if (el['settings-close']) {
    el['settings-close'].addEventListener('click', () => {
      hideModal(el['settings-modal'])
    })
  }

  if (el['settings-save']) {
    el['settings-save'].addEventListener('click', () => {
      const overrides = {
        openrouter: { apiKey: el.settingsInputs.openrouter?.value.trim() || '' },
        gemini: { apiKey: el.settingsInputs.gemini?.value.trim() || '' },
        pro: { apiKey: el.settingsInputs.pro?.value.trim() || '' },
      }

      setSettingsOverrides(overrides)
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(overrides))
      hideModal(el['settings-modal'])

      const btn = el['settings-save']
      const original = btn.textContent
      btn.textContent = '✓ Guardado'
      btn.style.pointerEvents = 'none'
      setTimeout(() => {
        btn.textContent = original
        btn.style.pointerEvents = ''
      }, 1500)
    })
  }

  // --- Settings theme options ---
  const themeDark = $('#settings-theme-dark')
  const themeLight = $('#settings-theme-light')
  function updateSettingsThemeBtns() {
    const active = state.theme
    ;[themeDark, themeLight].forEach(btn => {
      if (!btn) return
      const isActive = btn.dataset.themeOption === active
      btn.setAttribute('data-active', isActive ? '' : null)
      btn.className = `theme-option flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 ${
        isActive
          ? 'bg-gold/10 border-gold text-gold'
          : 'bg-surface-500 border-surface-700 text-surface-200 hover:bg-gold/10 hover:border-gold/30'
      }`
    })
  }
  ;[themeDark, themeLight].forEach(btn => {
    btn?.addEventListener('click', () => {
      applyTheme(btn.dataset.themeOption)
      updateSettingsThemeBtns()
    })
  })
  updateSettingsThemeBtns()

  // --- Thinking toggle (iOS switch) ---
  updateThinkingSwitch()
  bindThinkingSwitch(el['thinking-track'])
  bindThinkingSwitch(el['settings-thinking-track'])

  // --- Modal backdrop clicks ---
  $$('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
        hideModal(modal)
      }
    })
  })

  // --- Message input ---
  if (el['message-input']) {
    el['message-input'].addEventListener('input', () => {
      el['message-input'].style.height = 'auto'
      el['message-input'].style.height = Math.min(el['message-input'].scrollHeight, UI.maxInputHeight) + 'px'
      if (el['send-btn']) {
        const hasText = el['message-input'].value.trim().length > 0
        el['send-btn'].disabled = (!hasText && currentFiles.length === 0) || state.sending
      }
    })

    el['message-input'].addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (el['send-btn'] && !el['send-btn'].disabled) sendMessage()
      }
    })
  }

  if (el['send-btn']) {
    el['send-btn'].addEventListener('click', sendMessage)
  }

  // --- Escape key closes modals ---
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!el['settings-modal']?.classList.contains('hidden')) {
        hideModal(el['settings-modal'])
      }
      if (!el['cost-modal']?.classList.contains('hidden')) {
        hideModal(el['cost-modal'])
      }
    }
  })

  // --- Suggestion chips ---
  el.suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (el['message-input']) {
        el['message-input'].value = chip.dataset.prompt
        el['message-input'].dispatchEvent(new Event('input', { bubbles: true }))
      }
      el['message-input']?.focus()
      sendMessage()
    })
  })

  // --- New chat ---
  if (el['new-chat-btn-side']) {
    el['new-chat-btn-side'].addEventListener('click', () => {
      createNewConversation()
      closeSidebar()
    })
  }

  // --- Keyboard shortcuts ---
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      sendMessage()
    }
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      e.preventDefault()
      el['message-input']?.focus()
    }
  })

  // --- File attach ---
  if (el['attach-btn'] && el['file-input']) {
    el['attach-btn'].addEventListener('click', () => {
      el['file-input'].click()
    })

    el['file-input'].addEventListener('change', () => {
      if (el['file-input'].files?.length) {
        handleFileSelect(el['file-input'].files)
        el['file-input'].value = ''
      }
    })
  }

  // --- Scroll to bottom button ---
  setupScrollBottomBtn()

  // --- Load settings overrides ---
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}')
    setSettingsOverrides(saved)
    if (el.settingsInputs.openrouter) el.settingsInputs.openrouter.value = saved.openrouter?.apiKey || ''
    if (el.settingsInputs.gemini) el.settingsInputs.gemini.value = saved.gemini?.apiKey || ''
    if (el.settingsInputs.pro) el.settingsInputs.pro.value = saved.pro?.apiKey || ''
  } catch { /* ignore */ }

  // --- Init UI ---
  applyTheme(state.theme)
  buildDropdown()
  updateProviderUI()
  await initRenderer()

  let conv = getCurrentConversation()
  if (!conv && state.conversations.length === 0) {
    createNewConversation()
  } else if (!conv && state.conversations.length > 0) {
    state.currentId = state.conversations[0].id
  }

  renderConversationList()
  await renderMessages()

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}

bootstrap()
