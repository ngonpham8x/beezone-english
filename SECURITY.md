# Production and security checklist

The application now uses Supabase Auth with Google OAuth for identity. The browser only receives a Supabase publishable key; the key that provisions Google accounts is used exclusively by `api/admin/users.ts` on Vercel.

## 1. Create and configure Supabase

1. Create a Supabase project and run [`supabase/migrations/001_auth_profiles.sql`](supabase/migrations/001_auth_profiles.sql) in **SQL Editor**.
2. In **Authentication → Providers**, enable Google. Create Google OAuth credentials in Google Cloud and copy the client ID and secret to the Google provider configuration.
3. In **Authentication → URL configuration**, set Site URL to the final HTTPS Vercel URL and add both the final URL and any preview URL that will be used to the Redirect URLs allow-list.
4. Disable public sign-ups. Accounts are provisioned only by an active owner through the protected server endpoint and can then sign in with the matching Google email.
5. Run migrations `001` through `008`. Migration 006 enforces business write permissions and protects the final active owner. Migration 007 validates operational dates, enrollments and dated schedule changes; restricts schedule writes to owners; and prevents older clients from dropping the new arrays. Migration 008 protects historical per-lesson prices, validates student/session invoice references and integer payment amounts, rejects double billing and future billable attendance, and includes unbilled lessons in derived student debt. New staff-created lesson prices must match the class configuration and date roster; enabling billing on legacy attendance requires an owner. Add initial-owner emails directly to the private Supabase allowlist table; do not commit them to GitHub. Future owners are provisioned by an existing owner in the app; no public endpoint can create arbitrary owners. See `SUPABASE_SETUP.md` for the precise Dashboard flow.

## 2. Vercel environment variables

Set the following separately for Production and Preview where relevant. Values prefixed `VITE_` are public browser configuration; all other values are server-only secrets.

| Variable | Where used |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser and build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser and build |
| `SUPABASE_URL` | Protected Vercel API |
| `SUPABASE_SECRET_KEY` | Protected Vercel API only. Never use a `VITE_` prefix. |
| `APP_URL` | Exact production HTTPS URL accepted as a protected API origin |
| `ALLOWED_ORIGINS` | Optional comma-separated production/preview URL allow-list |

Use `SUPABASE_SERVICE_ROLE_KEY` only for legacy Supabase projects that do not provide `SUPABASE_SECRET_KEY`.

## 3. What is protected

- Google OAuth sessions are checked against the active `profiles` record before the app renders.
- Accounts not explicitly provisioned by a centre owner are inactive and cannot enter the app, including a Google user who knows the URL.
- Creating, listing, and locking users requires a live Supabase JWT and an active `owner` profile; this is checked again on the Vercel server, not only in the UI.
- The API validates input, restricts allowed browser origins, does not cache responses, applies a small provisioning rate limit, and prevents locking the final active owner.
- RLS permits the browser to read only its own active profile. Browser clients cannot grant roles, activate profiles, or provision Google accounts.
- Account provisioning, role changes, and lock/unlock operations write to a separate RLS-protected audit table. Only the protected server endpoint can write it and only active owners can read it through the API.
- Vercel headers add CSP, clickjacking, MIME-sniffing, referrer, and device-permission protections.

No internet-facing application can be guaranteed to be “unhackable”. Keep dependencies updated, require a password manager and MFA for owner Google accounts, review Supabase/Vercel audit logs, and rotate the server secret immediately if it is ever exposed.

## Storage and access boundaries

Production business data is stored in the RLS-protected `center_data` document. Only the development preview uses local browser storage. Production never falls back to preview accounts, sample datasets or sample audit history after configuration/network errors. Builds reject a Supabase secret or legacy service-role key placed in a `VITE_` variable.

**The shared document still grants every active account database read access to the entire document.** UI permissions hide modules and migration 006 enforces writes, but neither provides column/class-level read isolation. Do not treat hidden finance panels or assigned-class filters as a confidentiality boundary. If teachers/staff must be unable to read other classes, contacts or financial records, split business entities into tables with read RLS, or introduce an authenticated API that filters reads and merges authorized writes. This remains an architectural requirement before using that stricter permission model with real data.

Account management uses compensating rollback if audit insertion fails; Supabase Auth and database audit changes do not share one atomic transaction. Inspect failed account-management operations rather than assuming no external change occurred.

Use JSON backups for complete recovery. Excel exports contain reporting data and formulas; legacy VBA templates remain historical assets and are no longer embedded in newly generated reports. Do not use preview storage for operational data.
