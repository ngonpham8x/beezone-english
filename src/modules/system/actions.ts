import { showAlert } from '../../lib/dialogs';
import type { CenterDataPayload } from '../../lib/centerData';
import type {
  ActivityLog,
  CenterBackupData,
  ClassRoom,
  Student,
  SystemBackup,
  TuitionReceipt,
  UserAccount,
} from '../../types';
import { normalizeCenterData } from '../center/model';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from './activityLogger';

import { parseCenterData } from '../../lib/centerData';
import { mergeAcademicCatalog } from '../../lib/academicCatalog';
import { validateRecurringChanges } from '../../lib/operations';
import { reconcileStudentClassCodes } from '../../lib/studentClasses';
import {
  isInitialDemoAccountAudit,
  stripInitialDemoData,
} from '../../lib/demoData';
import { isLocalPreview } from '../../lib/supabase';
import type {
  CenterWorkbookData,
  StudentRosterImportData,
  StudentRosterImportOptions,
  StudentRosterImportSummary,
} from '../../services/excelService';
import { mergeActivityLogs } from '../center/model';
import { mergeStudentRoster } from './studentRoster';

type Context = Pick<
  CenterStore,
  | 'settings'
  | 'programs' | 'teachers' | 'rooms' | 'classes' | 'timetableSlots'
  | 'setPrograms' | 'setTeachers' | 'setRooms' | 'setTimetableSlots'
  | 'students'
  | 'grades'
  | 'receipts'
  | 'activityLogs'
  | 'attendanceSessions'
  | 'enrollments'
  | 'scheduleChanges'
  | 'backups'
  | 'accountAuditLogs'
  | 'setStudents'
  | 'setClasses'
  | 'setReceipts'
  | 'setBackups'
  | 'setActivityLogs'
  | 'setAccountAuditLogs'
  | 'applyData'
> & { currentUser: UserAccount | null; addLog: ActivityLogger };
export function createSystemActions({
  settings,
  programs, teachers, rooms, classes, timetableSlots,
  setPrograms, setTeachers, setRooms, setTimetableSlots,
  students,
  grades,
  receipts,
  activityLogs,
  attendanceSessions,
  enrollments,
  scheduleChanges,
  backups,
  accountAuditLogs,
  setStudents,
  setClasses,
  setReceipts,
  setBackups,
  setActivityLogs,
  setAccountAuditLogs,
  applyData,
  currentUser,
  addLog,
}: Context) {
  const currentPayload = (): CenterDataPayload => ({
    sessionBillingVersion: 1,
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
  });

  const rosterKey = (value: string) => value
    .trim()
    .replace(/[Đđ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]/g, '');

  const rosterStudentKey = (student: Pick<Student, 'name' | 'dob' | 'parentName'>) =>
    `${rosterKey(student.name)}|${student.dob}|${rosterKey(student.parentName)}`;

  const handleImportAcademicCatalog = (data: CenterWorkbookData, includeSchedule = false) => {
    if (!currentUser?.active || currentUser.role !== 'owner') return false;
    try {
      const catalog = mergeAcademicCatalog({ programs, teachers, rooms, classes, timetableSlots }, data, includeSchedule);
      const scheduleError = validateRecurringChanges(catalog.classes, catalog.timetableSlots, scheduleChanges);
      if (scheduleError) throw new Error(scheduleError);
      parseCenterData({ ...catalog, settings }, settings);
      setPrograms(catalog.programs);
      setTeachers(catalog.teachers);
      setRooms(catalog.rooms);
      setClasses(catalog.classes);
      setTimetableSlots(catalog.timetableSlots);
      addLog('IMPORT', 'Lớp học', `Bổ sung ${catalog.classes.length - classes.length} lớp từ Excel; giữ nguyên học viên, phiếu thu và lịch sử.`);
      return true;
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Danh mục lớp không hợp lệ.');
      return false;
    }
  };
  const handleImportStudents = (newStudentsList: Student[]) => {
    const existingIds = new Set(students.map((s) => s.id));
    const existingCodes = new Set(students.map((s) => s.code.trim().toLowerCase()));
    const uniqueStudents = newStudentsList.filter((s) => {
      const code = s.code.trim().toLowerCase();
      if (existingIds.has(s.id) || existingCodes.has(code)) return false;
      existingIds.add(s.id);
      existingCodes.add(code);
      return true;
    });
    setStudents((prev) => reconcileStudentClassCodes([...uniqueStudents, ...prev], classes));
    addLog(
      'IMPORT',
      'Excel',
      `Nhập ${uniqueStudents.length} học sinh mới; bỏ qua ${newStudentsList.length - uniqueStudents.length} bản ghi trùng.`,
    );
  };

  const handleImportStudentRoster = (
    data: StudentRosterImportData,
    options: StudentRosterImportOptions = {},
  ): StudentRosterImportSummary | null => {
    if (!currentUser?.active || (currentUser.role !== 'owner' && (!currentUser.permissions.excel.import || !currentUser.permissions.student.add))) return null;
    try {
      const shouldSynchronizePreview = isLocalPreview && currentUser.role === 'owner';
      const replaceExistingRoster = Boolean(options.replaceExistingRoster && currentUser.role === 'owner');
      const replaceMemberships = shouldSynchronizePreview || replaceExistingRoster;
      const sampleCleanup = shouldSynchronizePreview
        ? stripInitialDemoData(currentPayload())
        : { data: currentPayload(), removedRecords: 0 };
      const sourceClassKeys = new Set(data.classes.map((classroom) => rosterKey(classroom.name)));
      const staleRosterClassIds = new Set(
        replaceExistingRoster
          ? sampleCleanup.data.classes
            .filter((classroom) => !sourceClassKeys.has(rosterKey(classroom.name)))
            .map((classroom) => classroom.id)
          : shouldSynchronizePreview
          ? sampleCleanup.data.classes
            .filter((classroom) => classroom.id.startsWith('CLASS_ROSTER_') && !sourceClassKeys.has(rosterKey(classroom.name)))
            .map((classroom) => classroom.id)
          : [],
      );
      const baseClasses = sampleCleanup.data.classes.filter((classroom) => !staleRosterClassIds.has(classroom.id));
      const validClassIds = new Set(baseClasses.map((classroom) => classroom.id));
      const sourceStudentKeys = new Set(data.students.map(rosterStudentKey));
      const removedStudentIds = new Set(
        replaceExistingRoster
          ? sampleCleanup.data.students
            .filter((student) => !sourceStudentKeys.has(rosterStudentKey(student)))
            .map((student) => student.id)
          : [],
      );
      const baseStudents = sampleCleanup.data.students.flatMap((student) => {
        if (removedStudentIds.has(student.id)) return [];
        const membershipIds = [student.classId, ...(student.additionalClassIds || [])]
          .filter((classId) => validClassIds.has(classId));
        if (!membershipIds.length) return [];
        return [{
          ...student,
          classId: membershipIds[0],
          additionalClassIds: [...new Set(membershipIds.slice(1))],
        }];
      });
      const merged = mergeStudentRoster({
        programs: sampleCleanup.data.programs,
        classes: baseClasses,
        students: baseStudents,
      }, data, { replaceMemberships });
      const withoutStaleReferences: CenterDataPayload = {
        ...sampleCleanup.data,
        programs: merged.programs,
        classes: merged.classes,
        students: merged.students,
        timetableSlots: sampleCleanup.data.timetableSlots.filter((slot) => !staleRosterClassIds.has(slot.classId)),
        grades: sampleCleanup.data.grades.filter((grade) => (
          !staleRosterClassIds.has(grade.classId) && !removedStudentIds.has(grade.studentId)
        )),
        receipts: sampleCleanup.data.receipts.filter((receipt) => (
          !staleRosterClassIds.has(receipt.classId) && !removedStudentIds.has(receipt.studentId)
        )),
        attendanceSessions: sampleCleanup.data.attendanceSessions
          .filter((session) => !staleRosterClassIds.has(session.classId))
          .map((session) => ({
            ...session,
            entries: session.entries.filter((entry) => !removedStudentIds.has(entry.studentId)),
          })),
        enrollments: sampleCleanup.data.enrollments.filter((enrollment) => (
          !staleRosterClassIds.has(enrollment.classId) && !removedStudentIds.has(enrollment.studentId)
        )),
        scheduleChanges: sampleCleanup.data.scheduleChanges.filter((change) => !staleRosterClassIds.has(change.classId)),
      };
      const payload = normalizeCenterData(parseCenterData(withoutStaleReferences, settings));
      applyData(payload);
      if (shouldSynchronizePreview) {
        setAccountAuditLogs(accountAuditLogs.filter((entry) => !isInitialDemoAccountAudit(entry)));
      }
      const summary: StudentRosterImportSummary = {
        ...merged.summary,
        totalPrograms: payload.programs.length,
        totalClasses: payload.classes.length,
        totalStudents: payload.students.length,
        totalMemberships: payload.classes.reduce((total, classroom) => total + classroom.studentIds.length, 0),
        removedSampleRecords: sampleCleanup.removedRecords,
        removedStaleClasses: staleRosterClassIds.size,
        removedStaleStudents: removedStudentIds.size,
      };
      addLog(
        'IMPORT',
        'Excel',
        `Đồng bộ danh sách nhiều sheet: ${summary.totalClasses} lớp theo sheet, ${summary.totalStudents} học viên không trùng, ${summary.totalMemberships} lượt ghi danh; loại ${summary.removedSampleRecords} bản ghi mẫu, ${summary.removedStaleClasses} lớp và ${summary.removedStaleStudents} học viên không còn trong file.`,
      );
      return summary;
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Danh sách học viên Excel không hợp lệ.');
      return null;
    }
  };

  const handleRemoveInitialDemoData = () => {
    if (!isLocalPreview || currentUser?.role !== 'owner') return 0;
    const cleanup = stripInitialDemoData(currentPayload());
    const cleanedAuditLogs = accountAuditLogs.filter((entry) => !isInitialDemoAccountAudit(entry));
    const removedAuditLogs = accountAuditLogs.length - cleanedAuditLogs.length;
    const removedRecords = cleanup.removedRecords + removedAuditLogs;
    if (!removedRecords) return 0;
    applyData(normalizeCenterData(parseCenterData(cleanup.data, settings)));
    setAccountAuditLogs(cleanedAuditLogs);
    addLog('XÓA', 'Dữ liệu xem thử', `Xóa ${removedRecords} bản ghi mẫu tích hợp sẵn; giữ nguyên dữ liệu nhập Excel và dữ liệu người dùng.`);
    return removedRecords;
  };

  const handleImportCenterData = (data: CenterWorkbookData) => {
    if (enrollments.length || scheduleChanges.length || attendanceSessions.some((s) => s.billing)) {
      showAlert(
        'Đã có lịch sử đăng ký hoặc lịch nghỉ/học bù. Báo cáo Excel không thay thế bản sao lưu đầy đủ. Hãy dùng sao lưu JSON để khôi phục; vẫn có thể nhập thêm học viên bằng Excel.',
      );
      return false;
    }
    let payload: CenterDataPayload;
    try {
      payload = normalizeCenterData(parseCenterData({ ...data, settings }, settings));
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Dữ liệu nhập không hợp lệ.');
      return false;
    }
    applyData({ ...payload, backups: [], activityLogs });
    const importLog: ActivityLog[] = currentUser
      ? [
          {
            id: `LOG_IMPORT_${Date.now()}`,
            timestamp: new Date().toLocaleString('vi-VN'),
            userEmail: currentUser.email,
            userName: currentUser.name,
            action: 'IMPORT',
            module: 'Excel',
            details: `Nhập dữ liệu trung tâm: ${data.classes.length} lớp, ${data.students.length} học sinh, ${data.receipts.length} phiếu thu.`,
          },
        ]
      : [];
    setActivityLogs((previous) => mergeActivityLogs(importLog, previous));
    return true;
  };

  const handleBackupCreated = (backup: SystemBackup) => {
    setBackups((prev) => [backup, ...prev].slice(0, 30));
    addLog('BACKUP', 'Sao lưu', `Đã xuất tệp sao lưu ${backup.filename} (${backup.sizeKb} KB)`);
  };

  const handleRestoreBackup = (data: CenterBackupData, filename: string) => {
    const payload = normalizeCenterData(data);
    applyData({ ...payload, backups: payload.backups.slice(0, 30) });
    addLog('RESTORE', 'Sao lưu', `Đã khôi phục dữ liệu từ tệp ${filename}`);
  };

  // Data Consistency Handler
  const handleDataFixed = (
    fixedStudents: Student[],
    fixedClasses: ClassRoom[],
    fixedReceipts: TuitionReceipt[],
  ) => {
    setStudents(reconcileStudentClassCodes(fixedStudents, fixedClasses));
    setClasses(fixedClasses);
    setReceipts(fixedReceipts);
    addLog('ĐỒNG BỘ', 'Kiểm tra dữ liệu', 'Đã tự động sửa các liên kết dữ liệu không nhất quán');
  };

  return {
    handleImportAcademicCatalog,
    handleImportStudents,
    handleImportStudentRoster,
    handleRemoveInitialDemoData,
    handleImportCenterData,
    handleBackupCreated,
    handleRestoreBackup,
    handleDataFixed,
  };
}
