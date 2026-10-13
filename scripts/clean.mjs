import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(workspace, 'dist');
if (dirname(target) !== workspace) throw new Error('Refusing to clean outside the workspace.');
rmSync(target, { recursive: true, force: true });
