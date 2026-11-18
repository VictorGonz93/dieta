// Auditoría del escáner de códigos de barras.
// Comprueba que el lector es local, que el Service Worker lo cachea y que el
// flujo tiene reintento de cámara, fallback de Open Food Facts y avisos claros.
import { readFileSync, existsSync, statSync } from 'node:fs';
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

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const swSource = readFileSync(join(root, 'sw.js'), 'utf8');
const barcodeSource = readFileSync(join(root, 'js/modules/barcode.js'), 'utf8');
const appSource = readFileSync(join(root, 'js/app.js'), 'utf8');
const privacySource = readFileSync(join(root, 'privacy.html'), 'utf8');
const vendorPath = join(root, 'js/vendor/html5-qrcode.min.js');
const vendorReadmePath = join(root, 'js/vendor/README.md');
const vendorLicensePath = join(root, 'js/vendor/html5-qrcode.LICENSE.txt');

section('Lector local');
ok('vendor: html5-qrcode existe', existsSync(vendorPath));
ok('vendor: tamaño razonable', existsSync(vendorPath) && statSync(vendorPath).size > 250000,
    existsSync(vendorPath) ? `${statSync(vendorPath).size} bytes` : 'no existe');
const vendorSource = existsSync(vendorPath) ? readFileSync(vendorPath, 'utf8') : '';
ok('vendor: expone Html5Qrcode', vendorSource.includes('Html5Qrcode'));
ok('vendor: README con versión y licencia',
    existsSync(vendorReadmePath)
    && readFileSync(vendorReadmePath, 'utf8').includes('2.3.8')
    && readFileSync(vendorReadmePath, 'utf8').includes('Apache-2.0'));
ok('vendor: archivo de licencia Apache',
    existsSync(vendorLicensePath)
    && readFileSync(vendorLicensePath, 'utf8').includes('Apache License'));
ok('html: usa el lector local', indexHtml.includes('js/vendor/html5-qrcode.min.js'));
ok('html: no depende de unpkg', !indexHtml.includes('unpkg.com/html5-qrcode'));
ok('html: el lector carga antes que la app',
    indexHtml.indexOf('js/vendor/html5-qrcode.min.js') < indexHtml.indexOf('js/app.js?v='));

section('Service Worker');
ok('sw: cachea el lector local', swSource.includes('/dieta/js/vendor/html5-qrcode.min.js'));
ok('sw: no cachea el CDN antiguo', !swSource.includes('unpkg.com/html5-qrcode'));
ok('sw: versión 138', /CACHE_VERSION\s*=\s*138/.test(swSource));

section('Flujo del escáner');
ok('barcode: botón de reintento de cámara', barcodeSource.includes('_retryBarcodeCamera'));
ok('barcode: protección contra cierres durante el arranque', barcodeSource.includes('scanSession'));
ok('barcode: exige contexto seguro', barcodeSource.includes('isSecureContext'));
ok('barcode: fallback por facingMode', barcodeSource.includes("facingMode: 'environment'"));
ok('barcode: API v2 de Open Food Facts', barcodeSource.includes('api/v2/product/'));
ok('barcode: fallback a API v0', barcodeSource.includes('api/v0/product/'));
ok('barcode: distingue límite de consultas', barcodeSource.includes('rate_limit'));
ok('barcode: entrada manual', barcodeSource.includes('_searchManualBarcode'));
ok('barcode: lectura desde imagen', barcodeSource.includes('scanFile'));
ok('app: importa y expone el escáner',
    appSource.includes('openBarcodeScanner')
    && appSource.includes('window.openBarcodeScanner = openBarcodeScanner'));
ok('html: botón en el modal de comida', indexHtml.includes("openBarcodeScanner('modal')"));
ok('html: botón en la base de datos', indexHtml.includes("openBarcodeScanner('database')"));
ok('privacidad: explica el envío del código a Open Food Facts',
    privacySource.includes('Escáner de códigos de barras')
    && privacySource.includes('Open Food Facts')
    && privacySource.includes('imagen de la cámara se procesa en tu dispositivo'));

console.log(failures === 0
    ? '\nBARCODE AUDIT PASSED'
    : `\nBARCODE AUDIT FAILED: ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
