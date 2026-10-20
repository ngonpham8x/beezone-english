import { studentClassIds } from '../../lib/studentClasses';
import { ArrowLeft, ArrowRight, ChevronRight, ReceiptText, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import {
  debtBreakdown,
  getReceiptPaymentEntries,
  isStudentOwingTuition,
  paymentKindLabel,
  paymentKindOf,
  paymentMethodLabel,
  paymentPeriodLabel,
} from '../../lib/tuition';
import { ClassRoom, CourseProgram, Room, Student, Teacher, TuitionReceipt } from '../../types';

export type DashboardDetailType =
  | 'students'
  | 'teachers'
  | 'classes'
  | 'rooms'
  | 'revenue'
  | 'active'
  | 'reserved'
  | 'dropped'
  | 'debt'
  | 'paid'
  | 'monthly-debt'
  | 'course-debt'
  | 'session-debt';

interface DashboardDetailModalProps {
  detail: DashboardDetailType | null;
  students: Student[];
  teachers: Teacher[];
  classes: ClassRoom[];
  rooms: Room[];
  receipts: TuitionReceipt[];
  programs: CourseProgram[];
  revenueMonth: string | null;
  canViewDebt: boolean;
  onClose: () => void;
  onViewFull: (tab: string) => void;
}

const formatCurrency = (value: number) => value.toLocaleString('vi-VN') + 'đ';

const formatMonth = (value: string | null) => {
  if (!value) return 'tháng hiện tại';
  const [year, month] = value.split('-');
  return month && year ? month + '/' + year : value;
};

export const DashboardDetailModal: React.FC<DashboardDetailModalProps> = ({
  detail,
  students,
  teachers,
  classes,
  rooms,
  receipts,
  programs,
  revenueMonth,
  canViewDebt,
  onClose,
  onViewFull
}) => {
  const [selectedRevenueClassId, setSelectedRevenueClassId] = useState<string | null>(null);
  const [selectedDebtClassId, setSelectedDebtClassId] = useState<string | null>(null);

  useEffect(() => {
    if (detail !== 'revenue') setSelectedRevenueClassId(null);
    if (detail !== 'monthly-debt' && detail !== 'course-debt' && detail !== 'session-debt') setSelectedDebtClassId(null);
  }, [detail]);

  const classById = new Map<string, ClassRoom>(classes.map((item) => [item.id, item]));
  const teacherById = new Map<string, Teacher>(teachers.map((item) => [item.id, item]));
  const roomById = new Map<string, Room>(rooms.map((item) => [item.id, item]));
  const programById = new Map<string, CourseProgram>(programs.map((item) => [item.id, item]));
  const studentById = new Map<string, Student>(students.map((item) => [item.id, item]));

  const detailStudentMap: Partial<Record<DashboardDetailType, Student[]>> = {
    students,
    active: students.filter((student) => student.status === 'active'),
    reserved: students.filter((student) => student.status === 'reserved'),
    dropped: students.filter((student) => student.status === 'dropped'),
    debt: students.filter((student) => isStudentOwingTuition(student, receipts, classes)),
    paid: students.filter((student) => student.feeStatus === 'paid')
  };

  const detailStudentTitle: Partial<Record<DashboardDetailType, string>> = {
    students: 'Tất cả học sinh',
    active: 'Học sinh đang học',
    reserved: 'Học sinh bảo lưu',
    dropped: 'Học sinh nghỉ học',
    debt: 'Học sinh còn nợ học phí',
    paid: 'Học sinh đã đóng đủ'
  };

  const isStudentDetail = detail ? detail in detailStudentMap : false;
  const visibleStudents = detail ? detailStudentMap[detail] ?? [] : [];
  const paymentEntries = useMemo(() => getReceiptPaymentEntries(receipts), [receipts]);
  const visibleEntries = useMemo(() => revenueMonth
    ? paymentEntries.filter((entry) => entry.monthKey === revenueMonth)
    : paymentEntries, [paymentEntries, revenueMonth]);
  const visibleReceipts = useMemo(() => {
    const list = visibleEntries.map((e) => e.receipt);
    return [...new Set(list)];
  }, [visibleEntries]);

  const revenueClassRows = useMemo(() => classes.map((classroom) => {
    const classEntries = visibleEntries.filter((entry) => entry.classId === classroom.id);
    const classReceipts = [...new Set(classEntries.map((e) => e.receipt))];
    const allClassReceipts = receipts.filter((receipt) => receipt.classId === classroom.id);
    return {
      classroom,
      receipts: classReceipts,
      paidAmount: classEntries.reduce((sum, entry) => sum + entry.amount, 0),
      debt: debtBreakdown(allClassReceipts),
      studentCount: new Set(classEntries.map((entry) => entry.studentId)).size
    };
  }).filter((row) => row.receipts.length > 0 || row.paidAmount > 0).sort((a, b) => b.paidAmount - a.paidAmount), [classes, visibleEntries, receipts]);
  const selectedRevenueClass = revenueClassRows.find((row) => row.classroom.id === selectedRevenueClassId) ?? null;
  const revenueStudentRows = selectedRevenueClass ? (() => {
    const classEntries = visibleEntries.filter((entry) => entry.classId === selectedRevenueClass.classroom.id);
    const groupedStudents = new Map<string, { student: Student | undefined; receipts: TuitionReceipt[]; paidAmount: number }>();
    classEntries.forEach((entry) => {
      const group = groupedStudents.get(entry.studentId) ?? {
        student: studentById.get(entry.studentId),
        receipts: [],
        paidAmount: 0
      };
      if (!group.receipts.some(r => r.id === entry.receiptId)) {
        group.receipts.push(entry.receipt);
      }
      group.paidAmount += entry.amount;
      groupedStudents.set(entry.studentId, group);
    });
    return [...groupedStudents.values()].map((row) => ({
      ...row,
      debt: debtBreakdown(receipts.filter(r => r.studentId === row.student?.id))
    })).sort((a, b) => b.paidAmount - a.paidAmount);
  })() : [];

  const debtKind = detail === 'monthly-debt' ? 'monthly' : detail === 'course-debt' ? 'course' : detail === 'session-debt' ? 'session' : null;
  const debtReceipts = useMemo(() => debtKind
    ? receipts.filter((receipt) => receipt.debtAmount > 0 && paymentKindOf(receipt) === debtKind)
    : [], [debtKind, receipts]);
  const debtClassRows = useMemo(() => classes.map((classroom) => {
    const classReceipts = debtReceipts.filter((receipt) => receipt.classId === classroom.id);
    return {
      classroom,
      receipts: classReceipts,
      debtAmount: classReceipts.reduce((sum, receipt) => sum + receipt.debtAmount, 0),
      studentCount: new Set(classReceipts.map((receipt) => receipt.studentId)).size
    };
  }).filter((row) => row.receipts.length > 0).sort((a, b) => b.debtAmount - a.debtAmount), [classes, debtReceipts]);
  const selectedDebtClass = debtClassRows.find((row) => row.classroom.id === selectedDebtClassId) ?? null;
  const debtStudentRows = selectedDebtClass ? (() => {
    const groupedStudents = new Map<string, { student: Student | undefined; receipts: TuitionReceipt[] }>();
    selectedDebtClass.receipts.forEach((receipt) => {
      const group = groupedStudents.get(receipt.studentId) ?? { student: studentById.get(receipt.studentId), receipts: [] };
      group.receipts.push(receipt);
      groupedStudents.set(receipt.studentId, group);
    });
    return [...groupedStudents.values()].map((row) => ({
      ...row,
      debtAmount: row.receipts.reduce((sum, receipt) => sum + receipt.debtAmount, 0)
    })).sort((a, b) => b.debtAmount - a.debtAmount);
  })() : [];

  if (!detail) return null;

  const title = isStudentDetail
    ? detailStudentTitle[detail]!
    : ({
        teachers: 'Danh sách giáo viên',
        classes: 'Danh sách lớp học',
        rooms: 'Danh sách phòng học',
        revenue: selectedRevenueClass
          ? `${selectedRevenueClass.classroom.code} · ${selectedRevenueClass.classroom.name}`
          : 'Doanh thu tháng ' + formatMonth(revenueMonth),
        'monthly-debt': selectedDebtClass
          ? `${selectedDebtClass.classroom.code} · ${selectedDebtClass.classroom.name}`
          : 'Nợ học phí tháng theo lớp',
        'course-debt': selectedDebtClass
          ? `${selectedDebtClass.classroom.code} · ${selectedDebtClass.classroom.name}`
          : 'Nợ học phí khóa theo lớp',
        'session-debt': selectedDebtClass ? `${selectedDebtClass.classroom.code} · ${selectedDebtClass.classroom.name}` : 'Nợ học phí buổi theo lớp'
      } satisfies Partial<Record<DashboardDetailType, string>>)[detail] ?? 'Chi tiết';

  const total = isStudentDetail
    ? visibleStudents.length
    : detail === 'teachers'
      ? teachers.length
      : detail === 'classes'
        ? classes.length
        : detail === 'rooms'
          ? rooms.length
          : debtKind
            ? selectedDebtClass
              ? selectedDebtClass.debtAmount
              : debtReceipts.reduce((sum, receipt) => sum + receipt.debtAmount, 0)
          : selectedRevenueClass
            ? selectedRevenueClass.paidAmount
            : visibleEntries.reduce((sum, entry) => sum + entry.amount, 0);

  const viewTab = detail === 'teachers'
    ? 'teachers'
    : detail === 'classes'
      ? 'classes'
      : detail === 'rooms'
        ? 'rooms'
        : detail === 'revenue' || debtKind
          ? 'tuition'
          : 'students';

  const handleViewFull = () => {
    onClose();
    onViewFull(viewTab);
  };

  return (
    <DialogFrame label={title} onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section
        className="dialog-panel relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {detail === 'revenue'
                ? 'Tổng đã thu: ' + formatCurrency(total as number)
                : debtKind
                  ? 'Tổng còn nợ: ' + formatCurrency(total as number)
                : total + ' bản ghi'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 overflow-auto p-4 sm:p-6">
          {isStudentDetail && (
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Mã</th>
                  <th className="px-3 py-2.5">Học sinh</th>
                  <th className="px-3 py-2.5">Lớp</th>
                  <th className="px-3 py-2.5">Chương trình</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5">Học phí</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleStudents.map((student) => {
                  const classRoom = classById.get(student.classId);
                  const program = programById.get(student.programId);
                  const statusLabel = student.status === 'active' ? 'Đang học' : student.status === 'dropped' ? 'Nghỉ học' : 'Bảo lưu';
                  const debt = debtBreakdown(receipts.filter((receipt) => receipt.studentId === student.id));
                  const feeLabel = debt.total > 0 ? 'Đóng thiếu' : student.feeStatus === 'paid' ? 'Đã đóng đủ' : 'Chưa đóng';
                  return (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-semibold text-slate-700">{student.code}</td>
                      <td className="px-3 py-3">
                        <div className="font-bold text-slate-900">{student.name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{student.phone}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{studentClassIds(student).map(id => classById.get(id)?.code || id).join(' · ') || 'Chưa xếp lớp'}</td>
                      <td className="px-3 py-3 text-slate-700">{program?.name ?? 'Chưa xác định'}</td>
                      <td className="px-3 py-3 text-slate-700">{statusLabel}</td>
                      <td className="px-3 py-3">
                        {canViewDebt || student.feeStatus === 'paid' ? (
                          <div>
                            <div className="font-semibold text-slate-800">{feeLabel}</div>
                            {canViewDebt && debt.monthly > 0 && <div className="mt-0.5 text-[10px] font-bold text-rose-700">Nợ tháng: {formatCurrency(debt.monthly)}</div>}
                            {canViewDebt && debt.course > 0 && <div className="mt-0.5 text-[10px] font-bold text-rose-700">Nợ khóa: {formatCurrency(debt.course)}</div>}{canViewDebt && debt.session > 0 && <div className="mt-0.5 text-[10px] font-bold text-rose-700">Nợ buổi: {formatCurrency(debt.session)}</div>}
                          </div>
                        ) : 'Đã hạn chế'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {detail === 'teachers' && (
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                <tr><th className="px-3 py-2.5">Giáo viên</th><th className="px-3 py-2.5">Liên hệ</th><th className="px-3 py-2.5">Chuyên môn</th><th className="px-3 py-2.5">Lớp phụ trách</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold text-slate-900">{teacher.name}</td>
                    <td className="px-3 py-3 text-slate-700"><div>{teacher.phone}</div><div className="mt-0.5 text-[11px] text-slate-500">{teacher.email}</div></td>
                    <td className="px-3 py-3 text-slate-700">{teacher.specialty}</td>
                    <td className="px-3 py-3 text-slate-700">{classes.filter((item) => item.teacherId === teacher.id).map((item) => item.code).join(', ') || 'Chưa phân công'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {detail === 'classes' && (
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                <tr><th className="px-3 py-2.5">Mã lớp</th><th className="px-3 py-2.5">Lớp học</th><th className="px-3 py-2.5">Giáo viên</th><th className="px-3 py-2.5">Phòng</th><th className="px-3 py-2.5">Sĩ số</th><th className="px-3 py-2.5">Lịch học</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classes.map((classRoom) => (
                  <tr key={classRoom.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-700">{classRoom.code}</td>
                    <td className="px-3 py-3"><div className="font-bold text-slate-900">{classRoom.name}</div><div className="mt-0.5 text-[11px] text-slate-500">{programById.get(classRoom.programId)?.name ?? 'Chưa xác định'}</div></td>
                    <td className="px-3 py-3 text-slate-700">{teacherById.get(classRoom.teacherId)?.name ?? 'Chưa phân công'}</td>
                    <td className="px-3 py-3 text-slate-700">{roomById.get(classRoom.roomId)?.name ?? 'Chưa xếp phòng'}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{classRoom.studentIds.length}/{classRoom.capacity > 0 ? classRoom.capacity : 'Chưa cập nhật'}</td>
                    <td className="px-3 py-3 text-slate-700">{classRoom.days.join(', ')} · {classRoom.scheduleTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {detail === 'rooms' && (
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                <tr><th className="px-3 py-2.5">Phòng</th><th className="px-3 py-2.5">Sức chứa</th><th className="px-3 py-2.5">Trạng thái</th><th className="px-3 py-2.5">Lớp đang sử dụng</th><th className="px-3 py-2.5">Ghi chú</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.map((room) => (
                  <tr key={room.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3"><div className="font-bold text-slate-900">{room.name}</div><div className="mt-0.5 text-[11px] text-slate-500">{room.id}</div></td>
                    <td className="px-3 py-3 text-slate-700">{room.capacity > 0 ? `${room.capacity} chỗ` : 'Chưa cập nhật'}</td>
                    <td className="px-3 py-3 text-slate-700">{room.status === 'available' ? 'Sẵn sàng' : 'Bảo trì'}</td>
                    <td className="px-3 py-3 text-slate-700">{classes.filter((item) => item.roomId === room.id).map((item) => item.code).join(', ') || 'Trống lịch'}</td>
                    <td className="px-3 py-3 text-slate-500">{room.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {detail === 'revenue' && (
            selectedRevenueClass ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
                  <div className="font-extrabold">{selectedRevenueClass.classroom.code} · {selectedRevenueClass.classroom.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-amber-800">
                    <span>{revenueStudentRows.length} học sinh đã đóng trong tháng</span>
                    <span>Tổng thu: <b>{formatCurrency(selectedRevenueClass.paidAmount)}</b></span>
                    {canViewDebt && selectedRevenueClass.debt.monthly > 0 && <span>Nợ tháng: <b>{formatCurrency(selectedRevenueClass.debt.monthly)}</b></span>}
                    {canViewDebt && selectedRevenueClass.debt.course > 0 && <span>Nợ khóa: <b>{formatCurrency(selectedRevenueClass.debt.course)}</b></span>}
                    {canViewDebt && selectedRevenueClass.debt.session > 0 && <span>Nợ buổi: <b>{formatCurrency(selectedRevenueClass.debt.session)}</b></span>}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {revenueStudentRows.map(({ student, receipts: studentReceipts, paidAmount, debt }) => (
                    <article key={student?.id ?? studentReceipts[0]?.studentId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-slate-900">{student?.name ?? 'Học sinh đã xóa'}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{student?.code || 'Chưa có mã'} · {studentReceipts.length} phiếu thu</p>
                        </div>
                        <ReceiptText className="h-5 w-5 shrink-0 text-amber-600" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                        <div><p className="text-[10px] font-semibold uppercase text-slate-500">Đã đóng</p><p className="mt-0.5 font-extrabold text-emerald-700">{formatCurrency(paidAmount)}</p></div>
                        <div><p className="text-[10px] font-semibold uppercase text-slate-500">Còn nợ</p><p className="mt-0.5 font-extrabold text-rose-700">{canViewDebt ? formatCurrency(debt.total) : '—'}</p></div>
                      </div>
                      {canViewDebt && debt.total > 0 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-rose-700">{debt.monthly > 0 && <span>Nợ tháng: {formatCurrency(debt.monthly)}</span>}{debt.course > 0 && <span>Nợ khóa: {formatCurrency(debt.course)}</span>}{debt.session > 0 && <span>Nợ buổi: {formatCurrency(debt.session)}</span>}</div>}
                      <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100 text-xs">
                        {studentReceipts.map((receipt) => (
                          <div key={receipt.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                            <div className="min-w-0"><p className="font-semibold text-slate-700">{receipt.code} · {paymentKindLabel(receipt)}</p><p className="text-[10px] text-slate-500">{paymentPeriodLabel(receipt)} · {receipt.paymentDate} · {paymentMethodLabel(receipt.paymentMethod)}</p></div>
                            <div className="shrink-0 text-right"><p className="font-bold text-emerald-700">{formatCurrency(receipt.paidAmount)}</p>{canViewDebt && receipt.debtAmount > 0 && <p className="mt-0.5 text-[10px] font-bold text-rose-700">Nợ {formatCurrency(receipt.debtAmount)}</p>}</div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {revenueClassRows.map((row) => (
                  <button key={row.classroom.id} type="button" onClick={() => setSelectedRevenueClassId(row.classroom.id)} className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-slate-900">{row.classroom.code}</p><p className="mt-0.5 text-xs text-slate-500">{row.classroom.name}</p></div><ChevronRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-amber-600" /></div>
                    <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase text-slate-500">Đã thu</p><p className="mt-0.5 text-lg font-extrabold text-emerald-700">{formatCurrency(row.paidAmount)}</p></div><div className="text-right text-[11px] text-slate-500"><p>{row.studentCount} học sinh</p>{canViewDebt && row.debt.monthly > 0 && <p className="mt-1 font-bold text-rose-700">Nợ tháng: {formatCurrency(row.debt.monthly)}</p>}{canViewDebt && row.debt.course > 0 && <p className="mt-1 font-bold text-rose-700">Nợ khóa: {formatCurrency(row.debt.course)}</p>}{canViewDebt && row.debt.session > 0 && <p className="mt-1 font-bold text-rose-700">Nợ buổi: {formatCurrency(row.debt.session)}</p>}</div></div>
                  </button>
                ))}
              </div>
            )
          )}

          {debtKind && (
            selectedDebtClass ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-950">
                  <div className="font-extrabold">{selectedDebtClass.classroom.code} · {selectedDebtClass.classroom.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-rose-800">
                    <span>{debtStudentRows.length} học sinh còn nợ {debtKind === 'monthly' ? 'tháng' : debtKind === 'session' ? 'buổi' : 'khóa'}</span>
                    <span>Tổng nợ: <b>{formatCurrency(selectedDebtClass.debtAmount)}</b></span>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {debtStudentRows.map(({ student, receipts: studentReceipts, debtAmount }) => (
                    <article key={student?.id ?? studentReceipts[0]?.studentId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="truncate font-extrabold text-slate-900">{student?.name ?? 'Học sinh đã xóa'}</p><p className="mt-0.5 text-[11px] text-slate-500">{student?.code || 'Chưa có mã'} · {studentReceipts.length} khoản chưa đủ</p></div>
                        <p className="shrink-0 text-sm font-extrabold text-rose-700">{formatCurrency(debtAmount)}</p>
                      </div>
                      <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100 text-xs">
                        {studentReceipts.map((receipt) => (
                          <div key={receipt.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                            <div className="min-w-0"><p className="font-semibold text-slate-700">{receipt.code} · {paymentKindLabel(receipt)}</p><p className="text-[10px] text-slate-500">{paymentPeriodLabel(receipt)} · {receipt.paymentDate}</p></div>
                            <p className="shrink-0 font-bold text-rose-700">Nợ {formatCurrency(receipt.debtAmount)}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {debtClassRows.map((row) => (
                  <button key={row.classroom.id} type="button" onClick={() => setSelectedDebtClassId(row.classroom.id)} className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-slate-900">{row.classroom.code}</p><p className="mt-0.5 text-xs text-slate-500">{row.classroom.name}</p></div><ChevronRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-rose-700" /></div>
                    <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase text-slate-500">Nợ {debtKind === 'monthly' ? 'tháng' : debtKind === 'session' ? 'buổi' : 'khóa'}</p><p className="mt-0.5 text-lg font-extrabold text-rose-700">{formatCurrency(row.debtAmount)}</p></div><p className="text-right text-[11px] text-slate-500">{row.studentCount} học sinh</p></div>
                  </button>
                ))}
              </div>
            )
          )}

          {((isStudentDetail && visibleStudents.length === 0) || (detail === 'revenue' && visibleReceipts.length === 0) || (Boolean(debtKind) && debtReceipts.length === 0)) && (
            <p className="py-10 text-center text-sm text-slate-500">Chưa có dữ liệu phù hợp.</p>
          )}
        </div>

        <footer className="flex items-center justify-end border-t border-slate-100 px-5 py-3 sm:px-6">
          {((detail === 'revenue' && selectedRevenueClass) || (debtKind && selectedDebtClass)) && (
            <button type="button" onClick={() => {
              setSelectedRevenueClassId(null);
              setSelectedDebtClassId(null);
            }} className="mr-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="h-3.5 w-3.5" /> Danh sách lớp
            </button>
          )}
          <button
            type="button"
            onClick={handleViewFull}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-600 transition shadow-xs"
          >
            Mở trang quản lý <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </footer>
      </section>
    </DialogFrame>
  );
};
