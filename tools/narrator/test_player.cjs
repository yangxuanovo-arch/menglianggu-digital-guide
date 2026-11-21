const path = require('node:path');
const { spawnSync } = require('node:child_process');

const result = spawnSync(process.env.PYTHON || 'python3', [path.resolve(__dirname, '../check_narrator.py')], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
