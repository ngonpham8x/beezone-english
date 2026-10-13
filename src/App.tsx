import { withUnbilledSessionReceipts, validateSessionReceipt, validateBilledAttendanceEdit } from './lib/sessionBilling';
import type { TaskDestination } from './components/TodayTasks';
import { DialogFrame } from './components/DialogFrame';
import { updateEnrollmentHistory, validateCourse, validateScheduleChange, lessonsOn } from './lib/operations';
import { findScheduleConflict } from './lib/schedule';
import { DRAWER_QUERY, useMediaQuery } from './hooks/useResponsive';
import React, { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  ClassEnrollment,
  ScheduleChange,
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
const DashboardView = lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const StudentManager = lazy(() => import('./components/StudentManager').then(m => ({ default: m.StudentManager })));
const TeacherManager = lazy(() => import('./components/TeacherManager').then(m => ({ default: m.TeacherManager })));
const ClassManager = lazy(() => import('./components/ClassManager').then(m => ({ default: m.ClassManager })));
const RoomManager = lazy(() => import('./components/RoomManager').then(m => ({ default: m.RoomManager })));
const TimetableManager = lazy(() => import('./components/TimetableManager').then(m => ({ default: m.TimetableManager })));
const TeacherScheduleMatrix = lazy(() => import('./components/TeacherScheduleMatrix').then(m => ({ default: m.TeacherScheduleMatrix })));
const GradeManager = lazy(() => import('./components/GradeManager').then(m => ({ default: m.GradeManager })));
const TuitionManager = lazy(() => import('./components/TuitionManager').then(m => ({ default: m.TuitionManager })));
const ReportView = lazy(() => import('./components/ReportView').then(m => ({ default: m.ReportView })));
import { ActivityLogView } from './components/ActivityLogView';
import { SystemSettingsModal } from './components/SystemSettingsModal';
import { LoginModal } from './components/LoginModal';
import { PwaInstallModal } from './components/PwaInstallModal';
import { AuthScreen } from './components/AuthScreen';
import { UserManagementModal } from './components/UserManagementModal';
const AttendanceManager = lazy(() => import('./components/AttendanceManager').then(m => ({ default: m.AttendanceManager })));
const AdmissionsManager = lazy(() => import('./components/AdmissionsManager').then(m => ({ default: m.AdmissionsManager })));
const CourseProgramManager = lazy(() => import('./components/CourseProgramManager').then(m => ({ default: m.CourseProgramManager })));
import DataConsistencyChecker from './components/DataConsistencyChecker';
import { profileToAccount, ProfileRow, DEV_OWNER_ACCOUNT, DEV_TEACHER_ACCOUNT, createMockSessionForAccount, findAdminAccountByEmail } from './lib/auth';
import { registerActiveSession, removeActiveSession } from './lib/activeSessions';
import { isSupabaseConfigured, isLocalPreview, supabase } from './lib/supabase';
import { feeStatusForReceipts } from './lib/tuition';
import { centerDate, isCalendarDate } from './lib/dates';
import { nextReceiptCode } from './lib/identifiers';
import { parseCenterData, type CenterDataPayload } from './lib/centerData';
import { createSyncQueue, SyncConflictError } from './lib/syncQueue';
import { matchesSearch } from './lib/search';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { CenterWorkbookData } from './services/excelService';

const ImportExportModal = lazy(() => import('./components/ImportExportModal').then((module) => ({ default: module.ImportExportModal })));
const BackupManager = lazy(() => import('./components/BackupManager').then((module) => ({ default: module.BackupManager })));

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
const VALID_TABS = new Set(['dashboard', 'attendance', 'admissions', 'programs', 'students', 'teachers', 'classes', 'rooms', 'timetable', 'teacher-schedule', 'grades', 'tuition', 'reports', 'excel-import-export', 'data-consistency', 'backups', 'settings', 'activity-logs']);

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
  if (!VALID_TABS.has(tab)) return false;
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

const feeStatusFromReceipts = (studentId: string, receipts: TuitionReceipt[], sessions: AttendanceSession[] = []): Student['feeStatus'] => {
  return feeStatusForReceipts(withUnbilledSessionReceipts(receipts, sessions).filter((receipt) => receipt.studentId === studentId));
};

const normaliseReceipt = (receipt: TuitionReceipt): TuitionReceipt => {
  const paymentKind = receipt.paymentKind === 'course' ? 'course' : receipt.paymentKind === 'session' ? 'session' : 'monthly';
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
      // Preserve existing browser data across schema updates; never erase it on launch.
      localStorage.setItem('PHUC_PHUC_THINH_DATA_VERSION', DATA_SCHEMA_VERSION);
    } catch (error) {
      console.error(error);
    }
  };

  const loadStored = <T,>(key: string, fallback: T): T => {
    try {
      ensureDataSchema();
      if (!isLocalPreview) return (Array.isArray(fallback) ? [] : fallback) as T;
      const stored = localStorage.getItem(`PHUC_PHUC_THINH_${key}`);
      const parsed = stored ? JSON.parse(stored) : fallback;
      return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  };

  const saveStored = <T,>(key: string, value: T) => {
    try {
      if (!isLocalPreview) return;
      localStorage.setItem(`PHUC_PHUC_THINH_${key}`, JSON.stringify(value));
    } catch (e) {
      console.error(e);
      setStorageError('Không thể lưu trên trình duyệt. Hãy xuất bản sao lưu trước khi đóng trang.');
    }
  };

  // State Management
  const [settings, setSettings] = useState<CenterSettings>(() => loadStored('settings', initialSettings));
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
        if (sessionStorage.getItem('BEEZONE_DEV_ROLE') === 'teacher') return createMockSessionForAccount(DEV_TEACHER_ACCOUNT);
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
  const [authStatus, setAuthStatus] = useState<'loading' | 'ready' | 'signed-out' | 'blocked' | 'error'>(
    isSupabaseConfigured ? 'loading' : isLocalPreview ? 'ready' : 'signed-out'
  );
  const [isCenterDataHydrated, setIsCenterDataHydrated] = useState(!isSupabaseConfigured);
  const [canSyncCenterData, setCanSyncCenterData] = useState(false);
  const [hasCenterData, setHasCenterData] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRetry, setAuthRetry] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error' | 'conflict'>('saved');
  const [syncError, setSyncError] = useState<string | null>(null);
  const cloudRevisionRef = useRef<string | null>(null);
  const savedPayloadRef = useRef('');
  const syncQueueRef = useRef<ReturnType<typeof createSyncQueue<CenterDataPayload>> | null>(null);

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
  const [taskRequest, setTaskRequest] = useState<TaskDestination | null>(null);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>(() => loadStored('enrollments', []));
  const [scheduleChanges, setScheduleChanges] = useState<ScheduleChange[]>(() => loadStored('scheduleChanges', []));
  const billingReceipts = useMemo(() => withUnbilledSessionReceipts(receipts, attendanceSessions), [receipts, attendanceSessions]);
  const [accountAuditLogs, setAccountAuditLogs] = useState<AccountAuditLog[]>(() => loadStored('accountAuditLogs', initialAccountAuditLogs));
  const [accountAuditError, setAccountAuditError] = useState<string | null>(null);
  const [isAccountAuditLoading, setIsAccountAuditLoading] = useState(false);

  // Navigation & Layout State
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const tabFromUrl = new URLSearchParams(window.location.search).get('tab');
      const candidate = tabFromUrl || sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || 'dashboard';
      return VALID_TABS.has(candidate) ? candidate : 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.innerWidth < 1280;
    } catch {
      return false;
    }
  });
  useEffect(() => { if (isDrawer) setSidebarCollapsed(true); }, [isDrawer]);
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
  useEffect(() => saveStored('enrollments', enrollments), [enrollments]);
  useEffect(() => saveStored('scheduleChanges', scheduleChanges), [scheduleChanges]);
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
        const feeStatus = feeStatusFromReceipts(student.id, receipts, attendanceSessions);
        if (feeStatus === student.feeStatus) return student;
        changed = true;
        return { ...student, feeStatus };
      });
      return changed ? nextStudents : previousStudents;
    });
  }, [receipts, attendanceSessions]);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    let hydratedUserId: string | null = null;
    let resolvingUserId: string | null = null;
    let resolutionId = 0;
    let authEventObserved = false;
    const deferredEvents = new Set<number>();

    const resolveSession = async (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);

      if (!nextSession) {
        resolutionId += 1;
        hydratedUserId = null;
        resolvingUserId = null;
        syncQueueRef.current?.stop();
        setCurrentUser(null);
        setIsCenterDataHydrated(false);
        setCanSyncCenterData(false);
        setHasCenterData(false);
        setPrograms([]); setTeachers([]); setRooms([]); setClasses([]); setStudents([]);
        setTimetableSlots([]); setGrades([]); setReceipts([]); setBackups([]); setEnrollments([]); setScheduleChanges([]);
        setAttendanceSessions([]); setActivityLogs([]); setAccountAuditLogs([]);
        setAuthStatus('signed-out');
        return;
      }

      if (resolvingUserId === nextSession.user.id) return;
      resolvingUserId = nextSession.user.id;
      const runId = ++resolutionId;
      const isCurrent = () => isMounted && runId === resolutionId;
      const alreadyHydrated = hydratedUserId === nextSession.user.id;

      if (!alreadyHydrated) setAuthStatus('loading');
      setAuthError(null);
      try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role, is_active, permissions')
        .eq('id', nextSession.user.id)
        .maybeSingle();

      if (!isCurrent()) return;
      if (error) throw new Error('Không thể kiểm tra quyền tài khoản. Kiểm tra kết nối và thử lại.');
      if (!data || !data.is_active || !['owner', 'staff'].includes(data.role)) {
        hydratedUserId = null;
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
      if (alreadyHydrated) { setAuthStatus('ready'); return; }
      syncQueueRef.current?.stop();
      setIsCenterDataHydrated(false);
      setCanSyncCenterData(false);
      setHasCenterData(false);
      const { data: centerData, error: centerDataError } = await supabase
        .from('center_data')
        .select('payload, updated_at')
        .eq('id', 'primary')
        .maybeSingle();

      if (!isCurrent()) return;
      if (!centerDataError) {
        const payload = parseCenterData(centerData?.payload || {}, initialSettings);
        const hasPayload = Boolean(centerData && Object.keys(centerData.payload || {}).length);
        const normalizedReceipts = normaliseReceipts(payload.receipts);
        const hydratedStudents = payload.students.map(student => ({ ...student, feeStatus: feeStatusFromReceipts(student.id, normalizedReceipts, payload.attendanceSessions) }));
        const hydratedClasses = reconcileClassStudentIds(payload.classes, hydratedStudents);
        const hydratedTeachers = reconcileTeacherAssignments(payload.teachers, hydratedClasses);
        setSettings(payload.settings); setPrograms(payload.programs); setRooms(payload.rooms);
        setTeachers(hydratedTeachers); setClasses(hydratedClasses); setStudents(hydratedStudents);
        setTimetableSlots(payload.timetableSlots); setGrades(payload.grades); setReceipts(normalizedReceipts);
        setBackups(payload.backups); setAttendanceSessions(payload.attendanceSessions);
        setEnrollments(payload.enrollments); setScheduleChanges(payload.scheduleChanges);
        setActivityLogs(payload.activityLogs);
        cloudRevisionRef.current = centerData?.updated_at ?? null;
        savedPayloadRef.current = JSON.stringify({ ...payload, teachers: hydratedTeachers, classes: hydratedClasses, students: hydratedStudents, receipts: normalizedReceipts });
        setSyncStatus('saved'); setSyncError(null);
        setCanSyncCenterData(true);
        setHasCenterData(hasPayload);
      } else {
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
      hydratedUserId = nextSession.user.id;
      setIsCenterDataHydrated(true);
      setAuthStatus('ready');
      } catch (error) {
        if (!isCurrent()) return;
        hydratedUserId = null;
        syncQueueRef.current?.stop();
        setCanSyncCenterData(false);
        setIsCenterDataHydrated(false);
        setAuthError(error instanceof Error ? error.message : 'Không thể tải dữ liệu.');
        setAuthStatus('error');
      } finally {
        if (isCurrent()) resolvingUserId = null;
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted || authEventObserved) return;
      if (error) { setAuthError('Không thể kiểm tra phiên đăng nhập.'); setAuthStatus('error'); return; }
      void resolveSession(data.session);
    }).catch(() => { if (isMounted) { setAuthError('Không thể kết nối hệ thống đăng nhập.'); setAuthStatus('error'); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventObserved = true;
      // Supabase holds an auth lock while callbacks run. Defer queries outside it.
      const timer = window.setTimeout(() => { deferredEvents.delete(timer); void resolveSession(nextSession); }, 0);
      deferredEvents.add(timer);
    });

    return () => {
      isMounted = false;
      deferredEvents.forEach(timer => window.clearTimeout(timer));
      listener.subscription.unsubscribe();
    };
  }, [authRetry]);

  useEffect(() => {
    if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData) return;
    let active = true;
    const queue = createSyncQueue<CenterDataPayload>(async payload => {
      const revision = cloudRevisionRef.current;
      const result = revision
        ? await supabase.from('center_data').update({ payload }).eq('id', 'primary').eq('updated_at', revision).select('updated_at').maybeSingle()
        : await supabase.from('center_data').insert({ id: 'primary', payload }).select('updated_at').single();
      if (result.error?.code === '23505' || (!result.error && !result.data)) throw new SyncConflictError();
      if (result.error) throw new Error('Không thể lưu dữ liệu lên máy chủ. Kiểm tra kết nối và quyền truy cập rồi thử lại.');
      if (!active) return;
      cloudRevisionRef.current = result.data.updated_at;
      savedPayloadRef.current = JSON.stringify(payload);
    }, (status, error) => { setSyncStatus(status); setSyncError(error || null); });
    syncQueueRef.current = queue;
    return () => { active = false; queue.stop(); if (syncQueueRef.current === queue) syncQueueRef.current = null; };
  }, [currentUser?.id, isCenterDataHydrated, canSyncCenterData]);

  useEffect(() => {
    if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData) return;
    const payload: CenterDataPayload = { sessionBillingVersion: 1, settings, programs, teachers, rooms, classes, students: students.map(s => ({ ...s, feeStatus: feeStatusFromReceipts(s.id, receipts, attendanceSessions) })), timetableSlots, grades, receipts, backups, activityLogs, attendanceSessions, enrollments, scheduleChanges };
    if (JSON.stringify(payload) === savedPayloadRef.current) return;
    setSyncStatus(previous => previous === 'error' || previous === 'conflict' ? previous : 'saving');
    const timer = window.setTimeout(() => {
      syncQueueRef.current?.enqueue(payload);
    }, 750);
    return () => window.clearTimeout(timer);
  }, [settings, programs, teachers, rooms, classes, students, timetableSlots, grades, receipts, backups, activityLogs, attendanceSessions, enrollments, scheduleChanges, currentUser?.id, isCenterDataHydrated, canSyncCenterData]);

  useEffect(() => {
    if (syncStatus === 'saved' && !storageError) return;
    const warnBeforeClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [syncStatus, storageError]);

  // Activity Logger
  const addLog = (
    action: 'ĐĂNG NHẬP' | 'THÊM' | 'SỬA' | 'XÓA' | 'EXPORT' | 'IMPORT' | 'BACKUP' | 'RESTORE' | 'ĐỒNG BỘ',
    module: string,
    details: string
  ) => {
    if (!currentUser) return;
    const newLog: ActivityLog = {
      id: `LOG_${crypto.randomUUID()}`,
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
    if (isLocalPreview) { setAccountAuditLogs(initialAccountAuditLogs); setAccountAuditError(null); return; }
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
      throw new Error('Không thể tải nhật ký tài khoản từ máy chủ.');
    } catch (error) {
      setAccountAuditError(error instanceof Error ? error.message : 'Không thể tải nhật ký tài khoản.');
    } finally {
      setIsAccountAuditLoading(false);
    }
  }, [currentUser?.role, session?.access_token]);

  useEffect(() => {
    if (activeTab === 'activity-logs') void loadAccountAuditLogs();
  }, [activeTab, loadAccountAuditLogs]);

  // Student CRUD Handlers
  const handleAddStudent = (newStudent: Student) => {
    if (newStudent.classId) setEnrollments(prev => updateEnrollmentHistory(prev, undefined, newStudent, newStudent.enrollDate || centerDate()));
    setStudents(prev => [{ ...newStudent, feeStatus: feeStatusFromReceipts(newStudent.id, receipts, attendanceSessions) }, ...prev]);
    addLog('THÊM', 'Học sinh', `Thêm mới học sinh ${newStudent.name} (${newStudent.code})`);
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    setEnrollments(prev => updateEnrollmentHistory(prev, students.find(s => s.id === updatedStudent.id), updatedStudent, centerDate()));
    const normalizedStudent = { ...updatedStudent, feeStatus: feeStatusFromReceipts(updatedStudent.id, receipts, attendanceSessions) };
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? normalizedStudent : s));
    addLog('SỬA', 'Học sinh', `Cập nhật thông tin học sinh ${updatedStudent.name} (${updatedStudent.code})`);
  };

  const handleDeleteStudent = (id: string) => {
    const st = students.find(s => s.id === id);
    if (attendanceSessions.some(session => session.billing && session.entries.some(entry => entry.studentId === id))) { alert('Học viên có lịch sử học phí theo buổi. Hãy chuyển trạng thái học để giữ hồ sơ.'); return; }
    const linkedReceipts = receipts.filter((receipt) => receipt.studentId === id);
    if (enrollments.some(item => item.studentId === id)) { alert('Học viên có lịch sử đăng ký khóa học. Hãy chuyển trạng thái học để giữ hồ sơ.'); return; }
    if (linkedReceipts.length > 0) {
      alert(`Không thể xóa ${st?.name || 'học sinh'} vì còn ${linkedReceipts.length} phiếu thu. Hãy xóa/điều chỉnh phiếu thu hoặc chuyển trạng thái học trước để không mất lịch sử tài chính.`);
      return;
    }
    if (currentUser?.role !== 'owner' && (grades.some(grade => grade.studentId === id) || attendanceSessions.some(session => session.entries.some(entry => entry.studentId === id)))) { alert('Học viên có lịch sử điểm hoặc điểm danh. Hãy chuyển trạng thái học hoặc liên hệ Chủ trung tâm.'); return; }
    setStudents(prev => prev.filter(s => s.id !== id));
    setGrades((previousGrades) => previousGrades.filter((grade) => grade.studentId !== id));
    if (st) addLog('XÓA', 'Học sinh', `Xóa học sinh ${st.name} (${st.code}) và dữ liệu điểm liên quan khỏi hệ thống`);
  };

  const handleEnrollStudent = (studentId: string, classId: string, enrollDate: string) => {
    if (!currentUser || (currentUser.role !== 'owner' && (!currentUser.permissions.student.edit || (classes.find(c => c.id === classId)?.billingMode !== 'session' && !currentUser.permissions.tuition.collect)))) { alert('Cần quyền sửa học viên và thu học phí để xác nhận nhập học.'); return false; }
    const student = students.find(s => s.id === studentId);
    if (!student || student.status === 'active') return false;
    const targetClass = classes.find(c => c.id === classId);
    if (!targetClass) { alert('Lớp nhập học không tồn tại.'); return false; }
    if (targetClass.courseStatus === 'completed' || targetClass.courseStatus === 'paused') { alert('Chọn một đợt học đang mở.'); return false; }
    if (targetClass.capacity > 0 && students.filter(s => s.classId === classId && s.status === 'active').length >= targetClass.capacity) { alert('Lớp đã đủ sĩ số. Hãy chọn lớp khác.'); return false; }
    const targetProgram = programs.find(p => p.id === targetClass.programId);
    if (!targetProgram) { alert('Lớp chưa có chương trình học hợp lệ.'); return false; }
    const tuitionAmount = targetProgram.tuitionFee;
    setEnrollments(prev => updateEnrollmentHistory(prev, student, { ...student, classId, status: 'active' }, enrollDate || centerDate()));

    // 1. Update student
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          status: 'active' as const,
          classId: classId,
          programId: targetClass?.programId || s.programId,
          enrollDate: enrollDate || centerDate(),
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
    if (currentUser.role === 'owner') setGrades(prev => {
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
      id: `REC_${crypto.randomUUID()}`,
      code: nextReceiptCode(receipts),
      studentId,
      classId,
      courseFee: targetClass.billingMode === 'monthly' ? 0 : tuitionAmount,
      monthlyFee: targetClass.billingMode === 'monthly' ? tuitionAmount : 0,
      paymentKind: targetClass.billingMode === 'monthly' ? 'monthly' : 'course',
      billingPeriod: targetClass.billingMode === 'monthly' ? (enrollDate || centerDate()).slice(0,7) : `Nhập học ${enrollDate || centerDate()}`,
      discount: 0,
      paidAmount: 0,
      debtAmount: tuitionAmount,
      status: 'unpaid',
      paymentDate: enrollDate || centerDate(),
      collectorName: currentUser?.name || 'BeeZone English',
      paymentMethod: 'Chưa xác định',
      notes: `Học phí nhập học khóa ${targetProgram?.name || targetClass?.name || ''}`,
    };
    if (targetClass.billingMode !== 'session' && tuitionAmount > 0 && !receipts.some(r => r.studentId === studentId && r.classId === classId && r.paymentKind === 'course')) setReceipts(prev => [newReceipt, ...prev]);

    addLog('THÊM', 'Tuyển sinh', `Xác nhận nhập học chính thức học viên ${student.name} (${student.code}) vào lớp ${targetClass?.name || classId}`);
    return true;
  };

  const handleReserveStudent = (studentId: string, reserveDate: string, expectedReturnDate: string, reason: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    setEnrollments(prev => updateEnrollmentHistory(prev, student, { ...student, status: 'reserved' }, reserveDate));
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
    setEnrollments(prev => updateEnrollmentHistory(prev, student, { ...student, status: 'dropped' }, dropDate));
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
    if (!currentUser || (currentUser.role !== 'owner' && !currentUser.permissions.student.edit)) return false;
    if (!isCalendarDate(returnDate)) { alert('Ngày đăng ký không hợp lệ.'); return false; }
    const student = students.find(s => s.id === studentId);
    if (!student) return false;
    const targetClass = classes.find(c => c.id === targetClassId);
    if (!targetClass) { alert('Lớp quay lại học không tồn tại.'); return false; }
    if (targetClass.courseStatus === 'completed' || targetClass.courseStatus === 'paused') { alert('Chọn một đợt học đang mở.'); return false; }
    if (targetClass.capacity > 0 && students.filter(s => s.id !== studentId && s.classId === targetClassId && s.status === 'active').length >= targetClass.capacity) { alert('Lớp đã đủ sĩ số. Hãy chọn lớp khác.'); return false; }
    const reNote = `\n[QUAY LẠI HỌC]: Ngày ${returnDate} tại lớp ${targetClass?.name || targetClassId}. ${note || ''}`;
    setEnrollments(prev => updateEnrollmentHistory(prev, student, { ...student, classId: targetClassId, status: 'active' }, returnDate));
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          status: 'active' as const,
          classId: targetClassId,
          programId: targetClass.programId,
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
    return true;
  };

  const handleImportStudents = (newStudentsList: Student[]) => {
    const existingIds = new Set(students.map(s => s.id));
    const existingCodes = new Set(students.map(s => s.code.trim().toLowerCase()));
    const uniqueStudents = newStudentsList.filter(s => {
      const code = s.code.trim().toLowerCase();
      if (existingIds.has(s.id) || existingCodes.has(code)) return false;
      existingIds.add(s.id); existingCodes.add(code); return true;
    });
    setStudents(prev => [...uniqueStudents, ...prev]);
    addLog('IMPORT', 'Excel', `Nhập ${uniqueStudents.length} học sinh mới; bỏ qua ${newStudentsList.length - uniqueStudents.length} bản ghi trùng.`);
  };

  const handleImportCenterData = (data: CenterWorkbookData) => {
    if (enrollments.length || scheduleChanges.length || attendanceSessions.some(s => s.billing)) { alert('Đã có lịch sử đăng ký hoặc lịch nghỉ/học bù. Báo cáo Excel không thay thế bản sao lưu đầy đủ. Hãy dùng sao lưu JSON để khôi phục; vẫn có thể nhập thêm học viên bằng Excel.'); return false; }
    try { parseCenterData({ ...data, settings }, settings); }
    catch (error) { alert(error instanceof Error ? error.message : 'Dữ liệu nhập không hợp lệ.'); return false; }
    const normalizedReceipts = normaliseReceipts(data.receipts);
    const importedStudents = data.students.map((student) => ({ ...student, feeStatus: feeStatusFromReceipts(student.id, normalizedReceipts, data.attendanceSessions || []) }));
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
    setAttendanceSessions(data.attendanceSessions || []);
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
    return true;
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
    if (scheduleChanges.some(c => c.teacherId === id)) { alert('Giáo viên có lịch sử đổi lịch/học bù. Hãy giữ hồ sơ giáo viên.'); return; }
    const t = teachers.find(item => item.id === id);
    const managedClasses = classes.filter((classroom) => classroom.teacherId === id);
    if (managedClasses.length > 0 || timetableSlots.some(s => s.teacherId === id)) {
      alert(`Không thể xóa giáo viên ${t?.name || ''} vì đang phụ trách ${managedClasses.length} lớp. Hãy phân công giáo viên khác cho các lớp trước.`);
      return;
    }
    setTeachers(prev => prev.filter(item => item.id !== id));
    if (t) addLog('XÓA', 'Giáo viên', `Xóa giáo viên ${t.name}`);
  };

  // Class CRUD Handlers
  const handleAddClass = (c: ClassRoom) => {
    if (currentUser?.role !== 'owner') return;
    const error = validateCourse(c); if (error) { alert(error); return; }
    if (c.courseStatus === 'completed') c = { ...c, completedDate: c.completedDate || centerDate() };
    setClasses(prev => [...prev, c]);
    addLog('THÊM', 'Lớp học', `Tạo lớp học mới ${c.name} (${c.code})`);
  };

  const handleUpdateClass = (c: ClassRoom) => {
    if (currentUser?.role !== 'owner') return;
    const error = validateCourse(c); if (error) { alert(error); return; }
    if (c.courseStatus === 'completed' && classes.find(item => item.id === c.id)?.courseStatus !== 'completed') {
      c = { ...c, completedDate: c.completedDate || centerDate() };
      setEnrollments(prev => {
        let history = prev;
        for (const student of students.filter(s => s.classId === c.id)) history = updateEnrollmentHistory(history, student, student, student.enrollDate || centerDate());
        return history.map(item => item.classId === c.id && ['active', 'reserved'].includes(item.status) ? { ...item, status: 'completed', endDate: c.completedDate } : item);
      });
    } else if (c.courseStatus !== 'completed' && c.completedDate) {
      c = { ...c, completedDate: undefined };
      if (classes.find(item => item.id === c.id)?.courseStatus === 'completed') setEnrollments(prev => students.filter(s => s.classId === c.id && ['active', 'reserved'].includes(s.status)).reduce((history, student) => updateEnrollmentHistory(history, undefined, student, centerDate()), prev));
    }
    setClasses(prev => prev.map(item => item.id === c.id ? c : item));
    setStudents(prev => prev.map(student => student.classId === c.id && student.programId !== c.programId ? { ...student, programId: c.programId } : student));
    addLog('SỬA', 'Lớp học', `Cập nhật lớp học ${c.name} (${c.code})`);
  };

  const handleCreateProgram = (program: CourseProgram) => {
    setPrograms(prev => [...prev, program]);
    addLog('THÊM', 'Chương trình học', `Tạo chương trình ${program.name}`);
  };

  const handleDeleteClass = (id: string) => {
    if (attendanceSessions.some(session => session.classId === id && session.billing)) { alert('Lớp có lịch sử học phí theo buổi. Hãy kết thúc đợt học để giữ hồ sơ.'); return; }
    if (enrollments.some(item => item.classId === id) || scheduleChanges.some(item => item.classId === id)) { alert('Đợt học có lịch sử đăng ký hoặc lịch nghỉ/học bù. Hãy giữ hồ sơ và chuyển trạng thái kết thúc.'); return; }
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
    setAttendanceSessions(prev => prev.filter(session => session.classId !== id));
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
    if (scheduleChanges.some(c => c.roomId === id)) { alert('Phòng có lịch sử đổi lịch/học bù. Hãy giữ hồ sơ phòng.'); return; }
    const room = rooms.find((item) => item.id === id);
    const roomClasses = classes.filter((classroom) => classroom.roomId === id);
    if (roomClasses.length > 0 || timetableSlots.some(slot => slot.roomId === id)) {
      alert(`Không thể xóa phòng ${room?.name || ''} vì đang được dùng cho ${roomClasses.length} lớp. Hãy đổi phòng cho các lớp trước.`);
      return;
    }
    setRooms(prev => prev.filter(item => item.id !== id));
    addLog('XÓA', 'Phòng học', `Xóa phòng học ${room?.name || ''}`);
  };

  // Timetable Handlers
  const handleAddSlot = (slot: TimetableSlot) => {
    const next = [...timetableSlots, slot];
    setTimetableSlots(next);
    setClasses(classrooms => classrooms.map(classroom => classroom.id === slot.classId ? withClassScheduleSummary(classroom, next) : classroom));
    addLog('THÊM', 'Thời khóa biểu', `Thêm ca học mới vào ${slot.dayOfWeek} (${slot.startTime}-${slot.endTime})`);
  };

  const handleUpdateSlot = (slot: TimetableSlot) => {
    const oldClassId = timetableSlots.find(s => s.id === slot.id)?.classId;
    const next = timetableSlots.map(s => s.id === slot.id ? slot : s);
    setTimetableSlots(next);
    setClasses(classrooms => classrooms.map(classroom => classroom.id === slot.classId || classroom.id === oldClassId ? withClassScheduleSummary(classroom, next) : classroom));
    addLog('SỬA', 'Thời khóa biểu', `Cập nhật ca học vào ${slot.dayOfWeek}`);
  };

  const handleDeleteSlot = (id: string) => {
    if (scheduleChanges.some(c => c.sourceSlotId === id)) { alert('Ca học có lịch nghỉ/học bù liên quan. Giữ ca gốc hoặc hủy điều chỉnh trước.'); return; }
    const deletedSlot = timetableSlots.find(slot => slot.id === id);
    const next = timetableSlots.filter(s => s.id !== id);
    setTimetableSlots(next);
    if (deletedSlot) setClasses(classrooms => classrooms.map(classroom => classroom.id === deletedSlot.classId ? withClassScheduleSummary(classroom, next) : classroom));
    addLog('XÓA', 'Thời khóa biểu', `Xóa ca học khỏi thời khóa biểu`);
  };

  const handleReplaceClassSchedule = (classId: string, slots: TimetableSlot[]) => {
    const next = [...timetableSlots.filter(slot => slot.classId !== classId), ...slots];
    setTimetableSlots(next);
    setClasses(classrooms => classrooms.map(classroom => classroom.id === classId ? withClassScheduleSummary(classroom, next) : classroom));
  };

  // Grade Handler
  const handleUpdateGrade = (updatedGrade: Grade) => {
    setGrades(prev => {
      const idx = prev.findIndex(g => g.studentId === updatedGrade.studentId && g.classId === updatedGrade.classId);
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
    if (!currentUser || (currentUser.role !== 'owner' && !currentUser.permissions.tuition.collect)) return false;
    if (r.paymentKind !== 'session' && classes.find(c => c.id === r.classId)?.billingMode === 'session') { alert('Lớp này thu theo buổi. Chọn các buổi đã điểm danh trong mục Học phí theo buổi.'); return false; }
    const issue = validateSessionReceipt(r, attendanceSessions, receipts);
    if (issue) { alert(issue); return false; }
    setReceipts(prev => [r, ...prev]);

    addLog('THÊM', 'Học phí', `Lập phiếu thu ${r.code} số tiền ${r.paidAmount.toLocaleString('vi-VN')} đ`);
    return true;
  };

  const handleUpdateReceipt = (updatedReceipt: TuitionReceipt) => {
    if (!currentUser || (currentUser.role !== 'owner' && !currentUser.permissions.tuition.collect)) return false;
    const issue = validateSessionReceipt(updatedReceipt, attendanceSessions, receipts);
    if (issue) { alert(issue); return false; }
    setReceipts(prev => prev.map((receipt) => receipt.id === updatedReceipt.id ? updatedReceipt : receipt));
    addLog('SỬA', 'Học phí', `Cập nhật phiếu thu ${updatedReceipt.code} (${updatedReceipt.paymentKind === 'course' ? 'học phí khóa' : updatedReceipt.paymentKind === 'session' ? 'học phí buổi' : 'học phí tháng'})`);
  };

  const handleDeleteReceipt = (id: string) => {
    if (!currentUser || (currentUser.role !== 'owner' && !currentUser.permissions.tuition.delete)) return;
    const receipt = receipts.find((item) => item.id === id);
    setReceipts(prev => prev.filter((item) => item.id !== id));
    if (receipt) addLog('XÓA', 'Học phí', `Xóa phiếu thu ${receipt.code} (${receipt.paymentKind === 'course' ? 'học phí khóa' : receipt.paymentKind === 'session' ? 'học phí buổi' : 'học phí tháng'})`);
  };

  const handleBackupCreated = (backup: SystemBackup) => {
    setBackups(prev => [backup, ...prev].slice(0, 30));
    addLog('BACKUP', 'Sao lưu', `Đã xuất tệp sao lưu ${backup.filename} (${backup.sizeKb} KB)`);
  };

  const handleRestoreBackup = (data: CenterBackupData, filename: string) => {
    const normalizedReceipts = normaliseReceipts(data.receipts);
    const restoredStudents = data.students.map((student) => ({ ...student, feeStatus: feeStatusFromReceipts(student.id, normalizedReceipts, data.attendanceSessions || []) }));
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
    setAttendanceSessions(data.attendanceSessions || []);
    setEnrollments(data.enrollments || []); setScheduleChanges(data.scheduleChanges || []);
    setHasCenterData(true);
    addLog('RESTORE', 'Sao lưu', `Đã khôi phục dữ liệu từ tệp ${filename}`);
  };

  // Attendance Handler
  const handleSaveAttendanceSession = (sessionData: AttendanceSession) => {
    const issue = validateBilledAttendanceEdit(sessionData, receipts);
    if (issue) { alert(issue); return false; }
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
    return true;
  };

  const handleSaveScheduleChange = (change: ScheduleChange): string | null => {
    if (currentUser?.role !== 'owner') return 'Chỉ Chủ trung tâm được đổi lịch.';
    const error = validateScheduleChange(change, classes, timetableSlots, scheduleChanges, attendanceSessions);
    if (error) return error;
    const room = rooms.find(item => item.id === change.roomId);
    if (change.kind !== 'cancel' && (!teachers.some(t => t.id === change.teacherId) || !room || room.status !== 'available')) return 'Giáo viên hoặc phòng không còn sẵn sàng.';
    setScheduleChanges(prev => [...prev.filter(item => item.id !== change.id), change]);
    addLog('SỬA', 'Lịch theo ngày', change.kind + ': ' + change.date + ' · ' + change.reason);
    return null;
  };
  const handleDeleteScheduleChange = (id: string): string | null => {
    if (currentUser?.role !== 'owner') return 'Chỉ Chủ trung tâm được đổi lịch.';
    const change = scheduleChanges.find(item => item.id === id);
    if (!change) return null;
    if (attendanceSessions.some(a => a.classId === change.classId && [change.date, change.sourceDate].includes(a.date))) return 'Buổi đã điểm danh; giữ lại điều chỉnh để bảo toàn lịch sử.';
    const next = scheduleChanges.filter(item => item.id !== id);
    for (const date of [change.date, change.sourceDate].filter((d): d is string => Boolean(d))) {
      const lessons = lessonsOn(date, classes, timetableSlots, next);
      if (lessons.some(lesson => findScheduleConflict(lessons, lesson))) return 'Khôi phục lịch gốc sẽ trùng giờ giáo viên hoặc phòng.';
    }
    setScheduleChanges(next); addLog('XÓA', 'Lịch theo ngày', 'Hủy điều chỉnh ngày ' + change.date);
    return null;
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
    if (students.some(s => s.programId === id) || classes.some(c => c.programId === id)) { alert('Không thể xóa chương trình đang có học viên hoặc lớp học.'); return; }
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
    if ((syncStatus !== 'saved' || storageError) && !window.confirm('Có dữ liệu chưa lưu. Hãy chọn Hủy để xuất bản sao lưu, hoặc OK để đăng xuất và bỏ thay đổi chưa lưu.')) return;
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
      try { sessionStorage.removeItem(`PHUC_PHUC_THINH_LOGIN_LOGGED_${currentUser.id}`); } catch { /* optional session storage */ }
    }
    setCurrentUser(null);
    setSession(null);
    setAuthStatus('signed-out');
    setIsLoginOpen(false);
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

  if (authStatus === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-sm font-semibold text-slate-600">
        Đang kiểm tra quyền truy cập…
      </main>
    );
  }

  if (authStatus === 'error') {
    return <main className="grid min-h-screen place-items-center bg-slate-100 p-4"><section role="alert" className="max-w-md rounded-2xl bg-white p-6 text-center shadow-xl"><h1 className="text-lg font-bold">Chưa thể tải hệ thống</h1><p className="mt-2 text-sm text-slate-600">{authError}</p><button onClick={() => setAuthRetry(value => value + 1)} className="mt-4 rounded-xl bg-amber-500 px-4 py-2 font-bold">Thử lại</button><button onClick={() => void handleLogout().catch(() => setAuthError('Không thể đăng xuất. Hãy kiểm tra kết nối.'))} className="ml-3 text-sm font-bold">Đăng xuất</button></section></main>;
  }

  if (authStatus === 'blocked') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <section className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-xl">
          <h1 className="font-extrabold text-red-900">Tài khoản chưa được cấp quyền</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Liên hệ Chủ trung tâm để nhận lời mời hoặc kiểm tra lại trạng thái tài khoản.</p>
          <button onClick={() => void handleLogout().catch(() => setAuthError('Không thể đăng xuất. Hãy kiểm tra kết nối.'))} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Đăng xuất</button>
          {authError && <p role="alert" className="mt-2 text-sm text-red-700">{authError}</p>}
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
  const searchResults = searchQuery.trim() ? [
    ...(canAccessTab('students', currentUser) ? students.filter(s => matchesSearch(searchQuery, s.name, s.code, s.phone, s.parentPhone)).map(s => ({ id: s.id, name: `${s.name} • ${s.code}`, tab: 'students', label: 'Học viên' })) : []),
    ...(canAccessTab('classes', currentUser) ? classes.filter(c => matchesSearch(searchQuery, c.name, c.code)).map(c => ({ id: c.id, name: `${c.name} • ${c.code}`, tab: 'classes', label: 'Lớp' })) : []),
    ...(canAccessTab('teachers', currentUser) ? teachers.filter(t => matchesSearch(searchQuery, t.name, t.phone, t.email)).map(t => ({ id: t.id, name: t.name, tab: 'teachers', label: 'Giáo viên' })) : []),
  ].slice(0, 8) : [];

  return (
    <div className="min-h-svh bg-slate-100 flex flex-col font-sans antialiased text-slate-900">
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
        syncStatus={isLocalPreview ? 'preview' : syncStatus}
      />

      {isLocalPreview && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">Bản xem thử • Dữ liệu chỉ lưu trên trình duyệt của máy này.</div>}
      {searchQuery.trim() && <section aria-label="Kết quả tìm kiếm nhanh" className="border-b border-amber-200 bg-white px-4 py-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-600">Kết quả tìm kiếm nhanh</p><button onClick={() => setSearchQuery('')} className="rounded-lg px-3 py-1 text-xs font-bold text-slate-500">Xóa tìm kiếm</button></div><div className="mt-2 flex flex-wrap gap-2">{searchResults.length ? searchResults.map(result => <button key={`${result.tab}:${result.id}`} onClick={() => navigateTo(result.tab)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs hover:border-amber-400"><span className="font-bold text-amber-700">{result.label}: </span>{result.name}</button>) : <p className="text-sm text-slate-500">Không tìm thấy kết quả trong dữ liệu bạn được phép xem.</p>}</div></section>}
      {(syncError || storageError) && <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span className="flex-1">{syncError || storageError}</span>{syncStatus === 'error' && <button onClick={() => syncQueueRef.current?.retry()} className="rounded-lg border border-red-300 px-3 py-1 font-bold">Thử lưu lại</button>}{(currentUser.role === 'owner' || currentUser.permissions.excel.export) && <button onClick={() => setIsBackupModalOpen(true)} className="rounded-lg border border-red-300 px-3 py-1 font-bold">Xuất sao lưu</button>}</div>}

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
        <main id="main-content" ref={contentViewportRef} className="workspace-content @container min-w-0 flex-1 p-3 sm:p-6 transition-all">
          <ErrorBoundary key={activeTab}>
          <Suspense fallback={<div role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-500">Đang tải chức năng…</div>}>
          {activeTab === 'dashboard' && (
            <DashboardView
              students={students}
              teachers={teachers}
              classes={classes}
              rooms={rooms}
              receipts={billingReceipts}
              programs={programs}
              currentUser={currentUser}
              timetableSlots={timetableSlots} scheduleChanges={scheduleChanges} attendanceSessions={attendanceSessions}
              onOpenTask={destination => {
                if (!canAccessTab(destination.tab, currentUser)) return;
                setTaskRequest(destination);
                if (destination.tab === 'students') setSearchQuery(students.find(s => s.id === destination.studentId)?.code || '');
                if (destination.tab === 'classes' && currentUser.role === 'owner') setClassEditRequest(classes.find(c => c.id === destination.classId) || null);
                navigateTo(destination.tab);
              }}
              onNavigateTab={navigateTo}
            />
          )}

          {activeTab === 'students' && (
            <StudentManager
              students={students}
              programs={programs}
              classes={classes}
              receipts={billingReceipts}
              timetableSlots={timetableSlots}
              teachers={teachers}
              rooms={rooms}
              permissions={currentUser.permissions}
              isOwner={currentUser.role === 'owner'}
              searchQuery={searchQuery}
              enrollments={enrollments}
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
              searchQuery={searchQuery}
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
              receipts={billingReceipts}
              timetableSlots={timetableSlots}
              permissions={currentUser.permissions}
              isOwner={currentUser.role === 'owner'}
              searchQuery={searchQuery}
              enrollments={enrollments} attendanceSessions={attendanceSessions} scheduleChanges={scheduleChanges}
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
              scheduleChanges={scheduleChanges} attendanceSessions={attendanceSessions}
              onSaveChange={handleSaveScheduleChange} onDeleteChange={handleDeleteScheduleChange}
              onAddSlot={handleAddSlot}
              onUpdateSlot={handleUpdateSlot}
              onDeleteSlot={handleDeleteSlot}
            />
          )}

          {activeTab === 'teacher-schedule' && (
            <TeacherScheduleMatrix
              scheduleChanges={scheduleChanges}
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
              timetableSlots={timetableSlots} scheduleChanges={scheduleChanges}
              enrollments={enrollments}
              request={taskRequest?.tab === 'attendance' ? taskRequest : null} onRequestHandled={() => setTaskRequest(null)}
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
              requestReceiptId={taskRequest?.tab === 'tuition' ? taskRequest.receiptId : undefined} onRequestHandled={() => setTaskRequest(null)}
              attendanceSessions={attendanceSessions}
              onAddReceipt={handleAddReceipt}
              onUpdateReceipt={handleUpdateReceipt}
              onDeleteReceipt={handleDeleteReceipt}
            />
          )}

          {activeTab === 'excel-import-export' && (
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="font-bold text-lg text-slate-900 mb-2">Nhập / Xuất Excel</h3>
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
              receipts={billingReceipts}
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
                enrollments={enrollments} scheduleChanges={scheduleChanges}
                attendanceSessions={attendanceSessions}
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
          </Suspense>
          </ErrorBoundary>
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
        onManageAccounts={() => setIsUserManagementOpen(true)}
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
            receipts={receipts} attendanceSessions={attendanceSessions}
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
        <DialogFrame label="Sao lưu dữ liệu" onClose={() => setIsBackupModalOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
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
                programs={programs}
                timetableSlots={timetableSlots}
                activityLogs={activityLogs}
                enrollments={enrollments} scheduleChanges={scheduleChanges}
                attendanceSessions={attendanceSessions}
                onBackupCreated={currentUser.role === 'owner' ? handleBackupCreated : undefined}
                onRestoreBackup={currentUser.role === 'owner' ? handleRestoreBackup : undefined}
              />
            </Suspense>
          </div>
        </DialogFrame>
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
