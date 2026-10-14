import { isIP } from 'node:net';
import { header, json, type ApiRequest } from './request.js';

/** A bounded per-process burst guard; durable quotas are enforced by Postgres. */
export function createBurstLimiter(maxKeys = 10_000) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;
  return (key: string, limit: number, windowMs: number, now = Date.now()): number => {
    if (now >= nextSweep) {
      for (const [id, entry] of buckets) if (entry.resetAt <= now) buckets.delete(id);
      nextSweep = now + 60_000;
    }
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && buckets.size >= maxKeys)
        return Math.max(1, Math.ceil((nextSweep - now) / 1000));
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return 0;
    }
    if (current.count >= limit) return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    current.count++;
    return 0;
  };
}

export function clientAddress(req: ApiRequest): string {
  // Vercel overwrites this header; local/direct deployments must use the socket.
  const forwarded = process.env.VERCEL === '1' ? header(req, 'x-vercel-forwarded-for') : undefined;
  const value = forwarded || req.socket?.remoteAddress || '';
  return isIP(value) ? value : 'unknown';
}

const burst = createBurstLimiter();

export function rateLimited(res: any, retryAfter: number) {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfter))));
  return json(res, 429, { error: 'Quá nhiều yêu cầu. Vui lòng chờ rồi thử lại.' });
}

export function admitAdminRequest(req: ApiRequest, res: any): boolean {
  const retry = burst('all-admin', 300, 60_000) || burst(`ip:${clientAddress(req)}`, 60, 60_000);
  if (!retry) return true;
  rateLimited(res, retry);
  return false;
}
