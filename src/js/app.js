import { streamChat, getAvailableProviders, getDefaultProvider, isProviderConfigured, setSettingsOverrides } from './api.js'
import {
  renderMessage, renderStreamingMessage, updateStreamingContent,
  finalizeStreamingContent, renderTypingIndicator, removeTypingIndicator,
  formatConversationDate, setupCopyButtons, initRenderer
} from './chat.js'
import { escapeHtml } from './utils.js'
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
    'dropdown-pro-group', 'dropdown-divider', 'cost-modal',
    'cost-modal-accept', 'cost-modal-cancel', 'dont-show-again',
    'conversation-list', 'new-chat-btn-side', 'settings-btn',
    'settings-modal', 'settings-close', 'settings-save',
    'settings-openrouter', 'settings-gemini', 'settings-pro',
    'file-input', 'attach-btn', 'file-list',
  ]
  ids.forEach(id => { el[id] = $(`#${id}`) })
  el.modeBtns = $$('.mode-btn')
  el.suggestionChips = $$('.suggestion-chip')
  el.settingsInputs = {
    openrouter: el['settings-openrouter'],
    gemini: el['settings-gemini'],
    pro: el['settings-pro'],
  }
  el.costModalAccept = el['cost-modal-accept']
  el.costModalCancel = el['cost-modal-cancel']
  el.dontShowAgain = el['dont-show-again']
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

function saveState() {
  try {
    const toStore = {
      mode: state.mode,
      theme: state.theme,
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
  saveState()
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
    mode: state.mode,
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
  const providers = getAvailableProviders(state.mode)
  const current = providers.find(p => p.id === state.provider)

  if (current && el['provider-label'] && el['provider-badge']) {
    el['provider-label'].textContent = current.label
    el['provider-badge'].textContent = state.mode === 'free' ? 'Gratuito' : 'PRO'
    el['provider-badge'].className = `provider-cost ${state.mode === 'free' ? 'free-cost' : 'pro-cost'}`
  }

  el['dropdown-free-group']?.querySelectorAll('.dropdown-item').forEach(item => {
    item.setAttribute('aria-selected', item.dataset.provider === state.provider)
  })
  el['dropdown-pro-group']?.querySelectorAll('.dropdown-item').forEach(item => {
    item.setAttribute('aria-selected', item.dataset.provider === state.provider)
  })
}

function doSetMode(mode) {
  state.mode = mode
  el.modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode)
    btn.setAttribute('aria-checked', btn.dataset.mode === mode)
  })

  const providers = getAvailableProviders(mode)
  const currentInMode = providers.find(p => p.id === state.provider)
  state.provider = currentInMode ? state.provider : (providers[0]?.id || null)

  buildDropdown()
  updateProviderUI()
  saveState()
}

function setMode(mode) {
  if (mode === state.mode) return
  if (mode === 'pro' && !state.costWarningDismissed) {
    showCostModal(() => doSetMode(mode))
    return
  }
  doSetMode(mode)
}

function buildDropdown() {
  const freeProviders = getAvailableProviders('free')
  const proProviders = getAvailableProviders('pro')

  if (el['dropdown-free-group']) {
    el['dropdown-free-group'].innerHTML =
      '<div class="dropdown-group-label">Gratuitos</div>' +
      freeProviders.map(p => `
        <button class="dropdown-item" data-provider="${escapeHtml(p.id)}" role="option" aria-selected="${p.id === state.provider}">
          <span class="dropdown-item-name">${escapeHtml(p.label)}${p.badge ? ` <span style="font-size:10px;color:var(--color-gold,#C8A87C);font-weight:600">· ${escapeHtml(p.badge)}</span>` : ''}</span>
          <span class="dropdown-item-badge free-badge">Gratis</span>
        </button>
      `).join('')
  }

  if (el['dropdown-pro-group']) {
    el['dropdown-pro-group'].innerHTML =
      '<div class="dropdown-group-label">PRO · Facturable</div>' +
      proProviders.map(p => `
        <button class="dropdown-item" data-provider="${escapeHtml(p.id)}" role="option" aria-selected="${p.id === state.provider}">
          <span class="dropdown-item-name">${escapeHtml(p.label)}</span>
          <span class="dropdown-item-badge pro-badge">PRO</span>
        </button>
      `).join('')
  }

  if (el['dropdown-divider']) {
    el['dropdown-divider'].style.display = (freeProviders.length > 0 && proProviders.length > 0) ? 'block' : 'none'
  }

  el['dropdown-free-group']?.querySelectorAll('.dropdown-item').forEach(bindDropdownItem)
  el['dropdown-pro-group']?.querySelectorAll('.dropdown-item').forEach(bindDropdownItem)
}

function bindDropdownItem(item) {
  item.addEventListener('click', () => {
    const providerId = item.dataset.provider
    if (state.mode === 'free') {
      state.provider = providerId
    } else {
      if (!state.costWarningDismissed) {
        showCostModal(() => {
          state.provider = providerId
          updateProviderUI()
          saveState()
        })
        el['provider-dropdown'].hidden = true
        return
      }
      state.provider = providerId
    }
    updateProviderUI()
    saveState()
    el['provider-dropdown'].hidden = true
  })
}

function showCostModal(onAccept) {
  el['cost-modal'].hidden = false
  el['dont-show-again'].checked = false

  const handleAccept = () => {
    if (el['dont-show-again'].checked) {
      state.costWarningDismissed = true
      saveState()
    }
    el['cost-modal'].hidden = true
    el['cost-modal-accept'].removeEventListener('click', handleAccept)
    el['cost-modal-cancel'].removeEventListener('click', handleCancel)
    onAccept?.()
  }

  const handleCancel = () => {
    el['cost-modal'].hidden = true
    el['cost-modal-accept'].removeEventListener('click', handleAccept)
    el['cost-modal-cancel'].removeEventListener('click', handleCancel)
    if (state.mode === 'pro') doSetMode('free')
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
      return `
        <div class="conversation-item ${isActive ? 'active' : ''}" data-conv-id="${escapeHtml(c.id)}">
          <div class="conversation-item-title">${escapeHtml(c.title)}</div>
          <div class="conversation-item-meta">
            <span>${escapeHtml(date)}</span>
            <span>·</span>
            <span>${c.mode === 'free' ? 'Free' : 'PRO'}</span>
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
  if (!text || state.sending) return

  let conv = getCurrentConversation()
  if (!conv) conv = createNewConversation()

  if (!isProviderConfigured(state.provider)) {
    const name = getAvailableProviders(state.mode).find(p => p.id === state.provider)?.label || state.provider
    showToast(`Configura API key para ${name} en Ajustes`)
    return
  }

  state.sending = true
  el['send-btn'].disabled = true
  el['message-input'].disabled = true
  if (el['empty-state']) el['empty-state'].style.display = 'none'

  let messageText = text

  if (currentFiles.length > 0) {
    const fileBlocks = currentFiles.map(f =>
      `[Archivo: ${f.name}]\n\`\`\`\n${f.content}\n\`\`\``
    ).join('\n\n')
    messageText = `${fileBlocks}\n\n${text}`
    currentFiles = []
    renderFileList()
  }

  const userMsg = {
    id: `msg_${Date.now()}`,
    role: 'user',
    content: messageText,
    timestamp: Date.now(),
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

  const currentProvider = getAvailableProviders(state.mode)
    .find(p => p.id === state.provider)?.label || ''
  el['messages-list'].appendChild(renderTypingIndicator(currentProvider))
  scrollToBottom()

  const aiMsgId = `msg_${Date.now() + 1}`
  const aiMsgEl = renderStreamingMessage(aiMsgId)
  removeTypingIndicator()
  el['messages-list'].appendChild(aiMsgEl)
  scrollToBottom()

  let fullResponse = ''
  abortController = new AbortController()

  try {
    const messagesForApi = conv.messages.map(m => ({ role: m.role, content: m.content }))

    for await (const chunk of streamChat(messagesForApi, {
      provider: state.provider,
      signal: abortController.signal,
    })) {
      fullResponse += chunk
      updateStreamingContent(aiMsgId, fullResponse)
      scrollToBottom()
    }

    await finalizeStreamingContent(aiMsgId, fullResponse)

    const aiMsg = {
      id: aiMsgId,
      role: 'assistant',
      content: fullResponse,
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
        await finalizeStreamingContent(aiMsgId, fullResponse)
        conv.messages.push({
          id: aiMsgId,
          role: 'assistant',
          content: fullResponse + '\n\n*(generación detenida)*',
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

function isTextFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext) return file.type.startsWith('text/')
  if (TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(file.name)) return true
  if (['jpg','jpeg','png','gif','bmp','webp','ico','svg','tiff','avif'].includes(ext)) return false
  return file.type.startsWith('text/') || !file.type
}

async function handleFileSelect(files) {
  for (const file of files) {
    if (currentFiles.length >= 5) {
      showToast('Máximo 5 archivos')
      break
    }

    if (file.size > 500 * 1024) {
      showToast(`"${file.name}" excede 500 KB`)
      continue
    }

    if (!isTextFile(file)) {
      showToast(`"${file.name}" no es un archivo de texto compatible`)
      continue
    }

    try {
      const text = await file.text()
      currentFiles.push({ name: file.name, content: text })
    } catch {
      showToast(`No se pudo leer "${file.name}"`)
    }
  }
  renderFileList()
  el['message-input'].focus()
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
    `<span class="file-chip" title="${escapeHtml(f.name)}">
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
}

function initProviders() {
  const defaultProvider = getDefaultProvider(state.mode)
  if (!state.provider || !getAvailableProviders(state.mode).find(p => p.id === state.provider)) {
    state.provider = defaultProvider
  }
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

  setupCopyButtons(el['messages-list'])

  if (el['provider-selector']) {
    el['provider-selector'].addEventListener('click', e => {
      e.stopPropagation()
      if (el['provider-dropdown']) {
        el['provider-dropdown'].hidden = !el['provider-dropdown'].hidden
      }
    })
  }

  document.addEventListener('click', () => {
    if (el['provider-dropdown']) el['provider-dropdown'].hidden = true
  })

  if (el['theme-btn']) {
    el['theme-btn'].addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark')
    })
  }

  el.modeBtns.forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode))
  })

  if (el['menu-btn']) el['menu-btn'].addEventListener('click', toggleSidebar)
  if (el['sidebar-overlay']) el['sidebar-overlay'].addEventListener('click', closeSidebar)

  if (el['settings-btn']) {
    el['settings-btn'].addEventListener('click', () => {
      closeSidebar()
      loadSettingsIntoUI()
      if (el['settings-modal']) el['settings-modal'].hidden = false
    })
  }

  if (el['settings-close']) {
    el['settings-close'].addEventListener('click', () => {
      if (el['settings-modal']) el['settings-modal'].hidden = true
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
      if (el['settings-modal']) el['settings-modal'].hidden = true

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

  $$('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
        modal.hidden = true
      }
    })
  })

  if (el['message-input']) {
    el['message-input'].addEventListener('input', () => {
      el['message-input'].style.height = 'auto'
      el['message-input'].style.height = Math.min(el['message-input'].scrollHeight, UI.maxInputHeight) + 'px'
      if (el['send-btn']) {
        el['send-btn'].disabled = !el['message-input'].value.trim() || state.sending
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

  el.suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (el['message-input']) {
        el['message-input'].value = chip.dataset.prompt
        el['message-input'].style.height = 'auto'
        el['message-input'].style.height = Math.min(el['message-input'].scrollHeight, UI.maxInputHeight) + 'px'
      }
      if (el['send-btn']) el['send-btn'].disabled = false
      el['message-input'].focus()
    })
  })

  if (el['new-chat-btn-side']) {
    el['new-chat-btn-side'].addEventListener('click', () => {
      createNewConversation()
      closeSidebar()
    })
  }

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      sendMessage()
    }
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      e.preventDefault()
      el['message-input']?.focus()
    }
  })

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

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}')
    setSettingsOverrides(saved)
    if (el.settingsInputs.openrouter) el.settingsInputs.openrouter.value = saved.openrouter?.apiKey || ''
    if (el.settingsInputs.gemini) el.settingsInputs.gemini.value = saved.gemini?.apiKey || ''
    if (el.settingsInputs.pro) el.settingsInputs.pro.value = saved.pro?.apiKey || ''
  } catch { /* ignore */ }

  applyTheme(state.theme)
  doSetMode(state.mode)
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
