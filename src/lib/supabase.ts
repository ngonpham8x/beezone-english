import { createClient } from '@supabase/supabase-js';
import { canonicalAppUrl } from './appUrl';

const canonicalUrl = import.meta.env.PROD && typeof window !== 'undefined'
  ? canonicalAppUrl(window.location.href) : null;
if (canonicalUrl) window.location.replace(canonicalUrl);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

const validUrl = (() => {
  try { return new URL(supabaseUrl).protocol === 'https:' && !supabaseUrl.includes('YOUR_PROJECT'); }
  catch { return false; }
})();
export const isSupabaseConfigured = Boolean(validUrl && supabasePublishableKey && !supabasePublishableKey.includes('YOUR_KEY') && !supabasePublishableKey.startsWith('sb_secret_'));
// Preview identities must never be available in a deployed build.
export const isLocalPreview = import.meta.env.DEV && !isSupabaseConfigured;

/** Public Auth settings prevent redirecting users to a raw disabled-provider error. */
export async function isGoogleSignInEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: supabasePublishableKey },
    signal: AbortSignal.timeout(8_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Auth settings unavailable');
  const settings = await response.json();
  if (typeof settings?.external?.google !== 'boolean') throw new Error('Invalid Auth settings');
  return settings.external.google;
}

// Do not add a service-role/secret key here. This bundle is delivered to browsers.
export const supabase = isSupabaseConfigured && !canonicalUrl
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
