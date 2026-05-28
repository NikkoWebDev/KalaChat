export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function escapeAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function* parseSSEStream(reader, { onData, onDone } = {}) {
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          onDone?.()
          return
        }
        if (data) yield data
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function createDebouncedRAF(fn) {
  let ticking = false
  return function (...args) {
    if (!ticking) {
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        fn(...args)
      })
    }
  }
}
