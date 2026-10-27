import { showAlert } from '../../lib/dialogs';
import { toast } from '../../lib/toast';
import type { ScheduleChange, TimetableSlot, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

import { lessonsOn, validateRecurringChanges, validateScheduleChange } from '../../lib/operations';
import { findScheduleConflict, linkedTimetableSlots } from '../../lib/schedule';
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
    const teacherByClass = new Map<string, string>();
    for (const slot of slots) {
      const assignedTeacher = teacherByClass.get(slot.classId);
      if (assignedTeacher && assignedTeacher !== slot.teacherId)
        return 'Các ca học định kỳ của cùng một lớp phải dùng cùng giáo viên phụ trách.';
      teacherByClass.set(slot.classId, slot.teacherId);
    }
    if ([...teacherByClass].some(([classId, teacherId]) =>
      classes.find((classroom) => classroom.id === classId)?.teacherId !== teacherId &&
      !canManageAcademic(currentUser, 'classes', 'edit')))
      return 'Cần quyền sửa lớp học để đồng bộ giáo viên phụ trách với thời khóa biểu.';
    const ids = new Set(slots.map(slot => slot.id));
    const next = [...timetableSlots.filter(slot => !ids.has(slot.id)), ...slots].map((slot) => {
      const teacherId = teacherByClass.get(slot.classId);
      return teacherId && slot.teacherId !== teacherId ? { ...slot, teacherId } : slot;
    });
    for (const slot of slots) {
      if (!classes.some(item => item.id === slot.classId) ||
          !teachers.some(item => item.id === slot.teacherId) ||
          !rooms.some(item => item.id === slot.roomId && item.status === 'available'))
        return 'Chọn lớp, giáo viên và phòng học đang sử dụng trước khi lưu.';
      if (!['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'].includes(slot.dayOfWeek))
        return 'Ngày trong tuần không hợp lệ.';
    }
    const classIds = new Set([...teacherByClass.keys(), ...timetableSlots.filter(slot => ids.has(slot.id)).map(slot => slot.classId)]);
    const nextClasses = classes.map((classroom) => {
      const teacherId = teacherByClass.get(classroom.id);
      const linkedClassroom = teacherId ? { ...classroom, teacherId } : classroom;
      return classIds.has(classroom.id) ? withClassScheduleSummary(linkedClassroom, next) : classroom;
    });
    const activeNext = linkedTimetableSlots(nextClasses, next);
    if (activeNext.some((slot) => findScheduleConflict(activeNext, slot)))
      return 'Ca học trùng giờ lớp, giáo viên hoặc phòng; kiểm tra lại các ngày đã chọn.';
    const issue = validateRecurringChanges(nextClasses, next, scheduleChanges);
    if (issue) return issue;
    setTimetableSlots(next);
    setClasses(nextClasses);
    addLog('SỬA', 'Thời khóa biểu', `Lưu ${slots.length} ca học`);
    toast.success(`Đã lưu ${slots.length} ca học.`);
    return null;
  };
  // Timetable Handlers
  const handleAddSlot = (slot: TimetableSlot) => {
    const issue = handleSaveSlots([slot]);
    if (issue) showAlert(issue);
  };

  const handleUpdateSlot = (slot: TimetableSlot) => {
    const issue = handleSaveSlots([slot]);
    if (issue) showAlert(issue);
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
    const teacherIds = new Set(slots.map((slot) => slot.teacherId));
    if (teacherIds.size > 1) {
      showAlert('Các ca học định kỳ của cùng một lớp phải dùng cùng giáo viên phụ trách.');
      return;
    }
    const next = [...timetableSlots.filter((slot) => slot.classId !== classId), ...slots];
    const nextClasses = classes.map((classroom) => {
      if (classroom.id !== classId) return classroom;
      const teacherId = slots[0]?.teacherId;
      return withClassScheduleSummary(teacherId ? { ...classroom, teacherId } : classroom, next);
    });
    const activeNext = linkedTimetableSlots(nextClasses, next);
    if (activeNext.some((slot) => findScheduleConflict(activeNext, slot))) {
      showAlert('Ca học trùng giờ lớp, giáo viên hoặc phòng; kiểm tra lại lịch trước khi lưu.');
      return;
    }
    const issue = validateRecurringChanges(nextClasses, next, scheduleChanges);
    if (issue) {
      showAlert(issue);
      return;
    }
    setTimetableSlots(next);
    setClasses(nextClasses);
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
