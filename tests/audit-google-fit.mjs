// Auditoría de la integración con Google Fit.
// Comprueba diagnóstico OAuth, Client ID configurable, reconexión y que la
// sincronización no se detenga al caducar el token.
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

const source = readFileSync(join(root, 'js/modules/google-fit.js'), 'utf8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const swSource = readFileSync(join(root, 'sw.js'), 'utf8');
const storageSource = readFileSync(join(root, 'js/modules/storage.js'), 'utf8');

section('Configuración y diagnóstico');
ok('fit: estado connected/expired/disconnected', source.includes('getGoogleFitState'));
ok('fit: Client ID configurable', source.includes('saveGoogleFitClientId') && source.includes('gfitClientIdInput'));
ok('fit: valida Client ID', source.includes('apps.googleusercontent.com'));
const disconnectBody = /export function disconnectGoogleFit\(\) \{([\s\S]*?)\n\}/.exec(source)?.[1] || '';
ok('fit: conserva Client ID al desconectar', disconnectBody.length > 0
    && !disconnectBody.includes("removeItem('gfit_client_id')"));
ok('fit: explica origin_mismatch', source.includes('origin_mismatch'));
ok('fit: explica invalid_client', source.includes('invalid_client'));
ok('fit: explica permiso denegado', source.includes('access_denied'));
ok('fit: explica app no verificada', source.includes('unverified'));
ok('fit: explica scope inválido', source.includes('invalid_scope'));
ok('fit: explica sesión caducada', source.includes('interaction_required') || source.includes('login_required'));
ok('fit: detecta Fitness API no habilitada', source.includes('accessNotConfigured') || source.includes('Fitness API no está habilitada'));
ok('fit: muestra último error', source.includes('_lastFitError') && source.includes('_fitErrorHtml'));
ok('html: carga Google Identity Services', indexHtml.includes('accounts.google.com/gsi/client'));

section('Sincronización persistente');
ok('fit: arranca aunque el token esté caducado',
    source.includes('if (!creds.autoSync) return;')
    && !source.includes('creds.autoSync && isGoogleFitConnected()'));
ok('fit: sincroniza cada 2 minutos', source.includes('2 * 60 * 1000'));
ok('fit: sincroniza al volver a la pestaña', source.includes("addEventListener('visibilitychange'"));
ok('fit: sincroniza al recuperar foco', source.includes("addEventListener('focus'"));
ok('fit: sincroniza al volver la conexión', source.includes("addEventListener('online'"));
ok('fit: usa el token renovado en la petición', source.includes('creds = getFitCredentials();'));
ok('fit: renueva el token caducado', source.includes('silentTokenRefresh()'));
ok('fit: limpia el error al sincronizar', source.includes('_clearFitError()'));
ok('fit: conserva la sesión para mostrar Reconectar',
    source.includes("localStorage.setItem('gfit_expires_at', '0')"));
ok('fit: permite reconectar', source.includes('Reconectar'));
ok('fit: avisa de la retirada de Google Fit', source.includes('Google Fit API se retira a finales de 2026'));
ok('storage: limpia credenciales de Google Fit',
    ['gfit_access_token', 'gfit_expires_at', 'gfit_client_id', 'gfit_auto_sync']
        .every(key => storageSource.includes(key)));

section('Versión');
ok('html: app v136', indexHtml.includes('js/app.js?v=136'));
ok('sw: versión 136', /CACHE_VERSION\s*=\s*136/.test(swSource));

console.log(failures === 0
    ? '\nGOOGLE FIT AUDIT PASSED'
    : `\nGOOGLE FIT AUDIT FAILED: ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
