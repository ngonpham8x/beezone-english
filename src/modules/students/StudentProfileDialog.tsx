import { studentClassIds } from '../../lib/studentClasses';
import {
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle,
  Clock,
  DollarSign,
  DoorOpen,
  GraduationCap,
  Phone,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { DialogFrame } from '../../components/DialogFrame';
import { paymentKindLabel, paymentPeriodLabel, studentTuitionDebtBreakdown } from '../../lib/tuition';
import type {
  ClassEnrollment,
  ClassRoom,
  CourseProgram,
  Room,
  Student,
  Teacher,
  TimetableSlot,
  TuitionReceipt,
} from '../../types';
import { FeeStatusBadge } from './FeeStatusBadge';
interface Props {
  student: Student;
  classes: ClassRoom[];
  programs: CourseProgram[];
  teachers: Teacher[];
  rooms: Room[];
  timetableSlots: TimetableSlot[];
  receipts: TuitionReceipt[];
  enrollments: ClassEnrollment[];
  onClose: () => void;
}
export function StudentProfileDialog({
  student: viewingStudent,
  classes,
  programs,
  teachers,
  rooms,
  timetableSlots,
  receipts,
  enrollments,
  onClose,
}: Props) {
  const debtForStudent = studentTuitionDebtBreakdown(viewingStudent, receipts, programs, classes);
  return (
    <DialogFrame
      label="Hồ sơ học viên"
      onClose={onClose}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
    >
      <div className="dialog-panel bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 custom-scrollbar">
        <button
          aria-label="Đóng"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row items-center gap-4 pb-5 border-b border-slate-200">
          <img
            src={
              viewingStudent.avatar ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
            }
            alt={viewingStudent.name}
            className="w-20 h-20 rounded-full object-cover border-4 border-red-700 shadow-md"
          />
          <div className="text-center sm:text-left flex-1">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-900 border border-red-300">
                MÃ HỌC SINH: {viewingStudent.code}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1 ${
                viewingStudent.status === 'active'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : viewingStudent.status === 'reserved'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : viewingStudent.status === 'registered'
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}>
                <CheckCircle className="w-3 h-3 text-current" />
                {viewingStudent.status === 'active'
                  ? 'Đang theo học'
                  : viewingStudent.status === 'reserved'
                    ? 'Tạm nghỉ'
                    : viewingStudent.status === 'registered'
                      ? 'Ghi danh'
                      : viewingStudent.status === 'trial'
                        ? 'Học thử'
                        : viewingStudent.status === 'lead'
                          ? 'Tiềm năng'
                          : 'Nghỉ học'}
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900 mt-1">{viewingStudent.name}</h3>
            <div className="text-xs text-slate-500 font-medium flex items-center justify-center sm:justify-start gap-3 mt-0.5">
              <span>
                {viewingStudent.gender === 'Nam'
                  ? 'Nam 👦'
                  : viewingStudent.gender === 'Nữ'
                    ? 'Nữ 👧'
                    : 'Chưa xác định'}
              </span>
              <span>•</span>
              <span>NS: {viewingStudent.dob}</span>
              <span>•</span>
              <span className="font-bold text-slate-700">
                {viewingStudent.gradeLevel} ({viewingStudent.school})
              </span>
            </div>
          </div>
        </div>

        {/* SECTION: INDIVIDUAL TIMETABLE / LỊCH HỌC CÁ NHÂN */}
        {studentClassIds(viewingStudent).map(classId => {
          const cls = classes.find((c) => c.id === classId);
          const program = programs.find((p) => p.id === (cls?.programId || viewingStudent.programId));
          const teacher = teachers.find((t) => t.id === cls?.teacherId);
          const room = rooms.find((r) => r.id === cls?.roomId);
          const classSlots = timetableSlots
            .filter((slot) => slot.classId === classId)
            .sort((left, right) => left.startTime.localeCompare(right.startTime));

          const activeDays = classSlots.length
            ? [...new Set(classSlots.map((slot) => slot.dayOfWeek))]
            : cls
              ? cls.days
              : [];
          const scheduleSummary = classSlots.length
            ? classSlots
                .map((slot) => `${slot.dayOfWeek}: ${slot.startTime}–${slot.endTime}`)
                .join(' · ')
            : cls?.scheduleTime || 'Chưa xếp lịch';
          const className = cls ? cls.name : viewingStudent.classId || 'Chưa xếp lớp';

          const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

          return (
            <div key={classId} className="my-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-purple-700" /> Lịch Học Cá Nhân Học Viên
                </h4>
                <span className="text-[11px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Lớp: {className}
                </span>
              </div>

              {/* Class Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gradient-to-r from-amber-50/50 via-slate-50 to-emerald-50/50 p-4 rounded-xl border border-slate-200 text-xs">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Chương trình:{' '}
                      <strong className="text-slate-900">
                        {program?.name || 'Chưa xác định'}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>
                      Khung giờ ca học:{' '}
                      <strong className="text-purple-800 font-extrabold">{scheduleSummary}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Lịch trong tuần:{' '}
                      <strong className="text-emerald-800">{activeDays.join(', ') || 'Chưa xếp lịch'}</strong>
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <GraduationCap className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>
                      Giáo viên phụ trách:{' '}
                      <strong className="text-indigo-900">
                        {teacher ? teacher.name : 'Chưa phân công'}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <DoorOpen className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      Phòng học cố định:{' '}
                      <strong className="text-rose-900">
                        {room ? room.name : 'Chưa xếp phòng'}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Ngày bắt đầu học:{' '}
                      <strong className="text-slate-900">{viewingStudent.enrollDate}</strong>
                    </span>
                  </div>
                </div>
                {(cls?.notes || cls?.note) && (
                  <div className="sm:col-span-2 pt-2 border-t border-slate-200/80 flex items-start gap-1.5 text-slate-700">
                    <span className="shrink-0 text-amber-700">📝</span>
                    <span>
                      Ghi chú lớp:{' '}
                      <strong className="text-slate-800 font-medium whitespace-pre-line">{cls.notes || cls.note}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Visual Weekly Grid for Student */}
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Ma trận thời khóa biểu hàng tuần của {viewingStudent.name}:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-center">
                  {daysOfWeek.map((day) => {
                    const daySlots = classSlots.filter((slot) => slot.dayOfWeek === day);
                    const isStudyDay =
                      daySlots.length > 0 || (classSlots.length === 0 && activeDays.includes(day));
                    return (
                      <div
                        key={day}
                        className={`p-2 rounded-xl text-xs border transition-all ${
                          isStudyDay
                            ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs font-bold'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}
                      >
                        <div className="text-[10px] uppercase font-bold opacity-80">{day}</div>
                        {isStudyDay ? (
                          <div className="text-[11px] mt-1 font-extrabold text-amber-300">
                            {daySlots[0]?.startTime || cls?.scheduleTime || 'Chưa xếp giờ'}
                            {daySlots[0] && (
                              <div className="text-[9px] font-medium text-white/90">
                                đến {daySlots[0].endTime}
                              </div>
                            )}
                            <div className="text-[9px] font-medium text-white/90 truncate">
                              {className}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] mt-1 font-normal italic text-slate-400">
                            Nghỉ học
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* SECTION: PARENT & CONTACT */}
        <div className="space-y-3 my-5 pt-3 border-t border-slate-200">
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-4 h-4 text-emerald-700" /> Thông Tin Phụ Huynh & Liên Hệ
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
            <div>
              <div className="text-slate-400 text-[10px] font-bold uppercase">Họ tên phụ huynh</div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">
                {viewingStudent.parentName || 'Chưa cập nhật'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] font-bold uppercase">
                Số điện thoại phụ huynh
              </div>
              <a
                href={`tel:${viewingStudent.parentPhone}`}
                className="font-extrabold text-emerald-700 text-sm hover:underline flex items-center gap-1 mt-0.5"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />{' '}
                {viewingStudent.parentPhone || 'Chưa cập nhật'}
              </a>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] font-bold uppercase">
                Số điện thoại học sinh
              </div>
              <div className="font-bold text-slate-800 mt-0.5">
                {viewingStudent.phone || 'Chưa cập nhật'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] font-bold uppercase">Địa chỉ nhà</div>
              <div className="font-bold text-slate-800 mt-0.5">
                {viewingStudent.address || 'Chưa cập nhật'}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION: TUITION & NOTES */}
        <div className="space-y-3 my-5 pt-3 border-t border-slate-200">
          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-emerald-700" /> Tình Trạng Học Phí & Ghi Chú
          </h4>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200 text-xs">
            <div>
              <div className="text-slate-500 font-medium">Trạng thái đóng phí:</div>
              <div className="mt-1">
                <FeeStatusBadge
                  feeStatus={viewingStudent.feeStatus}
                  monthlyDebt={debtForStudent.monthly}
                  courseDebt={debtForStudent.course}
                  sessionDebt={debtForStudent.session}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="text-slate-500 font-medium">Ghi chú bổ sung:</div>
              <div className="italic text-slate-700 font-medium">
                {viewingStudent.notes || 'Không có ghi chú đặc biệt'}
              </div>
            </div>
          </div>
          {enrollments.some((e) => e.studentId === viewingStudent.id) && (
            <section className="my-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs">
              <h4 className="mb-2 font-bold">Lịch sử đăng ký đợt học</h4>
              {enrollments
                .filter((e) => e.studentId === viewingStudent.id)
                .map((e) => (
                  <div key={e.id} className="border-t border-sky-100 py-2">
                    <strong>{classes.find((c) => c.id === e.classId)?.name || e.classId}</strong> ·{' '}
                    {
                      {
                        active: 'Đang học',
                        reserved: 'Bảo lưu',
                        completed: 'Hoàn thành',
                        transferred: 'Đã chuyển lớp',
                        dropped: 'Nghỉ học',
                      }[e.status]
                    }
                    <div>
                      {e.startDate || 'Chưa ghi ngày bắt đầu'} → {e.endDate || 'Chưa kết thúc'}
                    </div>
                  </div>
                ))}
            </section>
          )}
          {(() => {
            const debtReceipts = receipts.filter(
              (receipt) => receipt.studentId === viewingStudent.id && receipt.debtAmount > 0,
            );
            if (!debtReceipts.length) return null;
            return (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-950">
                <div className="font-extrabold">Các khoản còn thiếu cần thu</div>
                <div className="mt-2 space-y-1.5">
                  {debtReceipts.map((receipt) => (
                    <div
                      key={receipt.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-rose-200 pt-1.5 first:border-t-0 first:pt-0"
                    >
                      <span className="font-semibold">
                        {paymentKindLabel(receipt)} · {paymentPeriodLabel(receipt)}
                      </span>
                      <strong>{receipt.debtAmount.toLocaleString('vi-VN')} đ</strong>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-center">
          <span className="text-xs text-slate-500 font-medium">Trung tâm ngoại ngữ BeeZone</span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
