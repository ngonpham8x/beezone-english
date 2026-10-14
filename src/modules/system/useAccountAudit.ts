import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isLocalPreview } from '../../lib/supabase';
import { initialAccountAuditLogs } from '../../mock/initialData';
import type { AccountAuditLog, ActivityLog, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
export function useAccountAudit(
  store: CenterStore,
  currentUser: UserAccount | null,
  session: Session | null,
  activeTab: string,
) {
  const { setAccountAuditLogs, activityLogs, accountAuditLogs } = store;
  const [snapshot, setSnapshot] = useState<{ ownerId: string; activityLogs: ActivityLog[] } | null>(
    null,
  );
  const requestId = useRef(0);
  const [accountAuditError, setAccountAuditError] = useState<string | null>(null);
  const [isAccountAuditLoading, setIsAccountAuditLoading] = useState(false);
  const loadAccountAuditLogs = useCallback(async () => {
    const runId = ++requestId.current;
    if (currentUser?.role !== 'owner') {
      setAccountAuditLogs([]);
      setSnapshot(null);
      setAccountAuditError(null);
      setIsAccountAuditLoading(false);
      return;
    }
    if (isLocalPreview) {
      setAccountAuditLogs(initialAccountAuditLogs);
      setAccountAuditError(null);
      setIsAccountAuditLoading(false);
      return;
    }
    setIsAccountAuditLoading(true);
    setAccountAuditError(null);
    try {
      const response = await fetch('/api/admin/audit-logs', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const payload = (await response.json()) as {
          logs?: AccountAuditLog[];
          activityLogs?: ActivityLog[];
        };
        if (runId !== requestId.current) return;
        if (Array.isArray(payload.logs) && Array.isArray(payload.activityLogs)) {
          setAccountAuditLogs(payload.logs);
          setSnapshot({ ownerId: currentUser.id, activityLogs: payload.activityLogs });
          return;
        }
      }
      throw new Error('Không thể tải nhật ký hệ thống từ máy chủ.');
    } catch (error) {
      if (runId !== requestId.current) return;
      setAccountAuditError(
        error instanceof Error ? error.message : 'Không thể tải nhật ký tài khoản.',
      );
    } finally {
      if (runId === requestId.current) setIsAccountAuditLoading(false);
    }
  }, [currentUser?.id, currentUser?.role, session?.access_token, setAccountAuditLogs]);

  useEffect(() => {
    if (activeTab === 'activity-logs') void loadAccountAuditLogs();
    return () => {
      requestId.current += 1;
    };
  }, [activeTab, loadAccountAuditLogs]);

  const canDisplay = currentUser?.role === 'owner' && snapshot?.ownerId === currentUser.id;
  // Production renders only the server's privacy projection, never the raw shared payload.
  return {
    accountAuditError,
    isAccountAuditLoading,
    loadAccountAuditLogs,
    visibleActivityLogs: isLocalPreview ? activityLogs : canDisplay ? snapshot.activityLogs : [],
    visibleAccountLogs: isLocalPreview || canDisplay ? accountAuditLogs : [],
  };
}
export type AccountAudit = ReturnType<typeof useAccountAudit>;
