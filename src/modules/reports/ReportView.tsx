import { isStudentInClass } from '../../lib/studentClasses';
import { BarChart3, BookOpen, DollarSign, Printer, Users, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { StatCard } from '../../components/StatCard';
import { centerDate, localCalendarDate } from '../../lib/dates';
import { classTuitionDebtBreakdown, getReceiptPaymentEntries, ReceiptPaymentEntry, totalTuitionDebtBreakdown } from '../../lib/tuition';
import { ClassRoom, CourseProgram, Student, Teacher, TuitionReceipt } from '../../types';

interface ReportViewProps {
  students: Student[];
  teachers: Teacher[];
  classes: ClassRoom[];
  programs: CourseProgram[];
  receipts: TuitionReceipt[];
  onNavigateTab: (tab: string) => void;
}

export const ReportView: React.FC<ReportViewProps> = ({
  students,
  teachers,
  classes,
  programs,
  receipts,
  onNavigateTab
}) => {
  const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Tính doanh thu theo từng đợt thanh toán thực tế (hỗ trợ nhiều đợt đóng cho học phí khóa)
  const paymentEntries = getReceiptPaymentEntries(receipts);
  const [reportDate, setReportDate] = useState(centerDate);
  const referenceDate = new Date(`${reportDate}T00:00:00`);
  const weekStart = new Date(referenceDate);
  weekStart.setDate(referenceDate.getDate() - ((referenceDate.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const isoDay = localCalendarDate;

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearsSet = new Set<number>([
      currentYear - 3,
      currentYear - 2,
      currentYear - 1,
      currentYear,
      currentYear + 1,
      currentYear + 2,
    ]);
    receipts.forEach((r) => {
      const y = parseInt(String(r.paymentDate || r.billingPeriod || '').slice(0, 4), 10);
      if (!isNaN(y) && y >= 2015 && y <= 2099) yearsSet.add(y);
    });
    const parsed = parseInt(reportDate.slice(0, 4), 10);
    if (!isNaN(parsed) && parsed >= 2015 && parsed <= 2099) yearsSet.add(parsed);
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [receipts, reportDate]);

  const filterPaymentEntry = (entry: ReceiptPaymentEntry) => {
    if (timeFilter === 'day') return entry.date === reportDate;
    if (timeFilter === 'week') return entry.date >= isoDay(weekStart) && entry.date <= isoDay(weekEnd);
    if (timeFilter === 'month') return entry.date.startsWith(reportDate.slice(0, 7));
    if (timeFilter === 'year') return entry.date.startsWith(reportDate.slice(0, 4));
    return false;
  };

  const periodPaymentEntries = paymentEntries.filter(filterPaymentEntry);
  const totalRevenue = periodPaymentEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const totalDebtBreakdown = totalTuitionDebtBreakdown(students, receipts, programs, classes);
  const totalDebt = totalDebtBreakdown.total;
  const activeCount = students.filter(s => s.status === 'active').length;
  const reservedCount = students.filter(s => s.status === 'reserved').length;
  const selectedClass = classes.find((classroom) => classroom.id === selectedClassId) || null;
  const selectedClassStudents = selectedClass ? students.filter((student) => isStudentInClass(student, selectedClass.id)) : [];
  const selectedClassDebt = selectedClass ? classTuitionDebtBreakdown(selectedClass, students, receipts, programs) : { total: 0, monthly: 0, course: 0, session: 0 };
  const selectedClassPaid = periodPaymentEntries.filter((entry) => entry.classId === selectedClass?.id).reduce((sum, entry) => sum + entry.amount, 0);

  const selectedYear = reportDate.slice(0, 4);
  const monthlyBreakdown = useMemo(() => {
    if (timeFilter !== 'year') return [];
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const monthStr = `${selectedYear}-${String(monthNum).padStart(2, '0')}`;
      const monthEntries = paymentEntries.filter((e) => e.date.startsWith(monthStr));
      const revenue = monthEntries.reduce((sum, e) => sum + e.amount, 0);
      const count = monthEntries.length;
      return {
        month: monthNum,
        monthStr,
        revenue,
        count,
      };
    });
  }, [timeFilter, selectedYear, paymentEntries]);

  const periodSubtitle = useMemo(() => {
    if (timeFilter === 'day') {
      const [y, m, d] = reportDate.split('-');
      return d && m && y ? `Ngày ${d}/${m}/${y}` : `Ngày ${reportDate}`;
    }
    if (timeFilter === 'week') {
      const startStr = isoDay(weekStart).split('-').reverse().join('/');
      const endStr = isoDay(weekEnd).split('-').reverse().join('/');
      return `Tuần từ ${startStr} đến ${endStr}`;
    }
    if (timeFilter === 'month') {
      return `Tháng ${reportDate.slice(5, 7)}/${reportDate.slice(0, 4)}`;
    }
    return `Năm ${reportDate.slice(0, 4)}`;
  }, [timeFilter, reportDate, weekStart, weekEnd, isoDay]);

  const handlePrint = () => {
    const prevTitle = document.title;
    const filterLabel =
      timeFilter === 'day'
        ? 'Ngay'
        : timeFilter === 'week'
        ? 'Tuan'
        : timeFilter === 'month'
        ? 'Thang'
        : 'Nam';
    document.title = `BEEZONE_BaoCao_${filterLabel}_${centerDate()}`;
    const cleanup = () => {
      document.title = prevTitle;
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-heading bg-white border border-slate-200 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-amber-600" />
            Báo Cáo Tổng Hợp Trung Tâm Anh Ngữ
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Xem báo cáo theo Ngày, Tuần, Tháng, Năm về Học sinh, Doanh thu học phí & Hoạt động lớp
          </p>
        </div>

        <div className="report-controls">
          <label className="min-w-0">
            <span className="sr-only">
              {timeFilter === 'year'
                ? 'Năm báo cáo'
                : timeFilter === 'month'
                ? 'Tháng báo cáo'
                : timeFilter === 'week'
                ? 'Tuần báo cáo'
                : 'Ngày báo cáo'}
            </span>
            {timeFilter === 'year' ? (
              <select
                aria-label="Chọn năm báo cáo"
                value={reportDate.slice(0, 4)}
                onChange={(event) => {
                  const y = event.target.value;
                  const rest = reportDate.slice(4) || '-01-01';
                  setReportDate(`${y}${rest}`);
                }}
                className="filter-control filter-control--date cursor-pointer font-bold"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    Năm {yr}
                  </option>
                ))}
              </select>
            ) : timeFilter === 'month' ? (
              <input
                aria-label="Chọn tháng báo cáo"
                type="month"
                value={reportDate.slice(0, 7)}
                onChange={(event) => {
                  if (event.target.value) {
                    const dayPart = reportDate.slice(8, 10) || '01';
                    setReportDate(`${event.target.value}-${dayPart}`);
                  }
                }}
                className="filter-control filter-control--date cursor-pointer font-bold"
              />
            ) : (
              <input
                aria-label={timeFilter === 'week' ? 'Ngày trong tuần' : 'Ngày báo cáo'}
                type="date"
                value={reportDate}
                onChange={(event) => {
                  if (event.target.value) setReportDate(event.target.value);
                }}
                className="filter-control filter-control--date"
                title={timeFilter === 'week' ? `Tuần từ ${isoDay(weekStart)} đến ${isoDay(weekEnd)}` : undefined}
              />
            )}
          </label>
          <button
            onClick={handlePrint}
            className="report-print px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-2xs"
          >
            <Printer className="w-4 h-4 text-amber-400" /> In Báo Cáo
          </button>
          <div className="report-periods bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              aria-pressed={timeFilter === 'day'}
              onClick={() => setTimeFilter('day')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition ${timeFilter === 'day' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Hằng Ngày
            </button>
            <button
              aria-pressed={timeFilter === 'week'}
              onClick={() => setTimeFilter('week')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition ${timeFilter === 'week' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Hằng Tuần
            </button>
            <button
              aria-pressed={timeFilter === 'month'}
              onClick={() => setTimeFilter('month')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition ${timeFilter === 'month' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Hằng Tháng
            </button>
            <button
              aria-pressed={timeFilter === 'year'}
              onClick={() => setTimeFilter('year')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition ${timeFilter === 'year' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Hằng Năm
            </button>
          </div>
        </div>
      </div>

      {/* Report Paper */}
      <div className="bg-white p-3 sm:p-5 print:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div className="text-center border-b border-slate-200 pb-4">
          <h1 className="font-extrabold text-xl text-slate-900 uppercase tracking-wider">TRUNG TÂM NGOẠI NGỮ BEEZONE</h1>
          <p className="text-xs text-slate-500">Địa chỉ: 111 Ngô Quyền, Long Hải, Long Hoa, Tây Ninh · SĐT: 0847563679</p>
          <h2 className="text-lg font-bold text-slate-800 uppercase mt-2">
            BÁO CÁO TỔNG HỢP {
              timeFilter === 'day'
                ? 'HẰNG NGÀY'
                : timeFilter === 'week'
                ? 'HẰNG TUẦN'
                : timeFilter === 'month'
                ? 'HẰNG THÁNG'
                : 'HẰNG NĂM'
            }
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kỳ báo cáo: <span className="font-semibold text-slate-700">{periodSubtitle}</span> · Ngày xuất: {new Date().toLocaleDateString('vi-VN')}
          </p>
        </div>

        <div className="stats-grid">
          <StatCard label="Tổng học sinh" value={students.length + ' HS'} icon={Users} subtitle={activeCount + ' đang học · ' + reservedCount + ' bảo lưu'} onClick={() => onNavigateTab('students')} />
          <StatCard label="Tổng doanh thu" value={totalRevenue.toLocaleString('vi-VN') + ' đ'} icon={DollarSign} tone="emerald" subtitle={periodSubtitle} onClick={() => onNavigateTab('tuition')} />
          <StatCard label="Tổng công nợ" value={totalDebt.toLocaleString('vi-VN') + ' đ'} tone="rose" subtitle={'Tháng: ' + totalDebtBreakdown.monthly.toLocaleString('vi-VN') + ' · Khóa: ' + totalDebtBreakdown.course.toLocaleString('vi-VN') + ' · Buổi: ' + totalDebtBreakdown.session.toLocaleString('vi-VN')} onClick={() => onNavigateTab('tuition')} />
          <StatCard label="Lớp đang mở" value={classes.length + ' Lớp'} icon={BookOpen} tone="sky" subtitle={teachers.length + ' giáo viên'} onClick={() => onNavigateTab('classes')} />
        </div>

        {/* Yearly 12-Month Summary Breakdown */}
        {timeFilter === 'year' && (
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-600" />
                  Doanh Thu 12 Tháng Trong Năm {reportDate.slice(0, 4)}
                </h3>
                <p className="text-xs text-slate-500">
                  Bấm vào từng tháng để xem chi tiết danh sách học sinh và lớp học của tháng đó.
                </p>
              </div>
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg">
                Tổng năm: {totalRevenue.toLocaleString('vi-VN')} đ
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {monthlyBreakdown.map((m) => (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => {
                    setReportDate(`${reportDate.slice(0, 4)}-${String(m.month).padStart(2, '0')}-01`);
                    setTimeFilter('month');
                  }}
                  className={`text-left p-2.5 rounded-xl border transition-all ${
                    m.revenue > 0
                      ? 'bg-white border-amber-300 hover:border-amber-500 hover:shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-800">Tháng {m.month}</span>
                    {m.count > 0 && (
                      <span className="text-[10px] font-semibold text-slate-500">{m.count} phiếu</span>
                    )}
                  </div>
                  <div className={`mt-1 text-xs font-extrabold ${m.revenue > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {m.revenue > 0 ? `${m.revenue.toLocaleString('vi-VN')} đ` : '0 đ'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Classes Table */}
        <div>
          <h3 className="font-bold text-slate-900 text-sm mb-3">Chi Tiết Tình Hình Lớp Học & Học Phí:</h3>
          <HorizontalScroll label="Báo cáo lớp" className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[640px] text-left text-xs border border-slate-200">
              <thead className="bg-slate-800 text-slate-200 uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-2.5">STT</th>
                  <th className="p-2.5">Mã Lớp</th>
                  <th className="p-2.5">Tên Lớp Học</th>
                  <th className="p-2.5">Sĩ Số</th>
                  <th className="p-2.5">Doanh Thu Thu</th>
                  <th className="p-2.5">Nợ Tháng</th>
                  <th className="p-2.5">Nợ Khóa</th><th className="p-2.5">Nợ Buổi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {classes.map((cls, idx) => {
                  const classStudents = students.filter(s => isStudentInClass(s, cls.id));
                  const paid = periodPaymentEntries.filter((entry) => entry.classId === cls.id).reduce((s, e) => s + e.amount, 0);
                  const debt = classTuitionDebtBreakdown(cls, students, receipts, programs);

                  return (
                    <tr
                      key={cls.id}
                      onClick={() => setSelectedClassId(cls.id)}
                      className="cursor-pointer transition-colors hover:bg-amber-50/60"
                      title="Bấm để xem chi tiết lớp, học viên và học phí"
                    >
                      <td className="p-2.5 font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-2.5 font-bold font-mono text-slate-900"><button type="button" aria-label={`Xem chi tiết lớp ${cls.name}`} onClick={event => { event.stopPropagation(); setSelectedClassId(cls.id); }} className="rounded-md text-amber-800 underline decoration-amber-200 underline-offset-4 hover:text-amber-950">{cls.code}</button></td>
                      <td className="p-2.5 font-bold text-slate-900">{cls.name}</td>
                      <td className="p-2.5">{classStudents.length} / {cls.capacity > 0 ? cls.capacity : 'Chưa cập nhật'} HS</td>
                      <td className="p-2.5 font-bold text-emerald-700">{paid.toLocaleString('vi-VN')} đ</td>
                      <td className="p-2.5 font-bold text-rose-700">{debt.monthly > 0 ? `${debt.monthly.toLocaleString('vi-VN')} đ` : '—'}</td>
                      <td className="p-2.5 font-bold text-rose-700">{debt.course > 0 ? `${debt.course.toLocaleString('vi-VN')} đ` : '—'}</td><td className="p-2.5 font-bold text-rose-700">{debt.session > 0 ? `${debt.session.toLocaleString('vi-VN')} đ` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </HorizontalScroll>
        </div>
      </div>

      {selectedClass && (
        <DialogFrame label="Chi tiết báo cáo lớp" onClose={() => setSelectedClassId(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="dialog-panel relative max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedClassId(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Đóng chi tiết lớp"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="pr-9">
              <p className="text-xs font-bold font-mono text-amber-700">{selectedClass.code}</p>
              <h3 className="mt-1 text-lg font-extrabold text-slate-900">{selectedClass.name}</h3>
              <p className="mt-1 text-xs text-slate-500">Chi tiết sĩ số, phiếu thu và công nợ theo kỳ báo cáo đang chọn.</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Sĩ số</p><b className="mt-1 block text-slate-900">{selectedClassStudents.length} / {selectedClass.capacity || 'Chưa cập nhật'} HS</b></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-emerald-700">Đã thu</p><b className="mt-1 block text-emerald-800">{selectedClassPaid.toLocaleString('vi-VN')} đ</b></div>
              <div className="rounded-xl bg-rose-50 p-3"><p className="text-rose-700">Nợ tháng</p><b className="mt-1 block text-rose-800">{selectedClassDebt.monthly.toLocaleString('vi-VN')} đ</b></div>
              <div className="rounded-xl bg-violet-50 p-3"><p className="text-violet-700">Nợ khóa</p><b className="mt-1 block text-violet-800">{selectedClassDebt.course.toLocaleString('vi-VN')} đ</b></div>
              <div className="rounded-xl bg-amber-50 p-3"><p className="text-amber-700">Nợ buổi</p><b className="mt-1 block text-amber-800">{selectedClassDebt.session.toLocaleString('vi-VN')} đ</b></div>
            </div>

            <HorizontalScroll label="Học phí theo học viên" className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-slate-800 text-[10px] uppercase text-slate-100"><tr><th className="px-3 py-2.5">Mã HS</th><th className="px-3 py-2.5">Học viên</th><th className="px-3 py-2.5 text-right">Đã thu</th><th className="px-3 py-2.5 text-right">Nợ tháng</th><th className="px-3 py-2.5 text-right">Nợ khóa</th><th className="px-3 py-2.5 text-right">Nợ buổi</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedClassStudents.length === 0 ? <tr><td colSpan={6} className="px-3 py-7 text-center text-slate-500">Chưa có học viên trong lớp.</td></tr> : selectedClassStudents.map((student) => {
                    const studentReceipts = receipts.filter((receipt) => receipt.studentId === student.id);
                    const studentDebt = classTuitionDebtBreakdown(selectedClass, [student], studentReceipts, programs);
                    const studentPaid = periodPaymentEntries.filter((entry) => entry.studentId === student.id && entry.classId === selectedClass.id).reduce((sum, entry) => sum + entry.amount, 0);
                    return <tr key={student.id}><td className="px-3 py-2.5 font-bold font-mono text-slate-900">{student.code}</td><td className="px-3 py-2.5 font-semibold text-slate-800">{student.name}</td><td className="px-3 py-2.5 text-right font-bold text-emerald-700">{studentPaid.toLocaleString('vi-VN')} đ</td><td className="px-3 py-2.5 text-right font-bold text-rose-700">{studentDebt.monthly > 0 ? `${studentDebt.monthly.toLocaleString('vi-VN')} đ` : '—'}</td><td className="px-3 py-2.5 text-right font-bold text-violet-700">{studentDebt.course > 0 ? `${studentDebt.course.toLocaleString('vi-VN')} đ` : '—'}</td><td className="px-3 py-2.5 text-right font-bold text-violet-700">{studentDebt.session > 0 ? `${studentDebt.session.toLocaleString('vi-VN')} đ` : '—'}</td></tr>;
                  })}
                </tbody>
              </table>
            </HorizontalScroll>
          </div>
        </DialogFrame>
      )}
    </div>
  );
};
