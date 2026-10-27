// Runs every regression suite in a separate Node process so each one gets a
// clean module graph and its own localStorage stub.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const suites = [
    'audit-tdee-p0.mjs',
    'audit-tdee-p1.mjs',
    'audit-tdee-ui.mjs',
    'audit-tdee-p2.mjs',
];

let failed = 0;
for (const suite of suites) {
    console.log(`\n================ ${suite} ================`);
    const result = spawnSync(process.execPath, [join(here, suite)], {
        stdio: 'inherit',
        cwd: join(here, '..'),
    });
    if (result.status !== 0) failed++;
}

console.log(failed === 0
    ? '\nALL SUITES PASSED'
    : `\n${failed} SUITE(S) FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
