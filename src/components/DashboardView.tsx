import { TodayTasks, type TaskDestination } from './TodayTasks';
import type { AttendanceSession, ScheduleChange, TimetableSlot } from '../types';
import { HorizontalScroll } from './HorizontalScroll';
import React, { useState } from 'react';
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Building2, CheckCircle2, DollarSign, GraduationCap, Users, UserCheck, UserMinus, Sparkles, TrendingUp, Calendar, ArrowRight, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { ClassRoom, CourseProgram, Room, Student, Teacher, TuitionReceipt, UserAccount } from '../types';
import { DashboardDetailModal, DashboardDetailType } from './DashboardDetailModal';
import { debtBreakdown, paymentKindOf, getReceiptPaymentEntries } from '../lib/tuition';

interface DashboardViewProps {
  timetableSlots?: TimetableSlot[]; scheduleChanges?: ScheduleChange[]; attendanceSessions?: AttendanceSession[];
  onOpenTask?: (destination: TaskDestination) => void;
  students: Student[];
  teachers: Teacher[];
  classes: ClassRoom[];
  rooms: Room[];
  receipts: TuitionReceipt[];
  programs: CourseProgram[];
  currentUser: UserAccount;
  onNavigateTab: (tab: string) => void;
}

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#6366f1', '#ec4899', '#8b5cf6', '#06b6d4'];
const currency = (value: number) => `${value.toLocaleString('vi-VN')}đ`;
const monthLabel = (month: string) => month ? `Tháng ${month.slice(5)}/${month.slice(0, 4)}` : 'Chưa có kỳ thu';

export const DashboardView: React.FC<DashboardViewProps> = ({ students, teachers, classes, rooms, receipts, programs, currentUser, onNavigateTab, timetableSlots = [], scheduleChanges = [], attendanceSessions = [], onOpenTask }) => {
  const [selectedDetail, setSelectedDetail] = useState<DashboardDetailType | null>(null);
  const [isBannerMinimized, setIsBannerMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('BEEZONE_BANNER_MINIMIZED') === 'true';
    } catch {
      return false;
    }
  });

  const toggleBannerMinimized = () => {
    setIsBannerMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('BEEZONE_BANNER_MINIMIZED', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };
  const isOwner = currentUser.role === 'owner';
  const canViewStudents = isOwner || currentUser.permissions.student.view;
  const canViewTeachers = isOwner || currentUser.permissions.teacher.view;
  const canViewClasses = canViewStudents || canViewTeachers;
  const canViewRooms = canViewClasses;
  const canViewTuition = isOwner || currentUser.permissions.tuition.view;
  const showRevenue = isOwner || (currentUser.permissions.report?.view && currentUser.permissions.report?.revenue);
  const showDebt = isOwner || (canViewTuition && currentUser.permissions.tuition.showDebt);
  const activeStudents = students.filter((student) => student.status === 'active');
  const reservedStudents = students.filter((student) => student.status === 'reserved');
  const droppedStudents = students.filter((student) => student.status === 'dropped');
  const paidStudents = students.filter((student) => student.feeStatus === 'paid');
  const debtStudents = students.filter((student) => debtBreakdown(receipts.filter((receipt) => receipt.studentId === student.id)).total > 0);
  const totalCollected = receipts.reduce((sum, receipt) => sum + receipt.paidAmount, 0);
  const totalDebtBreakdown = debtBreakdown(receipts);
  const totalDebt = totalDebtBreakdown.total;
  const totalDue = totalCollected + totalDebt;
  const collectionRate = totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 100;

  // Tính doanh thu theo từng đợt thanh toán thực tế (hỗ trợ đóng học phí theo khóa nhiều đợt)
  const paymentEntries = getReceiptPaymentEntries(receipts);
  const paymentMonths = paymentEntries.map((entry) => entry.monthKey).filter(Boolean);
  const latestReceiptMonth = paymentMonths.sort().at(-1) || '';
  const monthlyRevenue = paymentEntries
    .filter((entry) => entry.monthKey === latestReceiptMonth)
    .reduce((sum, entry) => sum + entry.amount, 0);

  const classById = new Map(classes.map((classroom) => [classroom.id, classroom]));
  const programById = new Map(programs.map((program) => [program.id, program]));

  const monthlyRevenueData = (showRevenue ? [...new Set<string>(paymentMonths)] : [])
    .sort()
    .map((month) => {
      const monthEntries = paymentEntries.filter((entry) => entry.monthKey === month);
      return {
        month: monthLabel(month),
        monthly: monthEntries.filter((entry) => entry.paymentKind === 'monthly').reduce((sum, entry) => sum + entry.amount, 0),
        course: monthEntries.filter((entry) => entry.paymentKind === 'course').reduce((sum, entry) => sum + entry.amount, 0),
        session: monthEntries.filter((entry) => entry.paymentKind === 'session').reduce((sum, entry) => sum + entry.amount, 0),
      };
    });
  const programData = (canViewStudents ? programs : []).map((program, index) => ({
    name: program.name,
    value: students.filter((student) => student.programId === program.id).length,
    color: COLORS[index % COLORS.length]
  })).filter((item) => item.value > 0);
  const tuitionStatusData = (showDebt ? [
    { name: 'Đã đóng đủ', value: paidStudents.length, color: '#059669' },
    { name: 'Còn nợ / chưa đóng', value: debtStudents.length, color: '#dc2626' },
    { name: 'Bảo lưu', value: reservedStudents.length, color: '#d97706' }
  ] : []).filter((item) => item.value > 0);
  const tuitionKindSummary = (showDebt ? [
    { name: 'Học phí tháng', value: paymentEntries.filter((entry) => entry.paymentKind === 'monthly').reduce((sum, entry) => sum + entry.amount, 0), color: '#f59e0b' },
    { name: 'Học phí khóa', value: paymentEntries.filter((entry) => entry.paymentKind === 'course').reduce((sum, entry) => sum + entry.amount, 0), color: '#7c3aed' },
    { name: 'Học phí buổi', value: paymentEntries.filter((entry) => entry.paymentKind === 'session').reduce((sum, entry) => sum + entry.amount, 0), color: '#059669' },
  ] : []);
  const classMonthlyData = (showRevenue ? classes : []).map((classroom) => {
    const monthClassEntries = paymentEntries.filter((entry) => entry.classId === classroom.id && entry.monthKey === latestReceiptMonth);
    const classAllReceipts = receipts.filter((receipt) => receipt.classId === classroom.id);
    return {
      classroom,
      collected: monthClassEntries.reduce((sum, entry) => sum + entry.amount, 0),
      debt: debtBreakdown(classAllReceipts)
    };
  }).sort((a, b) => b.collected - a.collected || b.debt.total - a.debt.total);
  const studentRows = (canViewStudents ? students : []).slice(0, 8).map((student) => ({
    ...student,
    classroom: classById.get(student.classId),
    program: programById.get(student.programId),
    debt: debtBreakdown(receipts.filter((receipt) => receipt.studentId === student.id))
  }));

  const Card = ({ label, value, icon: Icon, color, detail, subtitle }: { label: string; value: string | number; icon: React.ElementType; color: string; detail: DashboardDetailType; subtitle?: string }) => {
    const canOpen = detail === 'students' || detail === 'active' || detail === 'reserved' || detail === 'dropped'
      ? canViewStudents
      : detail === 'teachers'
        ? canViewTeachers
        : detail === 'classes'
          ? canViewClasses
          : detail === 'rooms'
            ? canViewRooms
            : detail === 'revenue'
              ? showRevenue
              : detail === 'debt' || detail === 'paid' || detail === 'monthly-debt' || detail === 'course-debt' || detail === 'session-debt'
                ? showDebt
                : false;
    const content = (
      <div className="flex flex-col-reverse items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="mt-1 break-words text-lg sm:text-xl font-black text-slate-900 tracking-tight">{canOpen ? value : '—'}</p>
          {canOpen && subtitle && <p className="mt-1 text-[11px] font-semibold text-slate-500 truncate">{subtitle}</p>}
        </div>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${color} shadow-2xs shrink-0 transition-transform group-hover:scale-105`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    );
    const className = 'w-full rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 text-left shadow-2xs transition-all hover:shadow-md hover:border-amber-300 group';
    return canOpen
      ? <button onClick={() => setSelectedDetail(detail)} className={`${className} hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-500`}>{content}</button>
      : <div className={className}>{content}</div>;
  };

  const todayString = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      <TodayTasks classes={classes} students={students} slots={timetableSlots} changes={scheduleChanges} attendance={attendanceSessions} receipts={receipts} teachers={teachers} user={currentUser} onOpen={onOpenTask || (destination => onNavigateTab(destination.tab))} />
      {/* Friendly Hero Banner */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 p-3.5 sm:p-5 text-slate-950 shadow-xs sm:shadow-md border border-amber-300/60 transition-all">
        {/* Subtle decorative background glow */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 sm:h-36 sm:w-36 rounded-full bg-white/20 blur-xl" />
        <div className="pointer-events-none absolute -left-8 -bottom-8 h-28 w-28 sm:h-36 sm:w-36 rounded-full bg-slate-950/10 blur-xl" />

        {isBannerMinimized ? (
          <div className="relative z-10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base sm:text-lg shrink-0">🐝</span>
              <p className="text-xs sm:text-sm font-bold text-slate-950 truncate">
                Xin chào, <strong>{currentUser.name.replace(/\s*\(Quản [L|l]ý\)/gi, '')}</strong>!
                <span className="hidden sm:inline font-normal text-slate-900/80"> • {activeStudents.length} học viên • {classes.length} lớp</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateTab('attendance')}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-900 text-white text-[11px] font-bold shadow-2xs active:scale-95 transition"
              >
                Điểm danh
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('tuition')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 text-slate-950 text-[11px] font-bold shadow-2xs active:scale-95 transition"
              >
                Thu phí
              </button>
              <button
                type="button"
                onClick={toggleBannerMinimized}
                className="p-1 rounded-lg text-slate-900/80 hover:text-slate-950 hover:bg-white/20 transition ml-0.5"
                title="Mở rộng banner"
                aria-label="Mở rộng banner"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/10 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-950">
                  <Sparkles className="h-3 w-3 text-amber-900" /> Bảng Điều Khiển Tổng Quan
                </div>
                {/* Minimize button available on all screens */}
                <button
                  type="button"
                  onClick={toggleBannerMinimized}
                  className="p-1 rounded-lg text-slate-900/70 hover:text-slate-950 hover:bg-white/20 transition"
                  title="Thu gọn bớt không gian"
                  aria-label="Thu gọn banner"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
              </div>

              <h1 className="text-base sm:text-xl md:text-2xl font-black tracking-tight text-slate-950 flex items-center gap-1.5 flex-wrap leading-tight">
                <span>Xin chào, {currentUser.name.replace(/\s*\(Quản [L|l]ý\)/gi, '')}!</span>
                <span className="text-lg sm:text-xl">🐝</span>
              </h1>

              <p className="text-xs sm:text-sm font-semibold text-slate-950/85 mt-1 leading-snug">
                Hôm nay là <span className="capitalize">{todayString}</span> • <b>{activeStudents.length} học viên</b> đang học • <b>{classes.length} lớp</b> đang vận hành
              </p>
            </div>

            {/* Action buttons: Side-by-side pills */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 pt-0.5 xl:pt-0">
              <button
                type="button"
                onClick={() => onNavigateTab('attendance')}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-xs font-black shadow-xs transition active:scale-95"
              >
                <UserCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>Điểm danh hôm nay</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('tuition')}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-amber-50 text-slate-950 text-xs font-black shadow-xs border border-amber-300/80 transition active:scale-95"
              >
                <DollarSign className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>Thu học phí</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Primary Metric Cards */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 @min-[700px]:grid-cols-3 @min-[1100px]:grid-cols-5">
        <Card label="Tổng học sinh" value={students.length} icon={Users} color="bg-amber-100 text-amber-700" detail="students" subtitle={`${activeStudents.length} đang theo học`} />
        <Card label="Giáo viên" value={teachers.length} icon={GraduationCap} color="bg-blue-100 text-blue-600" detail="teachers" subtitle="Đội ngũ giảng dạy" />
        <Card label="Lớp học" value={classes.length} icon={Building2} color="bg-amber-100 text-amber-600" detail="classes" subtitle="Lớp đang mở" />
        <Card label="Phòng học" value={rooms.length} icon={Building2} color="bg-emerald-100 text-emerald-600" detail="rooms" subtitle="Phòng đạt chuẩn" />
        {showRevenue ? (
          <Card label={`Doanh thu ${monthLabel(latestReceiptMonth).toLocaleLowerCase('vi-VN')}`} value={currency(monthlyRevenue)} icon={DollarSign} color="bg-purple-100 text-purple-600" detail="revenue" subtitle="Khoản thu trong tháng" />
        ) : (
          <Card label="Học sinh còn nợ" value={showDebt ? debtStudents.length : '—'} icon={AlertTriangle} color="bg-amber-100 text-amber-600" detail="debt" subtitle="Cần thu học phí" />
        )}
      </section>

      {/* Student Status & Debt Breakdown Cards */}
      <section className={`grid grid-cols-2 gap-3 sm:gap-4 @min-[700px]:grid-cols-3 @min-[1100px]:grid-cols-4 ${showDebt ? '@min-[1400px]:grid-cols-6' : ''}`}>
        <Card label="Đang học" value={activeStudents.length} icon={UserCheck} color="bg-emerald-100 text-emerald-600" detail="active" subtitle="Chuyên cần đầy đủ" />
        <Card label="Bảo lưu" value={reservedStudents.length} icon={UserMinus} color="bg-amber-100 text-amber-600" detail="reserved" subtitle="Tạm dừng học" />
        <Card label="Học sinh nợ phí" value={showDebt ? debtStudents.length : '—'} icon={AlertTriangle} color="bg-orange-100 text-orange-600" detail="debt" subtitle="Cần theo dõi" />
        {showDebt && <Card label="Nợ học phí tháng" value={currency(totalDebtBreakdown.monthly)} icon={AlertTriangle} color="bg-rose-100 text-rose-600" detail="monthly-debt" subtitle="Bấm để xem danh sách" />}
        {showDebt && <Card label="Nợ học phí khóa" value={currency(totalDebtBreakdown.course)} icon={AlertTriangle} color="bg-rose-100 text-rose-600" detail="course-debt" subtitle="Bấm để xem danh sách" />}
        {showDebt && <Card label="Nợ học phí buổi" value={currency(totalDebtBreakdown.session)} icon={AlertTriangle} color="bg-rose-100 text-rose-600" detail="session-debt" subtitle="Gồm cả buổi chưa lập phiếu" />}
        <Card label="Đã đóng đủ" value={paidStudents.length} icon={CheckCircle2} color="bg-emerald-100 text-emerald-600" detail="paid" subtitle="Hoàn thành học phí" />
      </section>

      {/* Financial Transparency Banner & Progress */}
      {showDebt && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                Minh Bạch Tài Chính & Tiến Độ Thu Học Phí Toàn Trung Tâm
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cập nhật tức thời từ tất cả các phiếu thu và công nợ thực tế trong hệ thống
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                Đã thu đạt {collectionRate}%
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
            <div
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(collectionRate, 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-slate-500 font-semibold uppercase text-[10px]">1. Tổng Phải Thu</p>
              <p className="mt-1 text-lg font-black text-slate-900">{currency(totalDue)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Bao gồm học phí tháng, khóa và buổi</p>
            </div>
            <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200">
              <p className="text-emerald-700 font-semibold uppercase text-[10px]">2. Thực Thu (Đã Vào Quỹ)</p>
              <p className="mt-1 text-lg font-black text-emerald-700">{currency(totalCollected)}</p>
              <p className="text-[10px] text-emerald-600/80 mt-0.5">Đã xuất phiếu thu hợp lệ</p>
            </div>
            <div className="p-3.5 bg-rose-50/60 rounded-xl border border-rose-200">
              <p className="text-rose-700 font-semibold uppercase text-[10px]">3. Còn Nợ Đọng</p>
              <p className="mt-1 text-lg font-black text-rose-700">{currency(totalDebt)}</p>
              <p className="text-[10px] text-rose-600/80 mt-0.5">Tháng: {currency(totalDebtBreakdown.monthly)} · Khóa: {currency(totalDebtBreakdown.course)} · Buổi: {currency(totalDebtBreakdown.session)}</p>
            </div>
          </div>
        </section>
      )}

      {/* Visual Analytics */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Học sinh theo chương trình</h2>
          <div className="mt-3 flex flex-col items-center gap-3">
            <div className="h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={programData} dataKey="value" innerRadius={38} outerRadius={58} paddingAngle={2}>
                    {programData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full min-w-0 flex-1 space-y-2">
              {programData.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <b>{item.value}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Doanh thu theo tháng & khóa</h2>
          <p className="mt-0.5 text-[10px] text-slate-500">Tách theo khoản thu trên phiếu đã lập trong từng tháng.</p>
          <div className="mt-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenueData} barGap={4}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(value / 1000000)}M`} />
                <Tooltip formatter={(value, name) => [currency(Number(value)), String(name)]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar name="Học phí tháng" dataKey="monthly" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar name="Học phí khóa" dataKey="course" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                <Bar name="Học phí buổi" dataKey="session" fill="#059669" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Tình trạng học phí</h2>
          <div className="mt-3 flex flex-col items-center gap-3">
            <div className="h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={tuitionStatusData} dataKey="value" innerRadius={38} outerRadius={58} paddingAngle={2}>
                    {tuitionStatusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full min-w-0 flex-1 space-y-2">
              {tuitionStatusData.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <b>{item.value}</b>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-2">
                {tuitionKindSummary.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-600">
                      <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <b className="text-slate-800">{currency(item.value)}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="text-sm font-bold text-slate-800">Tổng thu từng lớp — {monthLabel(latestReceiptMonth)}</h2><p className="mt-1 text-[11px] text-slate-500">Đã thu và nợ của các phiếu thu trong tháng này.</p></div><button onClick={() => onNavigateTab('tuition')} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-600 transition shadow-xs">Quản lý học phí</button></div><HorizontalScroll label="Tổng thu từng lớp" className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Lớp</th><th className="px-4 py-3 text-right">Đã thu</th>{showDebt && <th className="px-4 py-3 text-right">Công nợ theo loại</th>}</tr></thead><tbody className="divide-y divide-slate-100">{classMonthlyData.map(({ classroom, collected, debt }) => <tr key={classroom.id}><td className="px-4 py-3"><b className="text-slate-900">{classroom.code}</b><span className="ml-2 text-slate-500">{classroom.name}</span></td><td className="px-4 py-3 text-right font-bold text-emerald-700">{currency(collected)}</td>{showDebt && <td className="px-4 py-3 text-right font-bold text-rose-700">{debt.total > 0 ? <><div>{currency(debt.total)}</div>{debt.monthly > 0 && <div className="mt-0.5 text-[10px]">Tháng: {currency(debt.monthly)}</div>}{debt.course > 0 && <div className="mt-0.5 text-[10px]">Khóa: {currency(debt.course)}</div>}{debt.session > 0 && <div className="mt-0.5 text-[10px]">Buổi: {currency(debt.session)}</div>}</> : '—'}</td>}</tr>)}</tbody></table></HorizontalScroll></div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="text-sm font-bold text-slate-800">Danh sách học sinh</h2><p className="mt-1 text-[11px] text-slate-500">Dữ liệu từ hồ sơ và phiếu thu đã chuẩn hoá.</p></div><button onClick={() => onNavigateTab('students')} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-600 transition shadow-xs">Xem tất cả</button></div><HorizontalScroll label="Danh sách học viên" className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Học sinh</th><th className="px-4 py-3">Lớp</th>{showDebt && <th className="px-4 py-3 text-right">Nợ theo loại</th>}</tr></thead><tbody className="divide-y divide-slate-100">{studentRows.map((student) => <tr key={student.id}><td className="px-4 py-3 font-bold text-slate-700">{student.code}</td><td className="px-4 py-3"><b className="text-slate-900">{student.name}</b><span className="mt-0.5 block text-[11px] text-slate-500">{student.status === 'reserved' ? 'Bảo lưu' : student.status === 'dropped' ? 'Nghỉ học' : 'Đang học'}</span></td><td className="px-4 py-3 text-slate-600">{student.classroom?.code || 'Chưa xếp'}</td>{showDebt && <td className="px-4 py-3 text-right font-bold text-rose-700">{student.debt.total > 0 ? <><div>{currency(student.debt.total)}</div>{student.debt.monthly > 0 && <div className="mt-0.5 text-[10px]">Tháng: {currency(student.debt.monthly)}</div>}{student.debt.course > 0 && <div className="mt-0.5 text-[10px]">Khóa: {currency(student.debt.course)}</div>}{student.debt.session > 0 && <div className="mt-0.5 text-[10px]">Buổi: {currency(student.debt.session)}</div>}</> : '—'}</td>}</tr>)}</tbody></table></HorizontalScroll></div>
      </section>

      <DashboardDetailModal detail={selectedDetail} students={students} teachers={teachers} classes={classes} rooms={rooms} receipts={receipts} programs={programs} revenueMonth={latestReceiptMonth || null} canViewDebt={showDebt} onClose={() => setSelectedDetail(null)} onViewFull={onNavigateTab} />
    </div>
  );
};
