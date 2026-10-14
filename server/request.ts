import { Buffer } from 'node:buffer';

export const MAX_ADMIN_BODY_BYTES = 10_000;

export type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
};

export function header(req: ApiRequest, name: string): string | undefined {
  const value = req.headers?.[name];
  return typeof value === 'string' ? value : undefined;
}

export function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'Origin, Authorization');
  res.status(status).json(body);
}

export function getBearerToken(req: ApiRequest): string | null {
  const value = header(req, 'authorization');
  if (!value || value.length > 8_192) return null;
  // Supabase access tokens are JWTs. Reject obvious bot garbage before network I/O;
  // the shape check never substitutes for auth.getUser's signature/session check.
  return /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(value)?.[1] || null;
}

function exactOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function requestIsAllowed(req: ApiRequest): boolean {
  if (header(req, 'sec-fetch-site') === 'cross-site') return false;
  if (req.headers?.origin === undefined) return true; // Non-browser callers still need a live JWT.
  const origin = exactOrigin(header(req, 'origin'));
  if (!origin) return false;
  const configured = [process.env.APP_URL, ...(process.env.ALLOWED_ORIGINS || '').split(',')];
  // Trust deployment configuration, never a caller-supplied Host/Forwarded header.
  if (process.env.VERCEL === '1') {
    for (const name of ['VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
      if (process.env[name]) configured.push(`https://${process.env[name]}`);
    }
  }
  if (configured.some((value) => exactOrigin(value) === origin)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  const local = new URL(origin);
  return (
    ['localhost', '127.0.0.1', '[::1]'].includes(local.hostname) &&
    local.host === header(req, 'host')
  );
}

export function validateBodyHeaders(req: ApiRequest): 400 | 413 | 415 | null {
  const length = header(req, 'content-length');
  if (req.headers?.['content-length'] !== undefined && (!length || !/^\d+$/.test(length)))
    return 400;
  if (length && Number(length) > MAX_ADMIN_BODY_BYTES) return 413;
  if (!/^application\/json(?:\s*;|$)/i.test(header(req, 'content-type') || '')) return 415;
  const encoding = header(req, 'content-encoding');
  if (encoding && encoding !== 'identity') return 415;
  return null;
}

export function parseRequestBody(body: unknown): Record<string, unknown> | null {
  try {
    if (body === undefined || body === '') return {};
    if (typeof body === 'string' && Buffer.byteLength(body, 'utf8') > MAX_ADMIN_BODY_BYTES)
      return null;
    const value = typeof body === 'string' ? JSON.parse(body) : body;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_ADMIN_BODY_BYTES) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
