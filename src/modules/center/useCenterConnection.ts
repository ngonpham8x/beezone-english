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
  mergeCenterSnapshots,
  type CenterSyncPreference,
} from '../../lib/centerSync';
import { isLocalPreview, isSupabaseConfigured, supabase } from '../../lib/supabase';
import { createSyncQueue, SyncConflictError } from '../../lib/syncQueue';
import { initialSettings } from '../../mock/initialData';
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
    students: reconcileStudentFees(students, receipts, attendanceSessions),
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
    'loading' | 'ready' | 'signed-out' | 'blocked' | 'error'
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
  // Keep hydration across a connection retry so a profile/network error cannot reload over edits.
  const hydratedUserIdRef = useRef<string | null>(null);
  const syncQueueRef = useRef<ReturnType<typeof createSyncQueue<CenterDataPayload>> | null>(null);

  const normalizeCloudPayload = useCallback((value: unknown) => normalizeCenterData(
    parseCenterData(value || {}, initialSettings),
  ), []);

  const processRemoteSnapshot = useCallback((snapshot: RemoteSnapshot) => {
    if (!snapshot.revision || snapshot.revision === cloudRevisionRef.current) return;
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
        const { data: centerData, error: centerDataError } = await supabase
          .from('center_data')
          .select('payload, updated_at')
          .eq('id', 'primary')
          .maybeSingle();

        if (!isCurrent()) return;
        if (!centerDataError) {
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
        } else {
          throw new Error(
            'Không thể tải dữ liệu trung tâm. Kiểm tra kết nối và cấu trúc Supabase rồi thử lại.',
          );
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
  }, [authRetry]);

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
            const result = revision
              ? await supabase
                  .from('center_data')
                  .update({ payload })
                  .eq('id', 'primary')
                  .eq('updated_at', revision)
                  .select('updated_at')
                  .maybeSingle()
              : await supabase
                  .from('center_data')
                  .insert({ id: 'primary', payload })
                  .select('updated_at')
                  .single();

            const casConflict = result.error?.code === '23505' || (!result.error && !result.data);
            if (casConflict) {
              const remoteResult = await supabase
                .from('center_data')
                .select('payload, updated_at')
                .eq('id', 'primary')
                .maybeSingle();
              if (remoteResult.error || !remoteResult.data?.updated_at) {
                throw new Error('Không thể tải phiên bản mới nhất để hợp nhất dữ liệu. Thay đổi trên máy này vẫn được giữ.');
              }
              const remote = normalizeCloudPayload(remoteResult.data.payload);
              const base = basePayloadRef.current || payload;
              // The user may have continued editing while this older queued snapshot
              // was being written. Merge the newest live state so a CAS recovery can
              // never replace keystrokes made during the request.
              const latestLocal = latestPayloadRef.current;
              const merged = mergeCenterSnapshots(base, latestLocal, remote);
              cloudRevisionRef.current = remoteResult.data.updated_at;
              if (merged.conflicts.length > 0) {
                conflictContextRef.current = {
                  base,
                  remote,
                  revision: remoteResult.data.updated_at,
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
                  revision: remoteResult.data.updated_at,
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
              const errorDetail = result.error.message || result.error.details || '';
              const hint = result.error.code === '42501'
                ? ' (Tài khoản hiện tại chưa được cấp quyền lưu mục này trên máy chủ)'
                : (errorDetail ? ` (${errorDetail})` : '');
              throw new Error(
                `Không thể lưu dữ liệu lên máy chủ. Kiểm tra kết nối và quyền truy cập rồi thử lại.${hint}`,
              );
            }
            if (!active) return;
            cloudRevisionRef.current = result.data.updated_at;
            basePayloadRef.current = payload;
            savedPayloadRef.current = JSON.stringify(payload);
            conflictContextRef.current = null;
            return;
          }
          throw new Error('Dữ liệu máy chủ đang thay đổi liên tục. Hãy chờ vài giây rồi thử lưu lại.');
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
  }, [currentUser?.id, isCenterDataHydrated, canSyncCenterData, applyData, normalizeCloudPayload]);

  useEffect(() => {
    if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData || typeof supabase.channel !== 'function') return;
    let active = true;
    const channel = supabase
      .channel(`beezone-center-${currentUser.id}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'center_data', filter: 'id=eq.primary' },
        (change) => {
          if (!active) return;
          const row = change.new as { payload?: unknown; updated_at?: unknown };
          if (typeof row.updated_at !== 'string' || row.payload === undefined) return;
          const snapshot = { payload: row.payload, revision: row.updated_at };
          if (writeInFlightRef.current) deferredRemoteRef.current = snapshot;
          else processRemoteSnapshotRef.current(snapshot);
        },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUser?.id, isCenterDataHydrated, canSyncCenterData]);

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
    handleDevLogin,
    handleAccountLogin,
  };
}
export type CenterConnection = ReturnType<typeof useCenterConnection>;
