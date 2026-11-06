import { askConfirmation } from '../../lib/dialogs';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { registerActiveSession, removeActiveSession } from '../../lib/activeSessions';
import { completedAuthUrl } from '../../lib/appUrl';
import { reportError } from '../../lib/diagnostics';
import {
  createMockSessionForAccount,
  DEV_OWNER_ACCOUNT,
  DEV_TEACHER_ACCOUNT,
  findAdminAccountByEmail,
  profileToAccount,
  type ProfileRow,
} from '../../lib/auth';
import { parseCenterData, type CenterDataPayload } from '../../lib/centerData';
import {
  centerSnapshotsEqual,
  isNewerCenterRevision,
  mergeCenterSnapshots,
  type CenterSyncPreference,
} from '../../lib/centerSync';
import { isLocalPreview, isSupabaseConfigured, supabase } from '../../lib/supabase';
import { createSyncQueue, SyncConflictError } from '../../lib/syncQueue';
import { reconcileStudentClassCodes } from '../../lib/studentClasses';
import { initialSettings } from '../../mock/initialData';
import {
  clearPendingPrivacyConsent,
  hasPendingPrivacyConsent,
  PRIVACY_CONSENT_PURPOSES,
  PRIVACY_POLICY_VERSION,
} from '../privacy/privacyPolicy';
import type { ActivityLog, UserAccount } from '../../types';
import { mergeActivityLogs, normalizeCenterData, reconcileStudentFees } from './model';
import type { CenterStore } from './useCenterStore';

interface SyncConflictContext {
  base: CenterDataPayload;
  remote: CenterDataPayload;
  revision: string;
  validationFailed: boolean;
}

interface RemoteSnapshot {
  payload: unknown;
  revision: string;
}

interface CenterSnapshotRpcResponse {
  payload: unknown;
  updated_at: string | null;
}

interface CenterSaveRpcResponse {
  applied: boolean;
  updated_at: string | null;
}

const NETWORK_SYNC_ERROR =
  'Mất kết nối với máy chủ. Hệ thống sẽ tự thử lại khi có mạng; dữ liệu đang nhập trên máy này vẫn được giữ.';

function isTransientNetworkFailure(error: unknown): boolean {
  const detail = error instanceof Error
    ? `${error.name} ${error.message}`
    : typeof error === 'string'
      ? error
      : error && typeof error === 'object'
        ? `${'message' in error ? String(error.message) : ''} ${'details' in error ? String(error.details) : ''}`
        : '';
  return /load failed|failed to fetch|network|offline|timed?\s*out|timeout|abort|mất kết nối/i.test(detail);
}

/** Session lifecycle, hydration and CAS queue belong to one connection; auth refresh must not overwrite edits. */
export function useCenterConnection(store: CenterStore, onCloseLogin: () => void) {
  const {
    settings,
    programs,
    teachers,
    rooms,
    classes,
    students,
    timetableSlots,
    grades,
    receipts,
    backups,
    activityLogs,
    attendanceSessions,
    enrollments,
    scheduleChanges,
    setActivityLogs,
    storageError,
    applyData,
    clearData,
  } = store;
  const currentPayload = useMemo<CenterDataPayload>(() => ({
    sessionBillingVersion: 1,
    settings,
    programs,
    teachers,
    rooms,
    classes,
    students: reconcileStudentFees(reconcileStudentClassCodes(students, classes), receipts, attendanceSessions),
    timetableSlots,
    grades,
    receipts,
    backups,
    activityLogs,
    attendanceSessions,
    enrollments,
    scheduleChanges,
  }), [
    settings,
    programs,
    teachers,
    rooms,
    classes,
    students,
    timetableSlots,
    grades,
    receipts,
    backups,
    activityLogs,
    attendanceSessions,
    enrollments,
    scheduleChanges,
  ]);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    if (isLocalPreview) {
      try {
        const savedDevRole = sessionStorage.getItem('BEEZONE_DEV_ROLE');
        const savedEmail = sessionStorage.getItem('BEEZONE_ACTIVE_EMAIL');
        if (savedDevRole === 'teacher') return DEV_TEACHER_ACCOUNT;
        if (savedEmail) {
          const matched = findAdminAccountByEmail(savedEmail);
          if (matched) return matched;
        }
        return DEV_OWNER_ACCOUNT;
      } catch {
        return DEV_OWNER_ACCOUNT;
      }
    }
    return null;
  });
  const [session, setSession] = useState<Session | null>(() => {
    if (isLocalPreview) {
      try {
        if (sessionStorage.getItem('BEEZONE_DEV_ROLE') === 'teacher')
          return createMockSessionForAccount(DEV_TEACHER_ACCOUNT);
        const savedEmail = sessionStorage.getItem('BEEZONE_ACTIVE_EMAIL');
        if (savedEmail) {
          const matched = findAdminAccountByEmail(savedEmail);
          if (matched) return createMockSessionForAccount(matched);
        }
      } catch {
        // ignore
      }
      return createMockSessionForAccount(DEV_OWNER_ACCOUNT);
    }
    return null;
  });
  const [authStatus, setAuthStatus] = useState<
    'loading' | 'ready' | 'signed-out' | 'blocked' | 'privacy-required' | 'error'
  >(isSupabaseConfigured ? 'loading' : isLocalPreview ? 'ready' : 'signed-out');
  const [isCenterDataHydrated, setIsCenterDataHydrated] = useState(!isSupabaseConfigured);
  const [canSyncCenterData, setCanSyncCenterData] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRetry, setAuthRetry] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error' | 'conflict'>('saved');
  const [syncError, setSyncError] = useState<string | null>(null);
  const cloudRevisionRef = useRef<string | null>(null);
  const basePayloadRef = useRef<CenterDataPayload | null>(null);
  const latestPayloadRef = useRef(currentPayload);
  latestPayloadRef.current = currentPayload;
  const savedPayloadRef = useRef('');
  const conflictContextRef = useRef<SyncConflictContext | null>(null);
  const writeInFlightRef = useRef(false);
  const inFlightPayloadRef = useRef('');
  const deferredRemoteRef = useRef<RemoteSnapshot | null>(null);
  const processRemoteSnapshotRef = useRef<(snapshot: RemoteSnapshot) => void>(() => undefined);
  const reconnectRefreshInFlightRef = useRef(false);
  const networkRetryAttemptRef = useRef(0);
  // Keep hydration across a connection retry so a profile/network error cannot reload over edits.
  const hydratedUserIdRef = useRef<string | null>(null);
  const syncQueueRef = useRef<ReturnType<typeof createSyncQueue<CenterDataPayload>> | null>(null);

  const normalizeCloudPayload = useCallback((value: unknown) => normalizeCenterData(
    parseCenterData(value || {}, initialSettings),
  ), []);

  const readScopedCenterSnapshot = useCallback(async (): Promise<CenterSnapshotRpcResponse> => {
    if (!supabase) throw new Error('Chưa cấu hình kết nối dữ liệu.');
    const { data, error } = await supabase.rpc('bz_get_center_snapshot', {
      p_policy_version: PRIVACY_POLICY_VERSION,
    });
    if (error) {
      const missingMigration = ['42883', 'PGRST202'].includes(error.code || '');
      throw Object.assign(
        new Error(missingMigration
          ? 'Chưa áp dụng migration 034 về giới hạn dữ liệu theo quyền.'
          : error.message || 'Không thể tải dữ liệu trung tâm.'),
        { cause: error },
      );
    }
    if (!data || typeof data !== 'object' || !('payload' in data) || !('updated_at' in data))
      throw new Error('Máy chủ trả về dữ liệu trung tâm không hợp lệ.');
    return data as unknown as CenterSnapshotRpcResponse;
  }, []);

  const processRemoteSnapshot = useCallback((snapshot: RemoteSnapshot) => {
    // A poll may start before a save and finish while that save is in flight.
    // Discard that deferred response once the save has advanced the revision;
    // merging it later would create a false conflict or restore stale values.
    if (!isNewerCenterRevision(snapshot.revision, cloudRevisionRef.current)) return;
    if (writeInFlightRef.current) {
      deferredRemoteRef.current = snapshot;
      return;
    }

    let remote: CenterDataPayload;
    try {
      remote = normalizeCloudPayload(snapshot.payload);
    } catch (error) {
      reportError('center-realtime-parse', error);
      return;
    }
    if (inFlightPayloadRef.current && JSON.stringify(remote) === inFlightPayloadRef.current) return;

    const base = basePayloadRef.current;
    if (!base) {
      cloudRevisionRef.current = snapshot.revision;
      basePayloadRef.current = remote;
      latestPayloadRef.current = remote;
      savedPayloadRef.current = JSON.stringify(remote);
      applyData(remote);
      setSyncStatus('saved');
      setSyncError(null);
      return;
    }

    const local = latestPayloadRef.current;
    const merged = mergeCenterSnapshots(base, local, remote);
    let validated: CenterDataPayload | null = null;
    let validationFailed = false;
    if (merged.conflicts.length === 0) {
      try {
        validated = normalizeCloudPayload(merged.value);
      } catch (error) {
        validationFailed = true;
        reportError('center-realtime-merge', error);
      }
    }

    cloudRevisionRef.current = snapshot.revision;
    if (merged.conflicts.length > 0 || !validated) {
      conflictContextRef.current = { base, remote, revision: snapshot.revision, validationFailed };
      const count = merged.conflicts.length || 1;
      const message = `${count} nội dung đang được sửa khác nhau trên nhiều máy. Hãy chọn bản ưu tiên; các thay đổi không trùng nhau vẫn được giữ.`;
      if (syncQueueRef.current) syncQueueRef.current.blockConflict(message);
      else {
        setSyncStatus('conflict');
        setSyncError(message);
      }
      return;
    }

    const recoveringConflict = conflictContextRef.current !== null;
    conflictContextRef.current = null;
    basePayloadRef.current = remote;
    savedPayloadRef.current = JSON.stringify(remote);
    latestPayloadRef.current = validated;
    if (recoveringConflict) syncQueueRef.current?.reset();
    applyData(validated);
    setSyncError(null);
    setSyncStatus(centerSnapshotsEqual(validated, remote) ? 'saved' : 'saving');
  }, [applyData, normalizeCloudPayload]);
  processRemoteSnapshotRef.current = processRemoteSnapshot;

  useEffect(() => {
    if (currentUser) {
      registerActiveSession(currentUser);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    let resolvingUserId: string | null = null;
    let resolutionId = 0;
    let authEventObserved = false;
    let latestSession: Session | null = null;
    let lastProfileCheck = 0;
    const deferredEvents = new Set<number>();

    const resolveSession = async (nextSession: Session | null) => {
      if (!isMounted) return;
      latestSession = nextSession;
      setSession(nextSession);

      if (!nextSession) {
        resolutionId += 1;
        hydratedUserIdRef.current = null;
        resolvingUserId = null;
        syncQueueRef.current?.stop();
        cloudRevisionRef.current = null;
        basePayloadRef.current = null;
        conflictContextRef.current = null;
        savedPayloadRef.current = '';
        setCurrentUser(null);
        setIsCenterDataHydrated(false);
        setCanSyncCenterData(false);
        clearData();
        setAuthStatus('signed-out');
        return;
      }

      // SDK initialization has completed; remove a leftover consumed callback code.
      const cleanUrl = completedAuthUrl(window.location.href);
      if (cleanUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
        window.history.replaceState(window.history.state, '', cleanUrl);

      if (resolvingUserId === nextSession.user.id) return;
      resolvingUserId = nextSession.user.id;
      const runId = ++resolutionId;
      const isCurrent = () => isMounted && runId === resolutionId;
      const alreadyHydrated = hydratedUserIdRef.current === nextSession.user.id;

      if (!alreadyHydrated) setAuthStatus('loading');
      setAuthError(null);
      try {
        lastProfileCheck = Date.now();
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', nextSession.user.id)
          .maybeSingle();

        if (!isCurrent()) return;
        if (error)
          throw new Error('Không thể kiểm tra quyền tài khoản. Kiểm tra kết nối và thử lại.');
        if (!data || !data.is_active || !['owner', 'admin', 'trainer', 'teacher', 'staff'].includes(data.role)) {
          hydratedUserIdRef.current = null;
          syncQueueRef.current?.stop();
          setCurrentUser(null);
          setCanSyncCenterData(false);
          setIsCenterDataHydrated(false);
          setAuthStatus('blocked');
          return;
        }

        const account = profileToAccount(data as ProfileRow, nextSession.user);
        setCurrentUser(account);
        const consentResult = await supabase
          .from('privacy_consents')
          .select('purposes, consented_at, withdrawn_at')
          .eq('user_id', nextSession.user.id)
          .eq('policy_version', PRIVACY_POLICY_VERSION)
          .maybeSingle();
        if (!isCurrent()) return;
        if (consentResult.error) {
          const missingMigration = ['42P01', 'PGRST205'].includes(consentResult.error.code || '');
          throw new Error(missingMigration
            ? 'Chưa áp dụng migration 033 về xác nhận quyền riêng tư. Chủ trung tâm cần cập nhật cơ sở dữ liệu trước khi tiếp tục.'
            : 'Không thể kiểm tra xác nhận bảo vệ dữ liệu cá nhân.');
        }
        const acceptedPurposes = new Set(Array.isArray(consentResult.data?.purposes) ? consentResult.data.purposes : []);
        const hasCurrentConsent = Boolean(
          consentResult.data?.consented_at
          && !consentResult.data?.withdrawn_at
          && PRIVACY_CONSENT_PURPOSES.every((purpose) => acceptedPurposes.has(purpose)),
        );
        if (!hasCurrentConsent && hasPendingPrivacyConsent()) {
          const accepted = await supabase.rpc('bz_accept_privacy_policy', {
            p_policy_version: PRIVACY_POLICY_VERSION,
            p_purposes: [...PRIVACY_CONSENT_PURPOSES],
          });
          if (!isCurrent()) return;
          if (accepted.error) throw new Error('Không thể lưu xác nhận bảo vệ dữ liệu cá nhân.');
          clearPendingPrivacyConsent();
        } else if (!hasCurrentConsent) {
          syncQueueRef.current?.stop();
          setCanSyncCenterData(false);
          setIsCenterDataHydrated(false);
          setAuthStatus('privacy-required');
          return;
        }
        // Refresh the profile on auth events without replacing unsaved business data.
        if (alreadyHydrated) {
          setIsCenterDataHydrated(true);
          setCanSyncCenterData(true);
          setAuthStatus('ready');
          return;
        }
        syncQueueRef.current?.stop();
        setIsCenterDataHydrated(false);
        setCanSyncCenterData(false);
        try {
          const centerData = await readScopedCenterSnapshot();
          if (!isCurrent()) return;
          const payload = normalizeCenterData(
            parseCenterData(centerData?.payload || {}, initialSettings),
          );
          applyData(payload);
          cloudRevisionRef.current = centerData?.updated_at ?? null;
          basePayloadRef.current = payload;
          latestPayloadRef.current = payload;
          conflictContextRef.current = null;
          savedPayloadRef.current = JSON.stringify(payload);
          setSyncStatus('saved');
          setSyncError(null);
          setCanSyncCenterData(true);
        } catch (centerDataError) {
          if (!isCurrent()) return;
          if (centerDataError instanceof Error && /migration 034/.test(centerDataError.message)) throw centerDataError;
          throw new Error('Không thể tải dữ liệu trung tâm. Kiểm tra kết nối và cấu trúc Supabase rồi thử lại.');
        }
        try {
          const loginLogKey = `PHUC_PHUC_THINH_LOGIN_LOGGED_${nextSession.user.id}`;
          if (!sessionStorage.getItem(loginLogKey)) {
            const loginLog: ActivityLog = {
              id: `LOG_LOGIN_${crypto.randomUUID()}`,
              timestamp: new Date().toLocaleString('vi-VN'),
              userEmail: account.email,
              userName: account.name,
              action: 'ĐĂNG NHẬP',
              module: 'Xác thực',
              details: 'Đăng nhập vào hệ thống quản lý trung tâm.',
            };
            setActivityLogs((previous) => mergeActivityLogs([loginLog], previous));
            sessionStorage.setItem(loginLogKey, '1');
          }
        } catch {
          // Session storage can be unavailable in restricted browser contexts.
        }
        hydratedUserIdRef.current = nextSession.user.id;
        setIsCenterDataHydrated(true);
        setAuthStatus('ready');
      } catch (error) {
        if (!isCurrent()) return;
        if (!alreadyHydrated) hydratedUserIdRef.current = null;
        syncQueueRef.current?.stop();
        setCanSyncCenterData(false);
        setIsCenterDataHydrated(false);
        setAuthError(error instanceof Error ? error.message : 'Không thể tải dữ liệu.');
        setAuthStatus('error');
      } finally {
        if (isCurrent()) resolvingUserId = null;
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted || authEventObserved) return;
        if (error) {
          setAuthError('Không thể kiểm tra phiên đăng nhập.');
          setAuthStatus('error');
          return;
        }
        void resolveSession(data.session);
      })
      .catch(() => {
        if (isMounted && !authEventObserved) {
          setAuthError('Không thể kết nối hệ thống đăng nhập.');
          setAuthStatus('error');
        }
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventObserved = true;
      latestSession = nextSession;
      // Supabase holds an auth lock while callbacks run. Defer queries outside it.
      const timer = window.setTimeout(() => {
        deferredEvents.delete(timer);
        void resolveSession(nextSession);
      }, 0);
      deferredEvents.add(timer);
    });

    // A permission update by the owner must reach an already signed-in staff member.
    // Reuse profile resolution: a hydrated session keeps its unsaved data and CAS revision.
    const refreshProfile = () => {
      if (document.visibilityState !== 'visible' || !latestSession || Date.now() - lastProfileCheck < 3000) return;
      void resolveSession(latestSession);
    };
    window.addEventListener('focus', refreshProfile);
    document.addEventListener('visibilitychange', refreshProfile);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', refreshProfile);
      document.removeEventListener('visibilitychange', refreshProfile);
      deferredEvents.forEach((timer) => window.clearTimeout(timer));
      listener.subscription.unsubscribe();
    };
  }, [authRetry, readScopedCenterSnapshot]);

  useEffect(() => {
    if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData) return;
    let active = true;
    const queue = createSyncQueue<CenterDataPayload>(
      async (requestedPayload) => {
        let payload = requestedPayload;
        writeInFlightRef.current = true;
        try {
          for (let attempt = 0; attempt < 4; attempt += 1) {
            const revision = cloudRevisionRef.current;
            inFlightPayloadRef.current = JSON.stringify(payload);
            const result = await supabase.rpc('bz_save_center_snapshot', {
              p_payload: payload,
              p_expected_updated_at: revision,
              p_policy_version: PRIVACY_POLICY_VERSION,
            });
            const saveResult = result.data as CenterSaveRpcResponse | null;
            const casConflict = !result.error && (!saveResult || saveResult.applied !== true);
            if (casConflict) {
              const remoteResult = await readScopedCenterSnapshot();
              if (!remoteResult.updated_at) {
                throw new Error('Không thể tải phiên bản mới nhất để hợp nhất dữ liệu. Thay đổi trên máy này vẫn được giữ.');
              }
              const remote = normalizeCloudPayload(remoteResult.payload);
              const base = basePayloadRef.current || payload;
              // The user may have continued editing while this older queued snapshot
              // was being written. Merge the newest live state so a CAS recovery can
              // never replace keystrokes made during the request.
              const latestLocal = latestPayloadRef.current;
              const merged = mergeCenterSnapshots(base, latestLocal, remote);
              cloudRevisionRef.current = remoteResult.updated_at;
              if (merged.conflicts.length > 0) {
                conflictContextRef.current = {
                  base,
                  remote,
                  revision: remoteResult.updated_at,
                  validationFailed: false,
                };
                throw new SyncConflictError(
                  `${merged.conflicts.length} nội dung đang được sửa khác nhau trên nhiều máy. Hãy chọn bản ưu tiên; các thay đổi không trùng nhau vẫn được giữ.`,
                );
              }
              try {
                payload = normalizeCloudPayload(merged.value);
              } catch (error) {
                reportError('center-sync-merge', error);
                conflictContextRef.current = {
                  base,
                  remote,
                  revision: remoteResult.updated_at,
                  validationFailed: true,
                };
                throw new SyncConflictError('Các thay đổi từ nhiều máy tạo liên kết dữ liệu không hợp lệ. Hãy chọn một bản ưu tiên để tiếp tục.');
              }
              basePayloadRef.current = remote;
              savedPayloadRef.current = JSON.stringify(remote);
              latestPayloadRef.current = payload;
              applyData(payload);
              continue;
            }
            if (result.error?.code === 'PT429')
              throw new Error('Đã đạt giới hạn lưu dữ liệu. Chờ khoảng một phút rồi thử lại; thay đổi đang nhập vẫn được giữ nguyên.');
            if (result.error?.code === 'PT413')
              throw new Error('Dữ liệu vượt giới hạn 32 MB. Hãy sao lưu thay đổi đang nhập và liên hệ quản trị.');
            if (result.error) {
              reportError('center-sync', result.error);
              if (isTransientNetworkFailure(result.error)) throw new Error(NETWORK_SYNC_ERROR);
              const errorDetail = result.error.message || result.error.details || '';
              const hint = result.error.code === '42501'
                ? ' (Tài khoản hiện tại chưa được cấp quyền lưu mục này trên máy chủ)'
                : (errorDetail ? ` (${errorDetail})` : '');
              throw new Error(
                `Không thể lưu dữ liệu lên máy chủ. Kiểm tra kết nối và quyền truy cập rồi thử lại.${hint}`,
              );
            }
            if (!active) return;
            if (!saveResult?.updated_at)
              throw new Error('Máy chủ không trả về phiên bản dữ liệu vừa lưu.');
            cloudRevisionRef.current = saveResult.updated_at;
            basePayloadRef.current = payload;
            savedPayloadRef.current = JSON.stringify(payload);
            conflictContextRef.current = null;
            return;
          }
          throw new Error('Dữ liệu máy chủ đang thay đổi liên tục. Hãy chờ vài giây rồi thử lưu lại.');
        } catch (error) {
          if (isTransientNetworkFailure(error)) throw new Error(NETWORK_SYNC_ERROR);
          throw error;
        } finally {
          writeInFlightRef.current = false;
          inFlightPayloadRef.current = '';
          const deferred = deferredRemoteRef.current;
          deferredRemoteRef.current = null;
          if (active && deferred) queueMicrotask(() => processRemoteSnapshotRef.current(deferred));
        }
      },
      (status, error) => {
        setSyncStatus(status);
        setSyncError(error || null);
      },
    );
    syncQueueRef.current = queue;
    return () => {
      active = false;
      queue.stop();
      if (syncQueueRef.current === queue) syncQueueRef.current = null;
    };
  }, [currentUser?.id, isCenterDataHydrated, canSyncCenterData, applyData, normalizeCloudPayload, readScopedCenterSnapshot]);

  useEffect(() => {
    if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData) return;
    if (syncStatus === 'saved' || syncStatus === 'conflict') networkRetryAttemptRef.current = 0;

    let active = true;
    let retryTimer: number | undefined;
    const refreshRemoteAndRetry = async () => {
      if (!active || reconnectRefreshInFlightRef.current || navigator.onLine === false) return;
      reconnectRefreshInFlightRef.current = true;
      try {
        const snapshotResult = await readScopedCenterSnapshot();
        if (!active) return;
        const remoteRevision = snapshotResult.updated_at;
        if (remoteRevision && remoteRevision !== cloudRevisionRef.current) {
          processRemoteSnapshotRef.current({
            payload: snapshotResult.payload,
            revision: remoteRevision,
          });
        }
        if (syncStatus === 'error' && syncError === NETWORK_SYNC_ERROR) {
          // Replace the failed snapshot with the latest merged state before retrying.
          // Otherwise an old offline snapshot could overwrite a remote edit after reconnecting.
          syncQueueRef.current?.enqueue(latestPayloadRef.current);
          syncQueueRef.current?.retry();
        }
      } catch (error) {
        if (!isTransientNetworkFailure(error)) reportError('center-reconnect-refresh', error);
      } finally {
        reconnectRefreshInFlightRef.current = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshRemoteAndRetry();
    };

    window.addEventListener('online', refreshRemoteAndRetry);
    window.addEventListener('focus', refreshRemoteAndRetry);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const pollingTimer = window.setInterval(refreshWhenVisible, 15_000);

    if (syncStatus === 'error' && syncError === NETWORK_SYNC_ERROR) {
      const retryDelays = [2_000, 5_000, 15_000, 30_000] as const;
      const attempt = Math.min(networkRetryAttemptRef.current, retryDelays.length - 1);
      networkRetryAttemptRef.current += 1;
      retryTimer = window.setTimeout(() => void refreshRemoteAndRetry(), retryDelays[attempt]);
    }

    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.clearInterval(pollingTimer);
      window.removeEventListener('online', refreshRemoteAndRetry);
      window.removeEventListener('focus', refreshRemoteAndRetry);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [currentUser?.id, isCenterDataHydrated, canSyncCenterData, syncStatus, syncError, readScopedCenterSnapshot]);

  useEffect(() => {
    if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData) return;
    const payload = currentPayload;
    if (JSON.stringify(payload) === savedPayloadRef.current) return;
    setSyncStatus((previous) =>
      previous === 'error' || previous === 'conflict' ? previous : 'saving',
    );
    const timer = window.setTimeout(() => {
      if (JSON.stringify(payload) !== savedPayloadRef.current) syncQueueRef.current?.enqueue(payload);
    }, 750);
    return () => window.clearTimeout(timer);
  }, [currentPayload, currentUser?.id, isCenterDataHydrated, canSyncCenterData]);

  const resolveSyncConflict = useCallback((preference: Exclude<CenterSyncPreference, 'manual'>) => {
    const context = conflictContextRef.current;
    if (!context) return;
    const local = latestPayloadRef.current;
    let selected: CenterDataPayload;
    try {
      const candidate = context.validationFailed
        ? preference === 'remote' ? context.remote : local
        : mergeCenterSnapshots(context.base, local, context.remote, preference).value;
      selected = normalizeCloudPayload(candidate);
    } catch (error) {
      reportError('center-conflict-resolution', error);
      setSyncError('Không thể hợp nhất lựa chọn này. Hãy xuất bản sao lưu trước khi thử lại.');
      return;
    }

    cloudRevisionRef.current = context.revision;
    basePayloadRef.current = context.remote;
    savedPayloadRef.current = JSON.stringify(context.remote);
    latestPayloadRef.current = selected;
    conflictContextRef.current = null;
    syncQueueRef.current?.reset();
    applyData(selected);
    setSyncError(null);
    setSyncStatus(centerSnapshotsEqual(selected, context.remote) ? 'saved' : 'saving');
  }, [applyData, normalizeCloudPayload]);

  useEffect(() => {
    if (syncStatus === 'saved' && !storageError) return;
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [syncStatus, storageError]);

  const handleLogout = async () => {
    if (
      (syncStatus !== 'saved' || storageError) &&
      !(await askConfirmation(
        'Có dữ liệu chưa lưu. Hãy chọn Hủy để xuất bản sao lưu, hoặc OK để đăng xuất và bỏ thay đổi chưa lưu.',
      ))
    )
      return;
    try {
      sessionStorage.removeItem('BEEZONE_DEV_ROLE');
      sessionStorage.removeItem('BEEZONE_ACTIVE_EMAIL');
    } catch {
      // ignore
    }
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    if (currentUser) {
      removeActiveSession(currentUser.email);
      try {
        sessionStorage.removeItem(`PHUC_PHUC_THINH_LOGIN_LOGGED_${currentUser.id}`);
      } catch {
        /* optional session storage */
      }
    }
    setCurrentUser(null);
    setSession(null);
    setAuthStatus('signed-out');
    onCloseLogin();
  };

  const handleAcceptPrivacy = async () => {
    if (!supabase || !session) return;
    const { error } = await supabase.rpc('bz_accept_privacy_policy', {
      p_policy_version: PRIVACY_POLICY_VERSION,
      p_purposes: [...PRIVACY_CONSENT_PURPOSES],
    });
    if (error) throw error;
    clearPendingPrivacyConsent();
    setAuthRetry((value) => value + 1);
  };

  const handleWithdrawPrivacy = async () => {
    if (!supabase || !session) return;
    if (
      (syncStatus !== 'saved' || storageError)
      && !(await askConfirmation('Có dữ liệu chưa lưu. Hãy chọn Hủy để sao lưu trước, hoặc OK để rút lại sự đồng ý và đăng xuất.'))
    ) return;
    const { error } = await supabase.rpc('bz_withdraw_privacy_policy', {
      p_policy_version: PRIVACY_POLICY_VERSION,
    });
    if (error) throw error;
    await supabase.auth.signOut();
    if (currentUser) removeActiveSession(currentUser.email);
    clearData();
    setCurrentUser(null);
    setSession(null);
    setAuthStatus('signed-out');
    onCloseLogin();
  };

  const handleDevLogin = (role: 'owner' | 'teacher') => {
    if (!isLocalPreview) return;
    const account = role === 'teacher' ? DEV_TEACHER_ACCOUNT : DEV_OWNER_ACCOUNT;
    try {
      sessionStorage.setItem('BEEZONE_DEV_ROLE', role);
      sessionStorage.setItem('BEEZONE_ACTIVE_EMAIL', account.email);
    } catch {
      // ignore
    }
    setCurrentUser(account);
    setSession(createMockSessionForAccount(account));
    setAuthStatus('ready');
  };

  const handleAccountLogin = (account: UserAccount) => {
    if (!isLocalPreview) return;
    try {
      sessionStorage.setItem('BEEZONE_DEV_ROLE', account.role);
      sessionStorage.setItem('BEEZONE_ACTIVE_EMAIL', account.email);
    } catch {
      // ignore
    }
    setCurrentUser(account);
    setSession(createMockSessionForAccount(account));
    setAuthStatus('ready');
  };

  return {
    currentUser,
    session,
    authStatus,
    authError,
    setAuthError,
    setAuthRetry,
    canSyncCenterData,
    syncStatus,
    syncError,
    syncQueueRef,
    resolveSyncConflict,
    handleLogout,
    handleAcceptPrivacy,
    handleWithdrawPrivacy,
    handleDevLogin,
    handleAccountLogin,
  };
}
export type CenterConnection = ReturnType<typeof useCenterConnection>;
