export const PRIVACY_POLICY_VERSION = '2026-11-06.1';
export const PRIVACY_POLICY_EFFECTIVE_DATE = '06/11/2026';
export const PRIVACY_CONSENT_PURPOSES = [
  'authentication',
  'center-operations',
  'security-audit',
] as const;

const PENDING_KEY = 'BEEZONE_PENDING_PRIVACY_CONSENT';
const PENDING_MAX_AGE_MS = 30 * 60 * 1000;

interface PendingConsent {
  version: string;
  createdAt: number;
}

export function markPendingPrivacyConsent() {
  try {
    const value: PendingConsent = { version: PRIVACY_POLICY_VERSION, createdAt: Date.now() };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    // The authenticated consent gate remains available if storage is restricted.
  }
}

export function hasPendingPrivacyConsent() {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null') as PendingConsent | null;
    return Boolean(
      value
      && value.version === PRIVACY_POLICY_VERSION
      && Number.isFinite(value.createdAt)
      && Date.now() - value.createdAt >= 0
      && Date.now() - value.createdAt <= PENDING_MAX_AGE_MS,
    );
  } catch {
    return false;
  }
}

export function clearPendingPrivacyConsent() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* optional browser storage */ }
}
