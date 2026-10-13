export function parseRequestBody(body: unknown): Record<string, unknown> | null {
  try {
    if (body === undefined || body === '') return {};
    const value = typeof body === 'string' && body.length <= 10_000 ? JSON.parse(body) : body;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (JSON.stringify(value).length > 10_000) return null;
    return value as Record<string, unknown>;
  } catch { return null; }
}
