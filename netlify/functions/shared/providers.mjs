function env(key) {
  return process.env[key] || ''
}

export const PROVIDER_CONFIGS = {
  'openrouter-free': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL'),
    model: env('VITE_OPENROUTER_MODEL_FREE'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-nemotron': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL'),
    model: env('VITE_OPENROUTER_MODEL_NEMOTRON'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-gptoss': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL'),
    model: env('VITE_OPENROUTER_MODEL_GPTOSS'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-minimax': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL'),
    model: env('VITE_OPENROUTER_MODEL_MINIMAX'),
    type: 'openai',
    group: 'openrouter',
  },
  'openrouter-dolphin': {
    baseUrl: env('VITE_OPENROUTER_BASE_URL'),
    model: env('VITE_OPENROUTER_MODEL_DOLPHIN'),
    type: 'openai',
    group: 'openrouter',
  },
  gemini: {
    baseUrl: env('VITE_GEMINI_BASE_URL'),
    model: env('VITE_GEMINI_MODEL'),
    type: 'gemini',
    group: 'gemini',
  },
  v4: {
    baseUrl: env('VITE_PRO_BASE_URL'),
    model: env('VITE_PRO_MODEL_V4'),
    type: 'openai',
    group: 'pro',
  },
  'v4-pro': {
    baseUrl: env('VITE_PRO_BASE_URL'),
    model: env('VITE_PRO_MODEL_V4_PRO'),
    type: 'openai',
    group: 'pro',
  },
}
