import type { AccountAuditLog, ActivityLog } from '../types';
import { PRIVATE_ACCOUNT_LABEL } from './accountPrivacy';

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
  const privateIds = new Set(privateProfiles.map((profile) => profile.id));
  const privateEmails = new Set(
    privateProfiles.map((profile) => profile.email?.trim().toLowerCase()).filter(Boolean),
  );
  const privateNames = new Set(
    privateProfiles.map((profile) => profile.full_name?.trim().toLowerCase()).filter(Boolean),
  );
  const terms = [
    ...new Set(privateProfiles.flatMap((profile) => [profile.email, profile.full_name])),
  ]
    .filter(
      (term): term is string =>
        typeof term === 'string' && term.trim().length >= 3 && term !== PRIVATE_ACCOUNT_LABEL,
    )
    .map((term) => term.trim())
    .sort((a, b) => b.length - a.length);
  const expression = terms.length
    ? new RegExp(terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'giu')
    : null;
  const redact = (text: string) =>
    expression ? text.replace(expression, () => PRIVATE_ACCOUNT_LABEL) : text;

  return {
    activityLogs(value: unknown): ActivityLog[] {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value)) throw new Error('Invalid activity logs');
      return value.map((log) => {
        if (
          !log ||
          ['id', 'timestamp', 'userEmail', 'userName', 'action', 'module', 'details'].some(
            (key) => typeof log[key] !== 'string',
          )
        )
          throw new Error('Invalid activity log');
        const isPrivate = privateEmails.has(log.userEmail.trim().toLowerCase());
        return {
          id: log.id,
          timestamp: log.timestamp,
          action: log.action,
          userName: isPrivate ? PRIVATE_ACCOUNT_LABEL : redact(log.userName),
          userEmail: isPrivate ? '' : redact(log.userEmail),
          module: redact(log.module),
          details: redact(log.details),
        };
      });
    },
    accountLogs(rows: AccountAuditRow[]): AccountAuditLog[] {
      return rows
        .filter(
          (row) =>
            !privateIds.has(row.target_id || '') &&
            // Legacy rows may have no target ID. Match only a verified private profile's identity.
            !(
              row.target_id === null &&
              (privateEmails.has(row.target_name.trim().toLowerCase()) ||
                privateNames.has(row.target_name.trim().toLowerCase()))
            ),
        )
        .map((row) => ({
          id: row.id,
          occurredAt: row.occurred_at,
          action: row.action,
          actorName: privateIds.has(row.actor_id || '')
            ? PRIVATE_ACCOUNT_LABEL
            : redact(row.actor_name),
          targetName: redact(row.target_name),
          targetRole: row.target_role,
          details: redact(row.details),
        }));
    },
  };
}
