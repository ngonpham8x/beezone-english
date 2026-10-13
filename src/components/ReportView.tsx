import React, { useState } from 'react';
import { Student, Teacher, ClassRoom, TuitionReceipt } from '../types';
import { BarChart3, Calendar, Download, Printer, DollarSign, Users, BookOpen, X } from 'lucide-react';
import { debtBreakdown, getReceiptPaymentEntries, ReceiptPaymentEntry } from '../lib/tuition';

interface ReportViewProps {
  students: Student[];
  teachers: Teacher[];
  classes: ClassRoom[];
  receipts: TuitionReceipt[];
  onNavigateTab: (tab: string) => void;
}

export const ReportView: React.FC<ReportViewProps> = ({
  students,
  teachers,
  classes,
  receipts,
  onNavigateTab
}) => {
  const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month'>('month');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Tính doanh thu theo từng đợt thanh toán thực tế (hỗ trợ nhiều đợt đóng cho học phí khóa)
  const paymentEntries = getReceiptPaymentEntries(receipts);
  const allDates = paymentEntries.map((entry) => entry.date).filter(Boolean).sort();
  const reportDate = allDates.at(-1) || new Date().toISOString().slice(0, 10);
  const referenceDate = new Date(`${reportDate}T00:00:00`);
  const weekStart = new Date(referenceDate);
  weekStart.setDate(referenceDate.getDate() - ((referenceDate.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const isoDay = (date: Date) => date.toISOString().slice(0, 10);

  const filterPaymentEntry = (entry: ReceiptPaymentEntry) => {
    if (timeFilter === 'day') return entry.date === reportDate;
    if (timeFilter === 'week') return entry.date >= isoDay(weekStart) && entry.date <= isoDay(weekEnd);
    return entry.date.startsWith(reportDate.slice(0, 7));
  };

  const periodPaymentEntries = paymentEntries.filter(filterPaymentEntry);
  const totalRevenue = periodPaymentEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const totalDebtBreakdown = debtBreakdown(receipts);
  const totalDebt = totalDebtBreakdown.total;
  const activeCount = students.filter(s => s.status === 'active').length;
  const reservedCount = students.filter(s => s.status === 'reserved').length;
  const selectedClass = classes.find((classroom) => classroom.id === selectedClassId) || null;
  const selectedClassStudents = selectedClass ? students.filter((student) => student.classId === selectedClass.id) : [];
  const selectedClassReceipts = selectedClass ? receipts.filter((receipt) => receipt.classId === selectedClass.id) : [];
  const selectedClassDebt = debtBreakdown(selectedClassReceipts);
  const selectedClassPaid = periodPaymentEntries.filter((entry) => entry.classId === selectedClass?.id).reduce((sum, entry) => sum + entry.amount, 0);

  const handlePrint = () => {
    const prevTitle = document.title;
    const filterLabel = timeFilter === 'day' ? 'Ngay' : (timeFilter === 'week' ? 'Tuan' : 'Thang');
    document.title = `BEEZONE_BaoCao_${filterLabel}_${new Date().toISOString().split('T')[0]}`;
    const cleanup = () => {
      document.title = prevTitle;
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-amber-600" />
            Báo Cáo Tổng Hợp Trung Tâm Anh Ngữ
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Xem báo cáo theo Ngày, Tuần, Tháng về Học sinh, Doanh thu học phí & Hoạt động lớp
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              onClick={() => setTimeFilter('day')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${timeFilter === 'day' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Hằng Ngày
            </button>
            <button
              onClick={() => setTimeFilter('week')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${timeFilter === 'week' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Hằng Tuần
            </button>
            <button
              onClick={() => setTimeFilter('month')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${timeFilter === 'month' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Hằng Tháng
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-2xs"
          >
            <Printer className="w-4 h-4 text-amber-400" /> In Báo Cáo
          </button>
        </div>
      </div>

      {/* Report Paper */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div className="text-center border-b border-slate-200 pb-4">
          <h1 className="font-extrabold text-xl text-slate-900 uppercase tracking-wider">TRUNG TÂM NGOẠI NGỮ BEEZONE</h1>
          <p className="text-xs text-slate-500">Địa chỉ: 111 Ngô Quyền, Long Hải, Long Hoa, Tây Ninh · SĐT: 0847563679</p>
          <h2 className="text-lg font-bold text-slate-800 uppercase mt-2">
            BÁO CÁO TỔNG HỢP {timeFilter === 'day' ? 'HẰNG NGÀY' : (timeFilter === 'week' ? 'HẰNG TUẦN' : 'HẰNG THÁNG')}
          </h2>
          <p className="text-xs text-slate-400 italic">Ngày xuất: {new Date().toLocaleDateString('vi-VN')}</p>
        </div>

        {/* 4 Summary Boxes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <button type="button" onClick={() => onNavigateTab('students')} className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left transition hover:border-amber-400 hover:bg-amber-50/40">
            <div className="text-slate-500 font-semibold uppercase">Tổng Học Sinh</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{students.length} HS</div>
            <div className="text-[11px] text-emerald-700 font-medium">{activeCount} đang học • {reservedCount} bảo lưu</div>
          </button>

          <button type="button" onClick={() => onNavigateTab('tuition')} className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left transition hover:border-amber-400 hover:bg-amber-50/40">
            <div className="text-slate-500 font-semibold uppercase">Tổng Doanh Thu</div>
            <div className="text-xl font-bold text-amber-700 mt-1">{totalRevenue.toLocaleString('vi-VN')} đ</div>
            <div className="text-[11px] text-slate-500">Theo {timeFilter === 'day' ? 'ngày' : timeFilter === 'week' ? 'tuần' : 'tháng'} có dữ liệu gần nhất</div>
          </button>

          <button type="button" onClick={() => onNavigateTab('tuition')} className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left transition hover:border-amber-400 hover:bg-amber-50/40">
            <div className="text-slate-500 font-semibold uppercase">Tổng Công Nợ</div>
            <div className="text-xl font-bold text-rose-700 mt-1">{totalDebt.toLocaleString('vi-VN')} đ</div>
            <div className="text-[11px] text-rose-600 font-medium">Tháng: {totalDebtBreakdown.monthly.toLocaleString('vi-VN')} đ · Khóa: {totalDebtBreakdown.course.toLocaleString('vi-VN')} đ</div>
          </button>

          <button type="button" onClick={() => onNavigateTab('classes')} className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left transition hover:border-amber-400 hover:bg-amber-50/40">
            <div className="text-slate-500 font-semibold uppercase">Số Lớp Đang Mở</div>
            <div className="text-xl font-bold text-blue-700 mt-1">{classes.length} Lớp</div>
            <div className="text-[11px] text-slate-500">{teachers.length} giáo viên phụ trách</div>
          </button>
        </div>

        {/* Classes Table */}
        <div>
          <h3 className="font-bold text-slate-900 text-sm mb-3">Chi Tiết Tình Hình Lớp Học & Học Phí:</h3>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[640px] text-left text-xs border border-slate-200">
              <thead className="bg-slate-800 text-slate-200 uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-2.5">STT</th>
                  <th className="p-2.5">Mã Lớp</th>
                  <th className="p-2.5">Tên Lớp Học</th>
                  <th className="p-2.5">Sĩ Số</th>
                  <th className="p-2.5">Doanh Thu Thu</th>
                  <th className="p-2.5">Nợ Tháng</th>
                  <th className="p-2.5">Nợ Khóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {classes.map((cls, idx) => {
                  const classStudents = students.filter(s => s.classId === cls.id);
                  const classAllReceipts = receipts.filter((receipt) => receipt.classId === cls.id);
                  const paid = periodPaymentEntries.filter((entry) => entry.classId === cls.id).reduce((s, e) => s + e.amount, 0);
                  const debt = debtBreakdown(classAllReceipts);

                  return (
                    <tr
                      key={cls.id}
                      onClick={() => setSelectedClassId(cls.id)}
                      className="cursor-pointer transition-colors hover:bg-amber-50/60"
                      title="Bấm để xem chi tiết lớp, học viên và học phí"
                    >
                      <td className="p-2.5 font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-2.5 font-bold font-mono text-slate-900">{cls.code}</td>
                      <td className="p-2.5 font-bold text-slate-900">{cls.name}</td>
                      <td className="p-2.5">{classStudents.length} / {cls.capacity > 0 ? cls.capacity : 'Chưa cập nhật'} HS</td>
                      <td className="p-2.5 font-bold text-emerald-700">{paid.toLocaleString('vi-VN')} đ</td>
                      <td className="p-2.5 font-bold text-rose-700">{debt.monthly > 0 ? `${debt.monthly.toLocaleString('vi-VN')} đ` : '—'}</td>
                      <td className="p-2.5 font-bold text-rose-700">{debt.course > 0 ? `${debt.course.toLocaleString('vi-VN')} đ` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
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
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-[10px] uppercase text-slate-100"><tr><th className="px-3 py-2.5">Mã HS</th><th className="px-3 py-2.5">Học viên</th><th className="px-3 py-2.5 text-right">Đã thu</th><th className="px-3 py-2.5 text-right">Nợ tháng</th><th className="px-3 py-2.5 text-right">Nợ khóa</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedClassStudents.length === 0 ? <tr><td colSpan={5} className="px-3 py-7 text-center text-slate-500">Chưa có học viên trong lớp.</td></tr> : selectedClassStudents.map((student) => {
                    const studentReceipts = selectedClassReceipts.filter((receipt) => receipt.studentId === student.id);
                    const studentDebt = debtBreakdown(studentReceipts);
                    const studentPaid = periodPaymentEntries.filter((entry) => entry.studentId === student.id).reduce((sum, entry) => sum + entry.amount, 0);
                    return <tr key={student.id}><td className="px-3 py-2.5 font-bold font-mono text-slate-900">{student.code}</td><td className="px-3 py-2.5 font-semibold text-slate-800">{student.name}</td><td className="px-3 py-2.5 text-right font-bold text-emerald-700">{studentPaid.toLocaleString('vi-VN')} đ</td><td className="px-3 py-2.5 text-right font-bold text-rose-700">{studentDebt.monthly > 0 ? `${studentDebt.monthly.toLocaleString('vi-VN')} đ` : '—'}</td><td className="px-3 py-2.5 text-right font-bold text-violet-700">{studentDebt.course > 0 ? `${studentDebt.course.toLocaleString('vi-VN')} đ` : '—'}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
