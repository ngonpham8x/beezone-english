import { showAlert } from '../../lib/dialogs';
import { toast } from '../../lib/toast';
import type { ScheduleChange, TimetableSlot, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

import { lessonsOn, validateRecurringChanges, validateScheduleChange } from '../../lib/operations';
import { findScheduleConflict } from '../../lib/schedule';
import { canManageAcademic } from '../../lib/permissions';
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
  const handleSaveSlots = (slots: TimetableSlot[]): string | null => {
    if (slots.some(slot => !canManageAcademic(currentUser, 'classes', timetableSlots.some(item => item.id === slot.id) ? 'edit' : 'add'))) return 'Bạn chưa được cấp quyền thêm hoặc sửa lịch học tương ứng.';
    if (!slots.length || new Set(slots.map(slot => slot.id)).size !== slots.length)
      return 'Danh sách ca học trống hoặc trùng mã.';
    const ids = new Set(slots.map(slot => slot.id));
    const next = [...timetableSlots.filter(slot => !ids.has(slot.id)), ...slots];
    for (const slot of slots) {
      if (!classes.some(item => item.id === slot.classId) ||
          !teachers.some(item => item.id === slot.teacherId) ||
          !rooms.some(item => item.id === slot.roomId && item.status === 'available'))
        return 'Chọn lớp, giáo viên và phòng học đang sử dụng trước khi lưu.';
      if (!['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'].includes(slot.dayOfWeek))
        return 'Ngày trong tuần không hợp lệ.';
      if (findScheduleConflict(next, slot)) return 'Ca học trùng giờ lớp, giáo viên hoặc phòng; kiểm tra lại các ngày đã chọn.';
    }
    const issue = validateRecurringChanges(classes, next, scheduleChanges);
    if (issue) return issue;
    const classIds = new Set([...slots.map(slot => slot.classId), ...timetableSlots.filter(slot => ids.has(slot.id)).map(slot => slot.classId)]);
    setTimetableSlots(next);
    setClasses(previous => previous.map(classroom => classIds.has(classroom.id) ? withClassScheduleSummary(classroom, next) : classroom));
    addLog('SỬA', 'Thời khóa biểu', `Lưu ${slots.length} ca học`);
    toast.success(`Đã lưu ${slots.length} ca học.`);
    return null;
  };
  // Timetable Handlers
  const handleAddSlot = (slot: TimetableSlot) => {
    if (!canManageAcademic(currentUser, 'classes', 'add')) return;
    const next = [...timetableSlots, slot];
    setTimetableSlots(next);
    setClasses((classrooms) =>
      classrooms.map((classroom) =>
        classroom.id === slot.classId ? withClassScheduleSummary(classroom, next) : classroom,
      ),
    );
    addLog('THÊM', 'Thời khóa biểu', `Thêm ca học mới vào ${slot.dayOfWeek} (${slot.startTime}-${slot.endTime})`);
    toast.success(`Thêm ca học mới vào ${slot.dayOfWeek} (${slot.startTime}-${slot.endTime}) thành công!`);
  };

  const handleUpdateSlot = (slot: TimetableSlot) => {
    if (!canManageAcademic(currentUser, 'classes')) return;
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
    toast.success(`Cập nhật ca học vào ${slot.dayOfWeek} thành công!`);
  };

  const handleDeleteSlot = (id: string) => {
    if (!canManageAcademic(currentUser, 'classes', 'delete')) return;
    if (scheduleChanges.some((c) => c.sourceSlotId === id)) {
      showAlert('Ca học có lịch nghỉ/học bù liên quan. Giữ ca gốc hoặc hủy điều chỉnh trước.');
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
    toast.success('Đã xóa ca học khỏi thời khóa biểu thành công!');
  };

  const handleReplaceClassSchedule = (classId: string, slots: TimetableSlot[]) => {
    const previous = timetableSlots.filter(slot => slot.classId === classId);
    if (slots.some(slot => !canManageAcademic(currentUser, 'classes', previous.some(item => item.id === slot.id) ? 'edit' : 'add')) ||
        previous.some(slot => !slots.some(item => item.id === slot.id) && !canManageAcademic(currentUser, 'classes', 'delete'))) return;
    const next = [...timetableSlots.filter((slot) => slot.classId !== classId), ...slots];
    setTimetableSlots(next);
    setClasses((classrooms) =>
      classrooms.map((classroom) =>
        classroom.id === classId ? withClassScheduleSummary(classroom, next) : classroom,
      ),
    );
  };

  const handleSaveScheduleChange = (change: ScheduleChange): string | null => {
    if (!canManageAcademic(currentUser, 'classes', scheduleChanges.some(item => item.id === change.id) ? 'edit' : 'add')) return 'Bạn chưa được cấp quyền thêm hoặc sửa lịch học tương ứng.';
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
    if (change.substituteTeacherId && !teachers.some((t) => t.id === change.substituteTeacherId))
      return 'Giáo viên dạy thay không tồn tại.';
    setScheduleChanges((prev) => [...prev.filter((item) => item.id !== change.id), change]);
    addLog('SỬA', 'Lịch theo ngày', change.kind + ': ' + change.date + ' · ' + change.reason);
    toast.success('Đã lưu thay đổi lịch học thành công!');
    return null;
  };
  const handleDeleteScheduleChange = (id: string): string | null => {
    if (!canManageAcademic(currentUser, 'classes', 'delete')) return 'Bạn chưa được cấp quyền xóa điều chỉnh lịch học.';
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
    toast.success('Đã hủy điều chỉnh lịch học thành công!');
    return null;
  };

  return {
    handleSaveSlots,
    handleAddSlot,
    handleUpdateSlot,
    handleDeleteSlot,
    handleReplaceClassSchedule,
    handleSaveScheduleChange,
    handleDeleteScheduleChange,
  };
}
