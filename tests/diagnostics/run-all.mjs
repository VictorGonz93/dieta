// Runs the diagnostic harnesses in separate Node processes. These print results
// for manual inspection; they do not fail the test suite.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const scripts = ['scenarios.mjs', 'closedloop.mjs'];

for (const script of scripts) {
    console.log(`\n================ ${script} ================`);
    const result = spawnSync(process.execPath, [join(here, script)], {
        stdio: 'inherit',
        cwd: join(here, '..', '..'),
    });
    if (result.status !== 0) {
        console.error(`${script} exited with ${result.status}`);
        process.exitCode = 1;
    }
}
