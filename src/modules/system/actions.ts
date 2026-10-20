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
import type { CenterWorkbookData } from '../../services/excelService';
import { mergeActivityLogs } from '../center/model';

type Context = Pick<
  CenterStore,
  | 'settings'
  | 'programs' | 'teachers' | 'rooms' | 'classes' | 'timetableSlots'
  | 'setPrograms' | 'setTeachers' | 'setRooms' | 'setTimetableSlots'
  | 'students'
  | 'activityLogs'
  | 'attendanceSessions'
  | 'enrollments'
  | 'scheduleChanges'
  | 'setStudents'
  | 'setClasses'
  | 'setReceipts'
  | 'setBackups'
  | 'setActivityLogs'
  | 'applyData'
> & { currentUser: UserAccount | null; addLog: ActivityLogger };
export function createSystemActions({
  settings,
  programs, teachers, rooms, classes, timetableSlots,
  setPrograms, setTeachers, setRooms, setTimetableSlots,
  students,
  activityLogs,
  attendanceSessions,
  enrollments,
  scheduleChanges,
  setStudents,
  setClasses,
  setReceipts,
  setBackups,
  setActivityLogs,
  applyData,
  currentUser,
  addLog,
}: Context) {
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
      alert(error instanceof Error ? error.message : 'Danh mục lớp không hợp lệ.');
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
    setStudents((prev) => [...uniqueStudents, ...prev]);
    addLog(
      'IMPORT',
      'Excel',
      `Nhập ${uniqueStudents.length} học sinh mới; bỏ qua ${newStudentsList.length - uniqueStudents.length} bản ghi trùng.`,
    );
  };

  const handleImportCenterData = (data: CenterWorkbookData) => {
    if (enrollments.length || scheduleChanges.length || attendanceSessions.some((s) => s.billing)) {
      alert(
        'Đã có lịch sử đăng ký hoặc lịch nghỉ/học bù. Báo cáo Excel không thay thế bản sao lưu đầy đủ. Hãy dùng sao lưu JSON để khôi phục; vẫn có thể nhập thêm học viên bằng Excel.',
      );
      return false;
    }
    let payload: CenterDataPayload;
    try {
      payload = normalizeCenterData(parseCenterData({ ...data, settings }, settings));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Dữ liệu nhập không hợp lệ.');
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
    setStudents(fixedStudents);
    setClasses(fixedClasses);
    setReceipts(fixedReceipts);
    addLog('ĐỒNG BỘ', 'Kiểm tra dữ liệu', 'Đã tự động sửa các liên kết dữ liệu không nhất quán');
  };

  return {
    handleImportAcademicCatalog,
    handleImportStudents,
    handleImportCenterData,
    handleBackupCreated,
    handleRestoreBackup,
    handleDataFixed,
  };
}
