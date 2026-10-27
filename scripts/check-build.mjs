import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const assets = resolve('dist/assets');
const forbidden = ['local-preview-token-', 'local-preview-refresh-', 'dev-owner-beezone'];
for (const filename of readdirSync(assets).filter(name => name.endsWith('.js'))) {
  const code = readFileSync(resolve(assets, filename), 'utf8');
  if (forbidden.some(marker => code.includes(marker))) throw new Error(`Production bundle contains preview authentication code: ${filename}`);
}
console.log('Production bundle: no preview authentication code.');
const html = readFileSync(resolve('dist/index.html'), 'utf8');
const worker = readFileSync(resolve('dist/sw.js'), 'utf8');
if (worker.includes('beezone-english-v4-source') || worker.includes('const APP_ASSETS_TO_CACHE = [];')) throw new Error('Service worker asset manifest was not prepared.');
for (const filename of readdirSync(assets).filter(name => /\.(js|css|png|jpe?g|svg|webp|woff2?)$/i.test(name))) {
  if (!worker.includes(JSON.stringify(`/assets/${filename}`))) throw new Error(`Service worker missing release asset: ${filename}`);
}
for (const [, attributes, content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc\s*=/.test(attributes) && content.trim()) throw new Error('CSP rejects executable inline scripts in the production shell.');
}
const config = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const csp = config.headers.flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy')?.value;
const scripts = csp?.split(';').find(directive => directive.trim().startsWith('script-src '));
if (!scripts || /unsafe-inline|unsafe-eval/.test(scripts)) throw new Error('Production CSP must disallow inline/eval scripts.');
const spaFallback = config.rewrites?.find(rule => rule.destination === '/index.html');
if (!spaFallback || !/assets/.test(spaFallback.source) || !/api/.test(spaFallback.source)) throw new Error('SPA fallback must exclude missing assets and API routes.');
const dailyBackup = config.crons?.find(job => job.path === '/api/cron/daily-backup');
if (dailyBackup?.schedule !== '0 19 * * *') throw new Error('Daily backup cron must run at 19:00 UTC (02:00 Asia/Ho_Chi_Minh).');
console.log('Production CSP: external scripts only; no executable inline shell scripts.');
