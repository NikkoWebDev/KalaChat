# Reprebot · KalaChat

Asistente del Consejo de Estudiantes de Ingeniería de Sistemas (CEIS) — UNAL sede Bogotá.
Responde sobre plan de estudios, malla curricular, normativa UNAL y servicios de la Facultad,
citando las fuentes documentales. Incluye un segundo modelo de propósito general vía Groq.

## Modelos

| Modelo | ID | Uso |
|---|---|---|
| Reprebot (Kala AI 4.3) | `reprebot` | Documental: RAG sobre documentos del programa y normativa UNAL. Es el modelo por defecto. |
| Groq GPT-OSS 120B | `groq` | Propósito general (`openai/gpt-oss-120b` vía API compatible OpenAI). Pide clave si no hay una configurada. |

El selector vive junto al compositor (botón con el nombre del modelo). El historial guarda qué
modelo respondió cada mensaje.

## Stack

- Astro 5 (salida estática) + Tailwind CSS
- Sin framework reactivo en el cliente: JS modular en `src/js/` (`app.js` estado/UI, `api.js`
  diálogo con proveedores, `chat.js` render Markdown+código+fuentes, `utils.js`, `constants.js`)
- Markdown con `marked` + sanitizado `DOMPurify` + resaltado `Prism`
- Streaming SSE tanto del backend RAG como de Groq
- Persistencia en `localStorage` (conversaciones, tema, `k`, claves opcionales)

## Puesta en marcha

```bash
npm install
npm run dev      # abre la URL "Local" que imprime la terminal (5173, o la siguiente libre)
npm run build    # genera dist/
npm run preview  # sirve el build
```

> Si `npm run dev` se veía "plano" (HTML sin estilos): era porque `src/styles/base.css`
> no estaba importado por nadie. Ya quedó importado en `src/layouts/Layout.astro`; si ves
> la app sin estilos, haz recarga fuerte (`Ctrl+Shift+R`).

## Variables de entorno

| Variable | Para qué |
|---|---|
| `VITE_REPREBOT_BASE_URL` | Endpoint RAG (por defecto `https://api2.nikko.dev`). Ver "Backend en api2.nikko.dev". |
| `VITE_REPREBOT_API_KEY` | `X-Api-Key` opcional propia de Reprebot. |
| `VITE_GROQ_BASE_URL` | Por defecto `https://api.groq.com/openai/v1`. |
| `VITE_GROQ_API_KEY` | Clave de Groq (`gsk-…`). También se puede pegar en Ajustes (queda solo en el navegador). |
| `VITE_GROQ_MODEL` | Por defecto `openai/gpt-oss-120b`. |

`.env` está en `.gitignore` y **nunca se sube**: las claves reales solo viven ahí o en
`localStorage`. En producción (Netlify) hay que definirlas en
Site settings → Environment variables. `.env.example` trae la plantilla con placeholders.

## Estructura

```
src/
  pages/index.astro            # composición: Sidebar + Header + MessagesContainer + InputArea
  layouts/Layout.astro         # importa base.css y arranca src/js/app.js
  components/
    Sidebar.astro              # conversaciones, búsqueda, ajustes
    Header.astro               # exportar, enlace Facultad
    MessagesContainer.astro    # estado vacío + sugerencias + lista de mensajes
    InputArea.astro            # selector de modelo + compositor + adjuntos
    SettingsModal.astro        # modelo activo, k-fuentes, tema, clave, atajos, datos
  js/
    app.js                     # estado, conversaciones, streaming, eventos
    api.js                     # generador dialogar(): reprebot (SSE propio) / Groq (OpenAI-compat)
    chat.js                    # Markdown seguro, bloques de código, fuentes, razonamiento
    constants.js               # identidad, MODELOS, prompts, defaults
    utils.js                   # escape, copiar, descargar, scroll
  styles/base.css              # tokens (claro/oscuro), mensajes, código, compositor…
mvp/index.html                 # prototipo antiguo (sin claves reales)
```

`dist/` es el build (ignorado en git). `netlify.toml` redirige todo a `/index.html`;
`vercel.json` hace lo propio con rewrites.

## Atajos

`Enter` enviar · `Shift+Enter` nueva línea · `Ctrl+Shift+O` nueva conversación ·
`Ctrl+K` buscar · `/` enfocar compositor · `Esc` detener generación.

## Backend en api2.nikko.dev

El frontend apunta a `https://api2.nikko.dev` (directo primero, proxy `/api/reprebot`
como respaldo). Para que responda, el subdominio debe cumplir esto:

1. **DNS** — `api2.nikko.dev` resolviendo al servidor. ✅ (ya resuelve)
2. **TLS** — certificado válido en el 443 (hoy falla el handshake). Con Caddy es
   automático; con nginx + certbot: `certbot --nginx -d api2.nikko.dev`.
3. **Reverse proxy** hacia el RAG (`https://reprebot-api.onrender.com`), ejemplo nginx:
   `proxy_pass https://reprebot-api.onrender.com;` preservando `Host` del upstream.
4. **CORS permisivo** (las peticiones no llevan credenciales, basta `*`):
   `Access-Control-Allow-Origin: *`,
   `Access-Control-Allow-Headers: content-type, x-api-key`,
   `Access-Control-Allow-Methods: GET, POST, OPTIONS`, y responder el `OPTIONS`
   con 200. Con esto el directo funciona desde cualquier origen y el proxy queda
   de respaldo.

Verificar cuando esté listo:

```bash
curl -s -m 20 -X OPTIONS https://api2.nikko.dev/v1/chat/completions \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" -D - -o /dev/null
curl -s -m 60 -X POST https://api2.nikko.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hola"}],"stream":false}' | head -c 200
```

El OPTIONS debe devolver 200 con `access-control-allow-origin`.

> **Ojo si `api2` solo reenvía a Render:** el RAG mantiene su propia allowlist y
> responde `OPTIONS → 400` a orígenes no permitidos (p. ej. `repre.nikko.dev`).
> En ese caso el CORS debe resolverlo `api2` en el borde: responder el `OPTIONS`
> él mismo e inyectar `Access-Control-Allow-Origin` en las respuestas del POST.
> Ejemplo nginx:
>
> ```nginx
> location /v1/ {
>   if ($request_method = OPTIONS) {
>     add_header Access-Control-Allow-Origin *;
>     add_header Access-Control-Allow-Headers "content-type, x-api-key";
>     add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
>     return 200;
>   }
>   proxy_pass https://reprebot-api.onrender.com;
>   proxy_set_header Host reprebot-api.onrender.com;
>   add_header Access-Control-Allow-Origin * always;
>   add_header Access-Control-Allow-Headers "content-type, x-api-key" always;
> }
> ```
>
> Con Caddy basta un `handle_response`/`header` equivalente. Sin esto, el
> navegador bloquea el directo y el chat depende del proxy `/api/reprebot`.

### Diagnosticar el proxy `/api/reprebot`

Abrir `GET https://TU-DOMINIO/api/reprebot` en el navegador:

- **405 / "Method not allowed"** → la función está viva.
- **404 o el HTML de la app** → no se desplegó (o un rewrite la tapa; en Vercel
  el rewrite excluye `/api/*`). Redeploy y reintentar.

## Si falla con error de red

El backend RAG vive en Render (plan gratuito): tras un rato sin uso se duerme y el
primer intento puede fallar con `NetworkError`. El chat lo detecta solo:

- reintenta hasta 2 veces (3 s y 10 s) mostrando _"El servidor está despertando…"_
  en la burbuja;
- si no hay internet (`navigator.onLine`), lo dice directamente en vez de reintentar;
- si todo falla, el mensaje explica la causa en lugar del `TypeError` crudo del navegador.

### CORS y el proxy `/api/reprebot`

El backend original tenía allowlist estricta de orígenes (verificado: solo aceptaba
`http://localhost:5173` y `http://127.0.0.1:5173`; cualquier otro origen recibía
`OPTIONS → 400` sin `Access-Control-Allow-Origin`). Con `api2.nikko.dev` y CORS
permisivo (sección anterior) el directo funciona desde cualquier origen. De todos
modos el proxy queda como respaldo:

- en dev usa **exactamente el puerto 5173** (`strictPort` está activado para que
  Astro no salte en silencio a otro puerto, que fallaría por CORS);
- en cualquier otro origen el frontend usa el proxy mismo-origen `/api/reprebot`,
  que reenvía servidor-a-servidor donde no aplica CORS:
  - Netlify: `netlify/functions/reprebot.mjs` + redirect en `netlify.toml`;
  - Vercel: `api/reprebot.js`.
- En `npm run dev` plano no hay proxy (responde 404): el chat lo detecta
  (`SIN_PROXY`), no lo vuelve a intentar en la sesión y sigue por la vía directa.

Causas típicas si persiste: sin internet, VPN/DNS, o un bloqueador (adblock) cortando
`reprebot-api.onrender.com`. Groq tiene el mismo trato ante cortes de red.

## Historial de cambios de este trabajo

1. **Reparación del chat** — el selector de modelo no abría (`el.selectorModelo`
   inexistente → `el.modeloBtn` + `aria-expanded`); los modales no centraban
   (faltaba alternar `flex` con `hidden`); Prism estaba importado pero jamás se
   cargaba (sin resaltado de código); `marked.parse` ahora con `await`; el slider
   `k` ya persiste; los `VITE_*_PLACEHOLDER` del `.env` se ignoran como claves;
   el proxy Netlify aceptaba IDs distintos a los del frontend (siempre `400
   Unknown provider`) y su rama Gemini devolvía el cuerpo crudo en vez de SSE
   normalizado; además se permitió origen `127.0.0.1` y `releaseLock` seguro.
2. **CSS desconectado** — `base.css` existía pero nadie lo importaba: ni `dev` ni
   `build` incluían estilos. Se importó en `Layout.astro`.
3. **Limpieza a un modelo** — se eliminaron OpenRouter/Gemini/DeepSeek: fuera menú
   multinivel, interruptor de razonamiento, modal PRO (`CostModal`), Netlify
   Functions del proxy y sus env vars.
4. **Groq** — key validada contra `/models` y probada con un `chat/completions`;
   modelo `openai/gpt-oss-120b` como segunda opción con selector mínimo
   (Documental/General), campo de clave en Ajustes y `VITE_GROQ_*` en `.env`.
   El push inicial lo frenó el push-protection de GitHub por una key vieja
   quemada en `mvp/index.html`, que se sanitizó a placeholder. Todo publicado
   en `main` de `NikkoWebDev/KalaChat`.

## Seguridad

- Ninguna clave real está commiteada (verificable: `git log -p | grep gsk_` no
  devuelve claves). Si alguna key expuesta sigue activa en su proveedor, rótala.
- El `X-Api-Key` de Reprebot y la key de Groq viajan solo del navegador al
  proveedor correspondiente; nada pasa por un backend propio.
