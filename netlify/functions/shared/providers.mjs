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

export const PROVIDER_CONFIGS = {
  'openrouter-free': {
    baseUrl: envMulti(['OPENROUTER_BASE_URL', 'VITE_OPENROUTER_BASE_URL'], 'https://openrouter.ai/api/v1'),
    model: envMulti(['OPENROUTER_MODEL_FREE', 'VITE_OPENROUTER_MODEL_FREE'], 'openrouter/free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-nemotron': {
    baseUrl: envMulti(['OPENROUTER_BASE_URL', 'VITE_OPENROUTER_BASE_URL'], 'https://openrouter.ai/api/v1'),
    model: envMulti(['OPENROUTER_MODEL_NEMOTRON', 'VITE_OPENROUTER_MODEL_NEMOTRON'], 'nvidia/nemotron-3-super-120b-a12b:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-gptoss': {
    baseUrl: envMulti(['OPENROUTER_BASE_URL', 'VITE_OPENROUTER_BASE_URL'], 'https://openrouter.ai/api/v1'),
    model: envMulti(['OPENROUTER_MODEL_GPTOSS', 'VITE_OPENROUTER_MODEL_GPTOSS'], 'openai/gpt-oss-120b:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-minimax': {
    baseUrl: envMulti(['OPENROUTER_BASE_URL', 'VITE_OPENROUTER_BASE_URL'], 'https://openrouter.ai/api/v1'),
    model: envMulti(['OPENROUTER_MODEL_MINIMAX', 'VITE_OPENROUTER_MODEL_MINIMAX'], 'minimax/minimax-m2.5:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-dolphin': {
    baseUrl: envMulti(['OPENROUTER_BASE_URL', 'VITE_OPENROUTER_BASE_URL'], 'https://openrouter.ai/api/v1'),
    model: envMulti(['OPENROUTER_MODEL_DOLPHIN', 'VITE_OPENROUTER_MODEL_DOLPHIN'], 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free'),
    type: 'openai',
    group: 'openrouter',
  },
  gemini: {
    baseUrl: envMulti(['GEMINI_BASE_URL', 'VITE_GEMINI_BASE_URL'], 'https://generativelanguage.googleapis.com/v1beta'),
    model: envMulti(['GEMINI_MODEL', 'VITE_GEMINI_MODEL'], 'gemini-2.0-flash'),
    type: 'gemini',
    group: 'gemini',
  },
  v4: {
    baseUrl: envMulti(['PRO_BASE_URL', 'VITE_PRO_BASE_URL'], 'https://api.deepseek.com'),
    model: envMulti(['PRO_MODEL_V4', 'VITE_PRO_MODEL_V4'], 'deepseek-chat'),
    type: 'openai',
    group: 'pro',
  },
  'v4-pro': {
    baseUrl: envMulti(['PRO_BASE_URL', 'VITE_PRO_BASE_URL'], 'https://api.deepseek.com'),
    model: envMulti(['PRO_MODEL_V4_PRO', 'VITE_PRO_MODEL_V4_PRO'], 'deepseek-reasoner'),
    type: 'openai',
    group: 'pro',
  },
}
