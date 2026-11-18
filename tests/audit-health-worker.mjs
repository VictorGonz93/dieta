// Auditoría del Worker de Google Health.
// Prueba criptografía, firma del state, parseo de dailyRollUp, CORS y rutas
// básicas sin necesidad de credenciales reales de Google.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

import {
    base64UrlToBytes,
    buildDailyRollupBody,
    decryptJSON,
    encryptJSON,
    isAllowedOrigin,
    normalizeDateKey,
    parseDailyRollupSteps,
    randomToken,
    sanitizeReturnPath,
    sha256Hex,
    signState,
    verifyState,
} from '../worker-health/src/security.js';
import worker, { __test as workerTest } from '../worker-health/src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let failures = 0;
function ok(name, condition, detail = '') {
    if (condition) console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
    else { failures++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(title) { console.log(`\n── ${title} ──`); }
function rejects(promise) {
    return promise.then(() => false, () => true);
}

const secret = randomBytes(32).toString('base64');
const wrongSecret = randomBytes(32).toString('base64');
const stateSecret = 'state-secret-para-pruebas-1234567890';

function createKv() {
    const store = new Map();
    return {
        _store: store,
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value) { store.set(key, value); },
        async delete(key) { store.delete(key); },
    };
}

const env = {
    HEALTH_KV: createKv(),
    GOOGLE_CLIENT_ID: 'client-id-de-prueba',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-prueba',
    TOKEN_ENCRYPTION_KEY: secret,
    STATE_SECRET: stateSecret,
};

section('Firma del state OAuth');
const state = await signState({ link: 'link_de_prueba_1234567890', origin: 'https://victorgonz93.github.io', iat: Date.now() }, stateSecret);
const verified = await verifyState(state, stateSecret);
ok('state: roundtrip', verified.ok && verified.payload.link === 'link_de_prueba_1234567890');
ok('state: rechaza firma manipulada', (await verifyState(state.slice(0, -2) + 'xx', stateSecret)).ok === false);
ok('state: rechaza secreto distinto', (await verifyState(state, 'otro-secreto')).ok === false);
const expiredState = await signState({ link: 'x', origin: 'https://victorgonz93.github.io', iat: Date.now() - 11 * 60 * 1000 }, stateSecret);
ok('state: rechaza caducado', (await verifyState(expiredState, stateSecret)).ok === false);
ok('state: rechaza basura', (await verifyState('no-es-un-state', stateSecret)).ok === false);

section('Cifrado del refresh token');
const record = { refreshToken: 'refresh-token-secreto', accessToken: 'access', createdAt: '2026-11-18T00:00:00.000Z' };
const encrypted = await encryptJSON(record, secret);
ok('crypto: cifra y descifra', JSON.stringify(await decryptJSON(encrypted, secret)) === JSON.stringify(record));
ok('crypto: no guarda el token en claro', !encrypted.includes('refresh-token-secreto'));
ok('crypto: rechaza clave distinta', await rejects(decryptJSON(encrypted, wrongSecret)));

const tampered = JSON.parse(encrypted);
tampered.ct = tampered.ct.slice(0, -4) + 'AAAA';
ok('crypto: rechaza ciphertext manipulado', await rejects(decryptJSON(JSON.stringify(tampered), secret)));
ok('crypto: exige clave de 32 bytes', await rejects(encryptJSON(record, 'corta')));

section('Fechas y dailyRollUp');
ok('fecha: válida', normalizeDateKey('2026-11-18') === '2026-11-18');
ok('fecha: rechaza 30 de febrero', normalizeDateKey('2026-02-30') === null);
ok('fecha: rechaza formato corto', normalizeDateKey('2026-2-3') === null);
ok('fecha: rechaza vacío', normalizeDateKey('') === null);
const body = buildDailyRollupBody('2026-12-31');
ok('rollup: empieza el día pedido', body.range.start.date.year === 2026 && body.range.start.date.month === 12 && body.range.start.date.day === 31);
ok('rollup: termina al día siguiente', body.range.end.date.year === 2027 && body.range.end.date.month === 1 && body.range.end.date.day === 1);
ok('rollup: ventana de 1 día', body.windowSizeDays === 1);
const parsed = parseDailyRollupSteps({ rollupDataPoints: [{ steps: { countSum: '3822' } }, { steps: { countSum: '100' } }] });
ok('rollup: suma pasos', parsed.steps === 3922 && parsed.hasData === true);
const empty = parseDailyRollupSteps({ rollupDataPoints: [] });
ok('rollup: sin datos no es error', empty.steps === 0 && empty.hasData === false);
ok('rollup: tolera respuesta vacía', parseDailyRollupSteps(null).steps === 0);

section('Orígenes y rutas');
ok('origen: permitido', isAllowedOrigin('https://victorgonz93.github.io', ['https://victorgonz93.github.io']));
ok('origen: permitido con barra final', isAllowedOrigin('https://victorgonz93.github.io/', ['https://victorgonz93.github.io']));
ok('origen: bloquea otro dominio', !isAllowedOrigin('https://evil.example', ['https://victorgonz93.github.io']));
ok('origen: sin Origin se permite (bearer obligatorio)', isAllowedOrigin('', ['https://victorgonz93.github.io']));
ok('returnPath: conserva /dieta/', sanitizeReturnPath('/dieta/') === '/dieta/');
ok('returnPath: bloquea //evil', sanitizeReturnPath('//evil.example') === '/');
ok('returnPath: bloquea query', sanitizeReturnPath('/dieta/?x=1') === '/');
ok('returnPath: bloquea URL absoluta', sanitizeReturnPath('https://evil.example') === '/');

const health = await worker.fetch(new Request('https://worker.test/health'), {});
const healthBody = await health.json();
ok('worker: /health responde', health.status === 200 && healthBody.ok === true);
ok('worker: /health sin secretos marca configured=false', healthBody.configured === false);

const healthConfigured = await worker.fetch(new Request('https://worker.test/health'), env);
ok('worker: /health con secretos marca configured=true', (await healthConfigured.json()).configured === true);

const noSession = await worker.fetch(new Request('https://worker.test/steps/today?date=2026-11-18'), env);
ok('worker: /steps/today exige sesión', noSession.status === 401);

const sessionToken = randomToken(32);
const sessionKey = `session:${await sha256Hex(sessionToken)}`;
env.HEALTH_KV._store.set(sessionKey, await encryptJSON({
    refreshToken: 'refresh-de-prueba',
    accessToken: 'access-de-prueba',
    accessExpiresAt: Date.now() + 60 * 60 * 1000,
    createdAt: new Date().toISOString(),
}, secret));

const badDate = await worker.fetch(new Request('https://worker.test/steps/today?date=2026-02-30', {
    headers: { Authorization: `Bearer ${sessionToken}` },
}), env);
ok('worker: /steps/today exige fecha válida', badDate.status === 400);

const originalFetch = globalThis.fetch;
const googleCalls = [];
globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    googleCalls.push({ url: target, body: init.body ? String(init.body) : '' });
    if (target.includes('health.googleapis.com')) {
        return new Response(JSON.stringify({ rollupDataPoints: [{ steps: { countSum: '2500' } }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};
try {
    const stepsRes = await worker.fetch(new Request('https://worker.test/steps/today?date=2026-11-18', {
        headers: { Authorization: `Bearer ${sessionToken}` },
    }), env);
    const stepsBody = await stepsRes.json();
    ok('worker: devuelve pasos de dailyRollUp', stepsRes.status === 200 && stepsBody.steps === 2500);
    ok('worker: marca hasData', stepsBody.hasData === true && stepsBody.date === '2026-11-18');
    const healthCall = googleCalls.find(call => call.url.includes('health.googleapis.com'));
    ok('worker: llama al endpoint dailyRollUp', !!healthCall && healthCall.url.endsWith(':dailyRollUp'));
    const rollupBody = healthCall ? JSON.parse(healthCall.body) : {};
    ok('worker: pide el día civil correcto', rollupBody.range.start.date.day === 18 && rollupBody.range.end.date.day === 19);

    globalThis.fetch = async (url) => {
        if (String(url).includes('health.googleapis.com')) {
            return new Response(JSON.stringify({ error: { message: 'ACCOUNT_NOT_LINKED' } }), { status: 400 });
        }
        return new Response('{}', { status: 200 });
    };
    const notLinked = await worker.fetch(new Request('https://worker.test/steps/today?date=2026-11-18', {
        headers: { Authorization: `Bearer ${sessionToken}` },
    }), env);
    ok('worker: traduce ACCOUNT_NOT_LINKED', notLinked.status === 409 && (await notLinked.json()).error === 'account_not_linked');
} finally {
    globalThis.fetch = originalFetch;
}

const link = 'link_handoff_1234567890abcdef';
const authKey = `auth:${await sha256Hex(link)}`;
env.HEALTH_KV._store.set(authKey, await encryptJSON({
    refreshToken: 'refresh-handoff',
    accessToken: 'access-handoff',
    accessExpiresAt: Date.now() + 60 * 60 * 1000,
    createdAt: new Date().toISOString(),
}, secret));
const handoffRequest = () => new Request('https://worker.test/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link }),
});
const handoff = await worker.fetch(handoffRequest(), env);
const handoffBody = await handoff.json();
ok('worker: canjea el enlace por sesión', handoff.status === 200 && typeof handoffBody.sessionToken === 'string' && handoffBody.sessionToken.length > 20);
ok('worker: el enlace es de un solo uso', (await worker.fetch(handoffRequest(), env)).status === 400);

const statusRes = await worker.fetch(new Request('https://worker.test/auth/status', {
    headers: { Authorization: `Bearer ${handoffBody.sessionToken}` },
}), env);
ok('worker: /auth/status conectado', statusRes.status === 200 && (await statusRes.json()).connected === true);

globalThis.fetch = async () => new Response('{}', { status: 200 });
try {
    const disconnect = await worker.fetch(new Request('https://worker.test/auth/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${handoffBody.sessionToken}` },
    }), env);
    ok('worker: desconecta la sesión', disconnect.status === 200);
    const statusAfter = await worker.fetch(new Request('https://worker.test/auth/status', {
        headers: { Authorization: `Bearer ${handoffBody.sessionToken}` },
    }), env);
    ok('worker: la sesión deja de ser válida tras desconectar', statusAfter.status === 401);
} finally {
    globalThis.fetch = originalFetch;
}

const blocked = await worker.fetch(new Request('https://worker.test/health', {
    headers: { Origin: 'https://evil.example' },
}), env);
ok('worker: bloquea origen no permitido', blocked.status === 403);

const preflight = await worker.fetch(new Request('https://worker.test/health', {
    method: 'OPTIONS',
    headers: { Origin: 'https://victorgonz93.github.io' },
}), env);
ok('worker: responde al preflight', preflight.status === 204);
ok('worker: CORS devuelve el origen exacto', preflight.headers.get('Access-Control-Allow-Origin') === 'https://victorgonz93.github.io');

section('Página de callback');
const page = workerTest._authPage({
    ok: true,
    link: 'link_de_prueba_1234567890',
    origin: 'https://victorgonz93.github.io',
    returnPath: '/dieta/',
});
const pageHtml = await page.text();
ok('callback: responde 200', page.status === 200);
ok('callback: envía postMessage al opener', pageHtml.includes('postMessage'));
ok('callback: incluye el enlace', pageHtml.includes('link_de_prueba_1234567890'));
ok('callback: CSP restrictiva', String(page.headers.get('Content-Security-Policy')).includes("default-src 'none'"));
ok('callback: no-store', page.headers.get('Cache-Control') === 'no-store');

const errorPage = await workerTest._authPage({
    ok: false,
    origin: 'https://victorgonz93.github.io',
    returnPath: '/dieta/',
    message: '<img src=x onerror=alert(1)>',
});
const errorHtml = await errorPage.text();
ok('callback: escapa HTML del error', !errorHtml.includes('<img src=x') && errorHtml.includes('&lt;img'));

const redirect = workerTest._redirectToApp('https://victorgonz93.github.io', '/dieta/', {
    health: 'connected',
    link: 'link_de_prueba_1234567890',
});
const redirectLocation = String(redirect.headers.get('Location') || '');
ok('redirect: responde 302', redirect.status === 302);
ok('redirect: vuelve a la app', redirectLocation.startsWith('https://victorgonz93.github.io/dieta/#'));
ok('redirect: conserva health y link', redirectLocation.includes('health=connected') && redirectLocation.includes('link=link_de_prueba_1234567890'));
ok('redirect: no-store y no-referrer',
    redirect.headers.get('Cache-Control') === 'no-store'
    && redirect.headers.get('Referrer-Policy') === 'no-referrer');

section('Configuración y secretos');
ok('config: detecta configuración completa', workerTest._isConfigured({
    clientId: 'a', clientSecret: 'b', encryptionKey: 'c', stateSecret: 'd', kv: true,
}));
ok('config: detecta secreto ausente', !workerTest._isConfigured({
    clientId: 'a', clientSecret: 'b', encryptionKey: '', stateSecret: 'd', kv: true,
}));
ok('config: detecta KV ausente', !workerTest._isConfigured({
    clientId: 'a', clientSecret: 'b', encryptionKey: 'c', stateSecret: 'd', kv: false,
}));
ok('utils: hash determinista', (await sha256Hex('abc')) === (await sha256Hex('abc')));
ok('utils: hash no devuelve el original', (await sha256Hex('abc')) !== 'abc');
ok('utils: token aleatorio único', randomToken(32) !== randomToken(32));
ok('utils: base64url sin padding', !randomToken(32).includes('='));
ok('utils: base64url decodifica 32 bytes', base64UrlToBytes(randomToken(32)).length === 32);

const workerSource = readFileSync(join(root, 'worker-health/src/index.js'), 'utf8');
const securitySource = readFileSync(join(root, 'worker-health/src/security.js'), 'utf8');
const wrangler = readFileSync(join(root, 'worker-health/wrangler.toml'), 'utf8');
ok('worker: scope de Health API', workerSource.includes('googlehealth.activity_and_fitness.readonly'));
ok('worker: OAuth offline con consentimiento', workerSource.includes('access_type') && workerSource.includes('prompt'));
ok('worker: endpoint dailyRollUp', workerSource.includes('dataPoints:dailyRollUp'));
ok('worker: usa KV', workerSource.includes('HEALTH_KV'));
ok('worker: cifra antes de guardar', workerSource.includes('encryptJSON') && workerSource.includes('decryptJSON'));
ok('worker: sesión hasheada', securitySource.includes('SHA-256') && securitySource.includes('sha256Hex'));
ok('worker: AES-GCM y HMAC', securitySource.includes('AES-GCM') && securitySource.includes('HMAC'));
ok('worker: no registra tokens', !/console\.log\([^)]*(refreshToken|accessToken|access_token|client_secret)/i.test(workerSource));
ok('wrangler: binding de KV', wrangler.includes('binding = "HEALTH_KV"'));
ok('wrangler: orígenes permitidos', wrangler.includes('ALLOWED_ORIGINS'));

console.log(failures === 0
    ? '\nHEALTH WORKER AUDIT PASSED'
    : `\nHEALTH WORKER AUDIT FAILED: ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
