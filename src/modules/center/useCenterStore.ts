import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CenterDataPayload } from '../../lib/centerData';
import { withUnbilledSessionReceipts } from '../../lib/sessionBilling';
import {
  initialAccountAuditLogs,
  initialActivityLogs,
  initialAttendanceSessions,
  initialBackups,
  initialClasses,
  initialGrades,
  initialPrograms,
  initialRooms,
  initialSettings,
  initialStudents,
  initialTeachers,
  initialTimetableSlots,
  initialTuitionReceipts,
} from '../../mock/initialData';
import type {
  AccountAuditLog,
  ActivityLog,
  AttendanceSession,
  CenterSettings,
  ClassEnrollment,
  ClassRoom,
  CourseProgram,
  Grade,
  Room,
  ScheduleChange,
  Student,
  SystemBackup,
  Teacher,
  TimetableSlot,
  TuitionReceipt,
} from '../../types';
import {
  normaliseClasses,
  normaliseReceipts,
  reconcileClassStudentIds,
  reconcileStudentFees,
  reconcileTeacherAssignments,
} from './model';
import { usePreviewState } from './previewStorage';

/** Owns business state and derived relationships. Authentication and screens never persist independently. */
export function useCenterStore() {
  const [storageError, setStorageError] = useState<string | null>(null);
  const [settings, setSettings] = usePreviewState<CenterSettings>(
    'settings',
    initialSettings,
    setStorageError,
  );
  const [programs, setPrograms] = usePreviewState<CourseProgram[]>(
    'programs',
    initialPrograms,
    setStorageError,
  );
  const [teachers, setTeachers] = usePreviewState<Teacher[]>(
    'teachers',
    initialTeachers,
    setStorageError,
  );
  const [rooms, setRooms] = usePreviewState<Room[]>('rooms', initialRooms, setStorageError);
  const [classes, setClasses] = usePreviewState<ClassRoom[]>(
    'classes',
    initialClasses,
    setStorageError,
    normaliseClasses,
  );
  const [students, setStudents] = usePreviewState<Student[]>(
    'students',
    initialStudents,
    setStorageError,
  );
  const [timetableSlots, setTimetableSlots] = usePreviewState<TimetableSlot[]>(
    'timetableSlots',
    initialTimetableSlots,
    setStorageError,
  );
  const [grades, setGrades] = usePreviewState<Grade[]>('grades', initialGrades, setStorageError);
  const [receipts, setReceipts] = usePreviewState<TuitionReceipt[]>(
    'receipts',
    initialTuitionReceipts,
    setStorageError,
    normaliseReceipts,
  );
  const [backups, setBackups] = usePreviewState<SystemBackup[]>(
    'backups',
    initialBackups,
    setStorageError,
  );
  const [activityLogs, setActivityLogs] = usePreviewState<ActivityLog[]>(
    'activityLogs',
    initialActivityLogs,
    setStorageError,
  );
  const [attendanceSessions, setAttendanceSessions] = usePreviewState<AttendanceSession[]>(
    'attendanceSessions',
    initialAttendanceSessions,
    setStorageError,
  );
  const [enrollments, setEnrollments] = usePreviewState<ClassEnrollment[]>(
    'enrollments',
    [],
    setStorageError,
  );
  const [scheduleChanges, setScheduleChanges] = usePreviewState<ScheduleChange[]>(
    'scheduleChanges',
    [],
    setStorageError,
  );
  const [accountAuditLogs, setAccountAuditLogs] = usePreviewState<AccountAuditLog[]>(
    'accountAuditLogs',
    initialAccountAuditLogs,
    setStorageError,
  );
  const billingReceipts = useMemo(
    () => withUnbilledSessionReceipts(receipts, attendanceSessions),
    [receipts, attendanceSessions],
  );
  useEffect(() => {
    setClasses((previousClasses) => reconcileClassStudentIds(previousClasses, students));
  }, [students]);

  useEffect(() => {
    setTeachers((previousTeachers) => reconcileTeacherAssignments(previousTeachers, classes));
  }, [classes]);

  useEffect(() => {
    setStudents((previous) => reconcileStudentFees(previous, billingReceipts));
  }, [billingReceipts]);

  const applyData = useCallback((data: CenterDataPayload) => {
    setSettings(data.settings);
    setPrograms(data.programs);
    setTeachers(data.teachers);
    setRooms(data.rooms);
    setClasses(data.classes);
    setStudents(data.students);
    setTimetableSlots(data.timetableSlots);
    setGrades(data.grades);
    setReceipts(data.receipts);
    setBackups(data.backups);
    setActivityLogs(data.activityLogs);
    setAttendanceSessions(data.attendanceSessions);
    setEnrollments(data.enrollments);
    setScheduleChanges(data.scheduleChanges);
  }, []);
  const clearData = useCallback(() => {
    setPrograms([]);
    setTeachers([]);
    setRooms([]);
    setClasses([]);
    setStudents([]);
    setTimetableSlots([]);
    setGrades([]);
    setReceipts([]);
    setBackups([]);
    setActivityLogs([]);
    setAttendanceSessions([]);
    setEnrollments([]);
    setScheduleChanges([]);
    setAccountAuditLogs([]);
  }, []);

  return {
    settings,
    setSettings,
    programs,
    setPrograms,
    teachers,
    setTeachers,
    rooms,
    setRooms,
    classes,
    setClasses,
    students,
    setStudents,
    timetableSlots,
    setTimetableSlots,
    grades,
    setGrades,
    receipts,
    setReceipts,
    backups,
    setBackups,
    activityLogs,
    setActivityLogs,
    attendanceSessions,
    setAttendanceSessions,
    enrollments,
    setEnrollments,
    scheduleChanges,
    setScheduleChanges,
    accountAuditLogs,
    setAccountAuditLogs,
    billingReceipts,
    storageError,
    applyData,
    clearData,
  };
}
export type CenterStore = ReturnType<typeof useCenterStore>;
