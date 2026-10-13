import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const assets = resolve('dist/assets');
const forbidden = ['local-preview-token-', 'local-preview-refresh-', 'dev-owner-beezone'];
for (const filename of readdirSync(assets).filter(name => name.endsWith('.js'))) {
  const code = readFileSync(resolve(assets, filename), 'utf8');
  if (forbidden.some(marker => code.includes(marker))) throw new Error(`Production bundle contains preview authentication code: ${filename}`);
}
console.log('Production bundle: no preview authentication code.');
