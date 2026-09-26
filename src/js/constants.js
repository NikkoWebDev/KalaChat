export const IDENTIDAD = {
  nombre: 'Reprebot',
  modelo: 'Kala AI 4.3',
  descripcion: 'Asistente del CEIS · plan de estudios y normativa UNAL',
}

export const STORAGE_KEYS = {
  STATE: 'reprebot_state_v1',
  SETTINGS: 'reprebot_settings_v1',
}

export const DEFAULTS = {
  theme: 'dark',
  conversations: [],
  currentId: null,
  modelo: 'reprebot',
  k: 5,
}

export const API_DEFAULTS = {
  temperature: 0.2,
  maxTokens: 2048,
  timeoutMs: 60_000,
}

export const UI = {
  toastDuration: 2600,
  maxStoredMessages: 120,
  maxInputHeight: 200,
  titleTruncateLength: 44,
}

// Prefijo que se le antepone a la ultima pregunta cuando el hilo tiene historial.
// La API solo acepta la pregunta y la engancha a su prompt del sistema; con esto
// el modelo entiende a que se refiere un "y entonces?" sin perder el anclaje documental.
export const SEGUIMIENTO =
  'Teniendo en cuenta la conversacion anterior, responde a lo siguiente. ' +
  'Si la pregunta es de seguimiento, resuelvela con esa conversacion; ' +
  'si no lo es, responde solo con base en los documentos.'

export const SUGERENCIAS = [
  { titulo: 'Plan de estudios', texto: '¿Cual es el plan de estudios del programa?', icono: 'malla' },
  { titulo: 'Malla curricular', texto: '¿Como se organizan los semestres y las asignaturas de la malla?', icono: 'ruta' },
  { titulo: 'Normativa', texto: '¿Que acuerdos estructuran el plan flexible 2021?', icono: 'norma' },
  { titulo: 'Nivelacion', texto: '¿Como funciona la nivelacion en matematicas?', icono: 'mate' },
  { titulo: 'Estatuto estudiantil', texto: '¿Que dice el estatuto estudiantil sobre la permanencia?', icono: 'libro' },
  { titulo: 'Apoyos', texto: '¿Que apoyos socioeconomicos ofrece Bienestar Universitario?', icono: 'apoyo' },
]

const REPREBOT_CORE = `Eres Reprebot, el asistente del Consejo de Estudiantes de Ingenieria de Sistemas (CEIS) de la Universidad Nacional de Colombia, sede Bogota.

Respondes sobre el plan de estudios de Ingenieria de Sistemas y Computacion, la malla curricular, la normativa UNAL, los procesos academicos, los servicios de Bienestar y las dependencias de la Facultad de Ingenieria. Te basas en los documentos que el sistema te entrega: no inventas datos, cifras, articulos ni correos. Si el contexto no alcanza, lo dices y sugieres a donde acudir.

Escribes en espanol, en segunda persona formal, con precision y sin relleno. Respuestas cortas cuando la pregunta es corta. Usas listas y tablas solo cuando de verdad ordenan la informacion. Cierras citando la fuente cuando aporta.`

export const SYSTEM_PROMPTS = {
  reprebot: REPREBOT_CORE,

  groq: `${REPREBOT_CORE}

Nota de modo: estas corriendo como modelo de proposito general dentro de Reprebot. Si la pregunta no es sobre la UNAL, respondes con tu conocimiento general y lo adviertes.`,
}

const env = import.meta.env

export const MODELOS = {
  reprebot: {
    label: IDENTIDAD.nombre,
    descripcion: 'Documentos del programa y normativa UNAL',
    tipo: 'reprebot',
    grupo: 'reprebot',
    modo: 'free',
    sello: 'Kala AI 4.3',
  },
  groq: {
    label: 'Groq GPT-OSS 120B',
    descripcion: 'Proposito general, respuesta rapida',
    tipo: 'openai',
    grupo: 'groq',
    baseUrl: env.VITE_GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    modelo: env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b',
    modo: 'free',
    sello: 'General',
  },
}

export const API_KEYS_ENV = {
  reprebot: env.VITE_REPREBOT_API_KEY || '',
  groq: env.VITE_GROQ_API_KEY || '',
}

export const REPREBOT_BASE_URL = (env.VITE_REPREBOT_BASE_URL || 'https://api2.nikko.dev').replace(/\/+$/, '')