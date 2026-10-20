import { ConfirmedForm } from '../../components/ConfirmedForm';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  Edit,
  Plus,
  Printer,
  Save,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { DialogFrame } from '../../components/DialogFrame';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { TeacherAvatar } from '../../components/TeacherAvatar';
import { useResponsiveView } from '../../hooks/useResponsive';
import { centerDate } from '../../lib/dates';
import { validateRecurringChanges } from '../../lib/operations';
import type { AttendanceSession, ScheduleChange, StaffPermissions } from '../../types';
import { academicPermission } from '../../lib/permissions';
import { ClassRoom, Room, Teacher, TimetableSlot } from '../../types';
import { ScheduleChangesManager } from './ScheduleChangesManager';

interface TeacherScheduleMatrixProps {
  scheduleChanges?: ScheduleChange[];
  attendanceSessions?: AttendanceSession[];
  teachers: Teacher[];
  timetableSlots: TimetableSlot[];
  classes: ClassRoom[];
  rooms: Room[];
  isOwner?: boolean;
  canManage?: boolean;
  permissions?: StaffPermissions;
  onAddSlot?: (slot: TimetableSlot) => void;
  onSaveSlots?: (slots: TimetableSlot[]) => string | null;
  onUpdateSlot?: (slot: TimetableSlot) => void;
  onDeleteSlot?: (id: string) => void;
  onSaveChange?: (change: ScheduleChange) => string | null;
  onDeleteChange?: (id: string) => string | null;
  onCreateClass?: (c: ClassRoom) => void;
  onCreateTeacher?: (t: Teacher) => void;
  onCreateRoom?: (r: Room) => void;
}

const normaliseTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})\s*:\s*(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const TeacherScheduleMatrix: React.FC<TeacherScheduleMatrixProps> = ({
  teachers,
  timetableSlots,
  classes,
  rooms,
  scheduleChanges,
  attendanceSessions = [],
  isOwner = false,
  canManage = false,
  permissions,
  onAddSlot,
  onSaveSlots,
  onUpdateSlot,
  onDeleteSlot,
  onSaveChange,
  onDeleteChange,
  onCreateClass,
  onCreateTeacher,
  onCreateRoom,
}) => {
  const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  const todayDay = days[(new Date(`${centerDate()}T12:00:00`).getDay() + 6) % 7];
  const [selectedDay, setSelectedDay] = useResponsiveView<string>(todayDay, 'all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const canEdit = isOwner || (permissions ? academicPermission(permissions, 'classes', 'edit') : canManage);
  const canAdd = isOwner || (permissions ? academicPermission(permissions, 'classes', 'add') : canManage);
  const canDelete = isOwner || (permissions ? academicPermission(permissions, 'classes', 'delete') : canManage);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Thứ 2']);
  const [slotToDelete, setSlotToDelete] = useState<TimetableSlot | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [isQuickClassOpen, setIsQuickClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [isQuickTeacherOpen, setIsQuickTeacherOpen] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherPhone, setNewTeacherPhone] = useState('');
  const [isQuickRoomOpen, setIsQuickRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');

  const checkConflict = (targetSlot: TimetableSlot): string | null => {
    const existing = timetableSlots.filter((s) => s.id !== targetSlot.id);

    for (const slot of existing) {
      if (slot.dayOfWeek === targetSlot.dayOfWeek) {
        const isTimeOverlap =
          (targetSlot.startTime >= slot.startTime && targetSlot.startTime < slot.endTime) ||
          (targetSlot.endTime > slot.startTime && targetSlot.endTime <= slot.endTime) ||
          (targetSlot.startTime <= slot.startTime && targetSlot.endTime >= slot.endTime);

        if (isTimeOverlap) {
          if (slot.teacherId === targetSlot.teacherId) {
            const gv = teachers.find((t) => t.id === targetSlot.teacherId)?.name;
            return `Trùng giáo viên (${gv}) vào ${targetSlot.dayOfWeek} (${targetSlot.startTime}-${targetSlot.endTime})`;
          }
          if (slot.roomId === targetSlot.roomId) {
            const p = rooms.find((r) => r.id === targetSlot.roomId)?.name;
            return `Trùng phòng học (${p}) vào ${targetSlot.dayOfWeek} (${targetSlot.startTime}-${targetSlot.endTime})`;
          }
          if (slot.classId === targetSlot.classId) {
            const c = classes.find((cl) => cl.id === targetSlot.classId)?.name;
            return `Trùng lớp học (${c}) vào ${targetSlot.dayOfWeek} (${targetSlot.startTime}-${targetSlot.endTime})`;
          }
        }
      }
    }
    return validateRecurringChanges(classes, [...existing, targetSlot], scheduleChanges || []);
  };


  const handleQuickCreateClass = () => {
    if (!newClassName.trim()) return;
    const newClass: ClassRoom = {
      id: `CLASS_${Date.now()}`,
      code: `LOP-${String(classes.length + 1).padStart(2, '0')}`,
      name: newClassName.trim(),
      capacity: 20,
      programId: '',
      teacherId: editingSlot?.teacherId || '',
      roomId: editingSlot?.roomId || '',
      days: [],
      scheduleTime: '',
      studentIds: [],
      courseStatus: 'active',
      billingMode: 'course',
    };
    onCreateClass?.(newClass);
    if (editingSlot) setEditingSlot({ ...editingSlot, classId: newClass.id });
    setNewClassName('');
    setIsQuickClassOpen(false);
  };

  const handleQuickCreateTeacher = () => {
    if (!newTeacherName.trim()) return;
    const newTeacher: Teacher = {
      id: `T_${Date.now()}`,
      name: newTeacherName.trim(),
      phone: newTeacherPhone.trim() || 'Chưa cập nhật',
      address: '',
      email: '',
      specialty: 'Tiếng Anh',
      assignedClassIds: [],
    };
    onCreateTeacher?.(newTeacher);
    if (editingSlot) setEditingSlot({ ...editingSlot, teacherId: newTeacher.id });
    setNewTeacherName('');
    setIsQuickTeacherOpen(false);
  };

  const handleQuickCreateRoom = () => {
    if (!newRoomName.trim()) return;
    const newRoom: Room = {
      id: `R_${Date.now()}`,
      name: newRoomName.trim(),
      capacity: 20,
      status: 'available',
    };
    onCreateRoom?.(newRoom);
    if (editingSlot) setEditingSlot({ ...editingSlot, roomId: newRoom.id });
    setNewRoomName('');
    setIsQuickRoomOpen(false);
  };

  const handleOpenAdd = (teacherId?: string, day?: string) => {
    const defaultClass = classes[0];
    const defaultDay = day || (selectedDay !== 'all' ? selectedDay : 'Thứ 2');
    setEditingSlot({
      id: `TT_${Date.now()}`,
      classId: defaultClass?.id || '',
      teacherId: teacherId || defaultClass?.teacherId || teachers[0]?.id || '',
      roomId: defaultClass?.roomId || rooms[0]?.id || '',
      dayOfWeek: defaultDay,
      startTime: '18:00',
      endTime: '19:30',
    });
    setSelectedDays([defaultDay]);
    setConflictError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (slot: TimetableSlot) => {
    setEditingSlot(slot);
    setSelectedDays([slot.dayOfWeek]);
    setConflictError(null);
    setIsModalOpen(true);
  };

    const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot || (timetableSlots.some(item => item.id === editingSlot.id) ? !canEdit : !canAdd)) return;
    if (selectedDays.length === 0) {
      setConflictError('Vui lòng tích chọn ít nhất một ngày dạy trong tuần.');
      return;
    }
    const startTime = normaliseTime(editingSlot.startTime);
    const endTime = normaliseTime(editingSlot.endTime);
    if (!startTime || !endTime || startTime >= endTime) {
      setConflictError('Nhập giờ dạng HH:MM; giờ kết thúc phải sau giờ bắt đầu.');
      return;
    }

    if (onSaveSlots) {
      const existing = timetableSlots.some(slot => slot.id === editingSlot.id);
      const slots = selectedDays.map((dayOfWeek, index) => ({
        ...editingSlot, startTime, endTime, dayOfWeek,
        id: existing && index === 0 ? editingSlot.id : 'TT_' + crypto.randomUUID(),
      }));
      const issue = onSaveSlots(slots);
      if (issue) { setConflictError(issue); return; }
      setIsModalOpen(false);
      setEditingSlot(null);
      setConflictError(null);
      return;
    }

    const isExisting = timetableSlots.some((slot) => slot.id === editingSlot.id);

    if (isExisting) {
      const firstDay = selectedDays[0];
      const normalizedSlot = { ...editingSlot, startTime, endTime, dayOfWeek: firstDay };
      const conflict = checkConflict(normalizedSlot);
      if (conflict) {
        setConflictError(`Trùng lịch vào ${firstDay}: ${conflict}`);
        return;
      }

      const additionalSlots: TimetableSlot[] = [];
      for (let i = 1; i < selectedDays.length; i++) {
        const extraDay = selectedDays[i];
        const extraSlot: TimetableSlot = {
          ...normalizedSlot,
          id: `TT_${Date.now()}_${i}`,
          dayOfWeek: extraDay,
        };
        const extraConflict = checkConflict(extraSlot);
        if (extraConflict) {
          setConflictError(`Trùng lịch vào ${extraDay}: ${extraConflict}`);
          return;
        }
        additionalSlots.push(extraSlot);
      }

      onUpdateSlot?.(normalizedSlot);
      additionalSlots.forEach((slot) => onAddSlot?.(slot));
    } else {
      const slotsToAdd: TimetableSlot[] = [];
      for (let i = 0; i < selectedDays.length; i++) {
        const d = selectedDays[i];
        const newSlot: TimetableSlot = {
          ...editingSlot,
          id: `TT_${Date.now()}_${i}`,
          dayOfWeek: d,
          startTime,
          endTime,
        };
        const conflict = checkConflict(newSlot);
        if (conflict) {
          setConflictError(`Trùng lịch vào ${d}: ${conflict}`);
          return;
        }
        slotsToAdd.push(newSlot);
      }

      slotsToAdd.forEach((slot) => onAddSlot?.(slot));
    }

    setIsModalOpen(false);
    setEditingSlot(null);
    setConflictError(null);
  };

  const scrollTable = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        left:
          direction === 'left'
            ? 0
            : Math.max(
                0,
                scrollContainerRef.current.scrollWidth - scrollContainerRef.current.clientWidth,
              ),
        behavior: 'smooth',
      });
    }
  };

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = `BEEZONE_LichGiangDay_${centerDate()}`;
    document.body.dataset.printing = 'teacher-schedule';
    const pageStyle = document.createElement('style');
    pageStyle.id = 'teacher-schedule-page-style';
    pageStyle.textContent = '@page { size: A4 landscape; margin: 7mm; }';
    document.head.appendChild(pageStyle);
    const cleanup = () => {
      delete document.body.dataset.printing;
      pageStyle.remove();
      document.title = prevTitle;
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  const displayedDays = selectedDay === 'all' ? days : [selectedDay];

  return (
    <div data-print-teacher-schedule className="teacher-print-schedule space-y-6 print:m-0 print:p-0">
      {scheduleChanges && (
        <div className="print:hidden">
          <ScheduleChangesManager
            classes={classes}
            slots={timetableSlots}
            changes={scheduleChanges}
            teachers={teachers}
            rooms={rooms}
            attendance={attendanceSessions}
            permissions={permissions}
            isOwner={isOwner}
            canManage={canManage}
            onSave={onSaveChange || (() => 'Chỉ Chủ trung tâm được đổi lịch.')}
            onDelete={onDeleteChange || (() => 'Chỉ Chủ trung tâm được đổi lịch.')}
          />
          <p className="mt-2 text-xs text-slate-500">
            Ma trận bên dưới là lịch tuần lặp lại; lịch thực tế phía trên đã tính buổi nghỉ và học bù.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-amber-600" />
            Bảng Lịch Giảng Dạy Giáo Viên (Excel Grid View)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Trực quan hóa ca dạy của tất cả giáo viên dưới dạng Ma Trận Excel chuẩn. Bạn có thể thêm, chỉnh sửa hoặc xóa ca dạy trực tiếp tại đây.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canAdd && onAddSlot && (
            <button
              onClick={() => handleOpenAdd()}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" /> Thêm Ca Dạy
            </button>
          )}

          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Printer className="w-4 h-4 text-amber-400" /> In Lịch Dạy
          </button>
        </div>
      </div>

      {/* Day Selector Bar & Scroll Shortcuts */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5 max-w-full">
          <button
            onClick={() => setSelectedDay('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedDay === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            🗓️ Toàn Tuần (Thứ 2 → CN)
          </button>
          {days.map((day) => {
            const count = timetableSlots.filter((s) => s.dayOfWeek === day).length;
            const isSelected = selectedDay === day;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-sm ring-2 ring-amber-400/50'
                    : 'bg-slate-50 text-slate-700 hover:bg-amber-50 hover:text-amber-900 border border-slate-200/80'
                }`}
              >
                <span>{day}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected ? 'bg-slate-950 text-white' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedDay === 'all' && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Cuộn nhanh:</span>
            <button
              onClick={() => scrollTable('left')}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-slate-200"
              title="Cuộn về đầu tuần (Thứ 2 - Thứ 4)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="text-[11px]">Đầu tuần</span>
            </button>
            <button
              onClick={() => scrollTable('right')}
              className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-amber-300"
              title="Cuộn xem cuối tuần (Thứ 7 & Chủ Nhật)"
            >
              <span className="text-[11px]">Thứ 7 & CN</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* EXCEL GRID MATRIX TABLE */}
      <div className="teacher-print-shell bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="teacher-print-heading p-4 bg-slate-950 text-white border-b border-amber-500/30 flex justify-between items-center print:bg-white print:text-slate-900">
          <div>
            <h3 className="font-extrabold text-base uppercase tracking-wider text-amber-400">TRUNG TÂM NGOẠI NGỮ BEEZONE</h3>
            <p className="text-xs text-slate-200 font-medium">BẢNG LỊCH PHÂN CÔNG GIẢNG DẠY</p>
          </div>
          <span className="text-xs text-amber-200/80 italic">Cập nhật: {centerDate().slice(0, 4)}</span>
        </div>

        <HorizontalScroll label="Lịch giáo viên" ref={scrollContainerRef} className="teacher-print-table-wrap overflow-x-auto custom-scrollbar">
          <table className={`teacher-print-table w-full text-xs text-left border-collapse border border-slate-300 ${selectedDay === 'all' ? 'min-w-[1100px]' : 'min-w-full'}`}>
            <thead>
              <tr className="bg-amber-400 text-slate-950 uppercase text-[11px] font-black border-b border-amber-500">
                <th className="py-3 px-4 border-r border-amber-500 w-44 min-w-[150px] md:sticky left-0 z-20 bg-amber-400 text-slate-950 shadow-xs">
                  Giáo Viên
                </th>
                {displayedDays.map((d) => (
                  <th key={d} className="py-3 px-3 border-r border-amber-500 text-center min-w-[135px]">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-medium">
              {teachers.map((teacher) => (
                <tr key={teacher.id} className="teacher-print-row hover:bg-slate-50">
                  <td className="py-3 px-4 bg-slate-100 font-bold text-slate-900 border-r border-slate-300 md:sticky left-0 z-10 shadow-xs whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <TeacherAvatar teacher={teacher} className="h-7 w-7 text-[9px]" />
                      <div>
                        <div>{teacher.name}</div>
                        <div className="text-[10px] text-amber-700 font-bold">{teacher.specialty}</div>
                      </div>
                    </div>
                  </td>

                  {displayedDays.map((day) => {
                    const slots = timetableSlots.filter(
                      (s) => s.teacherId === teacher.id && s.dayOfWeek === day,
                    );

                    return (
                      <td key={day} className="group/cell p-2 border-r border-slate-300 align-top h-24 min-w-[135px]">
                        {slots.length === 0 ? (
                          <div className="min-h-[60px] flex flex-col items-center justify-center">
                            <span className="text-[10px] text-slate-300 italic group-hover/cell:hidden">-</span>
                            {canAdd && onAddSlot && (
                              <button
                                onClick={() => handleOpenAdd(teacher.id, day)}
                                className="inline-flex items-center gap-1 px-2 py-2 text-[10px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded transition"
                                title={`Thêm ca dạy cho ${teacher.name} vào ${day}`}
                              >
                                <Plus className="w-3 h-3 text-amber-600" /> Ca dạy
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {slots.map((s) => {
                              const cls = classes.find((c) => c.id === s.classId);
                              const room = rooms.find((r) => r.id === s.roomId);

                              return (
                                <div
                                  key={s.id}
                                  className="group/slot relative teacher-print-slot p-2 bg-amber-50/90 hover:bg-amber-100/90 border border-amber-300 rounded-lg text-[10px] shadow-2xs transition-colors"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-1">
                                    <div className="font-bold font-mono text-slate-900">
                                      {cls?.code || 'LỚP'} ({s.startTime}–{s.endTime})
                                    </div>
                                    {(canEdit || canDelete) && (
                                      <div className="flex items-center gap-0.5 print:hidden">
                                        {canEdit && onUpdateSlot && (
                                          <button
                                            onClick={() => handleOpenEdit(s)}
                                            className="p-2 text-amber-800 hover:bg-amber-200/60 rounded transition"
                                            title="Sửa ca dạy"
                                            aria-label="Sửa ca dạy"
                                          >
                                            <Edit className="w-3 h-3" />
                                          </button>
                                        )}
                                        {canDelete && onDeleteSlot && (
                                          <button
                                            onClick={() => setSlotToDelete(s)}
                                            className="p-2 text-rose-700 hover:bg-rose-100 rounded transition"
                                            title="Xóa ca dạy"
                                            aria-label="Xóa ca dạy"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-slate-700 font-medium truncate">{cls?.name || 'Chưa chọn lớp'}</div>
                                  <div className="text-blue-800 font-bold mt-0.5 flex items-center gap-1">
                                    <DoorOpen className="w-3 h-3" />
                                    <span>{room?.name || 'Chưa xếp phòng'}</span>
                                  </div>
                                </div>
                              );
                            })}

                            {canAdd && onAddSlot && (
                              <div className="text-center pt-1 print:hidden">
                                <button
                                  onClick={() => handleOpenAdd(teacher.id, day)}
                                  className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 hover:bg-amber-100 px-2 py-2 rounded border border-dashed border-amber-300 transition"
                                  title={`Thêm ca dạy tiếp cho ${teacher.name}`}
                                >
                                  + Thêm ca
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScroll>
      </div>

      {/* Add / Edit Timetable Slot Modal */}
      {isModalOpen && editingSlot && (
        <DialogFrame
          label={timetableSlots.some((slot) => slot.id === editingSlot.id) ? 'Cập Nhật Lịch Dạy' : 'Tạo Lịch Dạy Mới'}
          onClose={() => {
            setIsModalOpen(false);
            setEditingSlot(null);
            setConflictError(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="dialog-panel relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setEditingSlot(null);
                setConflictError(null);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-amber-600" />
              {timetableSlots.some((slot) => slot.id === editingSlot.id) ? 'Cập Nhật Ca Dạy' : 'Tạo Ca Dạy Mới'}
            </h3>

            {conflictError && (
              <div className="p-3 mb-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{conflictError}</span>
              </div>
            )}

            <ConfirmedForm confirmWhen={timetableSlots.some(item => item.id === editingSlot.id)} entityLabel="lịch học" onSubmit={handleSaveSlot} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="font-semibold text-slate-700 text-xs">Lớp Học *</label>
                  {onCreateClass && (
                    <button
                      type="button"
                      onClick={() => setIsQuickClassOpen(o => !o)}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
                    >
                      + Tạo lớp mới
                    </button>
                  )}
                </div>
                <select
                  value={editingSlot.classId}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      setIsQuickClassOpen(true);
                      return;
                    }
                    const selectedCls = classes.find((c) => c.id === e.target.value);
                    setEditingSlot({
                      ...editingSlot,
                      classId: e.target.value,
                      teacherId: selectedCls?.teacherId || editingSlot.teacherId,
                      roomId: selectedCls?.roomId || editingSlot.roomId,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                  required
                >
                  <option value="">-- Chọn lớp học --</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                  {onCreateClass && <option value="__NEW__">➕ Tạo lớp học mới...</option>}
                </select>
                {isQuickClassOpen && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-amber-950">Tạo nhanh lớp học</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Tên lớp mới (VD: Kiddy 2A)"
                        value={newClassName}
                        onChange={e => setNewClassName(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleQuickCreateClass}
                        className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg shadow-2xs cursor-pointer"
                      >
                        Tạo
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="font-semibold text-slate-700 text-xs">Giáo Viên Dạy</label>
                    {onCreateTeacher && (
                      <button
                        type="button"
                        onClick={() => setIsQuickTeacherOpen(o => !o)}
                        className="text-[10px] font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
                      >
                        + Mới
                      </button>
                    )}
                  </div>
                  <select
                    value={editingSlot.teacherId}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsQuickTeacherOpen(true);
                        return;
                      }
                      setEditingSlot({ ...editingSlot, teacherId: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="">-- Chọn GV --</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                    {onCreateTeacher && <option value="__NEW__">➕ Tạo giáo viên mới...</option>}
                  </select>
                  {isQuickTeacherOpen && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-300 rounded-xl space-y-1.5">
                      <input
                        type="text"
                        placeholder="Tên GV (VD: Cô Mai)"
                        value={newTeacherName}
                        onChange={e => setNewTeacherName(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setIsQuickTeacherOpen(false)} className="px-2 py-1 text-[11px] text-slate-600">Đóng</button>
                        <button type="button" onClick={handleQuickCreateTeacher} className="px-2.5 py-1 text-[11px] font-bold text-white bg-amber-600 rounded-lg">Lưu</button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="font-semibold text-slate-700 text-xs">Phòng Học</label>
                    {onCreateRoom && (
                      <button
                        type="button"
                        onClick={() => setIsQuickRoomOpen(o => !o)}
                        className="text-[10px] font-bold text-blue-700 hover:text-blue-900 cursor-pointer"
                      >
                        + Mới
                      </button>
                    )}
                  </div>
                  <select
                    value={editingSlot.roomId}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsQuickRoomOpen(true);
                        return;
                      }
                      setEditingSlot({ ...editingSlot, roomId: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="">-- Chọn phòng --</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    {onCreateRoom && <option value="__NEW__">➕ Tạo phòng học mới...</option>}
                  </select>
                  {isQuickRoomOpen && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-300 rounded-xl space-y-1.5">
                      <input
                        type="text"
                        placeholder="Tên phòng (VD: P.103)"
                        value={newRoomName}
                        onChange={e => setNewRoomName(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setIsQuickRoomOpen(false)} className="px-2 py-1 text-[11px] text-slate-600">Đóng</button>
                        <button type="button" onClick={handleQuickCreateRoom} className="px-2.5 py-1 text-[11px] font-bold text-white bg-blue-700 rounded-lg">Lưu</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <label className="font-semibold text-slate-700 text-xs flex items-center gap-1.5">
                    <span>Tích chọn các ngày dạy trong tuần *</span>
                    <span className="text-[11px] font-normal text-slate-500">
                      ({selectedDays.length} ngày đã chọn)
                    </span>
                  </label>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedDays(['Thứ 2', 'Thứ 4', 'Thứ 6'])}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
                    >
                      2-4-6
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDays(['Thứ 3', 'Thứ 5', 'Thứ 7'])}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
                    >
                      3-5-7
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDays(['Thứ 7', 'Chủ Nhật'])}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
                    >
                      T7-CN
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDays([...days])}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
                    >
                      Tất cả
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  {days.map((d) => {
                    const isChecked = selectedDays.includes(d);
                    return (
                      <label
                        key={d}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition border select-none ${
                          isChecked
                            ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedDays(selectedDays.filter((item) => item !== d));
                            } else {
                              setSelectedDays([...selectedDays, d]);
                            }
                          }}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
                        />
                        <span className="text-xs">{d}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giờ Bắt Đầu</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editingSlot.startTime}
                    onChange={(e) => setEditingSlot({ ...editingSlot, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    placeholder="Ví dụ: 18:00"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giờ Kết Thúc</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editingSlot.endTime}
                    onChange={(e) => setEditingSlot({ ...editingSlot, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    placeholder="Ví dụ: 19:30"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingSlot(null);
                    setConflictError(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" /> Lưu Ca Dạy
                </button>
              </div>
            </ConfirmedForm>
          </div>
        </DialogFrame>
      )}

      {/* Delete Slot Confirmation Modal */}
      <ConfirmModal
        isOpen={!!slotToDelete}
        title="Xác nhận xóa ca dạy"
        message={
          slotToDelete ? (
            <>
              Bạn có chắc chắn muốn xóa ca dạy <strong>{slotToDelete.dayOfWeek} ({slotToDelete.startTime}–{slotToDelete.endTime})</strong> của lớp{' '}
              <strong>{classes.find((c) => c.id === slotToDelete.classId)?.name || slotToDelete.classId}</strong>?
            </>
          ) : null
        }
        confirmText="Xác nhận xóa"
        cancelText="Hủy bỏ"
        variant="danger"
        onConfirm={() => {
          if (slotToDelete) {
            onDeleteSlot?.(slotToDelete.id);
            setSlotToDelete(null);
          }
        }}
        onClose={() => setSlotToDelete(null)}
      />
    </div>
  );
};
