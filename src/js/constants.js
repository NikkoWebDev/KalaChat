export const STORAGE_KEYS = {
  STATE: 'kalachat_state',
  SETTINGS: 'kalachat_settings',
}

export const DEFAULTS = {
  mode: import.meta.env.VITE_DEFAULT_MODE || '',
  theme: 'dark',
  conversations: [],
  currentId: null,
  provider: null,
  costWarningDismissed: false,
}

export const API_DEFAULTS = {
  temperature: 0.7,
  maxTokens: 4096,
}

export const UI = {
  toastDuration: 2500,
  maxStoredMessages: 100,
  maxInputHeight: 120,
  titleTruncateLength: 40,
  scrollDebounceMs: 16,
}
