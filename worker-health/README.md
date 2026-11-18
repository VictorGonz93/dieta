# Apex Nutrition — Worker de Google Health

Backend mínimo para mantener una sesión larga con la **Google Health API** y leer los pasos del día sin volver a iniciar sesión cada hora.

```
PWA (GitHub Pages)
   │  1. popup /auth/start
   ▼
Worker (Cloudflare) ── 2. OAuth ──▶ Google
   │  3. guarda refresh token cifrado (AES-256-GCM) en KV
   │  4. recibe un token de sesión opaco
   ▼
PWA ── 5. GET /steps/today ──▶ Worker ── 6. dailyRollUp ──▶ Google Health API
```

El **refresh token nunca llega al navegador**. La PWA solo guarda un token de sesión opaco.

## Requisitos

- Cuenta de Google con la app **Google Health** instalada en el móvil.
- Proyecto de Google Cloud con la **Google Health API** habilitada.
- Cuenta de Cloudflare con Workers y KV (el plan gratuito sirve para uso personal).
- Node.js y `npx wrangler`.

## 1. Google Cloud

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto (o reutiliza uno).
2. Ve a **APIs & Services → Library**, busca **Google Health API** y pulsa **Enable**.
3. Ve a **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Publishing status: **Testing** para probar (los refresh tokens caducan a los 7 días).
   - Añade el scope `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`.
   - En **Test users**, añade tu propia cuenta de Google.
4. Ve a **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Name: `Apex Nutrition Health Worker`.
   - **Authorized redirect URIs**:
     ```
     https://apex-nutrition-health.victorgonz93.workers.dev/auth/callback
     ```
     Si usas otro nombre de Worker o un dominio propio, pon la URL real terminada en `/auth/callback`. Para desarrollo local, añade también:
     ```
     http://localhost:8787/auth/callback
     ```
   - Guarda el **Client ID** y el **Client Secret**. No los peges en el chat ni en el repositorio.

> No hace falta configurar **Authorized JavaScript origins**: el flujo es Authorization Code en el Worker, no Google Identity Services en el navegador. Esto evita el `origin_mismatch` de Google Fit.

## 2. Cloudflare

Desde `worker-health/`:

```bash
npx wrangler login
npx wrangler kv namespace create HEALTH_KV
```

Copia el `id` que devuelve y pégalo en `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "HEALTH_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Configura los secretos (te los pedirá por consola; no se guardan en el repo):

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Genera `TOKEN_ENCRYPTION_KEY` con 32 bytes aleatorios en base64:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Opcional: `npx wrangler secret put STATE_SECRET`. Si no existe, se usa `TOKEN_ENCRYPTION_KEY`.

Despliega:

```bash
npx wrangler deploy
```

Comprueba:

```bash
curl https://apex-nutrition-health.victorgonz93.workers.dev/health
```

Debe devolver `{"ok":true,"service":"apex-nutrition-health","configured":true}`. Si `configured` es `false`, faltan secretos.

### Desarrollo local

Crea `worker-health/.dev.vars` (está en `.gitignore`):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
TOKEN_ENCRYPTION_KEY=...
```

Y ejecuta:

```bash
npx wrangler dev
```

Añade `http://localhost:8787/auth/callback` como redirect URI en Google Cloud.

## 3. Activar los pasos del teléfono en Google Health

La Health API **no lee los datos de Google Fit**. Los pasos tienen que estar en la app Google Health:

1. Instala/abre **Google Health** en el móvil Android (es la antigua app Fitbit).
2. Si no tienes cuenta: **Join Google Health** → cuando pregunte por el tracker, elige **Just the app**.
3. Si ya tienes cuenta: **Connections → Devices → Phone → Agree**.
4. Camina unos minutos y abre la app para que sincronice.
5. En la app deberías ver los pasos del teléfono.

La Health API identifica esta fuente como **Fitbit MobileTrack**, que sí está en la lista de dispositivos compatibles con `steps`.

## 4. Configurar la PWA

1. Abre `https://victorgonz93.github.io/dieta/`.
2. Ve a **Deporte → Planificación**.
3. En la tarjeta **Pasos con Google Health**, abre **Configuración avanzada**.
4. Comprueba la URL del Worker y pulsa **Probar Worker**.
5. Pulsa **Conectar con Google Health** y completa el consentimiento.
6. La tarjeta debe mostrar los pasos del día.

Si cambias de Worker, guarda la nueva URL: la app descarta el token de sesión anterior y te pide reconectar.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Estado del Worker y de la configuración |
| `GET` | `/auth/start?origin=&link=&return=` | Inicia OAuth (redirige a Google) |
| `GET` | `/auth/callback` | Recibe el código, guarda el refresh token cifrado |
| `POST` | `/auth/session` | Canjea el enlace de un solo uso por un token de sesión |
| `GET` | `/auth/status` | Comprueba la sesión |
| `POST` | `/auth/disconnect` | Revoca el token en Google y borra la sesión |
| `GET` | `/steps/today?date=YYYY-MM-DD` | Pasos del día vía `dailyRollUp` |

Todas las rutas de datos exigen `Authorization: Bearer <token-de-sesión>`.

## Seguridad y privacidad

- El refresh token se cifra con **AES-256-GCM** antes de escribirlo en KV.
- El token de sesión se guarda en KV bajo `SHA-256(token)`, no en claro.
- El `state` de OAuth va firmado con **HMAC-SHA256** y caduca a los 10 minutos.
- `ALLOWED_ORIGINS` limita qué webs pueden usar el Worker; el token de sesión es la autenticación real.
- No se guarda historial de pasos ni el cuerpo de las respuestas.
- Las sesiones caducan a los 90 días o al pulsar **Desconectar**.
- No se registran tokens, códigos OAuth ni cabeceras en los logs.

## Limitaciones importantes

- **Scopes restringidos:** todos los scopes de Google Health son restringidos. Para más de 100 usuarios hace falta verificación y revisión de seguridad de Google.
- **Testing:** los refresh tokens caducan a los 7 días. La app mostrará **Reconectar**.
- **Publicación:** para una sesión indefinida hay que publicar la app y pasar la verificación. No es un cambio de código.
- **Cobertura:** la API solo devuelve datos de dispositivos compatibles. Un móvil Android con Google Fit no aparece por sí solo; hay que activar el teléfono en la app Google Health (MobileTrack).
- **Webhooks:** la API soporta webhooks para `steps`, pero esta versión usa polling cada 2 minutos. Los webhooks exigirían verificación del endpoint y una suscripción adicional.
- **Tiempo real:** Google Health sincroniza cuando el móvil sube los datos. La app puede tardar unos minutos en ver el último recuento.

## Problemas frecuentes

### `ACCOUNT_NOT_LINKED`

La cuenta no está vinculada a Google Health. Instala la app, activa el teléfono como dispositivo y vuelve a conectar.

### `api_disabled`

La Google Health API no está habilitada en el proyecto del Worker. Actívala en **APIs & Services → Library**.

### `redirect_uri_mismatch`

La redirect URI del cliente OAuth no coincide exactamente con `https://<worker>/auth/callback`. No pongas barra final ni `localhost` si estás en producción.

### `invalid_grant` al renovar

El refresh token caducó (7 días en Testing) o se revocó. Pulsa **Reconectar**.

### El Worker responde pero `configured: false`

Faltan `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` o `TOKEN_ENCRYPTION_KEY`. Vuelve a ejecutar `wrangler secret put`.

### Los pasos siguen a 0

1. Abre la app Google Health en el móvil y comprueba que cuenta pasos.
2. Fuerza una sincronización manual en la app.
3. Espera unos minutos y pulsa **Sincronizar** en Apex Nutrition.
4. Si sigue a 0, revisa que la cuenta de Google sea la misma en el móvil y en el consentimiento.
