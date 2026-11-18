// Auditoría de la integración con Google Health API + Worker.
// Comprueba que la PWA no maneja el refresh token, que el Worker lo cifra y
// que la sincronización sobrevive a la caducidad del access token.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let failures = 0;
function ok(name, condition, detail = '') {
    if (condition) console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
    else { failures++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(title) { console.log(`\n── ${title} ──`); }

const client = readFileSync(join(root, 'js/modules/google-health.js'), 'utf8');
const stepsSync = readFileSync(join(root, 'js/modules/steps-sync.js'), 'utf8');
const app = readFileSync(join(root, 'js/app.js'), 'utf8');
const tabs = readFileSync(join(root, 'js/modules/ui/tabs.js'), 'utf8');
const storage = readFileSync(join(root, 'js/modules/storage.js'), 'utf8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const swSource = readFileSync(join(root, 'sw.js'), 'utf8');
const privacy = readFileSync(join(root, 'privacy.html'), 'utf8');
const worker = readFileSync(join(root, 'worker-health/src/index.js'), 'utf8');
const security = readFileSync(join(root, 'worker-health/src/security.js'), 'utf8');
const wrangler = readFileSync(join(root, 'worker-health/wrangler.toml'), 'utf8');
const workerReadme = readFileSync(join(root, 'worker-health/README.md'), 'utf8');

section('Cliente PWA');
ok('health: Worker por defecto', client.includes('apex-nutrition-health.victorgonz93.workers.dev'));
ok('health: URL del Worker configurable', client.includes('ghealth_worker_url') && client.includes('saveGoogleHealthWorkerUrl'));
ok('health: guarda solo el token de sesión', client.includes('ghealth_session') && client.includes('sessionToken'));
ok('health: no menciona refresh_token', !client.includes('refresh_token'));
ok('health: flujo OAuth por redirección', client.includes('/auth/start') && client.includes("mode: 'redirect'") && client.includes('window.location.assign'));
ok('health: procesa el retorno con hash', client.includes('hashParams') && client.includes("health === 'error'"));
ok('health: canjea el enlace de un solo uso', client.includes('/auth/session'));
ok('health: sincroniza cada 2 minutos', client.includes('2 * 60 * 1000'));
ok('health: sincroniza al volver a la pestaña', client.includes("addEventListener('visibilitychange'"));
ok('health: sincroniza al recuperar foco', client.includes("addEventListener('focus'"));
ok('health: sincroniza al volver la conexión', client.includes("addEventListener('online'"));
ok('health: detecta sesión caducada', client.includes('reauth_required'));
ok('health: explica cuenta no vinculada', client.includes('account_not_linked'));
ok('health: explica API deshabilitada', client.includes('api_disabled'));
ok('health: permite reconectar', client.includes('Reconectar'));
ok('health: permite desconectar y revocar', client.includes('/auth/disconnect'));
ok('health: avisa del límite de 7 días', client.includes('7 días'));
ok('health: exige la app Google Health en el móvil', client.includes('Connections') && client.includes('Phone'));
ok('health: avisa de que Fit no se migra', client.includes('Google Fit no se migra') || client.includes('no se migran automáticamente'));
ok('health: aplica los pasos al entreno', client.includes('applyStepsToTodayWorkout'));
ok('health: escapa HTML en la UI', client.includes('escapeHTML'));

section('Lógica compartida de pasos');
ok('steps: actualiza solo el bloque sincronizado', stepsSync.includes('synced: true') && stepsSync.includes('syncedSet'));
ok('steps: no pisa series manuales', stepsSync.includes('Los sets manuales no se') || stepsSync.includes('sets manuales'));
ok('steps: guarda en workoutSessions', stepsSync.includes("safeSet('workoutSessions'"));
ok('steps: notifica el cambio', stepsSync.includes('notifyNutritionChanged'));
ok('fit: eliminado del cliente', !app.includes('google-fit.js') && !indexHtml.includes('googleFitConfigContainer'));
ok('fit: módulo eliminado del Service Worker', !swSource.includes('/dieta/js/modules/google-fit.js'));

section('Worker de salud');
ok('worker: scope restringido de Health', worker.includes('googlehealth.activity_and_fitness.readonly'));
ok('worker: OAuth offline', worker.includes("access_type', 'offline'") && worker.includes("prompt', 'consent'"));
ok('worker: no hereda el scope de Fitness', worker.includes("include_granted_scopes', 'false'"));
ok('worker: canjea el código en Google', worker.includes('oauth2.googleapis.com/token'));
ok('worker: pide dailyRollUp', worker.includes('dataPoints:dailyRollUp'));
ok('worker: guarda en KV', worker.includes('HEALTH_KV'));
ok('worker: cifra el refresh token', worker.includes('encryptJSON') && security.includes('AES-GCM'));
ok('worker: firma el state', security.includes('HMAC') && worker.includes('signState'));
ok('worker: token de sesión hasheado', security.includes('sha256Hex') && worker.includes('sha256Hex'));
ok('worker: caduca la sesión a 90 días', worker.includes('90 * 24 * 60 * 60'));
ok('worker: revoca al desconectar', worker.includes('oauth2.googleapis.com/revoke'));
ok('worker: no cachea respuestas', worker.includes("'Cache-Control': 'no-store'"));
ok('worker: CORS con lista de orígenes', worker.includes('ALLOWED_ORIGINS'));
ok('worker: no registra tokens', !/console\.log\([^)]*(refreshToken|accessToken|access_token|client_secret)/i.test(worker));
ok('worker: traduce ACCOUNT_NOT_LINKED', worker.includes('ACCOUNT_NOT_LINKED'));
ok('worker: traduce API deshabilitada', worker.includes('api_disabled'));

section('Configuración del Worker');
ok('wrangler: binding HEALTH_KV', wrangler.includes('binding = "HEALTH_KV"'));
ok('wrangler: orígenes permitidos', wrangler.includes('ALLOWED_ORIGINS'));
ok('docs: redirect URI', workerReadme.includes('/auth/callback'));
ok('docs: secretos', workerReadme.includes('GOOGLE_CLIENT_ID') && workerReadme.includes('GOOGLE_CLIENT_SECRET') && workerReadme.includes('TOKEN_ENCRYPTION_KEY'));
ok('docs: pasos del teléfono', workerReadme.includes('MobileTrack') && workerReadme.includes('Phone'));
ok('docs: límite de 7 días', workerReadme.includes('7 días'));
ok('docs: scopes restringidos', workerReadme.includes('restringidos'));

section('Integración en la app');
ok('html: contenedor de Google Health', indexHtml.includes('googleHealthConfigContainer'));
ok('html: sin contenedor de Google Fit', !indexHtml.includes('googleFitConfigContainer'));
ok('app: inicializa Google Health', app.includes('initGoogleHealthAutoSync') && app.includes('renderGoogleHealthStatusUI'));
ok('app: expone conectar/desconectar', app.includes('window.connectGoogleHealth') && app.includes('window.disconnectGoogleHealth'));
ok('tabs: renderiza Health al abrir Deporte', tabs.includes('renderGoogleHealthStatusUI'));
ok('storage: limpia la sesión de Health', storage.includes("'ghealth_session'") && storage.includes("'ghealth_worker_url'") && storage.includes("'ghealth_auto_sync'") && storage.includes("'ghealth_pending_link'"));
ok('sw: cachea el módulo de Health', swSource.includes('/dieta/js/modules/google-health.js'));
ok('sw: cachea la lógica compartida', swSource.includes('/dieta/js/modules/steps-sync.js'));
ok('privacy: documenta Google Health', privacy.includes('Google Health API + Worker') && privacy.includes('AES-256-GCM'));
ok('privacy: documenta el límite de 7 días', privacy.includes('7 días'));
ok('privacy: documenta la revocación', privacy.includes('Desconectar') && privacy.includes('myaccount.google.com/permissions'));

section('Versión');
ok('html: app v138', indexHtml.includes('js/app.js?v=138'));
ok('html: CSS v138', indexHtml.includes('css/styles.css?v=20261118-138'));
ok('sw: versión 138', /CACHE_VERSION\s*=\s*138/.test(swSource));

console.log(failures === 0
    ? '\nGOOGLE HEALTH AUDIT PASSED'
    : `\nGOOGLE HEALTH AUDIT FAILED: ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
