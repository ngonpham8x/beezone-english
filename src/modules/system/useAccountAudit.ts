import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { isLocalPreview } from '../../lib/supabase';
import { initialAccountAuditLogs } from '../../mock/initialData';
import type { AccountAuditLog, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
export function useAccountAudit(
  store: CenterStore,
  currentUser: UserAccount | null,
  session: Session | null,
  activeTab: string,
) {
  const { setAccountAuditLogs } = store;
  const [accountAuditError, setAccountAuditError] = useState<string | null>(null);
  const [isAccountAuditLoading, setIsAccountAuditLoading] = useState(false);
  const loadAccountAuditLogs = useCallback(async () => {
    if (currentUser?.role !== 'owner') {
      setAccountAuditLogs([]);
      setAccountAuditError(null);
      return;
    }
    if (isLocalPreview) {
      setAccountAuditLogs(initialAccountAuditLogs);
      setAccountAuditError(null);
      return;
    }
    setIsAccountAuditLoading(true);
    setAccountAuditError(null);
    try {
      const response = await fetch('/api/admin/audit-logs', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const payload = (await response.json()) as { logs?: AccountAuditLog[]; error?: string };
        if (Array.isArray(payload.logs)) {
          setAccountAuditLogs(payload.logs);
          return;
        }
      }
      throw new Error('Không thể tải nhật ký tài khoản từ máy chủ.');
    } catch (error) {
      setAccountAuditError(
        error instanceof Error ? error.message : 'Không thể tải nhật ký tài khoản.',
      );
    } finally {
      setIsAccountAuditLoading(false);
    }
  }, [currentUser?.role, session?.access_token]);

  useEffect(() => {
    if (activeTab === 'activity-logs') void loadAccountAuditLogs();
  }, [activeTab, loadAccountAuditLogs]);

  return { accountAuditError, isAccountAuditLoading, loadAccountAuditLogs };
}
export type AccountAudit = ReturnType<typeof useAccountAudit>;
