import type { AccountAuditLog, ActivityLog } from '../types';
import { PRIVATE_ACCOUNT_LABEL } from './accountPrivacy.js';

interface AuditProfile {
  id: string;
  email?: string;
  full_name?: string;
  is_private?: boolean;
}

interface AccountAuditRow {
  id: string;
  occurred_at: string;
  action: AccountAuditLog['action'];
  actor_id: string | null;
  target_id: string | null;
  actor_name: string;
  target_name: string;
  target_role: AccountAuditLog['targetRole'];
  details: string;
}

/** A display projection only: never replace the stored audit or backup with this result. */
export function createAuditPrivacy(profiles: AuditProfile[]) {
  const privateProfiles = profiles.filter((profile) => profile.is_private === true);
  const identity = (value: string) => value.trim().normalize('NFC').toLowerCase();
  const privateIds = new Set(privateProfiles.map((profile) => profile.id));
  const privateEmails = new Set(
    privateProfiles.map((profile) => profile.email && identity(profile.email)).filter(Boolean),
  );
  const privateNames = new Set(
    privateProfiles.map((profile) => profile.full_name && identity(profile.full_name))
      .filter((name) => name && name !== identity(PRIVATE_ACCOUNT_LABEL)),
  );
  const terms = [
    ...new Set(privateProfiles.flatMap((profile) => [profile.id, profile.email, profile.full_name])),
  ]
    .filter(
      (term): term is string =>
        typeof term === 'string' && term.trim().length >= 3 && identity(term) !== identity(PRIVATE_ACCOUNT_LABEL),
    )
    .map((term) => term.trim().normalize('NFC'))
    .sort((a, b) => b.length - a.length);
  const expression = terms.length
    ? new RegExp(terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'iu')
    : null;
  const mentionsPrivateAccount = (...texts: string[]) =>
    texts.some((text) => expression?.test(text.normalize('NFC')));

  return {
    activityLogs(value: unknown): ActivityLog[] {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value)) throw new Error('Invalid activity logs');
      return value.flatMap((log) => {
        if (
          !log ||
          ['id', 'timestamp', 'userEmail', 'userName', 'action', 'module', 'details'].some(
            (key) => typeof log[key] !== 'string',
          )
        )
          throw new Error('Invalid activity log');
        if (
          privateEmails.has(identity(log.userEmail)) ||
          (!log.userEmail.trim() && privateNames.has(identity(log.userName))) ||
          mentionsPrivateAccount(log.id, log.timestamp, log.userEmail, log.userName, log.action, log.module, log.details)
        ) return [];
        return [{
          id: log.id,
          timestamp: log.timestamp,
          action: log.action,
          userName: log.userName,
          userEmail: log.userEmail,
          module: log.module,
          details: log.details,
        }];
      });
    },
    accountLogs(rows: AccountAuditRow[]): AccountAuditLog[] {
      return rows
        .filter(
          (row) =>
            !privateIds.has(row.actor_id || '') &&
            !privateIds.has(row.target_id || '') &&
            // Legacy rows may lack IDs; use identities from trusted private profiles.
            !(row.actor_id === null && privateNames.has(identity(row.actor_name))) &&
            !(
              row.target_id === null &&
              privateNames.has(identity(row.target_name))
            ) &&
            !mentionsPrivateAccount(row.id, row.occurred_at, row.actor_name, row.target_name, row.details),
        )
        .map((row) => ({
          id: row.id,
          occurredAt: row.occurred_at,
          action: row.action,
          actorName: row.actor_name,
          targetName: row.target_name,
          targetRole: row.target_role,
          details: row.details,
        }));
    },
  };
}
