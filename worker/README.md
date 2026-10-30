# Proxy CORS para la IA de Apex Nutrition (BYOK)

Este Worker es un puente **sin estado** entre la app estática y la API de
OpenCode. No guarda ninguna API key, no tiene una key propia y no registra
cabeceras ni cuerpos.

```
Navegador del usuario
  │  POST + Authorization: Bearer <SU key>
  ▼
Cloudflare Worker  ← solo añade CORS y reenvía
  │  Authorization + x-opencode-session + User-Agent
  ▼
opencode.ai/inference/go/openai/v1/chat/completions
```

## Por qué hace falta

OpenCode no devuelve `Access-Control-Allow-Origin` en el `POST` de inferencia
(el preflight `OPTIONS` responde 404). GitHub Pages es estático y no puede
actuar de proxy. Sin un proxy, el navegador bloquea la llamada antes de enviarla.

## Desplegar en Cloudflare (gratis)

Requisitos: una cuenta gratuita de Cloudflare. No hace falta tarjeta.

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

Wrangler mostrará una URL parecida a:

```
https://apex-nutrition-ai.TU-USUARIO.workers.dev
```

Pega esa URL en **Ajustes de IA → URL del proxy** dentro de la app.

### Configurar orígenes

Edita `wrangler.toml` y ajusta `ALLOWED_ORIGINS` si usas otro dominio:

```toml
[vars]
ALLOWED_ORIGINS = "https://victorgonz93.github.io,http://localhost:8765,http://127.0.0.1:8765,http://localhost:8000,http://127.0.0.1:8000"
```

Vuelve a desplegar con `npx wrangler deploy`. No uses `*` en producción.
Para probar la IA en local, sirve la app con `python -m http.server 8000` (o
8765) y abre `http://localhost:8000`. Abrir `index.html` como archivo
(`file://`) no funciona con la IA porque el navegador envía `Origin: null`.

### Usar Console en vez de Go

Por defecto el Worker apunta al endpoint de Go (`beam-free`). Si tienes saldo
en Console y quieres un modelo de pago, descomenta y ajusta:

```toml
[vars]
OPENCODE_ENDPOINT = "https://opencode.ai/inference/openai/v1/chat/completions"
```

Vuelve a desplegar. No hace falta tocar el código de la app.

## Probar el Worker

Sin key (debe devolver 401 con CORS):

```bash
curl -i -X POST "https://apex-nutrition-ai.TU-USUARIO.workers.dev" \
  -H "Origin: https://victorgonz93.github.io" \
  -H "Content-Type: application/json" \
  -d '{"model":"beam-free","messages":[{"role":"user","content":"Hola"}]}'
```

Con tu key (no la pegues en el chat de nadie; usa tu terminal):

```bash
curl -N -X POST "https://apex-nutrition-ai.TU-USUARIO.workers.dev" \
  -H "Origin: https://victorgonz93.github.io" \
  -H "Authorization: Bearer oc_sk_TU_KEY" \
  -H "x-opencode-session: prueba-local-1" \
  -H "Content-Type: application/json" \
  -d '{"model":"beam-free","messages":[{"role":"user","content":"Responde solo OK"}],"stream":true}'
```

## Seguridad y privacidad

- **No hay secretos en el Worker**: no ejecutes `wrangler secret put OPENCODE_API_KEY`.
- La key de cada usuario viaja en su propia petición y se reenvía a OpenCode.
- El Worker no escribe logs del cuerpo ni de las cabeceras.
- El origen permitido reduce el uso desde webs de terceros, pero no es una
  frontera de seguridad: cualquiera con su propia key puede llamar al proxy.
  La seguridad real es que **cada usuario paga su propia suscripción**.
- Si no confías en el Worker compartido, despliega el tuyo y cambia la URL en
  la app. El código es el mismo y no guarda nada.
- OpenCode/Beam puede retener las peticiones según su política (Beam Free no
  entrena con los datos y los retiene 30 días). Está explicado en `privacy.html`.

## Límites

- El Worker acepta cuerpos de hasta 256 KB y 80 mensajes.
- El plan gratuito de Cloudflare tiene límites de peticiones/día; para uso
  personal son más que suficientes.
- OpenCode Go está pensado para tráfico de agentes de código y monitoriza
  abusos. Un asistente de nutrición con volumen bajo debería funcionar, pero no
  es una API garantizada para producción masiva.
