import { createClient } from '@supabase/supabase-js';

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

// Do not add a service-role/secret key here. This bundle is delivered to browsers.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
