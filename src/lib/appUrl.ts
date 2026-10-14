export const APP_ORIGIN = 'https://beezone-english.vercel.app';
const ALTERNATE_HOSTS = new Set([
  'beezone-english-ngonpham.vercel.app',
  'beezone-english-git-main-ngonpham.vercel.app',
]);
const AUTH_QUERY_KEYS = ['code', 'error', 'error_code', 'error_description', 'sb_flow_id'];
const AUTH_FRAGMENT_KEYS = [
  'access_token',
  'refresh_token',
  'id_token',
  'error',
  'error_description',
];

function stripAuthParameters(url: URL) {
  AUTH_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (AUTH_FRAGMENT_KEYS.some((key) => fragment.has(key))) url.hash = '';
  return url;
}

/** PKCE verifiers and sessions belong to one origin: start a new login on the main domain. */
export function canonicalAppUrl(href: string): string | null {
  const url = new URL(href);
  if (url.protocol !== 'https:' || !ALTERNATE_HOSTS.has(url.hostname)) return null;
  const destination = stripAuthParameters(url);
  destination.host = new URL(APP_ORIGIN).host;
  destination.username = '';
  destination.password = '';
  return destination.href;
}

/** Call only after Supabase has finished reading the callback and returned a valid session. */
export function completedAuthUrl(href: string): string {
  const url = stripAuthParameters(new URL(href));
  return `${url.pathname}${url.search}${url.hash}`;
}
