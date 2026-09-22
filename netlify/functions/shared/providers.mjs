function env(key, fallback) {
  return process.env[key] || fallback
}

function envMulti(keys, fallback) {
  for (const key of keys) {
    const val = process.env[key]
    if (val) return val
  }
  return fallback
}

const openrouterBase = () => envMulti(['OPENROUTER_BASE_URL', 'VITE_OPENROUTER_BASE_URL'], 'https://openrouter.ai/api/v1')
const geminiBase = () => envMulti(['GEMINI_BASE_URL', 'VITE_GEMINI_BASE_URL'], 'https://generativelanguage.googleapis.com/v1beta')
const proBase = () => envMulti(['PRO_BASE_URL', 'VITE_PRO_BASE_URL'], 'https://api.deepseek.com')

export const PROVIDER_CONFIGS = {
  // IDs que envia el frontend (src/js/constants.js)
  'or-glm': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_FREE', 'VITE_OPENROUTER_MODEL_FREE'], 'z-ai/glm-5.2:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'or-nemotron': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_NEMOTRON', 'VITE_OPENROUTER_MODEL_NEMOTRON'], 'nvidia/nemotron-3-super-120b-a12b:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'or-gptoss': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_GPTOSS', 'VITE_OPENROUTER_MODEL_GPTOSS'], 'openai/gpt-oss-120b:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'or-minimax': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_MINIMAX', 'VITE_OPENROUTER_MODEL_MINIMAX'], 'minimax/minimax-m2.5:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'or-dolphin': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_DOLPHIN', 'VITE_OPENROUTER_MODEL_DOLPHIN'], 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free'),
    type: 'openai',
    group: 'openrouter',
  },
  gemini: {
    baseUrl: geminiBase(),
    model: envMulti(['GEMINI_MODEL', 'VITE_GEMINI_MODEL'], 'gemini-2.0-flash'),
    type: 'gemini',
    group: 'gemini',
  },
  'pro-flash': {
    baseUrl: proBase(),
    model: envMulti(['PRO_MODEL_V4', 'VITE_PRO_MODEL_V4'], 'deepseek-chat'),
    type: 'openai',
    group: 'pro',
  },
  'pro-reasoner': {
    baseUrl: proBase(),
    model: envMulti(['PRO_MODEL_V4_PRO', 'VITE_PRO_MODEL_V4_PRO'], 'deepseek-reasoner'),
    type: 'openai',
    group: 'pro',
  },

  // Alias legacy por compatibilidad
  'openrouter-free': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_FREE', 'VITE_OPENROUTER_MODEL_FREE'], 'openrouter/free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-nemotron': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_NEMOTRON', 'VITE_OPENROUTER_MODEL_NEMOTRON'], 'nvidia/nemotron-3-super-120b-a12b:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-gptoss': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_GPTOSS', 'VITE_OPENROUTER_MODEL_GPTOSS'], 'openai/gpt-oss-120b:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-minimax': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_MINIMAX', 'VITE_OPENROUTER_MODEL_MINIMAX'], 'minimax/minimax-m2.5:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-dolphin': {
    baseUrl: openrouterBase(),
    model: envMulti(['OPENROUTER_MODEL_DOLPHIN', 'VITE_OPENROUTER_MODEL_DOLPHIN'], 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free'),
    type: 'openai',
    group: 'openrouter',
  },
  v4: {
    baseUrl: proBase(),
    model: envMulti(['PRO_MODEL_V4', 'VITE_PRO_MODEL_V4'], 'deepseek-chat'),
    type: 'openai',
    group: 'pro',
  },
  'v4-pro': {
    baseUrl: proBase(),
    model: envMulti(['PRO_MODEL_V4_PRO', 'VITE_PRO_MODEL_V4_PRO'], 'deepseek-reasoner'),
    type: 'openai',
    group: 'pro',
  },
}
