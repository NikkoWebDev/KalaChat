import { streamChat, getAvailableProviders, getDefaultProvider, isProviderConfigured, setSettingsOverrides } from './api.js'
import {
  renderMessage, renderStreamingMessage, updateStreamingContent,
  finalizeStreamingContent, renderTypingIndicator, removeTypingIndicator,
  formatConversationDate, setupCopyButtons, initRenderer
} from './chat.js'
import { escapeHtml } from './utils.js'
import { STORAGE_KEYS, DEFAULTS, UI } from './constants.js'

let abortController = null
let state = loadState()

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULTS, ...parsed }
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
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

const defaultProvider = getDefaultProvider(state.mode)
if (!state.provider || !getAvailableProviders(state.mode).find(p => p.id === state.provider)) {
  state.provider = defaultProvider
}

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

const el = {
  sidebar: $('#sidebar'),
  sidebarOverlay: $('#sidebar-overlay'),
  menuBtn: $('#menu-btn'),
  main: $('#main'),
  messagesList: $('#messages-list'),
  messagesContainer: $('#messages-container'),
  emptyState: $('#empty-state'),
  input: $('#message-input'),
  sendBtn: $('#send-btn'),
  header: $('#header'),
  themeBtn: $('#theme-btn'),
  modeBtns: $$('.mode-btn'),
  providerSelector: $('#provider-selector'),
  providerDropdown: $('#provider-dropdown'),
  providerLabel: $('#provider-label'),
  providerBadge: $('#provider-badge'),
  dropdownFreeGroup: $('#dropdown-free-group'),
  dropdownProGroup: $('#dropdown-pro-group'),
  dropdownDivider: $('#dropdown-divider'),
  costModal: $('#cost-modal'),
  costModalAccept: $('#cost-modal-accept'),
  costModalCancel: $('#cost-modal-cancel'),
  dontShowAgain: $('#dont-show-again'),
  conversationList: $('#conversation-list'),
  newChatBtnSide: $('#new-chat-btn-side'),
  settingsBtn: $('#settings-btn'),
  settingsModal: $('#settings-modal'),
  settingsClose: $('#settings-close'),
  settingsSave: $('#settings-save'),
  settingsInputs: {
    openrouter: $('#settings-openrouter'),
    gemini: $('#settings-gemini'),
    pro: $('#settings-pro'),
  },
  suggestionChips: $$('.suggestion-chip'),
}

setupCopyButtons(el.messagesList)

function buildDropdown() {
  const freeProviders = getAvailableProviders('free')
  const proProviders = getAvailableProviders('pro')

  el.dropdownFreeGroup.innerHTML =
    '<div class="dropdown-group-label">Gratuitos</div>' +
    freeProviders.map(p => `
      <button class="dropdown-item" data-provider="${p.id}" role="option" aria-selected="${p.id === state.provider}">
        <span class="dropdown-item-name">${escapeHtml(p.label)}${p.badge ? ` <span style="font-size:10px;color:var(--color-gold,#C8A87C);font-weight:600">· ${escapeHtml(p.badge)}</span>` : ''}</span>
        <span class="dropdown-item-badge free-badge">Gratis</span>
      </button>
    `).join('')

  el.dropdownProGroup.innerHTML =
    '<div class="dropdown-group-label">PRO · Facturable</div>' +
    proProviders.map(p => `
      <button class="dropdown-item" data-provider="${p.id}" role="option" aria-selected="${p.id === state.provider}">
        <span class="dropdown-item-name">${escapeHtml(p.label)}</span>
        <span class="dropdown-item-badge pro-badge">PRO</span>
      </button>
    `).join('')

  el.dropdownDivider.style.display = (freeProviders.length > 0 && proProviders.length > 0) ? 'block' : 'none'

  el.dropdownFreeGroup.querySelectorAll('.dropdown-item').forEach(bindDropdownItem)
  el.dropdownProGroup.querySelectorAll('.dropdown-item').forEach(bindDropdownItem)
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
        el.providerDropdown.hidden = true
        return
      }
      state.provider = providerId
    }
    updateProviderUI()
    saveState()
    el.providerDropdown.hidden = true
  })
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  state.theme = theme
  saveState()
}

el.themeBtn.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark')
})

function setMode(mode) {
  if (mode === state.mode) return
  if (mode === 'pro' && !state.costWarningDismissed) {
    showCostModal(() => doSetMode(mode))
    return
  }
  doSetMode(mode)
}

function doSetMode(mode) {
  state.mode = mode
  el.modeBtns.forEach((btn) => {
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

el.modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode))
})

function updateProviderUI() {
  const providers = getAvailableProviders(state.mode)
  const current = providers.find(p => p.id === state.provider)

  if (current) {
    el.providerLabel.textContent = current.label
    el.providerBadge.textContent = state.mode === 'free' ? 'Gratuito' : 'PRO'
    el.providerBadge.className = `provider-cost ${state.mode === 'free' ? 'free-cost' : 'pro-cost'}`

    el.dropdownFreeGroup.querySelectorAll('.dropdown-item').forEach((item) => {
      item.setAttribute('aria-selected', item.dataset.provider === state.provider)
    })
    el.dropdownProGroup.querySelectorAll('.dropdown-item').forEach((item) => {
      item.setAttribute('aria-selected', item.dataset.provider === state.provider)
    })
  }
}

el.providerSelector.addEventListener('click', (e) => {
  e.stopPropagation()
  el.providerDropdown.hidden = !el.providerDropdown.hidden
})

document.addEventListener('click', () => {
  el.providerDropdown.hidden = true
})

function toggleSidebar() { document.body.classList.toggle('sidebar-open') }
function closeSidebar() { document.body.classList.remove('sidebar-open') }

el.menuBtn.addEventListener('click', toggleSidebar)
el.sidebarOverlay.addEventListener('click', closeSidebar)

function showCostModal(onAccept) {
  el.costModal.hidden = false
  el.dontShowAgain.checked = false

  const handleAccept = () => {
    if (el.dontShowAgain.checked) {
      state.costWarningDismissed = true
      saveState()
    }
    el.costModal.hidden = true
    el.costModalAccept.removeEventListener('click', handleAccept)
    el.costModalCancel.removeEventListener('click', handleCancel)
    onAccept?.()
  }

  const handleCancel = () => {
    el.costModal.hidden = true
    el.costModalAccept.removeEventListener('click', handleAccept)
    el.costModalCancel.removeEventListener('click', handleCancel)
    if (state.mode === 'pro') doSetMode('free')
  }

  el.costModalAccept.addEventListener('click', handleAccept)
  el.costModalCancel.addEventListener('click', handleCancel)
}

function loadSettingsIntoUI() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}')
    el.settingsInputs.openrouter.value = saved.openrouter?.apiKey || ''
    el.settingsInputs.gemini.value = saved.gemini?.apiKey || ''
    el.settingsInputs.pro.value = saved.pro?.apiKey || ''
  } catch { /* use env defaults */ }
}

el.settingsBtn.addEventListener('click', () => {
  closeSidebar()
  loadSettingsIntoUI()
  el.settingsModal.hidden = false
})

el.settingsClose.addEventListener('click', () => {
  el.settingsModal.hidden = true
})

el.settingsSave.addEventListener('click', () => {
  const overrides = {
    openrouter: { apiKey: el.settingsInputs.openrouter.value.trim() },
    gemini: { apiKey: el.settingsInputs.gemini.value.trim() },
    pro: { apiKey: el.settingsInputs.pro.value.trim() },
  }

  setSettingsOverrides(overrides)
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(overrides))
  el.settingsModal.hidden = true

  const btn = el.settingsSave
  const original = btn.textContent
  btn.textContent = '✓ Guardado'
  btn.style.pointerEvents = 'none'
  setTimeout(() => {
    btn.textContent = original
    btn.style.pointerEvents = ''
  }, 1500)
})

$$('.modal-overlay').forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
      modal.hidden = true
    }
  })
})

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
  if (state.conversations.length === 0) {
    el.conversationList.innerHTML =
      '<div class="empty-conversations">Sin conversaciones aún</div>'
    return
  }

  el.conversationList.innerHTML = state.conversations
    .map((c) => {
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

  el.conversationList.querySelectorAll('.conversation-item').forEach((item) => {
    item.addEventListener('click', () => switchToConversation(item.dataset.convId))
  })
  el.conversationList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => deleteConversation(btn.dataset.convId, e))
  })
}

async function renderMessages() {
  const messages = getCurrentConversation()?.messages || []
  el.messagesList.innerHTML = ''

  if (messages.length === 0) {
    el.emptyState.style.display = 'flex'
    return
  }

  el.emptyState.style.display = 'none'

  const fragments = await Promise.all(messages.map(msg => renderMessage(msg)))
  fragments.forEach(f => el.messagesList.appendChild(f))

  scrollToBottom()
}

let scrollRafId = null
function scrollToBottom() {
  if (scrollRafId) cancelAnimationFrame(scrollRafId)
  scrollRafId = requestAnimationFrame(() => {
    el.messagesContainer.scrollTop = el.messagesContainer.scrollHeight
    scrollRafId = null
  })
}

async function sendMessage() {
  const text = el.input.value.trim()
  if (!text || state.sending) return

  let conv = getCurrentConversation()
  if (!conv) conv = createNewConversation()

  if (!isProviderConfigured(state.provider)) {
    const name = getAvailableProviders(state.mode).find(p => p.id === state.provider)?.label || state.provider
    showToast(`Configura API key para ${name} en Ajustes`)
    return
  }

  state.sending = true
  el.sendBtn.disabled = true
  el.input.disabled = true
  el.emptyState.style.display = 'none'

  const userMsg = {
    id: `msg_${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: Date.now(),
  }

  conv.messages.push(userMsg)
  conv.updatedAt = Date.now()

  if (conv.messages.filter(m => m.role === 'user').length === 1) {
    conv.title = text.length > UI.titleTruncateLength
      ? text.slice(0, UI.titleTruncateLength) + '…'
      : text
  }

  el.messagesList.appendChild(await renderMessage(userMsg))
  el.input.value = ''
  el.input.style.height = 'auto'
  scrollToBottom()

  const currentProvider = getAvailableProviders(state.mode)
    .find(p => p.id === state.provider)?.label || ''
  el.messagesList.appendChild(renderTypingIndicator(currentProvider))
  scrollToBottom()

  const aiMsgId = `msg_${Date.now() + 1}`
  const aiMsgEl = renderStreamingMessage(aiMsgId)
  removeTypingIndicator()
  el.messagesList.appendChild(aiMsgEl)
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
    el.sendBtn.disabled = false
    el.input.disabled = false
    el.input.focus()
    abortController = null
  }
}

el.input.addEventListener('input', () => {
  el.input.style.height = 'auto'
  el.input.style.height = Math.min(el.input.scrollHeight, UI.maxInputHeight) + 'px'
  el.sendBtn.disabled = !el.input.value.trim() || state.sending
})

el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!el.sendBtn.disabled) sendMessage()
  }
})

el.sendBtn.addEventListener('click', sendMessage)

el.suggestionChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    el.input.value = chip.dataset.prompt
    el.input.style.height = 'auto'
    el.input.style.height = Math.min(el.input.scrollHeight, UI.maxInputHeight) + 'px'
    el.sendBtn.disabled = false
    el.input.focus()
  })
})

el.newChatBtnSide.addEventListener('click', () => {
  createNewConversation()
  closeSidebar()
})

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    sendMessage()
  }
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault()
    el.input.focus()
  }
})

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

async function init() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}')
    setSettingsOverrides(saved)
    el.settingsInputs.openrouter.value = saved.openrouter?.apiKey || ''
    el.settingsInputs.gemini.value = saved.gemini?.apiKey || ''
    el.settingsInputs.pro.value = saved.pro?.apiKey || ''
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

init()
