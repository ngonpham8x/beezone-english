import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

function worker(response: Response | Error, cached?: Response) {
  const listeners: Record<string, (event: any) => void> = {};
  const match = vi.fn(async () => cached);
  const fetch = vi.fn(async () => { if (response instanceof Error) throw response; return response; });
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://example.test' }, addEventListener: (type: string, fn: any) => { listeners[type] = fn; } },
    caches: { match, open: async () => ({ put: vi.fn() }) }, fetch, URL, Response,
  });
  return { request(path: string) {
    let result: Promise<Response> | undefined;
    listeners.fetch({ request: new Request(`https://example.test${path}`), respondWith: (value: Promise<Response>) => { result = value; }, waitUntil: () => {} });
    return result;
  }, match, fetch };
}

it('keeps an open version working when a deployment removes its cached chunk', async () => {
  const cached = new Response('old version module', { headers: { 'Content-Type': 'application/javascript' } });
  const test = worker(new Response('Not found', { status: 404 }), cached);
  expect(await (await test.request('/assets/StudentManager-old.js'))!.text()).toBe('old version module');
});
it('preserves a missing asset response when that exact asset is not cached', async () => {
  const test = worker(new Response('Not found', { status: 404 }));
  expect((await test.request('/assets/StudentManager-old.js'))!.status).toBe(404);
  expect(test.match).toHaveBeenCalledTimes(1);
});
it('does not cache or intercept authenticated API responses', () => {
  const test = worker(new Response('Unauthorized', { status: 401 }));
  expect(test.request('/api/admin/users')).toBeUndefined();
  expect(test.fetch).not.toHaveBeenCalled();
  expect(test.match).not.toHaveBeenCalled();
});
