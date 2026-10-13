import { HorizontalScroll } from './HorizontalScroll';
import { DialogFrame } from './DialogFrame';
import { useResponsiveView } from '../hooks/useResponsive';
import React, { useState, useRef } from 'react';
import { TimetableSlot, ClassRoom, Teacher, Room } from '../types';
import {
  CalendarDays,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Edit,
  X,
  Save,
  UserCheck,
  DoorOpen,
  BookOpen,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface TimetableManagerProps {
  timetableSlots: TimetableSlot[];
  classes: ClassRoom[];
  teachers: Teacher[];
  rooms: Room[];
  isOwner: boolean;
  onAddSlot: (slot: TimetableSlot) => void;
  onUpdateSlot: (slot: TimetableSlot) => void;
  onDeleteSlot: (id: string) => void;
}

const normaliseTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})\s*:\s*(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const TimetableManager: React.FC<TimetableManagerProps> = ({
  timetableSlots,
  classes,
  teachers,
  rooms,
  isOwner,
  onAddSlot,
  onUpdateSlot,
  onDeleteSlot
}) => {
  const [viewMode, setViewMode] = useResponsiveView('day', 'week');
  const [selectedDay, setSelectedDay] = useState<string>('Thứ 2');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const canEdit = isOwner;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollTable = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        left: direction === 'left' ? 0 : Math.max(0, scrollContainerRef.current.scrollWidth - scrollContainerRef.current.clientWidth),
        behavior: 'smooth'
      });
    }
  };

  const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  const timeSlots = [...new Set([
    '07:00 - 09:00',
    '17:30 - 19:00',
    '18:00 - 19:30',
    '19:30 - 21:00',
    ...timetableSlots.map((slot) => `${slot.startTime} - ${slot.endTime}`),
  ])].sort((left, right) => left.localeCompare(right));

  // Conflict Detection Engine
  const checkConflict = (targetSlot: TimetableSlot): string | null => {
    const existing = timetableSlots.filter(s => s.id !== targetSlot.id);

    for (const slot of existing) {
      if (slot.dayOfWeek === targetSlot.dayOfWeek) {
        // Time overlap check
        const isTimeOverlap =
          (targetSlot.startTime >= slot.startTime && targetSlot.startTime < slot.endTime) ||
          (targetSlot.endTime > slot.startTime && targetSlot.endTime <= slot.endTime) ||
          (targetSlot.startTime <= slot.startTime && targetSlot.endTime >= slot.endTime);

        if (isTimeOverlap) {
          if (slot.teacherId === targetSlot.teacherId) {
            const gv = teachers.find(t => t.id === targetSlot.teacherId)?.name;
            return `Trùng giáo viên (${gv}) vào ${targetSlot.dayOfWeek} (${targetSlot.startTime}-${targetSlot.endTime})`;
          }
          if (slot.roomId === targetSlot.roomId) {
            const p = rooms.find(r => r.id === targetSlot.roomId)?.name;
            return `Trùng phòng học (${p}) vào ${targetSlot.dayOfWeek} (${targetSlot.startTime}-${targetSlot.endTime})`;
          }
          if (slot.classId === targetSlot.classId) {
            const c = classes.find(cl => cl.id === targetSlot.classId)?.name;
            return `Trùng lớp học (${c}) vào ${targetSlot.dayOfWeek} (${targetSlot.startTime}-${targetSlot.endTime})`;
          }
        }
      }
    }
    return null;
  };

  const handleOpenAdd = () => {
    const defaultClass = classes[0];
    setEditingSlot({
      id: `TT_${Date.now()}`,
      classId: defaultClass?.id || '',
      teacherId: defaultClass?.teacherId || teachers[0]?.id || '',
      roomId: defaultClass?.roomId || rooms[0]?.id || '',
      dayOfWeek: selectedDay,
      startTime: '18:00',
      endTime: '19:30'
    });
    setConflictError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (slot: TimetableSlot) => {
    setEditingSlot(slot);
    setConflictError(null);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;
    const startTime = normaliseTime(editingSlot.startTime);
    const endTime = normaliseTime(editingSlot.endTime);
    if (!startTime || !endTime || startTime >= endTime) {
      setConflictError('Nhập giờ dạng HH:MM; giờ kết thúc phải sau giờ bắt đầu.');
      return;
    }
    const normalizedSlot = { ...editingSlot, startTime, endTime };

    const conflict = checkConflict(normalizedSlot);
    if (conflict) {
      setConflictError(conflict);
      return;
    }

    if (timetableSlots.some(s => s.id === normalizedSlot.id)) {
      onUpdateSlot(normalizedSlot);
    } else {
      onAddSlot(normalizedSlot);
    }

    setIsModalOpen(false);
    setEditingSlot(null);
    setConflictError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-amber-600" />
            Thời Khóa Biểu Trung Tâm
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Hệ thống tự động kiểm tra chống trùng lịch Giáo viên, Phòng học & Lớp học
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode switch */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              aria-pressed={viewMode === 'week'} onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'week' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-600'
              }`}
            >
              Xem Theo Tuần
            </button>
            <button
              aria-pressed={viewMode === 'day'} onClick={() => setViewMode('day')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'day' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-600'
              }`}
            >
              Xem Theo Ngày
            </button>
          </div>

          {canEdit && (
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4 text-slate-950" />
              Tạo Ca Học
            </button>
          )}
        </div>
      </div>

      {/* Day Selector & Quick Navigation Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5 max-w-full">
          <button
            aria-pressed={viewMode === 'week'} onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              viewMode === 'week'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            🗓️ Toàn Tuần (Thứ 2 → CN)
          </button>
          {daysOfWeek.map((day) => {
            const count = timetableSlots.filter(s => s.dayOfWeek === day).length;
            const isSelected = viewMode === 'day' && selectedDay === day;
            return (
              <button
                key={day}
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedDay(day);
                  setViewMode('day');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-sm ring-2 ring-amber-400/50'
                    : 'bg-slate-50 text-slate-700 hover:bg-amber-50 hover:text-amber-900 border border-slate-200/80'
                }`}
              >
                <span>{day}</span>
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected ? 'bg-slate-950 text-white' : 'bg-amber-100 text-amber-900'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {viewMode === 'week' && (
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

      {/* TIMETABLE GRID TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <HorizontalScroll label="Thời khóa biểu" ref={scrollContainerRef} className="overflow-x-auto custom-scrollbar">
          <table className={`w-full table-fixed text-left border-collapse text-xs ${viewMode === 'week' ? 'min-w-[980px]' : 'min-w-[280px]'}`}>
            <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold">
              <tr>
                <th className="py-3 px-2 border-b border-slate-700 w-32 sticky left-0 z-20 bg-slate-800 shadow-xs text-center">
                  Ca Học / Giờ
                </th>
                {(viewMode === 'week' ? daysOfWeek : [selectedDay]).map((day) => (
                  <th key={day} className="py-3 px-2 border-b border-slate-700 text-center">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              {timeSlots.map((timeRange) => {
                const [start, end] = timeRange.split(' - ');

                return (
                  <tr key={timeRange} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-2 bg-slate-100/95 font-bold text-red-900 border-r border-slate-200 sticky left-0 z-10 shadow-xs">
                      <div className="flex items-center gap-1.5 justify-center">
                        <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                        <span className="font-mono text-[11px]">{timeRange}</span>
                      </div>
                    </td>

                    {(viewMode === 'week' ? daysOfWeek : [selectedDay]).map((day) => {
                      const matchedSlots = timetableSlots.filter(
                        s => s.dayOfWeek === day && s.startTime === start
                      );

                      return (
                        <td key={day} className="p-1.5 border-r border-slate-100 align-top h-28">
                          {matchedSlots.length === 0 ? (
                            <div className="h-full border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-[10px] text-slate-300">
                              Trống ca
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {matchedSlots.map((slot) => {
                                const cls = classes.find(c => c.id === slot.classId);
                                const teacher = teachers.find(t => t.id === slot.teacherId);
                                const room = rooms.find(r => r.id === slot.roomId);

                                return (
                                  <div
                                    key={slot.id}
                                    className="p-2 bg-gradient-to-br from-red-50 to-amber-50/50 border border-red-200 rounded-xl shadow-2xs relative group text-[11px]"
                                  >
                                    <div className="font-bold text-red-900 flex items-center justify-between">
                                      <span className="truncate">{cls?.name || 'Lớp học'}</span>
                                      {canEdit && (
                                        <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                          <button onClick={() => handleOpenEdit(slot)} className="text-slate-400 hover:text-amber-600" title="Sửa ca"><Edit className="w-3 h-3" /></button>
                                          <button onClick={() => onDeleteSlot(slot.id)} className="text-slate-400 hover:text-rose-600" title="Xóa ca"><Trash2 className="w-3 h-3" /></button>
                                        </span>
                                      )}
                                    </div>

                                    <div className="text-[10px] text-slate-700 mt-1 space-y-0.5">
                                      <div className="flex items-center gap-1">
                                        <UserCheck className="w-3 h-3 text-amber-600 flex-shrink-0" /> <span className="truncate">{teacher?.name}</span>
                                      </div>
                                      <div className="flex items-center gap-1 font-semibold text-blue-800">
                                        <DoorOpen className="w-3 h-3 text-blue-600 flex-shrink-0" /> <span className="truncate">{room?.name}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </HorizontalScroll>
      </div>

      {/* ADD SLOT MODAL WITH CONFLICT CHECKER */}
      {isModalOpen && editingSlot && (
        <DialogFrame label="Ca học" onClose={() => {
                setIsModalOpen(false);
                setEditingSlot(null);
                setConflictError(null);
              }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-h-[90vh] max-w-md w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative custom-scrollbar">
            <button aria-label="Đóng"
              onClick={() => {
                setIsModalOpen(false);
                setEditingSlot(null);
                setConflictError(null);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-amber-600" />
              {timetableSlots.some((slot) => slot.id === editingSlot.id) ? 'Cập Nhật Lịch Học' : 'Tạo Lịch Học Mới'}
            </h3>

            {conflictError && (
              <div className="p-3 mb-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{conflictError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lớp Học *</label>
                <select
                  value={editingSlot.classId}
                  onChange={(e) => {
                    const selectedCls = classes.find(c => c.id === e.target.value);
                    setEditingSlot({
                      ...editingSlot,
                      classId: e.target.value,
                      teacherId: selectedCls?.teacherId || editingSlot.teacherId,
                      roomId: selectedCls?.roomId || editingSlot.roomId
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  required
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giáo Viên Dạy</label>
                  <select
                    value={editingSlot.teacherId}
                    onChange={(e) => setEditingSlot({ ...editingSlot, teacherId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phòng Học</label>
                  <select
                    value={editingSlot.roomId}
                    onChange={(e) => setEditingSlot({ ...editingSlot, roomId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Thứ Trong Tuần</label>
                  <select
                    value={editingSlot.dayOfWeek}
                    onChange={(e) => setEditingSlot({ ...editingSlot, dayOfWeek: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    {daysOfWeek.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giờ Bắt Đầu</label>
                  <input type="text" inputMode="numeric" value={editingSlot.startTime} onChange={(e) => setEditingSlot({ ...editingSlot, startTime: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-xl" placeholder="Ví dụ: 17:00" required />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Giờ Kết Thúc</label>
                <input type="text" inputMode="numeric" value={editingSlot.endTime} onChange={(e) => setEditingSlot({ ...editingSlot, endTime: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-xl" placeholder="Ví dụ: 19:00" required />
                <p className="mt-1 text-[11px] text-slate-500">Tự gõ mọi khung giờ theo dạng HH:MM, ví dụ Chủ Nhật 07:00–09:00.</p>
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
                  className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold hover:bg-amber-600 flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Save className="w-4 h-4 text-slate-950" /> Lưu Ca Học
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}
    </div>
  );
};
