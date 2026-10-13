import type { AttendanceSession, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

import { validateBilledAttendanceEdit } from '../../lib/sessionBilling';

type Context = Pick<CenterStore, 'classes' | 'receipts' | 'setAttendanceSessions'> & {
  currentUser: UserAccount | null;
  addLog: ActivityLogger;
};
export function createAttendanceActions({
  classes,
  receipts,
  setAttendanceSessions,
  currentUser,
  addLog,
}: Context) {
  // Attendance Handler
  const handleSaveAttendanceSession = (sessionData: AttendanceSession) => {
    const issue = validateBilledAttendanceEdit(sessionData, receipts);
    if (issue) {
      alert(issue);
      return false;
    }
    setAttendanceSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === sessionData.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = sessionData;
        return next;
      }
      return [sessionData, ...prev];
    });
    addLog(
      'THÊM',
      'Điểm danh',
      `Điểm danh buổi học ngày ${sessionData.date} lớp ${classes.find((c) => c.id === sessionData.classId)?.name || sessionData.classId}`,
    );
    return true;
  };

  return { handleSaveAttendanceSession };
}
