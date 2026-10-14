import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { APP_ORIGIN, canonicalAppUrl, completedAuthUrl } from '../src/lib/appUrl';

it.each(['beezone-english-ngonpham.vercel.app', 'beezone-english-git-main-ngonpham.vercel.app'])(
  'moves %s to the main domain without forwarding OAuth credentials',
  (host) => {
    expect(
      canonicalAppUrl(
        `https://${host}/?code=example&sb_flow_id=example&tab=attendance&view=compact#today`,
      ),
    ).toBe(`${APP_ORIGIN}/?tab=attendance&view=compact#today`);
    expect(
      canonicalAppUrl(
        `https://${host}/?error=access_denied&error_description=example#access_token=example&refresh_token=example`,
      ),
    ).toBe(`${APP_ORIGIN}/`);
  },
);

it.each([
  `${APP_ORIGIN}/?tab=tuition`,
  'http://localhost:3000/?tab=attendance',
  'https://preview-example.vercel.app/',
  'https://beezone-english-ngonpham.vercel.app.evil.test/',
])('keeps the trusted origin or unrelated development/preview URL %s', (href) => {
  expect(canonicalAppUrl(href)).toBeNull();
});

it('cleans only auth callback fields after a session is available', () => {
  expect(
    completedAuthUrl(`${APP_ORIGIN}/?code=example&sb_flow_id=example&tab=admissions#filters`),
  ).toBe('/?tab=admissions#filters');
  expect(completedAuthUrl('http://localhost:3000/?tab=students#today')).toBe(
    '/?tab=students#today',
  );
});

it('redirects regular root-page requests by host while leaving API and callback requests for the app', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  expect(config.redirects).toHaveLength(2);
  for (const rule of config.redirects) {
    expect(rule.source).toBe('/');
    expect(rule.destination).toBe(`${APP_ORIGIN}/`);
    expect(rule.missing).toEqual([
      { type: 'query', key: 'code' },
      { type: 'query', key: 'error' },
    ]);
    expect(canonicalAppUrl(`https://${rule.has[0].value}/`)).toBe(`${APP_ORIGIN}/`);
  }
});
