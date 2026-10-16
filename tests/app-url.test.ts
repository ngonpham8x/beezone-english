import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { APP_ORIGIN, canonicalAppUrl, completedAuthUrl, localAuthAppUrl } from '../src/lib/appUrl';

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

it('starts local login on the configured loopback, preserves the page and drops stale OAuth credentials', () => {
  expect(
    localAuthAppUrl(
      'http://localhost:3000/?tab=attendance&view=compact&code=expired&sb_flow_id=old#today',
      'http://127.0.0.1:3000',
      'development',
    ),
  ).toBe('http://127.0.0.1:3000/?tab=attendance&view=compact#today');
  expect(
    localAuthAppUrl(
      'http://localhost:3000/?tab=dashboard#access_token=old&refresh_token=old',
      'http://127.0.0.1:3000',
      'development',
    ),
  ).toBe('http://127.0.0.1:3000/?tab=dashboard');
  expect(
    localAuthAppUrl('http://127.0.0.1:3000/?tab=dashboard', 'http://127.0.0.1:3000', 'development'),
  ).toBeNull();
});

it.each(['production', 'test'])('does not change login origins in %s mode', (mode) => {
  expect(localAuthAppUrl('http://localhost:3000/', 'http://127.0.0.1:3000', mode)).toBeNull();
});

it.each([
  undefined,
  'invalid',
  'https://example.test',
  'http://example.test:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3000/other',
  'http://127.0.0.1:3000/?next=example',
  'http://127.0.0.1:3000/#example',
  'http://user:pass@127.0.0.1:3000',
])('rejects an unconfigured, non-local or mismatched login destination %s', (origin) => {
  expect(localAuthAppUrl('http://localhost:3000/?tab=dashboard', origin, 'development')).toBeNull();
});

it('keeps HTTPS and deployed pages at their own origin even with a local preference', () => {
  expect(
    localAuthAppUrl('https://localhost:3000/', 'http://127.0.0.1:3000', 'development'),
  ).toBeNull();
  expect(localAuthAppUrl(`${APP_ORIGIN}/`, 'http://127.0.0.1:3000', 'development')).toBeNull();
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
