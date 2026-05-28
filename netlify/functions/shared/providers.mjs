function env(key, fallback) {
  return process.env[key] || fallback
}

export const PROVIDER_CONFIGS = {
  'openrouter-free': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
    model: env('VITE_OPENROUTER_MODEL_FREE', 'openrouter/free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-nemotron': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
    model: env('VITE_OPENROUTER_MODEL_NEMOTRON', 'nvidia/nemotron-3-super-120b-a12b:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-gptoss': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
    model: env('VITE_OPENROUTER_MODEL_GPTOSS', 'openai/gpt-oss-120b:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-minimax': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
    model: env('VITE_OPENROUTER_MODEL_MINIMAX', 'minimax/minimax-m2.5:free'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-dolphin': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
    model: env('VITE_OPENROUTER_MODEL_DOLPHIN', 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free'),
    type: 'openai',
    group: 'openrouter',
  },
  gemini: {
    baseUrl: env('VITE_GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
    model: env('VITE_GEMINI_MODEL', 'gemini-2.0-flash'),
    type: 'gemini',
    group: 'gemini',
  },
  v4: {
    baseUrl: env('VITE_PRO_BASE_URL', ''),
    model: env('VITE_PRO_MODEL_V4', ''),
    type: 'openai',
    group: 'pro',
  },
  'v4-pro': {
    baseUrl: env('VITE_PRO_BASE_URL', ''),
    model: env('VITE_PRO_MODEL_V4_PRO', ''),
    type: 'openai',
    group: 'pro',
  },
}
