import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
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
import { isLocalPreview, isSupabaseConfigured, supabase } from '../../lib/supabase';
import { createSyncQueue, SyncConflictError } from '../../lib/syncQueue';
import { initialSettings } from '../../mock/initialData';
import type { ActivityLog, UserAccount } from '../../types';
import { mergeActivityLogs, normalizeCenterData, reconcileStudentFees } from './model';
import type { CenterStore } from './useCenterStore';

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
  const savedPayloadRef = useRef('');
  // Keep hydration across a connection retry so a profile/network error cannot reload over edits.
  const hydratedUserIdRef = useRef<string | null>(null);
  const syncQueueRef = useRef<ReturnType<typeof createSyncQueue<CenterDataPayload>> | null>(null);

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
        if (!data || !data.is_active || !['owner', 'staff'].includes(data.role)) {
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
      async (payload) => {
        const revision = cloudRevisionRef.current;
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
        if (result.error?.code === '23505' || (!result.error && !result.data))
          throw new SyncConflictError();
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
        savedPayloadRef.current = JSON.stringify(payload);
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
  }, [currentUser?.id, isCenterDataHydrated, canSyncCenterData]);

  useEffect(() => {
    if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData) return;
    const payload: CenterDataPayload = {
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
    };
    if (JSON.stringify(payload) === savedPayloadRef.current) return;
    setSyncStatus((previous) =>
      previous === 'error' || previous === 'conflict' ? previous : 'saving',
    );
    const timer = window.setTimeout(() => {
      syncQueueRef.current?.enqueue(payload);
    }, 750);
    return () => window.clearTimeout(timer);
  }, [
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
    currentUser?.id,
    isCenterDataHydrated,
    canSyncCenterData,
  ]);

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
      !window.confirm(
        'Có dữ liệu chưa lưu. Hãy chọn Hủy để xuất bản sao lưu, hoặc OK để đăng xuất và bỏ thay đổi chưa lưu.',
      )
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
    handleLogout,
    handleDevLogin,
    handleAccountLogin,
  };
}
export type CenterConnection = ReturnType<typeof useCenterConnection>;
