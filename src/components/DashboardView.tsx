import React, { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Building2, Calendar, CheckCircle2, DollarSign, GraduationCap, Users, UserCheck, UserMinus } from 'lucide-react';
import { ClassRoom, CourseProgram, Room, Student, Teacher, TuitionReceipt, UserAccount } from '../types';
import { DashboardDetailModal, DashboardDetailType } from './DashboardDetailModal';
import { debtBreakdown, paymentKindOf } from '../lib/tuition';

interface DashboardViewProps {
  students: Student[];
  teachers: Teacher[];
  classes: ClassRoom[];
  rooms: Room[];
  receipts: TuitionReceipt[];
  programs: CourseProgram[];
  currentUser: UserAccount;
  onNavigateTab: (tab: string) => void;
}

const COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];
const currency = (value: number) => `${value.toLocaleString('vi-VN')}đ`;
const monthLabel = (month: string) => month ? `Tháng ${month.slice(5)}/${month.slice(0, 4)}` : 'Chưa có kỳ thu';

export const DashboardView: React.FC<DashboardViewProps> = ({ students, teachers, classes, rooms, receipts, programs, currentUser, onNavigateTab }) => {
  const [selectedDetail, setSelectedDetail] = useState<DashboardDetailType | null>(null);
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

  const currentMonth = new Date().toISOString().slice(0, 7);
  const availableMonths = useMemo(() => {
    const months = [...new Set(receipts.map((r) => r.paymentDate.slice(0, 7)).filter(Boolean))].sort().reverse();
    if (!months.includes(currentMonth)) {
      months.unshift(currentMonth);
    }
    return months;
  }, [receipts, currentMonth]);

  const [selectedRevenueMonth, setSelectedRevenueMonth] = useState<string>(
    availableMonths.includes(currentMonth) ? currentMonth : (availableMonths[0] || currentMonth)
  );

  const activeRevenueMonth = availableMonths.includes(selectedRevenueMonth) ? selectedRevenueMonth : (availableMonths[0] || currentMonth);
  const monthlyRevenue = receipts.filter((receipt) => receipt.paymentDate.startsWith(activeRevenueMonth)).reduce((sum, receipt) => sum + receipt.paidAmount, 0);
  const classById = new Map(classes.map((classroom) => [classroom.id, classroom]));
  const programById = new Map(programs.map((program) => [program.id, program]));

  const receiptMonths = receipts.map((receipt) => receipt.paymentDate.slice(0, 7)).filter((month): month is string => Boolean(month));
  const monthlyRevenueData = (showRevenue ? [...new Set<string>(receiptMonths)] : [])
    .sort()
    .map((month) => {
      const monthReceipts = receipts.filter((receipt) => receipt.paymentDate.startsWith(month));
      return {
        month: monthLabel(month),
        monthly: monthReceipts.filter((receipt) => paymentKindOf(receipt) === 'monthly').reduce((sum, receipt) => sum + receipt.paidAmount, 0),
        course: monthReceipts.filter((receipt) => paymentKindOf(receipt) === 'course').reduce((sum, receipt) => sum + receipt.paidAmount, 0),
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
    { name: 'Học phí tháng', value: receipts.filter((receipt) => paymentKindOf(receipt) === 'monthly').reduce((sum, receipt) => sum + receipt.paidAmount, 0), color: '#dc2626' },
    { name: 'Học phí khóa', value: receipts.filter((receipt) => paymentKindOf(receipt) === 'course').reduce((sum, receipt) => sum + receipt.paidAmount, 0), color: '#7c3aed' },
  ] : []);
  const classMonthlyData = (showRevenue ? classes : []).map((classroom) => {
    const monthReceipts = receipts.filter((receipt) => receipt.classId === classroom.id && receipt.paymentDate.startsWith(activeRevenueMonth));
    return {
      classroom,
      collected: monthReceipts.reduce((sum, receipt) => sum + receipt.paidAmount, 0),
      debt: debtBreakdown(monthReceipts)
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
              : detail === 'debt' || detail === 'paid' || detail === 'monthly-debt' || detail === 'course-debt'
                ? showDebt
                : false;
    const content = <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-extrabold text-slate-900">{canOpen ? value : '—'}</p>{canOpen && subtitle && <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>}</div>
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span>
    </div>;
    const className = 'w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-2xs';
    return canOpen
      ? <button onClick={() => setSelectedDetail(detail)} className={`${className} transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-red-600`}>{content}</button>
      : <div className={className}>{content}</div>;
  };

  return (
    <div className="space-y-5 pb-8">
      {showRevenue && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-purple-700" />
            <span className="text-xs font-bold text-slate-800">Kỳ xem doanh thu:</span>
            <select
              value={activeRevenueMonth}
              onChange={(e) => setSelectedRevenueMonth(e.target.value)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none transition focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-100"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} {m === currentMonth ? '(Tháng hiện tại)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs font-semibold text-slate-600">
            Tổng thu thực tế trong {monthLabel(activeRevenueMonth).toLocaleLowerCase('vi-VN')}: <strong className="font-extrabold text-purple-700">{currency(monthlyRevenue)}</strong>
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Card label="Tổng học sinh" value={students.length} icon={Users} color="bg-red-100 text-red-600" detail="students" subtitle={`${activeStudents.length} đang học`} />
        <Card label="Tổng giáo viên" value={teachers.length} icon={GraduationCap} color="bg-blue-100 text-blue-600" detail="teachers" />
        <Card label="Tổng lớp" value={classes.length} icon={Building2} color="bg-amber-100 text-amber-600" detail="classes" />
        <Card label="Tổng phòng" value={rooms.length} icon={Building2} color="bg-emerald-100 text-emerald-600" detail="rooms" />
        {showRevenue ? <Card label={`Doanh thu ${monthLabel(activeRevenueMonth).toLocaleLowerCase('vi-VN')}`} value={currency(monthlyRevenue)} icon={DollarSign} color="bg-purple-100 text-purple-600" detail="revenue" subtitle="Bấm để xem chi tiết phiếu thu" /> : <Card label="Học sinh còn nợ" value={showDebt ? debtStudents.length : '—'} icon={AlertTriangle} color="bg-amber-100 text-amber-600" detail="debt" />}
      </section>

      <section className={`grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 ${showDebt ? 'xl:grid-cols-6' : ''}`}>
        <Card label="Đang học" value={activeStudents.length} icon={UserCheck} color="bg-emerald-100 text-emerald-600" detail="active" />
        <Card label="Bảo lưu" value={reservedStudents.length} icon={UserMinus} color="bg-amber-100 text-amber-600" detail="reserved" />
        <Card label="Còn nợ học phí" value={showDebt ? debtStudents.length : '—'} icon={AlertTriangle} color="bg-orange-100 text-orange-600" detail="debt" />
        {showDebt && <Card label="Nợ học phí tháng" value={currency(totalDebtBreakdown.monthly)} icon={AlertTriangle} color="bg-rose-100 text-rose-600" detail="monthly-debt" subtitle="Bấm để xem lớp và học viên" />}
        {showDebt && <Card label="Nợ học phí khóa" value={currency(totalDebtBreakdown.course)} icon={AlertTriangle} color="bg-rose-100 text-rose-600" detail="course-debt" subtitle="Bấm để xem lớp và học viên" />}
        <Card label="Đã đóng đủ" value={paidStudents.length} icon={CheckCircle2} color="bg-emerald-100 text-emerald-600" detail="paid" />
      </section>

      {showDebt && <section className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-semibold text-slate-500">Tổng phải thu</p><p className="mt-1 text-xl font-extrabold">{currency(totalCollected + totalDebt)}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-semibold text-slate-500">Đã thu</p><p className="mt-1 text-xl font-extrabold text-emerald-700">{currency(totalCollected)}</p></div></section>}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"><h2 className="text-sm font-bold text-slate-800">Học sinh theo chương trình</h2><div className="mt-3 flex items-center gap-3"><div className="h-36 w-36"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={programData} dataKey="value" innerRadius={38} outerRadius={58} paddingAngle={2}>{programData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie></PieChart></ResponsiveContainer></div><div className="min-w-0 flex-1 space-y-2">{programData.map((item) => <div key={item.name} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-1.5 text-slate-600"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /> <span className="truncate">{item.name}</span></span><b>{item.value}</b></div>)}</div></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"><h2 className="text-sm font-bold text-slate-800">Doanh thu theo tháng &amp; khóa</h2><p className="mt-0.5 text-[10px] text-slate-500">Tách theo khoản thu trên phiếu đã lập trong từng tháng.</p><div className="mt-2 h-44"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyRevenueData} barGap={4}><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(value / 1000000)}M`} /><Tooltip formatter={(value, name) => [currency(Number(value)), String(name)]} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} /><Bar name="Học phí tháng" dataKey="monthly" fill="#dc2626" radius={[3, 3, 0, 0]} /><Bar name="Học phí khóa" dataKey="course" fill="#7c3aed" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"><h2 className="text-sm font-bold text-slate-800">Tình trạng học phí</h2><div className="mt-3 flex items-center gap-3"><div className="h-36 w-36"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={tuitionStatusData} dataKey="value" innerRadius={38} outerRadius={58} paddingAngle={2}>{tuitionStatusData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie></PieChart></ResponsiveContainer></div><div className="min-w-0 flex-1 space-y-2">{tuitionStatusData.map((item) => <div key={item.name} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-1.5 text-slate-600"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /> <span className="truncate">{item.name}</span></span><b>{item.value}</b></div>)}<div className="border-t border-slate-100 pt-2">{tuitionKindSummary.map((item) => <div key={item.name} className="flex items-center justify-between gap-2 py-0.5 text-xs"><span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-600"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /> <span className="truncate">{item.name}</span></span><b className="text-slate-800">{currency(item.value)}</b></div>)}</div></div></div></div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="text-sm font-bold text-slate-800">Tổng thu từng lớp — {monthLabel(activeRevenueMonth)}</h2><p className="mt-1 text-[11px] text-slate-500">Đã thu và nợ của các phiếu thu trong tháng này.</p></div><button onClick={() => onNavigateTab('tuition')} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800">Quản lý học phí</button></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Lớp</th><th className="px-4 py-3 text-right">Đã thu</th>{showDebt && <th className="px-4 py-3 text-right">Công nợ theo loại</th>}</tr></thead><tbody className="divide-y divide-slate-100">{classMonthlyData.map(({ classroom, collected, debt }) => <tr key={classroom.id}><td className="px-4 py-3"><b className="text-slate-900">{classroom.code}</b><span className="ml-2 text-slate-500">{classroom.name}</span></td><td className="px-4 py-3 text-right font-bold text-emerald-700">{currency(collected)}</td>{showDebt && <td className="px-4 py-3 text-right font-bold text-rose-700">{debt.total > 0 ? <><div>{currency(debt.total)}</div>{debt.monthly > 0 && <div className="mt-0.5 text-[10px]">Tháng: {currency(debt.monthly)}</div>}{debt.course > 0 && <div className="mt-0.5 text-[10px]">Khóa: {currency(debt.course)}</div>}</> : '—'}</td>}</tr>)}</tbody></table></div></div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="text-sm font-bold text-slate-800">Danh sách học sinh</h2><p className="mt-1 text-[11px] text-slate-500">Dữ liệu từ hồ sơ và phiếu thu đã chuẩn hoá.</p></div><button onClick={() => onNavigateTab('students')} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800">Xem tất cả</button></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Học sinh</th><th className="px-4 py-3">Lớp</th>{showDebt && <th className="px-4 py-3 text-right">Nợ theo loại</th>}</tr></thead><tbody className="divide-y divide-slate-100">{studentRows.map((student) => <tr key={student.id}><td className="px-4 py-3 font-bold text-slate-700">{student.code}</td><td className="px-4 py-3"><b className="text-slate-900">{student.name}</b><span className="mt-0.5 block text-[11px] text-slate-500">{student.status === 'reserved' ? 'Bảo lưu' : student.status === 'dropped' ? 'Nghỉ học' : 'Đang học'}</span></td><td className="px-4 py-3 text-slate-600">{student.classroom?.code || 'Chưa xếp'}</td>{showDebt && <td className="px-4 py-3 text-right font-bold text-rose-700">{student.debt.total > 0 ? <><div>{currency(student.debt.total)}</div>{student.debt.monthly > 0 && <div className="mt-0.5 text-[10px]">Tháng: {currency(student.debt.monthly)}</div>}{student.debt.course > 0 && <div className="mt-0.5 text-[10px]">Khóa: {currency(student.debt.course)}</div>}</> : '—'}</td>}</tr>)}</tbody></table></div></div>
      </section>

      <DashboardDetailModal detail={selectedDetail} students={students} teachers={teachers} classes={classes} rooms={rooms} receipts={receipts} programs={programs} revenueMonth={activeRevenueMonth || null} canViewDebt={showDebt} onClose={() => setSelectedDetail(null)} onViewFull={onNavigateTab} />
    </div>
  );
};
