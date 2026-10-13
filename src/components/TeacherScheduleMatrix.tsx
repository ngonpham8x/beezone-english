import { centerDate } from '../lib/dates';
import { useResponsiveView } from '../hooks/useResponsive';
import React, { useState, useRef } from 'react';
import { Teacher, TimetableSlot, ClassRoom, Room } from '../types';
import { CalendarCheck, Printer, FileSpreadsheet, GraduationCap, ChevronLeft, ChevronRight } from 'lucide-react';
import { TeacherAvatar } from './TeacherAvatar';

interface TeacherScheduleMatrixProps {
  teachers: Teacher[];
  timetableSlots: TimetableSlot[];
  classes: ClassRoom[];
  rooms: Room[];
}

export const TeacherScheduleMatrix: React.FC<TeacherScheduleMatrixProps> = ({
  teachers,
  timetableSlots,
  classes,
  rooms
}) => {
  const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  const todayDay = days[(new Date(`${centerDate()}T12:00:00`).getDay() + 6) % 7];
  const [selectedDay, setSelectedDay] = useResponsiveView<string>(todayDay, 'all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollTable = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const amount = 350;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth'
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-amber-600" />
            Bảng Lịch Giảng Dạy Giáo Viên (Excel Grid View)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Trực quan hóa ca dạy của tất cả giáo viên dưới dạng Ma Trận Excel chuẩn
          </p>
        </div>

        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 max-w-full">
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
            const count = timetableSlots.filter(s => s.dayOfWeek === day).length;
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
          <span className="text-xs text-amber-200/80 italic">Cập nhật: 2026</span>
        </div>

        <div ref={scrollContainerRef} className="teacher-print-table-wrap overflow-x-auto custom-scrollbar">
          <table className={`teacher-print-table w-full text-xs text-left border-collapse border border-slate-300 ${selectedDay === 'all' ? 'min-w-[1100px]' : 'min-w-full'}`}>
            <thead>
              <tr className="bg-amber-400 text-slate-950 uppercase text-[11px] font-black border-b border-amber-500">
                <th className="py-3 px-4 border-r border-amber-500 w-44 min-w-[150px] sticky left-0 z-30 bg-amber-400 text-slate-950 shadow-xs">
                  Giáo Viên
                </th>
                {displayedDays.map(d => (
                  <th key={d} className="py-3 px-3 border-r border-amber-500 text-center min-w-[135px]">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-medium">
              {teachers.map((teacher) => (
                <tr key={teacher.id} className="teacher-print-row hover:bg-slate-50">
                  <td className="py-3 px-4 bg-slate-100 font-bold text-slate-900 border-r border-slate-300 sticky left-0 z-20 shadow-xs whitespace-nowrap">
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
                       s => s.teacherId === teacher.id && s.dayOfWeek === day
                    );

                    return (
                      <td key={day} className="p-2 border-r border-slate-300 align-top h-24 min-w-[135px]">
                        {slots.length === 0 ? (
                          <div className="text-[10px] text-slate-300 text-center pt-6 italic">-</div>
                        ) : (
                          <div className="space-y-1">
                            {slots.map(s => {
                              const cls = classes.find(c => c.id === s.classId);
                              const room = rooms.find(r => r.id === s.roomId);

                              return (
                                <div
                                  key={s.id}
                                  className="teacher-print-slot p-1.5 bg-amber-50/80 border border-amber-300 rounded-lg text-[10px] shadow-2xs"
                                >
                                  <div className="font-bold font-mono text-slate-900">{cls?.code} ({s.startTime})</div>
                                  <div className="text-slate-600 truncate">{cls?.name}</div>
                                  <div className="text-blue-800 font-bold">{room?.name}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
