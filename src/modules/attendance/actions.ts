import type { AttendanceSession, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

import { validateBilledAttendanceEdit } from '../../lib/sessionBilling';
import { centerDate, isCalendarDate } from '../../lib/dates';
import {
  appendParentContact,
  canContactParent,
  CONTACT_CHANNELS,
  retainContactHistory,
  splitAttendanceNote,
} from './parentContact';
import type { ParentContactRequest } from './parentContact';

type Context = Pick<
  CenterStore,
  'classes' | 'students' | 'attendanceSessions' | 'receipts' | 'setAttendanceSessions'
> & {
  currentUser: UserAccount | null;
  addLog: ActivityLogger;
};
export function createAttendanceActions({
  classes,
  students,
  attendanceSessions,
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
        const oldEntries = prev[idx].entries;
        next[idx] = {
          ...sessionData,
          entries: [
            ...sessionData.entries.map((entry) => ({
              ...entry,
              note: retainContactHistory(
                entry.note || '',
                oldEntries.find((old) => old.studentId === entry.studentId)?.note,
              ),
            })),
            ...oldEntries.filter(
              (old) =>
                !sessionData.entries.some((entry) => entry.studentId === old.studentId) &&
                splitAttendanceNote(old.note).history.length > 0,
            ),
          ],
        };
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

  const handleRecordParentContact = (request: ParentContactRequest): string | null => {
    const session = attendanceSessions.find((item) => item.id === request.sessionId);
    const classroom = classes.find((item) => item.id === session?.classId);
    if (!canContactParent(currentUser, classroom))
      return 'Bạn không có quyền ghi nhận liên hệ cho lớp này.';
    if (!session || !isCalendarDate(session.date) || session.date > centerDate())
      return 'Chỉ liên hệ cho buổi học đã diễn ra và đã lưu điểm danh.';
    const student = students.find((item) => item.id === request.studentId);
    if (
      !student ||
      session.entries.find((entry) => entry.studentId === request.studentId)?.status !== 'absent'
    )
      return 'Học viên không còn được ghi nhận vắng trong buổi này. Kiểm tra lại điểm danh.';
    if (
      !CONTACT_CHANNELS.includes(request.channel) ||
      typeof request.details !== 'string' ||
      request.details.length > 500
    )
      return 'Kênh liên hệ hoặc ghi chú chưa hợp lệ (tối đa 500 ký tự).';
    const now = new Date();
    setAttendanceSessions((prev) =>
      prev.map((item) =>
        item.id === session.id
          ? {
              ...item,
              entries: item.entries.map((entry) =>
                entry.studentId === student.id
                  ? {
                      ...entry,
                      note: appendParentContact(
                        entry.note || '',
                        request.channel,
                        request.details,
                        currentUser!.name,
                        now,
                      ),
                    }
                  : entry,
              ),
            }
          : item,
      ),
    );
    addLog(
      'SỬA',
      'Liên hệ phụ huynh',
      `Ghi nhận liên hệ qua ${request.channel} cho ${student.code}, lớp ${classroom!.name}, buổi ${session.date}.`,
    );
    return null;
  };

  return { handleSaveAttendanceSession, handleRecordParentContact };
}
