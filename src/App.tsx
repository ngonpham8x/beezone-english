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
  initialActivityLogs
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
import { profileToAccount, ProfileRow } from './lib/auth';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { feeStatusForReceipts } from './lib/tuition';
import { isStudentInClass } from './lib/student';
import type { CenterWorkbookData } from './services/excelService';
import { ShieldCheck } from 'lucide-react';
import DataConsistencyChecker from './components/DataConsistencyChecker';

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
}

const DATA_SCHEMA_VERSION = 'secure-supabase-import-v1';
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
  'activityLogs'
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

const sameIdList = (left: string[], right: string[]) => (
  left.length === right.length && left.every((id, index) => id === right[index])
);

// studentIds and assignedClassIds are denormalized fields used by some cards
// and reports. Keep them safely synchronized with primary student and extra classes.
const reconcileClassStudentIds = (classrooms: ClassRoom[], centerStudents: Student[]) => {
  let hasChanged = false;

  const nextClassrooms = classrooms.map((classroom) => {
    const idsSet = new Set<string>();

    centerStudents.forEach((student) => {
      if (
        student.classId === classroom.id ||
        (Array.isArray(student.extraClassIds) && student.extraClassIds.includes(classroom.id))
      ) {
        idsSet.add(student.id);
      }
    });

    const nextStudentIds = Array.from(idsSet);
    if (sameIdList(classroom.studentIds || [], nextStudentIds)) {
      return classroom;
    }
    hasChanged = true;
    return { ...classroom, studentIds: nextStudentIds };
  });

  return hasChanged ? nextClassrooms : classrooms;
};

const reconcileStudentExtraClasses = (centerStudents: Student[], classrooms: ClassRoom[]) => {
  let hasChanged = false;
  const nextStudents = centerStudents.map((student) => {
    const enrolledInOtherClasses = classrooms
      .filter((cls) => cls.id !== student.classId && Array.isArray(cls.studentIds) && cls.studentIds.includes(student.id))
      .map((cls) => cls.id);
    if (!enrolledInOtherClasses.length) return student;
    const currentExtras = student.extraClassIds || [];
    const mergedExtras = Array.from(new Set([...currentExtras, ...enrolledInOtherClasses]));
    if (sameIdList(currentExtras, mergedExtras)) return student;
    hasChanged = true;
    return { ...student, extraClassIds: mergedExtras };
  });
  return hasChanged ? nextStudents : centerStudents;
};

const reconcileTeacherAssignments = (centerTeachers: Teacher[], classrooms: ClassRoom[]) => {
  let hasChanged = false;
  const nextTeachers = centerTeachers.map((teacher) => {
    const assignedClassIds = classrooms.filter((classroom) => classroom.teacherId === teacher.id).map((classroom) => classroom.id);
    if (sameIdList(teacher.assignedClassIds || [], assignedClassIds)) {
      return teacher;
    }
    hasChanged = true;
    return { ...teacher, assignedClassIds };
  });
  return hasChanged ? nextTeachers : centerTeachers;
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
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authStatus, setAuthStatus] = useState<'loading' | 'ready' | 'signed-out' | 'blocked'>(
    isSupabaseConfigured ? 'loading' : 'signed-out'
  );
  const [isCenterDataHydrated, setIsCenterDataHydrated] = useState(!isSupabaseConfigured);
  const [canSyncCenterData, setCanSyncCenterData] = useState(false);
  const [hasCenterData, setHasCenterData] = useState(false);

  const [programs, setPrograms] = useState<CourseProgram[]>(() => loadStored('programs', initialPrograms));
  const [teachers, setTeachers] = useState<Teacher[]>(() => loadStored('teachers', initialTeachers));
  const [rooms, setRooms] = useState<Room[]>(() => loadStored('rooms', initialRooms));
  const [classes, setClasses] = useState<ClassRoom[]>(() => loadStored('classes', initialClasses));
  const [students, setStudents] = useState<Student[]>(() => {
    const rawStudents = loadStored('students', initialStudents);
    const rawClasses = loadStored('classes', initialClasses);
    return reconcileStudentExtraClasses(rawStudents, rawClasses);
  });
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>(() => loadStored('timetableSlots', initialTimetableSlots));
  const [grades, setGrades] = useState<Grade[]>(() => loadStored('grades', initialGrades));
  const [receipts, setReceipts] = useState<TuitionReceipt[]>(() => normaliseReceipts(loadStored('receipts', initialTuitionReceipts)));
  const [backups, setBackups] = useState<SystemBackup[]>(() => loadStored('backups', initialBackups));
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(() => loadStored('activityLogs', initialActivityLogs));
  const [accountAuditLogs, setAccountAuditLogs] = useState<AccountAuditLog[]>([]);
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [classEditRequest, setClassEditRequest] = useState<ClassRoom | null>(null);
  const contentViewportRef = useRef<HTMLElement>(null);
  const lastHydratedUserIdRef = useRef<string | null>(null);
  const lastSyncedPayloadRef = useRef<string>('');

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
    if (!currentUser || currentUser.role === 'owner') return;
    if (!canAccessTab(activeTab, currentUser) && activeTab !== 'dashboard') {
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

  // Modals state
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState<boolean>(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isPwaModalOpen, setIsPwaModalOpen] = useState<boolean>(false);

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
    const resolveSession = async (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);

      if (!nextSession) {
        lastHydratedUserIdRef.current = null;
        setCurrentUser(null);
        setIsCenterDataHydrated(!isSupabaseConfigured);
        setCanSyncCenterData(false);
        setHasCenterData(false);
        setAuthStatus('signed-out');
        return;
      }

      if (lastHydratedUserIdRef.current === nextSession.user.id && isCenterDataHydrated) {
        return;
      }

      setAuthStatus('loading');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role, is_active, permissions')
        .eq('id', nextSession.user.id)
        .maybeSingle();

      if (!isMounted) return;
      if (error || !data || !data.is_active) {
        lastHydratedUserIdRef.current = null;
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
          lastSyncedPayloadRef.current = JSON.stringify(payload);
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
      lastHydratedUserIdRef.current = nextSession.user.id;
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
    const payload: CenterDataPayload = { settings, programs, teachers, rooms, classes, students, timetableSlots, grades, receipts, backups, activityLogs };
    const timer = window.setTimeout(() => {
      const serialized = JSON.stringify(payload);
      if (serialized === lastSyncedPayloadRef.current) return;
      void supabase
        .from('center_data')
        .upsert({ id: 'primary', payload }, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) {
            console.error('Không thể đồng bộ dữ liệu trung tâm:', error.message);
          } else {
            lastSyncedPayloadRef.current = serialized;
          }
        });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [settings, programs, teachers, rooms, classes, students, timetableSlots, grades, receipts, backups, activityLogs, currentUser, isCenterDataHydrated, canSyncCenterData, hasCenterData]);

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
    if (currentUser?.role !== 'owner' || !session?.access_token) {
      setAccountAuditLogs([]);
      setAccountAuditError(null);
      return;
    }
    setIsAccountAuditLoading(true);
    setAccountAuditError(null);
    try {
      const response = await fetch('/api/admin/audit-logs', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json() as { logs?: AccountAuditLog[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Không thể tải nhật ký tài khoản.');
      setAccountAuditLogs(Array.isArray(payload.logs) ? payload.logs : []);
    } catch (requestError) {
      setAccountAuditLogs([]);
      setAccountAuditError(requestError instanceof Error ? requestError.message : 'Không thể tải nhật ký tài khoản.');
    } finally {
      setIsAccountAuditLoading(false);
    }
  }, [currentUser?.role, session?.access_token]);

  useEffect(() => {
    if (activeTab === 'activity-logs') void loadAccountAuditLogs();
  }, [activeTab, loadAccountAuditLogs]);

  // Student CRUD Handlers
  const handleAddStudent = (newStudent: Student) => {
    const normalized = { ...newStudent, feeStatus: feeStatusFromReceipts(newStudent.id, receipts) };
    const nextStudents = [normalized, ...students];
    setStudents(nextStudents);
    setClasses(prevClasses => reconcileClassStudentIds(prevClasses, nextStudents));
    addLog('THÊM', 'Học sinh', `Thêm mới học sinh ${newStudent.name} (${newStudent.code})`);
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    const previousStudent = students.find((student) => student.id === updatedStudent.id);
    const normalizedStudent = { ...updatedStudent, feeStatus: feeStatusFromReceipts(updatedStudent.id, receipts) };
    const nextStudents = students.map(s => s.id === updatedStudent.id ? normalizedStudent : s);
    setStudents(nextStudents);
    setClasses(prevClasses => reconcileClassStudentIds(prevClasses, nextStudents));
    if (previousStudent && previousStudent.classId !== updatedStudent.classId) {
      setGrades((previousGrades) => previousGrades.map((grade) => (
        grade.studentId === updatedStudent.id && (!grade.classId || grade.classId === previousStudent.classId)
          ? { ...grade, classId: updatedStudent.classId }
          : grade
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
    const nextStudents = students.filter(s => s.id !== id);
    setStudents(nextStudents);
    setClasses(prev => prev.map(c => ({
      ...c,
      studentIds: (c.studentIds || []).filter(sId => sId !== id)
    })));
    setGrades((previousGrades) => previousGrades.filter((grade) => grade.studentId !== id));
    if (st) addLog('XÓA', 'Học sinh', `Xóa học sinh ${st.name} (${st.code}) và dữ liệu điểm liên quan khỏi hệ thống`);
  };

  const handleImportStudents = (newStudentsList: Student[]) => {
    const nextStudents = [...newStudentsList, ...students];
    setStudents(nextStudents);
    setClasses(prevClasses => reconcileClassStudentIds(prevClasses, nextStudents));
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
    const scheduledSlots = timetableSlots.filter((slot) => slot.teacherId === id);
    if (managedClasses.length > 0 || scheduledSlots.length > 0) {
      const reasons = [
        managedClasses.length > 0 ? `${managedClasses.length} lớp học` : '',
        scheduledSlots.length > 0 ? `${scheduledSlots.length} ca dạy trên TKB` : '',
      ].filter(Boolean).join(' và ');
      alert(`Không thể xóa giáo viên ${t?.name || ''} vì đang phụ trách ${reasons}. Hãy phân công giáo viên khác trước.`);
      return;
    }
    setTeachers(prev => prev.filter(item => item.id !== id));
    if (t) addLog('XÓA', 'Giáo viên', `Xóa giáo viên ${t.name}`);
  };

  // Class CRUD Handlers
  const handleAddClass = (c: ClassRoom) => {
    setClasses(prev => [...prev, c]);
    if (c.teacherId) {
      setTeachers(prevTeachers => prevTeachers.map(t => 
        t.id === c.teacherId 
          ? { ...t, assignedClassIds: Array.from(new Set([...(t.assignedClassIds || []), c.id])) }
          : t
      ));
    }
    addLog('THÊM', 'Lớp học', `Tạo lớp học mới ${c.name} (${c.code})`);
  };

  const handleUpdateClass = (c: ClassRoom) => {
    const prevClass = classes.find(item => item.id === c.id);
    setClasses(prev => prev.map(item => item.id === c.id ? c : item));
    if (prevClass && prevClass.teacherId !== c.teacherId) {
      setTeachers(prevTeachers => prevTeachers.map(t => {
        if (t.id === prevClass.teacherId) {
          return { ...t, assignedClassIds: (t.assignedClassIds || []).filter(cId => cId !== c.id) };
        }
        if (t.id === c.teacherId) {
          return { ...t, assignedClassIds: Array.from(new Set([...(t.assignedClassIds || []), c.id])) };
        }
        return t;
      }));
    }
    if (prevClass && (prevClass.teacherId !== c.teacherId || prevClass.roomId !== c.roomId)) {
      setTimetableSlots(prevSlots => prevSlots.map(slot => 
        slot.classId === c.id 
          ? { ...slot, teacherId: c.teacherId, roomId: c.roomId }
          : slot
      ));
    }
    addLog('SỬA', 'Lớp học', `Cập nhật lớp học ${c.name} (${c.code})`);
  };

  const handleCreateProgram = (program: CourseProgram) => {
    setPrograms(prev => [...prev, program]);
    addLog('THÊM', 'Chương trình học', `Tạo chương trình ${program.name}`);
  };

  const handleDeleteClass = (id: string) => {
    const c = classes.find(item => item.id === id);
    const classStudents = students.filter((student) => isStudentInClass(student, id, c));
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
    setStudents(prev => prev.map(s => ({
      ...s,
      extraClassIds: (s.extraClassIds || []).filter(cId => cId !== id)
    })));
    setTeachers(prev => prev.map(t => ({
      ...t,
      assignedClassIds: (t.assignedClassIds || []).filter(cId => cId !== id)
    })));
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
    const scheduledSlots = timetableSlots.filter((slot) => slot.roomId === id);
    if (roomClasses.length > 0 || scheduledSlots.length > 0) {
      const reasons = [
        roomClasses.length > 0 ? `${roomClasses.length} lớp học` : '',
        scheduledSlots.length > 0 ? `${scheduledSlots.length} ca học trên TKB` : '',
      ].filter(Boolean).join(' và ');
      alert(`Không thể xóa phòng ${room?.name || ''} vì đang được dùng cho ${reasons}. Hãy đổi phòng cho các lớp/ca học trước.`);
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
      const idx = prev.findIndex(g => 
        g.id === updatedGrade.id || 
        (g.studentId === updatedGrade.studentId && (g.classId ? g.classId === updatedGrade.classId : true))
      );
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
    const normalized = normaliseReceipt(r);
    const nextReceipts = [normalized, ...receipts];
    setReceipts(nextReceipts);
    setStudents(prev => prev.map(s => s.id === r.studentId ? { ...s, feeStatus: feeStatusFromReceipts(s.id, nextReceipts) } : s));
    addLog('THÊM', 'Học phí', `Lập phiếu thu ${r.code} số tiền ${r.paidAmount.toLocaleString('vi-VN')} đ`);
  };

  const handleUpdateReceipt = (updatedReceipt: TuitionReceipt) => {
    const normalized = normaliseReceipt(updatedReceipt);
    const nextReceipts = receipts.map((receipt) => receipt.id === updatedReceipt.id ? normalized : receipt);
    setReceipts(nextReceipts);
    setStudents(prev => prev.map(s => s.id === updatedReceipt.studentId ? { ...s, feeStatus: feeStatusFromReceipts(s.id, nextReceipts) } : s));
    addLog('SỬA', 'Học phí', `Cập nhật phiếu thu ${updatedReceipt.code} (${updatedReceipt.paymentKind === 'course' ? 'học phí khóa' : 'học phí tháng'})`);
  };

  const handleDeleteReceipt = (id: string) => {
    const receipt = receipts.find((item) => item.id === id);
    const nextReceipts = receipts.filter((item) => item.id !== id);
    setReceipts(nextReceipts);
    if (receipt) {
      setStudents(prev => prev.map(s => s.id === receipt.studentId ? { ...s, feeStatus: feeStatusFromReceipts(s.id, nextReceipts) } : s));
      addLog('XÓA', 'Học phí', `Xóa phiếu thu ${receipt.code} (${receipt.paymentKind === 'course' ? 'học phí khóa' : 'học phí tháng'})`);
    }
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
    setHasCenterData(true);
    addLog('RESTORE', 'Sao lưu', `Đã khôi phục dữ liệu từ tệp ${filename}`);
  };

  const handleConsistencyDataFixed = (fixedStudents: Student[], fixedClassrooms: ClassRoom[], fixedReceipts: TuitionReceipt[]) => {
    setStudents(fixedStudents);
    setClasses(fixedClassrooms);
    setReceipts(fixedReceipts);
    addLog('SỬA', 'Kiểm tra dữ liệu', 'Tự động chuẩn hóa dữ liệu liên kết học viên, lớp học và học phí');
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setCurrentUser(null);
    setSession(null);
    setAuthStatus('signed-out');
    setIsLoginOpen(false);
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

  if (!currentUser || !session) return <AuthScreen />;

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
        onOpenPwaInstall={() => setIsPwaModalOpen(true)}
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
          onOpenPwaInstall={() => setIsPwaModalOpen(true)}
        />

        {/* Content View Container */}
        <main ref={contentViewportRef} className="min-w-0 flex-1 p-4 sm:p-6">
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

          {activeTab === 'grades' && (
            <GradeManager
              grades={grades}
              students={students}
              classes={classes}
              permissions={currentUser.permissions}
              isOwner={currentUser.role === 'owner'}
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
                className="px-4 py-2 bg-red-800 text-white rounded-xl font-bold text-xs"
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

          {activeTab === 'data-consistency' && (
            <DataConsistencyChecker
              students={students}
              classrooms={classes}
              receipts={receipts}
              programs={programs}
              onDataFixed={handleConsistencyDataFixed}
            />
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <h3 className="font-bold text-lg text-slate-900 mb-2">Cài Đặt Hệ Thống</h3>
                <p className="text-xs text-slate-500 mb-4">Thông tin trung tâm & cấu hình gửi email tự động</p>
                <button
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition"
                >
                  Chỉnh Sửa Cài Đặt Hệ Thống
                </button>
              </div>

              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 mb-1">Kiểm Tra Tính Nhất Quán Dữ Liệu</h3>
                    <p className="text-xs text-slate-500 mb-4">
                      Tự động rà soát và khắc phục các vấn đề liên kết giữa danh sách học viên, lớp học, học phí và chương trình học.
                    </p>
                    <button
                      onClick={() => setActiveTab('data-consistency')}
                      className="px-4 py-2 bg-violet-700 text-white rounded-xl font-bold text-xs hover:bg-violet-800 transition"
                    >
                      Mở Công Cụ Kiểm Tra Dữ Liệu
                    </button>
                  </div>
                </div>
              </div>
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
      />

      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        accessToken={session.access_token}
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
      />
    </div>
  );
}
