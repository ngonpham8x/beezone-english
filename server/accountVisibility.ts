/** Additional account-list privacy. Rules are configured only by database admins. */
export async function hiddenAccountsForViewer(client: any, viewerId: string): Promise<Set<string>> {
  const { data, error } = await client.from('account_visibility_rules').select('account_id, viewer_id');
  // Preserve the existing is_private behavior on databases predating migration 014.
  if (error && ['42P01', 'PGRST205'].includes(error.code)) return new Set();
  if (error || !Array.isArray(data)) throw new Error('Chưa thể kiểm tra quyền hiển thị tài khoản.');
  return new Set(data.filter(rule => rule.viewer_id !== viewerId).map(rule => rule.account_id));
}
