/** A successful HTML fallback is not a successful API operation. */
export async function readApiJson<T>(response: Response, fallback: string): Promise<T> {
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error(fallback);
  let body: T & { error?: string };
  try { body = await response.json(); } catch { throw new Error(fallback); }
  if (!response.ok) throw new Error(body?.error || fallback);
  if (!body || typeof body !== 'object') throw new Error(fallback);
  return body;
}
