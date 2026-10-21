import { adminApi } from '../../server/admin.js';
import { hiddenAccountsForViewer } from '../../server/accountVisibility.js';
import { json } from '../../server/request.js';
import { createAuditPrivacy } from '../../src/lib/auditPrivacy.js';

export default adminApi(['GET'], async (_req, res, { client, callerId }) => {
  const hiddenAccountIds = await hiddenAccountsForViewer(client, callerId);
  const [accounts, audit, center] = await Promise.all([
    // Legacy profiles without is_private keep their existing visibility.
    client.from('profiles').select('*'),
    client
      .from('account_audit_logs')
      .select(
        'id, occurred_at, action, actor_id, target_id, actor_name, target_name, target_role, details',
      )
      .order('occurred_at', { ascending: false })
      .limit(250),
    client.from('center_data').select('payload').eq('id', 'primary').maybeSingle(),
  ]);
  if (accounts.error || audit.error || center.error)
    return json(res, 500, { error: 'Chưa thể tải nhật ký hệ thống.' });

  const privacy = createAuditPrivacy((accounts.data || []).map(profile => hiddenAccountIds.has(profile.id) ? { ...profile, is_private: true } : profile));
  return json(res, 200, {
    logs: privacy.accountLogs(audit.data || []),
    activityLogs: privacy.activityLogs(center.data?.payload?.activityLogs),
  });
});
