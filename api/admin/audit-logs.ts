import { adminApi } from '../../server/admin.js';
import { json } from '../../server/request.js';

export default adminApi(['GET'], async (_req, res, { client }) => {
  const { data, error } = await client
    .from('account_audit_logs')
    .select('id, occurred_at, action, actor_name, target_name, target_role, details')
    .order('occurred_at', { ascending: false })
    .limit(250);
  if (error) return json(res, 500, { error: 'Chưa thể tải nhật ký tài khoản.' });

  const logs = (data || []).map((item) => ({
    id: item.id,
    occurredAt: item.occurred_at,
    action: item.action,
    actorName: item.actor_name,
    targetName: item.target_name,
    targetRole: item.target_role,
    details: item.details,
  }));
  return json(res, 200, { logs });
});
