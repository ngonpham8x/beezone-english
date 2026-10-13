import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Student,
  Teacher,
  ClassRoom,
  Room,
  CourseProgram,
  TimetableSlot,
  Grade,
  TuitionReceipt,
  UserAccount,
  ActivityLog,
  AccountAuditLog,
  SystemBackup,
  CenterSettings,
  CenterBackupData,
  AttendanceSession,
} from './types';
import {
  initialSettings,
  initialPrograms,
  initialTeachers,
  initialRooms,
  initialClasses,
  initialStudents,
  initialTimetableSlots,
  initialGrades,
  initialTuitionReceipts,
  initialBackups,
  initialActivityLogs,
  initialAttendanceSessions,
  initialAccountAuditLogs,
} from './mock/initialData';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { StudentManager } from './components/StudentManager';
import { TeacherManager } from './components/TeacherManager';
import { ClassManager } from './components/ClassManager';
import { RoomManager } from './components/RoomManager';
import { TimetableManager } from './components/TimetableManager';
import { TeacherScheduleMatrix } from './components/TeacherScheduleMatrix';
import { GradeManager } from './components/GradeManager';
import { TuitionManager } from './components/TuitionManager';
import { ReportView } from './components/ReportView';
import { ActivityLogView } from './components/ActivityLogView';
import { SystemSettingsModal } from './components/SystemSettingsModal';
import { LoginModal } from './components/LoginModal';
import { PwaInstallModal } from './components/PwaInstallModal';
import { AuthScreen } from './components/AuthScreen';
import { UserManagementModal } from './components/UserManagementModal';
import { AttendanceManager } from './components/AttendanceManager';
import { AdmissionsManager } from './components/AdmissionsManager';
import { CourseProgramManager } from './components/CourseProgramManager';
import DataConsistencyChecker from './components/DataConsistencyChecker';
import { profileToAccount, ProfileRow, DEV_OWNER_ACCOUNT, DEV_TEACHER_ACCOUNT, DEV_MOCK_SESSION, createMockSessionForAccount, findAdminAccountByEmail } from './lib/auth';
import { registerActiveSession, removeActiveSession } from './lib/activeSessions';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { feeStatusForReceipts } from './lib/tuition';
import type { CenterWorkbookData } from './services/excelService';

const ImportExportModal = lazy(() => import('./components/ImportExportModal').then((module) => ({ default: module.ImportExportModal })));
const BackupManager = lazy(() => import('./components/BackupManager').then((module) => ({ default: module.BackupManager })));

interface CenterDataPayload {
  settings: CenterSettings;
  programs: CourseProgram[];
  teachers: Teacher[];
  rooms: Room[];
  classes: ClassRoom[];
  students: Student[];
  timetableSlots: TimetableSlot[];
  grades: Grade[];
  receipts: TuitionReceipt[];
  backups: SystemBackup[];
  activityLogs: ActivityLog[];
  attendanceSessions?: AttendanceSession[];
}

const DATA_SCHEMA_VERSION = 'beezone-receipt-table-v5';
const ACTIVE_TAB_STORAGE_KEY = 'PHUC_PHUC_THINH_ACTIVE_TAB';
const DATA_STORE_KEYS = [
  'settings',
  'programs',
  'teachers',
  'rooms',
  'classes',
  'students',
  'timetableSlots',
  'grades',
  'receipts',
  'backups',
  'activityLogs',
  'attendanceSessions'
] as const;

const MAX_ACTIVITY_LOGS = 500;

const mergeActivityLogs = (...lists: ActivityLog[][]) => {
  const seen = new Set<string>();
  const merged: ActivityLog[] = [];
  for (const list of lists) {
    for (const log of list) {
      if (!log?.id || seen.has(log.id)) continue;
      seen.add(log.id);
      merged.push(log);
      if (merged.length >= MAX_ACTIVITY_LOGS) return merged;
    }
  }
  return merged;
};

const canAccessTab = (tab: string, user: UserAccount) => {
  if (user.role === 'owner') return true;
  const permissions = user.permissions;

  switch (tab) {
    case 'dashboard': return true;
    case 'attendance': return permissions.student.view || permissions.teacher.view;
    case 'admissions': return permissions.student.view;
    case 'programs': return permissions.student.view;
    case 'students': return permissions.student.view;
    case 'teachers': return permissions.teacher.view;
    case 'classes': return permissions.student.view;
    case 'rooms':
    case 'timetable':
    case 'teacher-schedule': return permissions.student.view || permissions.teacher.view;
    case 'grades': return permissions.grade.view;
    case 'tuition': return permissions.tuition.view;
    case 'reports': return permissions.report.view && permissions.report.revenue;
    case 'excel-import-export': return permissions.excel.import || permissions.excel.export;
    case 'data-consistency': return false;
    default: return false;
  }
};

const weekDayOrder = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

const withClassScheduleSummary = (classroom: ClassRoom, slots: TimetableSlot[]): ClassRoom => {
  const classSlots = slots
    .filter((slot) => slot.classId === classroom.id)
    .sort((left, right) => weekDayOrder.indexOf(left.dayOfWeek) - weekDayOrder.indexOf(right.dayOfWeek) || left.startTime.localeCompare(right.startTime));

  return {
    ...classroom,
    days: [...new Set(classSlots.map((slot) => slot.dayOfWeek))],
    scheduleTime: classSlots.map((slot) => `${slot.dayOfWeek}: ${slot.startTime}-${slot.endTime}`).join(' · '),
  };
};

const feeStatusFromReceipts = (studentId: string, receipts: TuitionReceipt[]): Student['feeStatus'] => {
  return feeStatusForReceipts(receipts.filter((receipt) => receipt.studentId === studentId));
};

const normaliseReceipt = (receipt: TuitionReceipt): TuitionReceipt => {
  const paymentKind = receipt.paymentKind === 'course' ? 'course' : 'monthly';
  const recordedAmount = Math.max(receipt.paidAmount + receipt.debtAmount + receipt.discount, 0);
  const status: NonNullable<TuitionReceipt['status']> = receipt.debtAmount > 0
    ? (receipt.paidAmount > 0 ? 'partial' : 'debt')
    : (receipt.paidAmount > 0 ? 'paid' : 'unpaid');
  return {
    ...receipt,
    // Keep both price fields. When staff reclassify an existing receipt, the
    // former monthly/course price stays as audit context instead of being
    // silently erased. Only paymentKind decides which bucket receives the
    // paid/debt amount in reports.
    courseFee: paymentKind === 'course'
      ? Math.max(receipt.courseFee ?? 0, recordedAmount)
      : Math.max(receipt.courseFee ?? 0, 0),
    monthlyFee: paymentKind === 'monthly'
      ? Math.max(receipt.monthlyFee ?? 0, recordedAmount)
      : Math.max(receipt.monthlyFee ?? 0, 0),
    paymentKind,
    billingPeriod: receipt.billingPeriod || receipt.paymentDate.slice(0, 7),
    // Status is derived from amounts so stale imported/manual labels cannot
    // disagree with the outstanding balance shown elsewhere.
    status,
  };
};

const normaliseReceipts = (receipts: TuitionReceipt[]) => receipts.map(normaliseReceipt);

export const sanitizeClassName = (name: string): string => {
  if (!name) return '';
  return name
    .replace(/^(Tiếng Anh\s+(Mầm Non|Tiểu Học|THCS|THPT)|Chương Trình\s+[A-Za-z]+)\s*[-–—:]\s*/gi, '')
    .replace(/\s*\([^)]*(tuổi|Lớp|Kids|Nhảy|Độ tuổi|Cấp|KIDDY|BEE|STARTER)[^)]*\)/gi, '')
    .trim();
};

const normaliseClasses = (classrooms: ClassRoom[]) => classrooms.map(c => ({
  ...c,
  name: sanitizeClassName(c.name) || c.name,
}));

const sameIdList = (left: string[], right: string[]) => (
  left.length === right.length && left.every((id, index) => id === right[index])
);

// studentIds and assignedClassIds are denormalized fields used by some cards
// and reports. Keep them derived from the primary student/class references so
// one CRUD action can never leave a stale roster or teacher workload behind.
const reconcileClassStudentIds = (classrooms: ClassRoom[], centerStudents: Student[]) => {
  const studentIdsByClass = new Map<string, string[]>();
  centerStudents.forEach((student) => {
    if (!classrooms.some((classroom) => classroom.id === student.classId)) return;
    const ids = studentIdsByClass.get(student.classId) || [];
    ids.push(student.id);
    studentIdsByClass.set(student.classId, ids);
  });

  let changed = false;
  const nextClasses = classrooms.map((classroom) => {
    const studentIds = studentIdsByClass.get(classroom.id) || [];
    if (sameIdList(classroom.studentIds || [], studentIds)) return classroom;
    changed = true;
    return { ...classroom, studentIds };
  });

  return changed ? nextClasses : classrooms;
};

const reconcileTeacherAssignments = (centerTeachers: Teacher[], classrooms: ClassRoom[]) => {
  let changed = false;
  const nextTeachers = centerTeachers.map((teacher) => {
    const assignedClassIds = classrooms.filter((classroom) => classroom.teacherId === teacher.id).map((classroom) => classroom.id);
    if (sameIdList(teacher.assignedClassIds || [], assignedClassIds)) return teacher;
    changed = true;
    return { ...teacher, assignedClassIds };
  });

  return changed ? nextTeachers : centerTeachers;
};

export default function App() {
  // Persistence Helper with localStorage
  const ensureDataSchema = () => {
    try {
      if (localStorage.getItem('PHUC_PHUC_THINH_DATA_VERSION') === DATA_SCHEMA_VERSION) return;
      DATA_STORE_KEYS.forEach((key) => localStorage.removeItem(`PHUC_PHUC_THINH_${key}`));
      localStorage.setItem('PHUC_PHUC_THINH_DATA_VERSION', DATA_SCHEMA_VERSION);
    } catch (error) {
      console.error(error);
    }
  };

  const loadStored = <T,>(key: string, fallback: T): T => {
    try {
      ensureDataSchema();
      if (isSupabaseConfigured) return fallback;
      const stored = localStorage.getItem(`PHUC_PHUC_THINH_${key}`);
      return stored ? JSON.parse(stored) : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const saveStored = <T,>(key: string, value: T) => {
    try {
      if (isSupabaseConfigured) return;
      localStorage.setItem(`PHUC_PHUC_THINH_${key}`, JSON.stringify(value));
    } catch (e) {
      console.error(e);
    }
  };

  // State Management
  const [settings, setSettings] = useState<CenterSettings>(() => loadStored('settings', initialSettings));
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    if (!isSupabaseConfigured) {
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
    if (!isSupabaseConfigured) {
      try {
        const savedEmail = sessionStorage.getItem('BEEZONE_ACTIVE_EMAIL');
        if (savedEmail) {
          const matched = findAdminAccountByEmail(savedEmail);
          if (matched) return createMockSessionForAccount(matched);
        }
      } catch {
        // ignore
      }
      return DEV_MOCK_SESSION;
    }
    return null;
  });
  const [authStatus, setAuthStatus] = useState<'loading' | 'ready' | 'signed-out' | 'blocked'>(
    isSupabaseConfigured ? 'loading' : 'ready'
  );
  const [isCenterDataHydrated, setIsCenterDataHydrated] = useState(!isSupabaseConfigured);
  const [canSyncCenterData, setCanSyncCenterData] = useState(false);
  const [hasCenterData, setHasCenterData] = useState(false);

  const [programs, setPrograms] = useState<CourseProgram[]>(() => loadStored('programs', initialPrograms));
  const [teachers, setTeachers] = useState<Teacher[]>(() => loadStored('teachers', initialTeachers));
  const [rooms, setRooms] = useState<Room[]>(() => loadStored('rooms', initialRooms));
  const [classes, setClasses] = useState<ClassRoom[]>(() => normaliseClasses(loadStored('classes', initialClasses)));
  const [students, setStudents] = useState<Student[]>(() => loadStored('students', initialStudents));
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>(() => loadStored('timetableSlots', initialTimetableSlots));
  const [grades, setGrades] = useState<Grade[]>(() => loadStored('grades', initialGrades));
  const [receipts, setReceipts] = useState<TuitionReceipt[]>(() => normaliseReceipts(loadStored('receipts', initialTuitionReceipts)));
  const [backups, setBackups] = useState<SystemBackup[]>(() => loadStored('backups', initialBackups));
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() => loadStored('activityLogs', initialActivityLogs));
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>(() => loadStored('attendanceSessions', initialAttendanceSessions));
  const [accountAuditLogs, setAccountAuditLogs] = useState<AccountAuditLog[]>(() => loadStored('accountAuditLogs', initialAccountAuditLogs));
  const [accountAuditError, setAccountAuditError] = useState<string | null>(null);
  const [isAccountAuditLoading, setIsAccountAuditLoading] = useState(false);

  // Navigation & Layout State
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const tabFromUrl = new URLSearchParams(window.location.search).get('tab');
      return tabFromUrl || sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.innerWidth < 768;
    } catch {
      return false;
    }
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [classEditRequest, setClassEditRequest] = useState<ClassRoom | null>(null);
  const contentViewportRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      // The page can scroll on desktop while the main area scrolls on smaller
      // viewports. Reset both whenever the user changes a menu/tab.
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      contentViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab]);

  useEffect(() => {
    if (currentUser && currentUser.role !== 'owner' && !canAccessTab(activeTab, currentUser) && activeTab !== 'dashboard') {
      setActiveTab('dashboard');
    }
  }, [activeTab, currentUser]);

  useEffect(() => {
    try {
      sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', activeTab);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      console.warn('Không thể lưu trang đang mở:', error);
    }
  }, [activeTab]);

  useEffect(() => {
    if (currentUser) {
      registerActiveSession(currentUser);
    }
  }, [currentUser]);

  // Modals state
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState<boolean>(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isPwaModalOpen, setIsPwaModalOpen] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Global listener for PWA install prompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleTriggerPwaInstall = async () => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && window.navigator.maxTouchPoints > 1);

    // Riêng iPhone/iPad: hiển thị ngay hướng dẫn cài đặt cho iPhone
    if (isIos) {
      setIsPwaModalOpen(true);
      return;
    }

    // Android & máy tính (Chrome, Edge): nếu trình duyệt sẵn sàng thì tự cài luôn
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.error('PWA install error:', err);
        setIsPwaModalOpen(true);
      }
      return;
    }

    // Nếu không có native prompt (đã cài hoặc cần thao tác tay), mở hướng dẫn chi tiết
    setIsPwaModalOpen(true);
  };

  // Sync to LocalStorage
  useEffect(() => saveStored('settings', settings), [settings]);
  useEffect(() => saveStored('programs', programs), [programs]);
  useEffect(() => saveStored('teachers', teachers), [teachers]);
  useEffect(() => saveStored('rooms', rooms), [rooms]);
  useEffect(() => saveStored('classes', classes), [classes]);
  useEffect(() => saveStored('students', students), [students]);
  useEffect(() => saveStored('timetableSlots', timetableSlots), [timetableSlots]);
  useEffect(() => saveStored('grades', grades), [grades]);
  useEffect(() => saveStored('receipts', receipts), [receipts]);
  useEffect(() => saveStored('backups', backups), [backups]);
  useEffect(() => saveStored('activityLogs', activityLogs), [activityLogs]);
  useEffect(() => saveStored('attendanceSessions', attendanceSessions), [attendanceSessions]);
  useEffect(() => saveStored('accountAuditLogs', accountAuditLogs), [accountAuditLogs]);

  useEffect(() => {
    setClasses((previousClasses) => reconcileClassStudentIds(previousClasses, students));
  }, [students]);

  useEffect(() => {
    setTeachers((previousTeachers) => reconcileTeacherAssignments(previousTeachers, classes));
  }, [classes]);

  useEffect(() => {
    setStudents((previousStudents) => {
      let changed = false;
      const nextStudents = previousStudents.map((student) => {
        const feeStatus = feeStatusFromReceipts(student.id, receipts);
        if (feeStatus === student.feeStatus) return student;
        changed = true;
        return { ...student, feeStatus };
      });
      return changed ? nextStudents : previousStudents;
    });
  }, [receipts]);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    let lastResolvedUserId: string | null = null;

    const resolveSession = async (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);

      if (!nextSession) {
        lastResolvedUserId = null;
        setCurrentUser(null);
        setIsCenterDataHydrated(!isSupabaseConfigured);
        setCanSyncCenterData(false);
        setHasCenterData(false);
        setAuthStatus('signed-out');
        return;
      }

      if (lastResolvedUserId === nextSession.user.id && isCenterDataHydrated) {
        return;
      }
      lastResolvedUserId = nextSession.user.id;

      setAuthStatus('loading');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role, is_active, permissions')
        .eq('id', nextSession.user.id)
        .maybeSingle();

      if (!isMounted) return;
      if (error || !data || !data.is_active) {
        setCurrentUser(null);
        setAuthStatus('blocked');
        return;
      }

      const account = profileToAccount(data as ProfileRow, nextSession.user);
      setCurrentUser(account);
      setIsCenterDataHydrated(false);
      setHasCenterData(false);
      const { data: centerData, error: centerDataError } = await supabase
        .from('center_data')
        .select('payload')
        .eq('id', 'primary')
        .maybeSingle();

      if (!isMounted) return;
      if (!centerDataError) {
        const payload = centerData?.payload as Partial<CenterDataPayload> | undefined;
        const hasPayload = Boolean(payload && typeof payload === 'object' && Object.keys(payload).length > 0);
        if (hasPayload && payload) {
          if (payload.settings) setSettings(payload.settings);
          if (Array.isArray(payload.programs)) setPrograms(payload.programs);
          if (Array.isArray(payload.rooms)) setRooms(payload.rooms);
          const normalizedReceipts = Array.isArray(payload.receipts) ? normaliseReceipts(payload.receipts) : [];
          const hydratedStudents = Array.isArray(payload.students)
            ? payload.students.map((student) => ({ ...student, feeStatus: feeStatusFromReceipts(student.id, normalizedReceipts) }))
            : [];
          const hydratedClasses = Array.isArray(payload.classes)
            ? reconcileClassStudentIds(payload.classes, hydratedStudents)
            : [];
          if (Array.isArray(payload.teachers)) setTeachers(reconcileTeacherAssignments(payload.teachers, hydratedClasses));
          if (Array.isArray(payload.classes)) setClasses(hydratedClasses);
          if (Array.isArray(payload.students)) setStudents(hydratedStudents);
          if (Array.isArray(payload.timetableSlots)) setTimetableSlots(payload.timetableSlots);
          if (Array.isArray(payload.grades)) setGrades(payload.grades);
          if (Array.isArray(payload.receipts)) setReceipts(normalizedReceipts);
          if (Array.isArray(payload.backups)) setBackups(payload.backups);
          if (Array.isArray(payload.attendanceSessions)) setAttendanceSessions(payload.attendanceSessions);
          if (Array.isArray(payload.activityLogs)) {
            // Do not discard local history if an older cloud payload has no
            // logs yet; merge by log id and let the next sync persist it.
            setActivityLogs((previous) => mergeActivityLogs(payload.activityLogs, previous));
          }
        }
        setCanSyncCenterData(true);
        setHasCenterData(hasPayload);
      } else {
        console.warn('Không thể tải dữ liệu trung tâm từ Supabase:', centerDataError.message);
        setCanSyncCenterData(false);
        setHasCenterData(false);
      }
      try {
        const loginLogKey = `PHUC_PHUC_THINH_LOGIN_LOGGED_${nextSession.user.id}`;
        if (!sessionStorage.getItem(loginLogKey)) {
          const loginLog: ActivityLog = {
            id: `LOG_LOGIN_${Date.now()}`,
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
      setIsCenterDataHydrated(true);
      setAuthStatus('ready');
    };

    void supabase.auth.getSession().then(({ data }) => resolveSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void resolveSession(nextSession);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData || !hasCenterData) return;
    const payload: CenterDataPayload = { settings, programs, teachers, rooms, classes, students, timetableSlots, grades, receipts, backups, activityLogs, attendanceSessions };
    const timer = window.setTimeout(() => {
      void supabase
        .from('center_data')
        .upsert({ id: 'primary', payload }, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.error('Không thể đồng bộ dữ liệu trung tâm:', error.message);
        });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [settings, programs, teachers, rooms, classes, students, timetableSlots, grades, receipts, backups, activityLogs, attendanceSessions, currentUser, isCenterDataHydrated, canSyncCenterData, hasCenterData]);

  // Activity Logger
  const addLog = (
    action: 'ĐĂNG NHẬP' | 'THÊM' | 'SỬA' | 'XÓA' | 'EXPORT' | 'IMPORT' | 'BACKUP' | 'RESTORE' | 'ĐỒNG BỘ',
    module: string,
    details: string
  ) => {
    if (!currentUser) return;
    const newLog: ActivityLog = {
      id: `LOG_${Date.now()}`,
      timestamp: new Date().toLocaleString('vi-VN'),
      userEmail: currentUser.email,
      userName: currentUser.name,
      action,
      module,
      details
    };
    setActivityLogs(prev => mergeActivityLogs([newLog], prev));
  };

  const loadAccountAuditLogs = useCallback(async () => {
    if (currentUser?.role !== 'owner') {
      setAccountAuditLogs([]);
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
        const payload = await response.json() as { logs?: AccountAuditLog[]; error?: string };
        if (Array.isArray(payload.logs)) {
          setAccountAuditLogs(payload.logs);
          saveStored('accountAuditLogs', payload.logs);
          return;
        }
      }
      // If endpoint returns non-JSON (e.g. Vite dev or offline), fallback gracefully to local storage
      const localLogs = loadStored<AccountAuditLog[]>('accountAuditLogs', initialAccountAuditLogs);
      setAccountAuditLogs(localLogs);
      setAccountAuditError(null);
    } catch {
      const localLogs = loadStored<AccountAuditLog[]>('accountAuditLogs', initialAccountAuditLogs);
      setAccountAuditLogs(localLogs);
      setAccountAuditError(null);
    } finally {
      setIsAccountAuditLoading(false);
    }
  }, [currentUser?.role, session?.access_token]);

  useEffect(() => {
    if (activeTab === 'activity-logs') void loadAccountAuditLogs();
  }, [activeTab, loadAccountAuditLogs]);

  // Student CRUD Handlers
  const handleAddStudent = (newStudent: Student) => {
    setStudents(prev => [{ ...newStudent, feeStatus: feeStatusFromReceipts(newStudent.id, receipts) }, ...prev]);
    addLog('THÊM', 'Học sinh', `Thêm mới học sinh ${newStudent.name} (${newStudent.code})`);
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    const previousStudent = students.find((student) => student.id === updatedStudent.id);
    const normalizedStudent = { ...updatedStudent, feeStatus: feeStatusFromReceipts(updatedStudent.id, receipts) };
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? normalizedStudent : s));
    if (previousStudent && previousStudent.classId !== updatedStudent.classId) {
      setGrades((previousGrades) => previousGrades.map((grade) => (
        grade.studentId === updatedStudent.id ? { ...grade, classId: updatedStudent.classId } : grade
      )));
    }
    addLog('SỬA', 'Học sinh', `Cập nhật thông tin học sinh ${updatedStudent.name} (${updatedStudent.code})`);
  };

  const handleDeleteStudent = (id: string) => {
    const st = students.find(s => s.id === id);
    const linkedReceipts = receipts.filter((receipt) => receipt.studentId === id);
    if (linkedReceipts.length > 0) {
      alert(`Không thể xóa ${st?.name || 'học sinh'} vì còn ${linkedReceipts.length} phiếu thu. Hãy xóa/điều chỉnh phiếu thu hoặc chuyển trạng thái học trước để không mất lịch sử tài chính.`);
      return;
    }
    setStudents(prev => prev.filter(s => s.id !== id));
    setGrades((previousGrades) => previousGrades.filter((grade) => grade.studentId !== id));
    if (st) addLog('XÓA', 'Học sinh', `Xóa học sinh ${st.name} (${st.code}) và dữ liệu điểm liên quan khỏi hệ thống`);
  };

  const handleEnrollStudent = (studentId: string, classId: string, enrollDate: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const targetClass = classes.find(c => c.id === classId);
    const targetProgram = programs.find(p => p.id === student.programId || (targetClass && p.id === targetClass.programId));
    const tuitionAmount = targetProgram?.tuitionFee || 1500000;

    // 1. Update student
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          status: 'active' as const,
          classId: classId,
          programId: targetClass?.programId || s.programId,
          enrollDate: enrollDate || new Date().toISOString().split('T')[0],
        };
      }
      return s;
    }));

    // 2. Add student to target class studentIds
    setClasses(prev => prev.map(c => {
      if (c.id === classId && !c.studentIds.includes(studentId)) {
        return { ...c, studentIds: [...c.studentIds, studentId] };
      }
      return c;
    }));

    // 3. Create initial grade record for class
    setGrades(prev => {
      if (prev.some(g => g.studentId === studentId && g.classId === classId)) return prev;
      return [
        ...prev,
        {
          id: `GR_${Date.now()}_${studentId}`,
          studentId,
          classId,
          listening: 0,
          speaking: 0,
          reading: 0,
          writing: 0,
          midterm: 0,
          finalExam: 0,
          attendance: 10,
          average: 0,
        }
      ];
    });

    // 4. Create initial tuition receipt
    const newReceipt: TuitionReceipt = {
      id: `REC_${Date.now()}_${studentId}`,
      code: `PT-${new Date().getFullYear()}-${(receipts.length + 1).toString().padStart(4, '0')}`,
      studentId,
      classId,
      courseFee: tuitionAmount,
      discount: 0,
      paidAmount: 0,
      debtAmount: tuitionAmount,
      status: 'unpaid',
      paymentDate: enrollDate || new Date().toISOString().split('T')[0],
      collectorName: currentUser?.name || 'BeeZone English',
      paymentMethod: 'Chưa xác định',
      notes: `Học phí nhập học khóa ${targetProgram?.name || targetClass?.name || ''}`,
    };
    setReceipts(prev => [newReceipt, ...prev]);

    addLog('THÊM', 'Tuyển sinh', `Xác nhận nhập học chính thức học viên ${student.name} (${student.code}) vào lớp ${targetClass?.name || classId}`);
  };

  const handleReserveStudent = (studentId: string, reserveDate: string, expectedReturnDate: string, reason: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const reserveNote = `\n[BẢO LƯU]: Từ ${reserveDate} đến ${expectedReturnDate || 'chưa định ngày'}. Lý do: ${reason}`;
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          status: 'reserved' as const,
          notes: (s.notes || '') + reserveNote
        };
      }
      return s;
    }));
    addLog('SỬA', 'Học sinh', `Bảo lưu học tập học sinh ${student.name} (${student.code}) từ ${reserveDate}`);
  };

  const handleDropStudent = (studentId: string, dropDate: string, reason: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const dropNote = `\n[NGHỈ HỌC NGANG]: Ngày ${dropDate}. Lý do: ${reason}`;
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          status: 'dropped' as const,
          notes: (s.notes || '') + dropNote
        };
      }
      return s;
    }));
    addLog('SỬA', 'Học sinh', `Học sinh ${student.name} (${student.code}) nghỉ học từ ngày ${dropDate}`);
  };

  const handleReEnrollStudent = (studentId: string, targetClassId: string, returnDate: string, note?: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const targetClass = classes.find(c => c.id === targetClassId);
    const reNote = `\n[QUAY LẠI HỌC]: Ngày ${returnDate} tại lớp ${targetClass?.name || targetClassId}. ${note || ''}`;
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          status: 'active' as const,
          classId: targetClassId,
          notes: (s.notes || '') + reNote
        };
      }
      return s;
    }));
    setClasses(prev => prev.map(c => {
      if (c.id !== targetClassId && c.studentIds.includes(studentId)) {
        return { ...c, studentIds: c.studentIds.filter(id => id !== studentId) };
      }
      if (c.id === targetClassId && !c.studentIds.includes(studentId)) {
        return { ...c, studentIds: [...c.studentIds, studentId] };
      }
      return c;
    }));
    addLog('SỬA', 'Học sinh', `Học sinh ${student.name} (${student.code}) quay lại học lớp ${targetClass?.name || targetClassId}`);
  };

  const handleImportStudents = (newStudentsList: Student[]) => {
    setStudents(prev => [...newStudentsList, ...prev]);
    addLog('IMPORT', 'Excel', `Import ${newStudentsList.length} học sinh mới từ file Excel`);
  };

  const handleImportCenterData = (data: CenterWorkbookData) => {
    const normalizedReceipts = normaliseReceipts(data.receipts);
    const importedStudents = data.students.map((student) => ({ ...student, feeStatus: feeStatusFromReceipts(student.id, normalizedReceipts) }));
    const importedClasses = reconcileClassStudentIds(data.classes, importedStudents);
    setPrograms(data.programs);
    setTeachers(reconcileTeacherAssignments(data.teachers, importedClasses));
    setRooms(data.rooms);
    setClasses(importedClasses);
    setStudents(importedStudents);
    setTimetableSlots(data.timetableSlots);
    setGrades(data.grades);
    setReceipts(normalizedReceipts);
    setBackups([]);
    setHasCenterData(true);
    const importLog: ActivityLog[] = currentUser ? [{
      id: `LOG_IMPORT_${Date.now()}`,
      timestamp: new Date().toLocaleString('vi-VN'),
      userEmail: currentUser.email,
      userName: currentUser.name,
      action: 'IMPORT',
      module: 'Excel',
      details: `Nhập dữ liệu trung tâm: ${data.classes.length} lớp, ${data.students.length} học sinh, ${data.receipts.length} phiếu thu.`
    }] : [];
    setActivityLogs((previous) => mergeActivityLogs(importLog, previous));
  };

  // Teacher CRUD Handlers
  const handleAddTeacher = (t: Teacher) => {
    setTeachers(prev => [...prev, t]);
    addLog('THÊM', 'Giáo viên', `Thêm giáo viên mới ${t.name}`);
  };

  const handleUpdateTeacher = (t: Teacher) => {
    setTeachers(prev => prev.map(item => item.id === t.id ? t : item));
    addLog('SỬA', 'Giáo viên', `Cập nhật thông tin giáo viên ${t.name}`);
  };

  const handleDeleteTeacher = (id: string) => {
    const t = teachers.find(item => item.id === id);
    const managedClasses = classes.filter((classroom) => classroom.teacherId === id);
    if (managedClasses.length > 0) {
      alert(`Không thể xóa giáo viên ${t?.name || ''} vì đang phụ trách ${managedClasses.length} lớp. Hãy phân công giáo viên khác cho các lớp trước.`);
      return;
    }
    setTeachers(prev => prev.filter(item => item.id !== id));
    if (t) addLog('XÓA', 'Giáo viên', `Xóa giáo viên ${t.name}`);
  };

  // Class CRUD Handlers
  const handleAddClass = (c: ClassRoom) => {
    setClasses(prev => [...prev, c]);
    addLog('THÊM', 'Lớp học', `Tạo lớp học mới ${c.name} (${c.code})`);
  };

  const handleUpdateClass = (c: ClassRoom) => {
    setClasses(prev => prev.map(item => item.id === c.id ? c : item));
    addLog('SỬA', 'Lớp học', `Cập nhật lớp học ${c.name} (${c.code})`);
  };

  const handleCreateProgram = (program: CourseProgram) => {
    setPrograms(prev => [...prev, program]);
    addLog('THÊM', 'Chương trình học', `Tạo chương trình ${program.name}`);
  };

  const handleDeleteClass = (id: string) => {
    const c = classes.find(item => item.id === id);
    const classStudents = students.filter((student) => student.classId === id);
    const classReceipts = receipts.filter((receipt) => receipt.classId === id);
    if (classStudents.length > 0 || classReceipts.length > 0) {
      const dependencies = [
        classStudents.length > 0 ? `${classStudents.length} học sinh` : '',
        classReceipts.length > 0 ? `${classReceipts.length} phiếu thu` : '',
      ].filter(Boolean).join(' và ');
      alert(`Không thể xóa lớp ${c?.name || ''} vì còn ${dependencies}. Hãy chuyển học sinh và xử lý phiếu thu trước để giữ liên kết dữ liệu.`);
      return;
    }
    setClasses(prev => prev.filter(item => item.id !== id));
    setTimetableSlots(prev => prev.filter(slot => slot.classId !== id));
    setGrades(prev => prev.filter((grade) => grade.classId !== id));
    if (c) addLog('XÓA', 'Lớp học', `Xóa lớp học ${c.name} (${c.code}) cùng lịch và điểm không còn liên kết`);
  };

  // Room CRUD Handlers
  const handleAddRoom = (r: Room) => {
    setRooms(prev => [...prev, r]);
    addLog('THÊM', 'Phòng học', `Thêm phòng học ${r.name}`);
  };

  const handleUpdateRoom = (r: Room) => {
    setRooms(prev => prev.map(item => item.id === r.id ? r : item));
    addLog('SỬA', 'Phòng học', `Cập nhật phòng học ${r.name}`);
  };

  const handleDeleteRoom = (id: string) => {
    const room = rooms.find((item) => item.id === id);
    const roomClasses = classes.filter((classroom) => classroom.roomId === id);
    if (roomClasses.length > 0) {
      alert(`Không thể xóa phòng ${room?.name || ''} vì đang được dùng cho ${roomClasses.length} lớp. Hãy đổi phòng cho các lớp trước.`);
      return;
    }
    setRooms(prev => prev.filter(item => item.id !== id));
    addLog('XÓA', 'Phòng học', `Xóa phòng học ${room?.name || ''}`);
  };

  // Timetable Handlers
  const handleAddSlot = (slot: TimetableSlot) => {
    setTimetableSlots(prev => {
      const next = [...prev, slot];
      setClasses(classrooms => classrooms.map((classroom) => classroom.id === slot.classId ? withClassScheduleSummary(classroom, next) : classroom));
      return next;
    });
    addLog('THÊM', 'Thời khóa biểu', `Thêm ca học mới vào ${slot.dayOfWeek} (${slot.startTime}-${slot.endTime})`);
  };

  const handleUpdateSlot = (slot: TimetableSlot) => {
    setTimetableSlots(prev => {
      const next = prev.map(s => s.id === slot.id ? slot : s);
      setClasses(classrooms => classrooms.map((classroom) => classroom.id === slot.classId ? withClassScheduleSummary(classroom, next) : classroom));
      return next;
    });
    addLog('SỬA', 'Thời khóa biểu', `Cập nhật ca học vào ${slot.dayOfWeek}`);
  };

  const handleDeleteSlot = (id: string) => {
    setTimetableSlots(prev => {
      const deletedSlot = prev.find((slot) => slot.id === id);
      const next = prev.filter(s => s.id !== id);
      if (deletedSlot) setClasses(classrooms => classrooms.map((classroom) => classroom.id === deletedSlot.classId ? withClassScheduleSummary(classroom, next) : classroom));
      return next;
    });
    addLog('XÓA', 'Thời khóa biểu', `Xóa ca học khỏi thời khóa biểu`);
  };

  const handleReplaceClassSchedule = (classId: string, slots: TimetableSlot[]) => {
    setTimetableSlots(prev => {
      const next = [...prev.filter((slot) => slot.classId !== classId), ...slots];
      setClasses(classrooms => classrooms.map((classroom) => classroom.id === classId ? withClassScheduleSummary(classroom, next) : classroom));
      return next;
    });
  };

  // Grade Handler
  const handleUpdateGrade = (updatedGrade: Grade) => {
    setGrades(prev => {
      const idx = prev.findIndex(g => g.studentId === updatedGrade.studentId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedGrade;
        return next;
      }
      return [...prev, updatedGrade];
    });
    addLog('SỬA', 'Điểm', `Cập nhật bảng điểm cho học sinh ID ${updatedGrade.studentId}`);
  };

  // Tuition Handler
  const handleAddReceipt = (r: TuitionReceipt) => {
    setReceipts(prev => [r, ...prev]);

    addLog('THÊM', 'Học phí', `Lập phiếu thu ${r.code} số tiền ${r.paidAmount.toLocaleString('vi-VN')} đ`);
  };

  const handleUpdateReceipt = (updatedReceipt: TuitionReceipt) => {
    setReceipts(prev => prev.map((receipt) => receipt.id === updatedReceipt.id ? updatedReceipt : receipt));
    addLog('SỬA', 'Học phí', `Cập nhật phiếu thu ${updatedReceipt.code} (${updatedReceipt.paymentKind === 'course' ? 'học phí khóa' : 'học phí tháng'})`);
  };

  const handleDeleteReceipt = (id: string) => {
    const receipt = receipts.find((item) => item.id === id);
    setReceipts(prev => prev.filter((item) => item.id !== id));
    if (receipt) addLog('XÓA', 'Học phí', `Xóa phiếu thu ${receipt.code} (${receipt.paymentKind === 'course' ? 'học phí khóa' : 'học phí tháng'})`);
  };

  const handleBackupCreated = (backup: SystemBackup) => {
    setBackups(prev => [backup, ...prev].slice(0, 30));
    addLog('BACKUP', 'Sao lưu', `Đã xuất tệp sao lưu ${backup.filename} (${backup.sizeKb} KB)`);
  };

  const handleRestoreBackup = (data: CenterBackupData, filename: string) => {
    const normalizedReceipts = normaliseReceipts(data.receipts);
    const restoredStudents = data.students.map((student) => ({ ...student, feeStatus: feeStatusFromReceipts(student.id, normalizedReceipts) }));
    const restoredClasses = reconcileClassStudentIds(data.classes, restoredStudents);
    setSettings(data.settings);
    setPrograms(data.programs);
    setTeachers(reconcileTeacherAssignments(data.teachers, restoredClasses));
    setRooms(data.rooms);
    setClasses(restoredClasses);
    setStudents(restoredStudents);
    setTimetableSlots(data.timetableSlots);
    setGrades(data.grades);
    setReceipts(normalizedReceipts);
    setBackups(data.backups.slice(0, 30));
    setActivityLogs(data.activityLogs);
    if (Array.isArray(data.attendanceSessions)) setAttendanceSessions(data.attendanceSessions);
    setHasCenterData(true);
    addLog('RESTORE', 'Sao lưu', `Đã khôi phục dữ liệu từ tệp ${filename}`);
  };

  // Attendance Handler
  const handleSaveAttendanceSession = (sessionData: AttendanceSession) => {
    setAttendanceSessions(prev => {
      const idx = prev.findIndex(s => s.id === sessionData.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = sessionData;
        return next;
      }
      return [sessionData, ...prev];
    });
    addLog('THÊM', 'Điểm danh', `Điểm danh buổi học ngày ${sessionData.date} lớp ${classes.find(c => c.id === sessionData.classId)?.name || sessionData.classId}`);
  };

  // Program Handlers
  const handleAddProgram = (program: CourseProgram) => {
    setPrograms(prev => [...prev, program]);
    addLog('THÊM', 'Chương trình học', `Tạo chương trình ${program.name} (${program.code})`);
  };

  const handleUpdateProgram = (program: CourseProgram) => {
    setPrograms(prev => prev.map(p => p.id === program.id ? program : p));
    addLog('SỬA', 'Chương trình học', `Cập nhật chương trình ${program.name} (${program.code})`);
  };

  const handleDeleteProgram = (id: string) => {
    const p = programs.find(item => item.id === id);
    setPrograms(prev => prev.filter(item => item.id !== id));
    if (p) addLog('XÓA', 'Chương trình học', `Xóa chương trình ${p?.name || id}`);
  };

  // Data Consistency Handler
  const handleDataFixed = (fixedStudents: Student[], fixedClasses: ClassRoom[], fixedReceipts: TuitionReceipt[]) => {
    setStudents(fixedStudents);
    setClasses(fixedClasses);
    setReceipts(fixedReceipts);
    addLog('ĐỒNG BỘ', 'Kiểm tra dữ liệu', 'Đã tự động sửa các liên kết dữ liệu không nhất quán');
  };

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('BEEZONE_DEV_ROLE');
      sessionStorage.removeItem('BEEZONE_ACTIVE_EMAIL');
    } catch {
      // ignore
    }
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error(e);
      }
    }
    if (currentUser) {
      removeActiveSession(currentUser.email);
    }
    setCurrentUser(null);
    setSession(null);
    setAuthStatus('signed-out');
    setIsLoginOpen(false);
  };

  const handleDevLogin = (role: 'owner' | 'teacher') => {
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

  if (authStatus === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-sm font-semibold text-slate-600">
        Đang kiểm tra quyền truy cập…
      </main>
    );
  }

  if (authStatus === 'blocked') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <section className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-xl">
          <h1 className="font-extrabold text-red-900">Tài khoản chưa được cấp quyền</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Liên hệ Chủ trung tâm để nhận lời mời hoặc kiểm tra lại trạng thái tài khoản.</p>
          <button onClick={() => void handleLogout()} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Đăng xuất</button>
        </section>
      </main>
    );
  }

  if (!currentUser || !session) {
    return <AuthScreen onDevLogin={handleDevLogin} onAccountLogin={handleAccountLogin} />;
  }

  const navigateTo = (tab: string) => {
    if (canAccessTab(tab, currentUser)) setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans antialiased text-slate-900">
      {/* Top Header Navigation */}
      <Header
        currentUser={currentUser}
        settings={settings}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenPwaInstall={handleTriggerPwaInstall}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onLogout={() => void handleLogout()}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 items-start">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={navigateTo}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          currentUser={currentUser}
          onOpenPwaInstall={handleTriggerPwaInstall}
        />

        {/* Content View Container */}
        <main ref={contentViewportRef} className="min-w-0 flex-1 p-3 sm:p-6 transition-all">
          {activeTab === 'dashboard' && (
            <DashboardView
              students={students}
              teachers={teachers}
              classes={classes}
              rooms={rooms}
              receipts={receipts}
              programs={programs}
              currentUser={currentUser}
              onNavigateTab={navigateTo}
            />
          )}

          {activeTab === 'students' && (
            <StudentManager
              students={students}
              programs={programs}
              classes={classes}
              receipts={receipts}
              timetableSlots={timetableSlots}
              teachers={teachers}
              rooms={rooms}
              permissions={currentUser.permissions}
              isOwner={currentUser.role === 'owner'}
              searchQuery={searchQuery}
              onAddStudent={handleAddStudent}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onReserveStudent={handleReserveStudent}
              onDropStudent={handleDropStudent}
              onReEnrollStudent={handleReEnrollStudent}
              onOpenImportExportModal={() => setIsImportExportModalOpen(true)}
              onOpenTuition={() => navigateTo('tuition')}
              onCreateProgram={handleCreateProgram}
            />
          )}

          {activeTab === 'teachers' && (
            <TeacherManager
              teachers={teachers}
              classes={classes}
              permissions={currentUser.permissions}
              isOwner={currentUser.role === 'owner'}
              onAddTeacher={handleAddTeacher}
              onUpdateTeacher={handleUpdateTeacher}
              onDeleteTeacher={handleDeleteTeacher}
              onEditClass={(classroom) => {
                setClassEditRequest(classroom);
                navigateTo('classes');
              }}
            />
          )}

          {activeTab === 'classes' && (
            <ClassManager
              classes={classes}
              teachers={teachers}
              rooms={rooms}
              programs={programs}
              students={students}
              receipts={receipts}
              timetableSlots={timetableSlots}
              permissions={currentUser.permissions}
              isOwner={currentUser.role === 'owner'}
              onAddClass={handleAddClass}
              onUpdateClass={handleUpdateClass}
              onDeleteClass={handleDeleteClass}
              onReplaceClassSchedule={handleReplaceClassSchedule}
              onCreateRoom={handleAddRoom}
              onCreateProgram={handleCreateProgram}
              editRequest={classEditRequest}
              onEditRequestHandled={() => setClassEditRequest(null)}
            />
          )}

          {activeTab === 'rooms' && (
            <RoomManager
              rooms={rooms}
              classes={classes}
              permissions={currentUser.permissions}
              isOwner={currentUser.role === 'owner'}
              onAddRoom={handleAddRoom}
              onUpdateRoom={handleUpdateRoom}
              onDeleteRoom={handleDeleteRoom}
            />
          )}

          {activeTab === 'timetable' && (
            <TimetableManager
              timetableSlots={timetableSlots}
              classes={classes}
              teachers={teachers}
              rooms={rooms}
              isOwner={currentUser.role === 'owner'}
              onAddSlot={handleAddSlot}
              onUpdateSlot={handleUpdateSlot}
              onDeleteSlot={handleDeleteSlot}
            />
          )}

          {activeTab === 'teacher-schedule' && (
            <TeacherScheduleMatrix
              teachers={teachers}
              timetableSlots={timetableSlots}
              classes={classes}
              rooms={rooms}
            />
          )}

          {activeTab === 'attendance' && (
            <AttendanceManager
              classes={classes}
              students={students}
              teachers={teachers}
              attendanceSessions={attendanceSessions}
              onSaveSession={handleSaveAttendanceSession}
              isOwner={currentUser.role === 'owner'}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'admissions' && (
            <AdmissionsManager
              students={students}
              programs={programs}
              classes={classes}
              teachers={teachers}
              permissions={currentUser.permissions}
              isOwner={currentUser.role === 'owner'}
              onAddStudent={handleAddStudent}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onEnrollStudent={handleEnrollStudent}
            />
          )}

          {activeTab === 'programs' && (
            <CourseProgramManager
              programs={programs}
              classes={classes}
              students={students}
              onAddProgram={handleAddProgram}
              onUpdateProgram={handleUpdateProgram}
              onDeleteProgram={handleDeleteProgram}
              isOwner={currentUser.role === 'owner'}
            />
          )}

          {activeTab === 'grades' && (
            <GradeManager
              grades={grades}
              students={students}
              classes={classes}
              teachers={teachers}
              programs={programs}
              settings={settings}
              permissions={currentUser.permissions}
              isOwner={currentUser.role === 'owner'}
              currentUser={currentUser}
              onUpdateGrade={handleUpdateGrade}
            />
          )}

          {activeTab === 'tuition' && (
            <TuitionManager
              receipts={receipts}
              students={students}
              classes={classes}
              programs={programs}
              permissions={currentUser.permissions}
              settings={settings}
              isOwner={currentUser.role === 'owner'}
              onAddReceipt={handleAddReceipt}
              onUpdateReceipt={handleUpdateReceipt}
              onDeleteReceipt={handleDeleteReceipt}
            />
          )}

          {activeTab === 'excel-import-export' && (
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="font-bold text-lg text-slate-900 mb-2">Import / Export File ExcelJS</h3>
              <p className="text-xs text-slate-500 mb-4">Quản lý nhập dữ liệu hàng loạt và xuất Workbook nhiều Sheet liên kết công thức</p>
              <button
                onClick={() => setIsImportExportModalOpen(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold text-xs shadow-xs transition"
              >
                Mở Cửa Sổ Import / Export Excel
              </button>
            </div>
          )}

          {activeTab === 'reports' && (
            <ReportView
              students={students}
              teachers={teachers}
              classes={classes}
              receipts={receipts}
              onNavigateTab={navigateTo}
            />
          )}

          {activeTab === 'data-consistency' && (
            <DataConsistencyChecker
              students={students}
              classrooms={classes}
              receipts={receipts}
              programs={programs}
              onDataFixed={handleDataFixed}
            />
          )}

          {activeTab === 'backups' && (
            <Suspense fallback={<div className="p-6 text-sm text-slate-500">Đang tải công cụ sao lưu…</div>}>
              <BackupManager
                backups={backups}
                settings={settings}
                students={students}
                teachers={teachers}
                rooms={rooms}
                classes={classes}
                receipts={receipts}
                grades={grades}
                programs={programs}
                timetableSlots={timetableSlots}
                activityLogs={activityLogs}
                onOpenImportExportModal={() => setIsImportExportModalOpen(true)}
                onBackupCreated={handleBackupCreated}
                onRestoreBackup={handleRestoreBackup}
              />
            </Suspense>
          )}

          {activeTab === 'activity-logs' && (
            <ActivityLogView
              logs={activityLogs}
              accountLogs={accountAuditLogs}
              isAccountAuditLoading={isAccountAuditLoading}
              accountAuditError={accountAuditError}
              onRefreshAccountLogs={() => void loadAccountAuditLogs()}
            />
          )}

          {activeTab === 'settings' && (
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="font-bold text-lg text-slate-900 mb-2">Cài Đặt Hệ Thống</h3>
              <p className="text-xs text-slate-500 mb-4">Thông tin trung tâm & cấu hình gửi email tự động</p>
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs"
              >
                Chỉnh Sửa Cài Đặt Hệ Thống
              </button>
            </div>
          )}
        </main>
      </div>

      {/* MODALS */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onSwitchRole={handleDevLogin}
        onSwitchAccount={handleAccountLogin}
      />

      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        accessToken={session?.access_token || ''}
        currentUser={currentUser}
        classes={classes}
        teachers={teachers}
        onAccountChanged={() => void loadAccountAuditLogs()}
      />

      {isImportExportModalOpen && (
        <Suspense fallback={null}>
          <ImportExportModal
            isOpen={isImportExportModalOpen}
            onClose={() => setIsImportExportModalOpen(false)}
            students={students}
            programs={programs}
            teachers={teachers}
            rooms={rooms}
            classes={classes}
            receipts={receipts}
            grades={grades}
            settings={settings}
            canSyncCenterData={canSyncCenterData}
            isOwner={currentUser.role === 'owner'}
            permissions={currentUser.permissions}
            onImportStudents={handleImportStudents}
            onImportCenterData={handleImportCenterData}
            onExportExcel={(filename) => addLog('EXPORT', 'Excel', `Xuất báo cáo Excel ${filename}`)}
          />
        </Suspense>
      )}

      <SystemSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={(s) => {
          setSettings(s);
          addLog('SỬA', 'Cài đặt', 'Cập nhật thông tin trung tâm & email báo cáo hằng tuần');
        }}
      />

      {isBackupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsBackupModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              ✕
            </button>
            <Suspense fallback={<div className="p-6 text-sm text-slate-500">Đang tải công cụ sao lưu…</div>}>
              <BackupManager
                backups={backups}
                settings={settings}
                students={students}
                teachers={teachers}
                rooms={rooms}
                classes={classes}
                receipts={receipts}
                grades={grades}
                onOpenImportExportModal={() => setIsImportExportModalOpen(true)}
              />
            </Suspense>
          </div>
        </div>
      )}

      <PwaInstallModal
        isOpen={isPwaModalOpen}
        onClose={() => setIsPwaModalOpen(false)}
        deferredPrompt={deferredPrompt}
        onPromptHandled={() => setDeferredPrompt(null)}
      />
    </div>
  );
}
