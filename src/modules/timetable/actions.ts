import type { ScheduleChange, TimetableSlot, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

import { lessonsOn, validateScheduleChange } from '../../lib/operations';
import { findScheduleConflict } from '../../lib/schedule';
import { withClassScheduleSummary } from '../center/model';

type Context = Pick<
  CenterStore,
  | 'teachers'
  | 'rooms'
  | 'classes'
  | 'setClasses'
  | 'timetableSlots'
  | 'setTimetableSlots'
  | 'attendanceSessions'
  | 'scheduleChanges'
  | 'setScheduleChanges'
> & { currentUser: UserAccount | null; addLog: ActivityLogger };
export function createScheduleActions({
  teachers,
  rooms,
  classes,
  setClasses,
  timetableSlots,
  setTimetableSlots,
  attendanceSessions,
  scheduleChanges,
  setScheduleChanges,
  currentUser,
  addLog,
}: Context) {
  // Timetable Handlers
  const handleAddSlot = (slot: TimetableSlot) => {
    const next = [...timetableSlots, slot];
    setTimetableSlots(next);
    setClasses((classrooms) =>
      classrooms.map((classroom) =>
        classroom.id === slot.classId ? withClassScheduleSummary(classroom, next) : classroom,
      ),
    );
    addLog(
      'THÊM',
      'Thời khóa biểu',
      `Thêm ca học mới vào ${slot.dayOfWeek} (${slot.startTime}-${slot.endTime})`,
    );
  };

  const handleUpdateSlot = (slot: TimetableSlot) => {
    const oldClassId = timetableSlots.find((s) => s.id === slot.id)?.classId;
    const next = timetableSlots.map((s) => (s.id === slot.id ? slot : s));
    setTimetableSlots(next);
    setClasses((classrooms) =>
      classrooms.map((classroom) =>
        classroom.id === slot.classId || classroom.id === oldClassId
          ? withClassScheduleSummary(classroom, next)
          : classroom,
      ),
    );
    addLog('SỬA', 'Thời khóa biểu', `Cập nhật ca học vào ${slot.dayOfWeek}`);
  };

  const handleDeleteSlot = (id: string) => {
    if (scheduleChanges.some((c) => c.sourceSlotId === id)) {
      alert('Ca học có lịch nghỉ/học bù liên quan. Giữ ca gốc hoặc hủy điều chỉnh trước.');
      return;
    }
    const deletedSlot = timetableSlots.find((slot) => slot.id === id);
    const next = timetableSlots.filter((s) => s.id !== id);
    setTimetableSlots(next);
    if (deletedSlot)
      setClasses((classrooms) =>
        classrooms.map((classroom) =>
          classroom.id === deletedSlot.classId
            ? withClassScheduleSummary(classroom, next)
            : classroom,
        ),
      );
    addLog('XÓA', 'Thời khóa biểu', `Xóa ca học khỏi thời khóa biểu`);
  };

  const handleReplaceClassSchedule = (classId: string, slots: TimetableSlot[]) => {
    const next = [...timetableSlots.filter((slot) => slot.classId !== classId), ...slots];
    setTimetableSlots(next);
    setClasses((classrooms) =>
      classrooms.map((classroom) =>
        classroom.id === classId ? withClassScheduleSummary(classroom, next) : classroom,
      ),
    );
  };

  const handleSaveScheduleChange = (change: ScheduleChange): string | null => {
    if (currentUser?.role !== 'owner') return 'Chỉ Chủ trung tâm được đổi lịch.';
    const error = validateScheduleChange(
      change,
      classes,
      timetableSlots,
      scheduleChanges,
      attendanceSessions,
    );
    if (error) return error;
    const room = rooms.find((item) => item.id === change.roomId);
    if (
      change.kind !== 'cancel' &&
      (!teachers.some((t) => t.id === change.teacherId) || !room || room.status !== 'available')
    )
      return 'Giáo viên hoặc phòng không còn sẵn sàng.';
    setScheduleChanges((prev) => [...prev.filter((item) => item.id !== change.id), change]);
    addLog('SỬA', 'Lịch theo ngày', change.kind + ': ' + change.date + ' · ' + change.reason);
    return null;
  };
  const handleDeleteScheduleChange = (id: string): string | null => {
    if (currentUser?.role !== 'owner') return 'Chỉ Chủ trung tâm được đổi lịch.';
    const change = scheduleChanges.find((item) => item.id === id);
    if (!change) return null;
    if (
      attendanceSessions.some(
        (a) => a.classId === change.classId && [change.date, change.sourceDate].includes(a.date),
      )
    )
      return 'Buổi đã điểm danh; giữ lại điều chỉnh để bảo toàn lịch sử.';
    const next = scheduleChanges.filter((item) => item.id !== id);
    for (const date of [change.date, change.sourceDate].filter((d): d is string => Boolean(d))) {
      const lessons = lessonsOn(date, classes, timetableSlots, next);
      if (lessons.some((lesson) => findScheduleConflict(lessons, lesson)))
        return 'Khôi phục lịch gốc sẽ trùng giờ giáo viên hoặc phòng.';
    }
    setScheduleChanges(next);
    addLog('XÓA', 'Lịch theo ngày', 'Hủy điều chỉnh ngày ' + change.date);
    return null;
  };

  return {
    handleAddSlot,
    handleUpdateSlot,
    handleDeleteSlot,
    handleReplaceClassSchedule,
    handleSaveScheduleChange,
    handleDeleteScheduleChange,
  };
}
