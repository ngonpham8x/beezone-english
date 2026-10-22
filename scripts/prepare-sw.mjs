import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const assetDir = resolve('dist/assets');
const workerPath = resolve('dist/sw.js');
const assets = readdirSync(assetDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(js|css|png|jpe?g|svg|webp|woff2?)$/i.test(entry.name))
  .map(entry => `/assets/${entry.name}`)
  .sort();
if (!assets.length) throw new Error('No production assets to cache.');
const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
const source = readFileSync(workerPath, 'utf8');
const cacheMarker = "const CACHE_NAME = 'beezone-english-v4-source';";
const assetMarker = 'const APP_ASSETS_TO_CACHE = [];';
if (!source.includes(cacheMarker) || !source.includes(assetMarker)) throw new Error('Service worker build markers are missing.');
const output = source
  .replace(cacheMarker, `const CACHE_NAME = 'beezone-english-v4-${version}';`)
  .replace(assetMarker, `const APP_ASSETS_TO_CACHE = ${JSON.stringify(assets)};`);
writeFileSync(workerPath, output);
console.log(`Service worker: precached manifest for ${assets.length} release assets.`);
