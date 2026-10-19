import {
  AlertCircle,
  Calendar,
  CheckCircle,
  CreditCard,
  DollarSign,
  Edit,
  FileText,
  Filter,
  History,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { StatCard } from '../../components/StatCard';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import { centerDate, isCalendarDate } from '../../lib/dates';
import { nextReceiptCode } from '../../lib/identifiers';
import { withUnbilledSessionReceipts } from '../../lib/sessionBilling';
import {
  debtBreakdown,
  getReceiptInstallments,
  getReceiptPaymentEntries,
  isStudentOwingTuition,
  paymentKindLabel,
  paymentKindOf,
  paymentMethodLabel,
  paymentPeriodLabel,
  receiptFee,
  unbilledTuitionForStudents,
} from '../../lib/tuition';
import type { AttendanceSession } from '../../types';
import {
  CenterSettings,
  ClassRoom,
  CourseProgram,
  StaffPermissions,
  Student,
  TuitionInstallment,
  TuitionReceipt,
} from '../../types';
import { ReceiptPreview } from './ReceiptPreview';
import { SessionTuitionManager } from './SessionTuitionManager';
import { TuitionDuePanel } from './TuitionDuePanel';
import { receiptStatus, receiptStatusClass, receiptStatusLabel } from './receiptPresentation';

interface TuitionManagerProps {
  attendanceSessions?: AttendanceSession[];
  requestReceiptId?: string;
  onRequestHandled?: () => void;
  receipts: TuitionReceipt[];
  students: Student[];
  classes: ClassRoom[];
  programs: CourseProgram[];
  permissions: StaffPermissions;
  settings: CenterSettings;
  isOwner: boolean;
  onAddReceipt: (r: TuitionReceipt) => boolean | void;
  onUpdateReceipt: (r: TuitionReceipt) => boolean | void;
  onDeleteReceipt: (id: string) => void;
}

export const TuitionManager: React.FC<TuitionManagerProps> = ({
  receipts,
  attendanceSessions = [],
  students,
  classes,
  programs,
  permissions,
  settings,
  isOwner,
  requestReceiptId, onRequestHandled,
  onAddReceipt,
  onUpdateReceipt,
  onDeleteReceipt
}) => {
  const currentMonth = centerDate().slice(0, 7);
  const defaultCoursePeriod = `Khóa ${new Date().getFullYear()}`;
  const [selectedReceipt, setSelectedReceipt] = useState<TuitionReceipt | null>(null);
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<TuitionReceipt | null>(null);
  const [pendingReceiptAction, setPendingReceiptAction] = useState<
    | { type: 'save'; receipt: TuitionReceipt; isUpdate: boolean }
    | { type: 'delete'; receipt: TuitionReceipt }
    | null
  >(null);

  const [collectingStudentId, setCollectingStudentId] = useState<string>(students[0]?.id || '');
  const [courseFeeInput, setCourseFeeInput] = useState<number>(0);
  const [monthlyFeeInput, setMonthlyFeeInput] = useState<number>(0);
  const [paymentKind, setPaymentKind] = useState<'course' | 'monthly'>('monthly');
  // A course label is invalid for <input type="month">. Retaining the two
  // values prevents the period field from appearing blank when switching kind.
  const [monthlyBillingPeriod, setMonthlyBillingPeriod] = useState<string>(currentMonth);
  const [courseBillingPeriod, setCourseBillingPeriod] = useState<string>(defaultCoursePeriod);
  const [paidAmountInput, setPaidAmountInput] = useState<number>(0);
  const [paymentDateInput, setPaymentDateInput] = useState<string>(centerDate());
  const [dueDateInput, setDueDateInput] = useState('');
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'Tiền mặt' | 'Chuyển khoản' | 'Thẻ' | 'Chưa xác định'>('Chưa xác định');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [collectorNameInput, setCollectorNameInput] = useState('');
  const [collectError, setCollectError] = useState<string | null>(null);

  // Thu học phí đợt tiếp theo / đóng đợt cuối cho học viên đóng nhiều đợt
  const [collectingInstallmentReceipt, setCollectingInstallmentReceipt] = useState<TuitionReceipt | null>(null);
  const [installmentAmountInput, setInstallmentAmountInput] = useState<number>(0);
  const [installmentDateInput, setInstallmentDateInput] = useState<string>(centerDate());
  const [installmentMethod, setInstallmentMethod] = useState<'Tiền mặt' | 'Chuyển khoản' | 'Thẻ' | 'Chưa xác định'>('Chuyển khoản');
  const [installmentNotes, setInstallmentNotes] = useState<string>('Đóng học phí đợt cuối (hoàn tất học phí)');
  const [installmentCollectorInput, setInstallmentCollectorInput] = useState('');
  const [installmentError, setInstallmentError] = useState<string | null>(null);

  const [receiptQuery, setReceiptQuery] = useState('');
  const [filterClassId, setFilterClassId] = useState('all');
  const [filterPaymentKind, setFilterPaymentKind] = useState<'all' | 'monthly' | 'course' | 'session'>('all');
  const [sessionNotice, setSessionNotice] = useState('');
  const [deadlineReceipt, setDeadlineReceipt] = useState<TuitionReceipt | null>(null);
  const [deadlineValue, setDeadlineValue] = useState('');
  const [deadlineError, setDeadlineError] = useState('');
  const [filterReceiptStatus, setFilterReceiptStatus] = useState<'all' | 'paid' | 'debt'>('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const canCollect = isOwner || permissions.tuition.collect;
  const canDelete = isOwner || permissions.tuition.delete;
  useEffect(() => {
    if (!requestReceiptId || requestReceiptId.startsWith('pending-session:')) return;
    const receipt = receipts.find(r => r.id === requestReceiptId);
    if (receipt) {
      resetReceiptFilters(); setReceiptQuery(receipt.code);
      if (canCollect) handleOpenEditReceipt(receipt); else setSelectedReceipt(receipt);
    }
    onRequestHandled?.();
  }, [requestReceiptId]);

  const unbilledActiveTuition = useMemo(
    () => unbilledTuitionForStudents(students, receipts, programs, classes),
    [students, receipts, programs, classes],
  );
  const recordedDebt = useMemo(
    () => withUnbilledSessionReceipts(receipts, attendanceSessions).reduce((sum, r) => sum + r.debtAmount, 0),
    [receipts, attendanceSessions],
  );
  const totalCollected = receipts.reduce((sum, r) => sum + r.paidAmount, 0);
  const totalDebt = recordedDebt + unbilledActiveTuition;
  const monthlyCollected = receipts.filter((receipt) => paymentKindOf(receipt) === 'monthly').reduce((sum, receipt) => sum + receipt.paidAmount, 0);
  const courseCollected = receipts.filter((receipt) => receipt.paymentKind === 'course').reduce((sum, receipt) => sum + receipt.paidAmount, 0);

  const pendingTuitionStudents = useMemo(() => {
    return students
      .filter((s) => isStudentOwingTuition(s, receipts))
      .map((s) => {
        const cls = classes.find((c) => c.id === s.classId);
        const prog = programs.find((p) => p.id === s.programId);
        const studentReceipts = receipts.filter((r) => r.studentId === s.id);
        const debt = debtBreakdown(studentReceipts);
        const hasReceipt = studentReceipts.length > 0;
        const expectedAmount = debt.total > 0 ? debt.total : (prog?.tuitionFee || 0);
        return {
          student: s,
          classroom: cls,
          program: prog,
          debt,
          hasReceipt,
          expectedAmount,
        };
      });
  }, [students, receipts, classes, programs]);
  const paymentEntries = useMemo(() => getReceiptPaymentEntries(receipts), [receipts]);
  const receiptMonths: string[] = useMemo(() => {
    const months = new Set<string>();
    paymentEntries.forEach((e) => e.monthKey && months.add(e.monthKey));
    receipts.forEach((r) => r.paymentDate && months.add(r.paymentDate.slice(0, 7)));
    return [...months].sort().reverse();
  }, [paymentEntries, receipts]);
  const coursePeriodOptions = [...new Set(receipts
    .filter((receipt) => receipt.paymentKind === 'course')
    .map((receipt) => receipt.billingPeriod?.trim())
    .filter((period): period is string => Boolean(period)))];
  const filteredReceipts = useMemo(() => {
    const normalizedQuery = receiptQuery.trim().toLocaleLowerCase('vi-VN');
    return [...receipts]
      .filter((receipt) => {
        const student = students.find((item) => item.id === receipt.studentId);
        const status = receiptStatus(receipt);
        const matchesQuery = !normalizedQuery || [receipt.code, student?.code, student?.name, paymentPeriodLabel(receipt)]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('vi-VN').includes(normalizedQuery));
        const matchesClass = filterClassId === 'all' || receipt.classId === filterClassId;
        const matchesKind = filterPaymentKind === 'all' || paymentKindOf(receipt) === filterPaymentKind;
        const matchesStatus = filterReceiptStatus === 'all' || (filterReceiptStatus === 'paid' ? status === 'paid' : receipt.debtAmount > 0);
        const matchesMethod = filterPaymentMethod === 'all' || paymentMethodLabel(receipt.paymentMethod) === filterPaymentMethod;
        const matchesMonth = filterMonth === 'all' ||
          receipt.paymentDate.startsWith(filterMonth) ||
          (Array.isArray(receipt.installments) && receipt.installments.some((inst) => inst.date.startsWith(filterMonth)));
        return matchesQuery && matchesClass && matchesKind && matchesStatus && matchesMethod && matchesMonth;
      })
      .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate) || right.code.localeCompare(left.code));
  }, [filterClassId, filterMonth, filterPaymentKind, filterPaymentMethod, filterReceiptStatus, receiptQuery, receipts, students]);

  const selectedStudentReceiptHistory = useMemo(() => (
    receipts
      .filter((receipt) => receipt.studentId === collectingStudentId)
      .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate) || right.code.localeCompare(left.code))
  ), [collectingStudentId, receipts]);

  const resetReceiptFilters = () => {
    setReceiptQuery('');
    setFilterClassId('all');
    setFilterPaymentKind('all');
    setFilterReceiptStatus('all');
    setFilterPaymentMethod('all');
    setFilterMonth('all');
  };

  const showReceiptDetail = (preset: 'all' | 'debt' | 'monthly' | 'course' | 'session') => {
    resetReceiptFilters();
    if (preset === 'debt') setFilterReceiptStatus('debt');
    if (preset === 'monthly' || preset === 'course' || preset === 'session') setFilterPaymentKind(preset);
  };

  const handleOpenCollectForStudent = (student: Student) => {
    const cls = classes.find((c) => c.id === student.classId);
    if (cls?.billingMode === 'session') {
      setSessionNotice(`Lớp ${cls.name} thu theo buổi học. Hãy chọn học viên và buổi học trong phần Học phí theo buổi để thu tiền.`);
      return;
    }
    const prog = programs.find((p) => p.id === student.programId);
    const studentReceipts = receipts.filter((r) => r.studentId === student.id);
    const debt = debtBreakdown(studentReceipts);
    const fee = debt.total > 0 ? debt.total : (prog?.tuitionFee || 0);
    const kind = cls?.billingMode === 'course' ? 'course' : 'monthly';

    setEditingReceipt(null);
    setCollectingStudentId(student.id);
    setCourseFeeInput(kind === 'course' ? fee : 0);
    setMonthlyFeeInput(kind === 'monthly' ? fee : 0);
    setPaymentKind(kind);
    setMonthlyBillingPeriod(currentMonth);
    setCourseBillingPeriod(coursePeriodOptions[0] || defaultCoursePeriod);
    setPaidAmountInput(fee);
    setPaymentDateInput(centerDate());
    setDueDateInput('');
    setDiscountInput(0);
    setPaymentMethod('Tiền mặt');
    setPaymentNotes('Thu học phí');
    setCollectorNameInput('');
    setCollectError(null);
    setIsCollectModalOpen(true);
  };

  const handleOpenCollect = () => {
    const eligibleStudent =
      students.find((s) => s.status === 'active' && s.feeStatus !== 'paid' && classes.find((c) => c.id === s.classId)?.billingMode !== 'session') ||
      students.find((s) => classes.find((c) => c.id === s.classId)?.billingMode !== 'session');
    if (!eligibleStudent) { setSessionNotice('Các lớp đang thu theo buổi. Chọn học viên và buổi học trong phần Học phí theo buổi để thu tiền.'); return; }
    handleOpenCollectForStudent(eligibleStudent);
  };

  const handleOpenEditReceipt = (receipt: TuitionReceipt) => {
    if (receipt.paymentKind === 'session') { setDeadlineReceipt(receipt); setDeadlineValue(receipt.dueDate || ''); setDeadlineError(''); return; }
    setEditingReceipt(receipt);
    setCollectingStudentId(receipt.studentId);
    setCourseFeeInput(receipt.courseFee || 0);
    setMonthlyFeeInput(receipt.monthlyFee || 0);
    const receiptKind = receipt.paymentKind === 'course' ? 'course' : 'monthly';
    setPaymentKind(receiptKind);
    setMonthlyBillingPeriod(receiptKind === 'monthly'
      ? (receipt.billingPeriod || receipt.paymentDate.slice(0, 7))
      : receipt.paymentDate.slice(0, 7));
    setCourseBillingPeriod(receiptKind === 'course'
      ? (receipt.billingPeriod || defaultCoursePeriod)
      : (coursePeriodOptions[0] || defaultCoursePeriod));
    setPaidAmountInput(receipt.paidAmount);
    setPaymentDateInput(receipt.paymentDate);
    setDueDateInput(receipt.dueDate || '');
    setDiscountInput(receipt.discount || 0);
    setPaymentMethod(receipt.paymentMethod || 'Chưa xác định');
    setPaymentNotes(receipt.notes || '');
    setCollectorNameInput(receipt.collectorName || '');
    setCollectError(null);
    setIsCollectModalOpen(true);
  };

  const handleOpenCollectInstallment = (receipt: TuitionReceipt) => {
    setCollectingInstallmentReceipt(receipt);
    setInstallmentAmountInput(receipt.debtAmount);
    setInstallmentDateInput(centerDate());
    setInstallmentMethod(receipt.paymentMethod || 'Chuyển khoản');
    setInstallmentNotes(receipt.debtAmount > 0 ? 'Đóng học phí đợt cuối (hoàn tất học phí)' : 'Thu học phí đợt tiếp theo');
    setInstallmentCollectorInput(receipt.collectorName || '');
    setInstallmentError(null);
  };

  const handleSaveInstallment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectingInstallmentReceipt) return;

    if (!Number.isFinite(installmentAmountInput) || installmentAmountInput <= 0) {
      setInstallmentError('Số tiền thu đợt này phải lớn hơn 0.');
      return;
    }
    if (installmentAmountInput > collectingInstallmentReceipt.debtAmount) {
      setInstallmentError(`Số tiền thu đợt này không thể vượt quá số tiền còn nợ (${collectingInstallmentReceipt.debtAmount.toLocaleString('vi-VN')} đ).`);
      return;
    }
    if (!installmentDateInput) {
      setInstallmentError('Vui lòng chọn ngày thu tiền của đợt này.');
      return;
    }

    const existingInstallments = getReceiptInstallments(collectingInstallmentReceipt);
    const installmentIndex = existingInstallments.length + 1;
    const isFinalPayment = installmentAmountInput >= collectingInstallmentReceipt.debtAmount;
    const finalCollector = installmentCollectorInput.trim() || collectingInstallmentReceipt.collectorName || '';

    const newInstallment: TuitionInstallment = {
      id: `INST_${Date.now()}`,
      date: installmentDateInput,
      amount: installmentAmountInput,
      paymentMethod: installmentMethod,
      collectorName: finalCollector,
      notes: installmentNotes || (isFinalPayment ? 'Đóng học phí đợt cuối (hoàn tất học phí)' : `Đóng học phí đợt ${installmentIndex}`),
    };

    const nextPaidAmount = collectingInstallmentReceipt.paidAmount + installmentAmountInput;
    const nextDebtAmount = Math.max(collectingInstallmentReceipt.debtAmount - installmentAmountInput, 0);
    const nextStatus = nextDebtAmount > 0 ? 'partial' : 'paid';

    const updatedReceipt: TuitionReceipt = {
      ...collectingInstallmentReceipt,
      paidAmount: nextPaidAmount,
      debtAmount: nextDebtAmount,
      status: nextStatus,
      paymentDate: installmentDateInput,
      collectorName: finalCollector,
      paymentMethod: installmentMethod,
      installments: [...existingInstallments, newInstallment],
      notes: collectingInstallmentReceipt.notes
        ? `${collectingInstallmentReceipt.notes} | Đợt ${installmentIndex} (${installmentDateInput}): +${installmentAmountInput.toLocaleString('vi-VN')} đ`
        : `Đợt ${installmentIndex} (${installmentDateInput}): +${installmentAmountInput.toLocaleString('vi-VN')} đ`
    };

    if (onUpdateReceipt(updatedReceipt) === false) return;
    setCollectingInstallmentReceipt(null);
    setSelectedReceipt(updatedReceipt);
  };

  const handleSaveCollect = (e: React.FormEvent) => {
    e.preventDefault();
    if (dueDateInput && !isCalendarDate(dueDateInput)) { setCollectError('Hạn thanh toán không hợp lệ.'); return; }
    const student = students.find(s => s.id === collectingStudentId);
    if (!student) return;
    if (!student.classId || !classes.some(c => c.id === student.classId)) { setCollectError('Học viên chưa được xếp vào lớp hợp lệ.'); return; }
    if ([courseFeeInput, monthlyFeeInput, paidAmountInput, discountInput].some(value => !Number.isFinite(value) || value < 0)) { setCollectError('Học phí, giảm giá và số tiền đóng phải là số không âm.'); return; }

    const selectedFee = paymentKind === 'monthly' ? monthlyFeeInput : courseFeeInput;
    const finalPrice = Math.max(selectedFee - discountInput, 0);
    const cleanBillingPeriod = (paymentKind === 'monthly' ? monthlyBillingPeriod : courseBillingPeriod).trim();
    if (selectedFee <= 0) {
      setCollectError(`Nhập học phí ${paymentKind === 'monthly' ? 'tháng' : 'khóa'} lớn hơn 0 trước khi lập phiếu.`);
      return;
    }
    if (!cleanBillingPeriod) {
      setCollectError('Nhập kỳ học phí hoặc mốc thời gian của khóa.');
      return;
    }
    if (discountInput > selectedFee) {
      setCollectError('Giảm giá không thể lớn hơn học phí.');
      return;
    }
    if (paidAmountInput > finalPrice) {
      setCollectError('Số tiền đóng không thể lớn hơn số tiền cần thu sau giảm giá.');
      return;
    }
    const debtAmount = Math.max(finalPrice - paidAmountInput, 0);
    const status = debtAmount > 0 ? (paidAmountInput > 0 ? 'partial' : 'debt') : 'paid';
    const finalCollector = collectorNameInput.trim();

    // Xử lý các đợt đóng tiền
    let nextInstallments = editingReceipt ? getReceiptInstallments(editingReceipt) : [];
    if (editingReceipt) {
      const addedAmount = paidAmountInput - editingReceipt.paidAmount;
      if (addedAmount > 0) {
        // Tăng số tiền đóng: thêm đợt thanh toán mới vào ngày thu được chọn
        const newInst: TuitionInstallment = {
          id: `INST_${Date.now()}`,
          date: paymentDateInput || centerDate(),
          amount: addedAmount,
          paymentMethod,
          collectorName: finalCollector,
          notes: debtAmount === 0 ? 'Đóng học phí đợt cuối (hoàn tất học phí)' : 'Đóng học phí đợt tiếp theo',
        };
        nextInstallments = [...nextInstallments, newInst];
      } else if (addedAmount === 0 && nextInstallments.length === 1 && (paymentDateInput !== editingReceipt.paymentDate || paymentMethod !== editingReceipt.paymentMethod || finalCollector !== editingReceipt.collectorName.trim())) {
        nextInstallments = [{ ...nextInstallments[0], date: paymentDateInput || editingReceipt.paymentDate, paymentMethod, collectorName: finalCollector }];
      } else if (paidAmountInput < editingReceipt.paidAmount) {
        nextInstallments = [
          {
            id: `INST_${Date.now()}`,
            date: paymentDateInput || editingReceipt.paymentDate,
            amount: paidAmountInput,
            paymentMethod,
            collectorName: finalCollector,
            notes: 'Điều chỉnh số tiền đã đóng',
          }
        ];
      }
    } else {
      nextInstallments = [
        {
          id: `INST_${Date.now()}`,
          date: paymentDateInput || centerDate(),
          amount: paidAmountInput,
          paymentMethod,
          collectorName: finalCollector,
          notes: debtAmount === 0 ? 'Đóng trọn gói 1 lần' : 'Đóng học phí đợt 1',
        }
      ];
    }

    const retainContextFee = Boolean(editingReceipt);
    const nextReceipt: TuitionReceipt = {
      ...(editingReceipt ?? {}),
      id: editingReceipt?.id || `TR_${Date.now()}`,
      code: editingReceipt?.code || nextReceiptCode(receipts),
      studentId: student.id,
      classId: editingReceipt?.classId || student.classId,
      // An existing receipt retains the other fee field as readable audit
      // context when the operator switches monthly <-> course. New receipts
      // keep the unused field empty so reports remain uncluttered.
      courseFee: paymentKind === 'course' || retainContextFee ? courseFeeInput : 0,
      monthlyFee: paymentKind === 'monthly' || retainContextFee ? monthlyFeeInput : 0,
      paymentKind,
      billingPeriod: cleanBillingPeriod,
      dueDate: dueDateInput || undefined,
      discount: discountInput,
      paidAmount: paidAmountInput,
      debtAmount,
      status,
      paymentDate: paymentDateInput || editingReceipt?.paymentDate || centerDate(),
      collectorName: finalCollector,
      paymentMethod,
      notes: paymentNotes || 'Thu học phí',
      installments: nextInstallments,
    };

    setPendingReceiptAction({ type: 'save', receipt: nextReceipt, isUpdate: Boolean(editingReceipt) });
  };

  const handleConfirmReceiptAction = () => {
    if (!pendingReceiptAction) return;
    if (pendingReceiptAction.type === 'save') {
      if (pendingReceiptAction.isUpdate ? onUpdateReceipt(pendingReceiptAction.receipt) === false : onAddReceipt(pendingReceiptAction.receipt) === false) return;
      setIsCollectModalOpen(false);
      setEditingReceipt(null);
      setSelectedReceipt(pendingReceiptAction.receipt);
    } else {
      onDeleteReceipt(pendingReceiptAction.receipt.id);
      if (selectedReceipt?.id === pendingReceiptAction.receipt.id) setSelectedReceipt(null);
    }
    setPendingReceiptAction(null);
  };


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-amber-600" />
            Quản Lý Học Phí & Phiếu Thu
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Thu học phí, cấp phiếu thu, theo dõi công nợ học viên tại Cơ sở 01
          </p>
        </div>

        {canCollect && (
          <button
            onClick={handleOpenCollect}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            Thu Học Phí Mới
          </button>
        )}
      </div>


      <div className="stats-grid stats-grid--five tuition-kpis">
        <StatCard label="Thực thu" value={totalCollected.toLocaleString('vi-VN') + ' đ'} icon={CheckCircle} tone="emerald" subtitle="Tiền đã nhận" onClick={() => showReceiptDetail('all')} />
        <StatCard
          label="Công nợ"
          value={totalDebt.toLocaleString('vi-VN') + ' đ'}
          icon={AlertCircle}
          tone="rose"
          subtitle={pendingTuitionStudents.length > 0 ? `${pendingTuitionStudents.length} HS cần thu / nợ phí` : 'Gồm buổi chưa lập phiếu'}
          onClick={() => showReceiptDetail('debt')}
        />
        <StatCard label="Học phí tháng" value={monthlyCollected.toLocaleString('vi-VN') + ' đ'} icon={DollarSign} tone="sky" subtitle="Đã thu theo tháng" onClick={() => showReceiptDetail('monthly')} />
        <StatCard label="Học phí khóa" value={courseCollected.toLocaleString('vi-VN') + ' đ'} icon={FileText} tone="amber" subtitle="Đã thu theo khóa" onClick={() => showReceiptDetail('course')} />
        <StatCard label="Học phí buổi" value={receipts.filter(r => r.paymentKind === 'session').reduce((sum,r) => sum+r.paidAmount,0).toLocaleString('vi-VN') + ' đ'} icon={Calendar} tone="violet" subtitle="Đã thu theo buổi" onClick={() => showReceiptDetail('session')} />
      </div>
      {(() => {
        const totalReceivable = totalCollected + totalDebt;
        const activeCount = students.filter(s => s.status === 'active').length;
        const collectionRate = totalReceivable > 0
          ? Math.round(totalCollected / totalReceivable * 100)
          : (totalCollected > 0 || (activeCount === 0 && pendingTuitionStudents.length === 0) ? 100 : 0);
        return (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 text-xs text-slate-500">
            <p>Phải thu: <strong className="font-semibold text-slate-700">{totalReceivable.toLocaleString('vi-VN')} đ</strong> · Còn nợ: <strong className="font-semibold text-rose-700">{totalDebt.toLocaleString('vi-VN')} đ</strong></p>
            <div className="flex items-center gap-2"><span>Đã thu {collectionRate}%</span><div className="h-1 w-24 overflow-hidden rounded-full bg-slate-200" aria-hidden="true"><div className="h-full rounded-full bg-emerald-500" style={{width:Math.min(100,collectionRate)+'%'}} /></div></div>
          </div>
        );
      })()}
      {sessionNotice && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{sessionNotice}</p>}
      {(classes.some(c => c.billingMode === 'session') || attendanceSessions.some(a => a.billing) || requestReceiptId?.startsWith('pending-session:')) && (
      <SessionTuitionManager sessions={attendanceSessions} receipts={receipts} students={students} classes={classes} canCollect={canCollect} showDebt={isOwner || permissions.tuition.showDebt} requestId={requestReceiptId} onRequestHandled={onRequestHandled} onCreate={onAddReceipt} />
      )}
      {(isOwner || permissions.tuition.showDebt) && receipts.some(r => r.debtAmount > 0) && <details className="tuition-tools">
        <summary>Nhắc hạn thanh toán · {receipts.filter(r => r.debtAmount > 0).length} phiếu còn nợ</summary>
        <TuitionDuePanel receipts={receipts} students={students} settings={settings} onOpen={r => canCollect ? handleOpenEditReceipt(r) : setSelectedReceipt(r)} />
      </details>}

      {pendingTuitionStudents.length > 0 && (
        <section aria-label="Học viên cần thu học phí" className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50/50 p-3.5 sm:p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-black text-xs shadow-2xs">
                {pendingTuitionStudents.length}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  Học viên cần thu học phí
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    Chưa hoàn thành
                  </span>
                </h3>
                <p className="text-[11px] text-slate-600">
                  Học viên đang học chưa đóng hoặc còn nợ tiền học phí cần theo dõi thu
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 bg-white px-3 py-1.5 rounded-xl border border-amber-200 shadow-2xs">
                Tổng cần thu: <strong className="text-rose-700 font-extrabold">{pendingTuitionStudents.reduce((sum, item) => sum + item.expectedAmount, 0).toLocaleString('vi-VN')} đ</strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs text-slate-700 border-collapse min-w-[700px]">
              <thead className="bg-amber-100/70 text-slate-800 uppercase text-[10px] font-bold border-b border-amber-200">
                <tr>
                  <th className="py-2.5 px-3">Mã HS</th>
                  <th className="py-2.5 px-3">Học sinh</th>
                  <th className="py-2.5 px-3">Lớp học</th>
                  <th className="py-2.5 px-3">Chương trình</th>
                  <th className="py-2.5 px-3 text-right">Số tiền cần thu</th>
                  <th className="py-2.5 px-3 text-center">Tình trạng</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100/70 font-medium">
                {pendingTuitionStudents.map(({ student, classroom, program, debt, expectedAmount }) => (
                  <tr key={student.id} className="hover:bg-amber-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-950">{student.code}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{student.name}</div>
                      <div className="text-[10px] text-slate-500">Phụ huynh: {student.parentName || 'Chưa ghi'} ({student.parentPhone || student.phone || 'Chưa có SĐT'})</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{classroom?.name || 'Chưa xếp lớp'}</td>
                    <td className="py-2.5 px-3 text-slate-700">{program?.name || 'Chưa chọn chương trình'}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-700">
                      {expectedAmount.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        debt.total > 0
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}>
                        {debt.total > 0 ? 'Đóng thiếu' : 'Chưa đóng'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {canCollect && (
                        <button
                          type="button"
                          onClick={() => handleOpenCollectForStudent(student)}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs shadow-2xs transition active:scale-95 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Thu học phí
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><Filter className="h-4 w-4 text-amber-600" /> Lọc phiếu thu nhanh</h3>
          <button type="button" onClick={resetReceiptFilters} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-amber-800"><RotateCcw className="h-3.5 w-3.5" /> Xóa bộ lọc</button>
        </div>
        <div className="tuition-filters">
          <label className="tuition-filter-search relative">
            <span className="sr-only">Tìm phiếu thu</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={receiptQuery} onChange={(event) => setReceiptQuery(event.target.value)} placeholder="Mã phiếu, mã/tên học sinh, kỳ thu..." className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
          </label>
          <ResponsiveSelect label="Lọc lớp trên phiếu thu" value={filterClassId} onChange={setFilterClassId} options={[
            { value: 'all', label: 'Tất cả lớp' },
            ...classes.map(classroom => ({ value: classroom.id, label: classroom.name })),
          ]} />
          <ResponsiveSelect label="Lọc khoản thu" value={filterPaymentKind} onChange={value => setFilterPaymentKind(value as typeof filterPaymentKind)} options={[
            { value: 'all', label: 'Tất cả khoản thu' }, { value: 'monthly', label: 'Học phí tháng' },
            { value: 'course', label: 'Học phí khóa' }, { value: 'session', label: 'Học phí buổi' },
          ]} />
          <ResponsiveSelect label="Lọc tình trạng phiếu thu" value={filterReceiptStatus} onChange={value => setFilterReceiptStatus(value as typeof filterReceiptStatus)} options={[
            { value: 'all', label: 'Tất cả tình trạng' }, { value: 'paid', label: 'Đã đóng đủ' }, { value: 'debt', label: 'Còn nợ / đóng thiếu' },
          ]} />
          <ResponsiveSelect label="Lọc tháng thu" value={filterMonth} onChange={setFilterMonth} options={[
            { value: 'all', label: 'Tất cả tháng thu' }, ...receiptMonths.map(month => ({ value: month, label: `Tháng ${month.slice(5)}/${month.slice(0, 4)}` })),
          ]} />
          <ResponsiveSelect label="Lọc hình thức thanh toán" value={filterPaymentMethod} onChange={setFilterPaymentMethod} options={[
            { value: 'all', label: 'Tất cả hình thức' }, ...['Tiền mặt', 'Chuyển khoản', 'Thẻ', 'TM/CK'].map(method => ({ value: method, label: method })),
          ]} />
        </div>
      </section>

      {/* Receipts History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs uppercase text-slate-800">
              Lịch Sử Phiếu Thu Học Phí
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
              {filteredReceipts.length} / {receipts.length} phiếu
            </span>
          </div>

        </div>

        <HorizontalScroll label="Học phí" className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[1050px] text-left text-xs text-slate-700 border-collapse">
            <thead className="bg-slate-100 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap sticky left-0 bg-slate-100 z-20 min-w-[120px]">Mã Phiếu Thu</th>
                <th className="py-3 px-3.5 whitespace-nowrap sticky left-[120px] bg-slate-100 z-20 shadow-r border-r border-slate-200 min-w-[180px]">Học Sinh</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Mức Học Phí</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Khoản Thu</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Đã Đóng (VNĐ)</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Còn Thiếu (VNĐ)</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-center">Tình Trạng</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Ngày Thu</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-center">Hình Thức</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredReceipts.map((rc) => {
                const student = students.find(s => s.id === rc.studentId);
                const status = receiptStatus(rc);
                const feeAmount = receiptFee(rc);

                return (
                  <tr key={rc.id} onClick={() => setSelectedReceipt(rc)} className="cursor-pointer hover:bg-slate-50 transition-colors group">
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle font-bold sticky left-0 bg-white group-hover:bg-slate-50 z-10">
                      <span className="font-mono text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 text-[11px] font-bold">
                        {rc.code}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle font-bold text-slate-900 sticky left-[120px] bg-white group-hover:bg-slate-50 z-10 shadow-r border-r border-slate-100">
                      {student?.name} <span className="text-slate-400 font-normal font-mono text-[11px]">({student?.code})</span>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle text-right">
                      {feeAmount > 0 ? (
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <span className="font-bold text-slate-800 font-mono">{feeAmount.toLocaleString('vi-VN')} đ</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                            rc.paymentKind === 'course'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-sky-50 text-sky-800 border-sky-200'
                          }`}>
                            {rc.paymentKind === 'course' ? 'Khóa' : rc.paymentKind === 'session' ? 'Buổi' : 'Tháng'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">{paymentKindLabel(rc)} · {paymentPeriodLabel(rc)}</span>
                        {rc.installments && rc.installments.length > 1 && (
                          <span className="rounded-full bg-blue-100 text-blue-800 px-1.5 py-0.2 text-[9px] font-bold" title={`Đã đóng qua ${rc.installments.length} đợt thanh toán`}>
                            {rc.installments.length} đợt
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle text-right font-bold text-emerald-700 font-mono">
                      {rc.paidAmount.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle text-right font-bold font-mono">
                      {rc.debtAmount > 0 ? (
                        <span className="text-rose-700">{rc.debtAmount.toLocaleString('vi-VN')} đ</span>
                      ) : (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${receiptStatusClass[status]}`}>{receiptStatusLabel[status]}</span>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle text-slate-600 font-mono text-[11px]">{rc.paymentDate}</td>
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle text-center">
                      {(() => {
                        const method = paymentMethodLabel(rc.paymentMethod);
                        if (method === 'Tiền mặt') {
                          return <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/60">Tiền mặt</span>;
                        }
                        if (method === 'Chuyển khoản') {
                          return <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200/60">Chuyển khoản</span>;
                        }
                        if (method === 'Thẻ') {
                          return <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200/60">Quẹt thẻ</span>;
                        }
                        return <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">{method}</span>;
                      })()}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap align-middle text-right">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {canCollect && rc.debtAmount > 0 && (
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); handleOpenCollectInstallment(rc); }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] inline-flex items-center gap-1 shadow-2xs transition active:scale-95 whitespace-nowrap"
                          title="Thu học phí đợt tiếp theo hoặc đợt cuối"
                        >
                          <DollarSign className="w-3.5 h-3.5 text-emerald-200" /> Thu nợ
                        </button>
                      )}
                      {canCollect && (
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); handleOpenEditReceipt(rc); }}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg text-[11px] inline-flex items-center gap-1 transition active:scale-95 whitespace-nowrap border border-amber-200/60"
                          title="Sửa và cập nhật phiếu thu"
                        >
                          <Edit className="w-3.5 h-3.5" /> Sửa
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); setSelectedReceipt(rc); }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-[11px] inline-flex items-center gap-1 transition active:scale-95 whitespace-nowrap border border-slate-200"
                        title="Xem và In Phiếu Thu (PDF)"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-600" /> In
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setPendingReceiptAction({ type: 'delete', receipt: rc }); }}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold rounded-lg text-[11px] inline-flex items-center gap-1 transition active:scale-95 whitespace-nowrap border border-rose-200/60"
                          title="Xóa phiếu thu"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Xóa
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredReceipts.length && <tr><td colSpan={11} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">Không tìm thấy phiếu thu phù hợp với bộ lọc hiện tại.</td></tr>}
            </tbody>
          </table>
        </HorizontalScroll>
      </div>

      {/* COLLECT TUITION MODAL */}
      {isCollectModalOpen && (
        <DialogFrame label="Phiếu thu học phí" onClose={() => { setIsCollectModalOpen(false); setEditingReceipt(null); }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-h-[90vh] max-w-md w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative custom-scrollbar">
            <button aria-label="Đóng"
              onClick={() => { setIsCollectModalOpen(false); setEditingReceipt(null); }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-600" />
              {editingReceipt ? `Sửa Phiếu Thu ${editingReceipt.code}` : 'Lập Phiếu Thu Học Phí'}
            </h3>

            <form onSubmit={handleSaveCollect} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chọn Học Sinh *</label>
                <select
                  value={collectingStudentId}
                  onChange={(e) => {
                    setCollectingStudentId(e.target.value);
                    setCollectError(null);
                    const st = students.find(s => s.id === e.target.value);
                    const prog = programs.find(p => p.id === st?.programId);
                    if (prog) {
                      if (paymentKind === 'monthly') {
                        setMonthlyFeeInput(prog.tuitionFee);
                        setPaidAmountInput(prog.tuitionFee);
                      } else {
                        setCourseFeeInput(prog.tuitionFee);
                        setPaidAmountInput(prog.tuitionFee);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900"
                  required
                >
                  {students
                    .filter((s) => editingReceipt || classes.find((c) => c.id === s.classId)?.billingMode !== 'session')
                    .sort((a, b) => {
                      const aOwing = isStudentOwingTuition(a, receipts) ? 0 : 1;
                      const bOwing = isStudentOwingTuition(b, receipts) ? 0 : 1;
                      return aOwing - bOwing || a.name.localeCompare(b.name, 'vi-VN');
                    })
                    .map((s) => {
                      const owing = isStudentOwingTuition(s, receipts);
                      const tag = owing ? '⚠️ [Chưa đóng/còn nợ]' : '✓ [Đã đóng đủ]';
                      return (
                        <option key={s.id} value={s.id}>
                          {tag} {s.name} ({s.code}) - Phụ huynh: {s.parentName || 'Chưa ghi'}
                        </option>
                      );
                    })}
                </select>
              </div>

              {collectingStudentId && (
                <section className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-sky-950">Lịch sử học phí của học viên</h4>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-sky-700">{selectedStudentReceiptHistory.length} phiếu</span>
                  </div>
                  {selectedStudentReceiptHistory.length ? (
                    <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                      {selectedStudentReceiptHistory.map((receipt) => {
                        const status = receiptStatus(receipt);
                        const isCurrentReceipt = receipt.id === editingReceipt?.id;
                        return (
                          <div key={receipt.id} className={`rounded-lg border px-2.5 py-2 ${isCurrentReceipt ? 'border-amber-300 bg-amber-50' : 'border-sky-100 bg-white'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate font-bold text-slate-800">{paymentKindLabel(receipt)} · {paymentPeriodLabel(receipt)}</div>
                                <div className="text-[10px] text-slate-500">{receipt.code} · {receipt.paymentDate}{isCurrentReceipt ? ' · đang sửa' : ''}</div>
                              </div>
                              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${receiptStatusClass[status]}`}>{receiptStatusLabel[status]}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-semibold">
                              <span className="text-emerald-700">Đã đóng: {receipt.paidAmount.toLocaleString('vi-VN')} đ</span>
                              {receipt.debtAmount > 0 && <span className="text-rose-700">Còn nợ: {receipt.debtAmount.toLocaleString('vi-VN')} đ</span>}
                              {receipt.paymentKind === 'course' && (receipt.monthlyFee || 0) > 0 && <span className="text-slate-500">Giữ HP tháng: {(receipt.monthlyFee || 0).toLocaleString('vi-VN')} đ</span>}
                              {receipt.paymentKind !== 'course' && receipt.courseFee > 0 && <span className="text-slate-500">Giữ HP khóa: {receipt.courseFee.toLocaleString('vi-VN')} đ</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[10px] text-sky-800">Chưa có phiếu thu. Sau khi lập phiếu, tháng/khóa đã đóng sẽ hiển thị ở đây.</p>
                  )}
                </section>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Khoản Thu *</label>
                  <select
                    value={paymentKind}
                    onChange={(e) => {
                      const nextKind = e.target.value as 'course' | 'monthly';
                      setPaymentKind(nextKind);
                      // Keep each amount and period exactly as the operator
                      // entered it. Switching kind must not wipe the edit form.
                      setCollectError(null);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="course">Học phí khóa</option>
                    <option value="monthly">Học phí tháng</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{paymentKind === 'monthly' ? 'Kỳ Học Phí' : 'Mốc Thời Gian Khóa'}</label>
                  {paymentKind === 'monthly' ? (
                    <input type="month" value={monthlyBillingPeriod} onChange={(e) => setMonthlyBillingPeriod(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl" required />
                  ) : (
                    <>
                      <input type="text" value={courseBillingPeriod} onChange={(e) => setCourseBillingPeriod(e.target.value)} list="course-period-options" placeholder="Ví dụ: Khóa 09/2026–12/2026" className="w-full px-3 py-2 border border-slate-300 rounded-xl" required />
                      <datalist id="course-period-options">
                        {coursePeriodOptions.map((period) => <option key={period} value={period} />)}
                        <option value={defaultCoursePeriod} />
                      </datalist>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{paymentKind === 'course' ? 'Học Phí Khóa (VNĐ) *' : 'Học Phí Tháng (VNĐ) *'}</label>
                <input
                  type="number"
                  min="0"
                  value={paymentKind === 'course' ? courseFeeInput : monthlyFeeInput}
                  onChange={(e) => paymentKind === 'course' ? setCourseFeeInput(Number(e.target.value)) : setMonthlyFeeInput(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-800"
                  required
                />
              </div>

              {editingReceipt && paymentKind === 'course' && monthlyFeeInput > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
                  <div className="font-extrabold">Học phí tháng đang được giữ lại</div>
                  <div className="mt-0.5">{monthlyFeeInput.toLocaleString('vi-VN')} đ · chuyển lại “Học phí tháng” để xem/sửa giá trị này. Lưu phiếu khóa sẽ không xóa giá trị tháng.</div>
                </div>
              )}
              {editingReceipt && paymentKind === 'monthly' && courseFeeInput > 0 && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
                  <div className="font-extrabold">Học phí khóa đang được giữ lại</div>
                  <div className="mt-0.5">{courseFeeInput.toLocaleString('vi-VN')} đ · chuyển lại “Học phí khóa” để xem/sửa giá trị này. Lưu phiếu tháng sẽ không xóa giá trị khóa.</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số Tiền Đóng Lần Này (VNĐ) *</label>
                  <input type="number" min="0" value={paidAmountInput} onChange={(e) => setPaidAmountInput(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-emerald-800" required />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giảm Giá / Miễn Giảm</label>
                  <input type="number" min="0" value={discountInput} onChange={(e) => setDiscountInput(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-xl" />
                </div>
              </div>

              {(() => {
                const due = Math.max((paymentKind === 'monthly' ? monthlyFeeInput : courseFeeInput) - discountInput, 0);
                const remaining = Math.max(due - paidAmountInput, 0);
                const previewStatus = paidAmountInput >= due && due > 0 ? 'paid' : (paidAmountInput > 0 ? 'partial' : 'unpaid');
                return (
                  <div className={`rounded-xl border px-3 py-2.5 ${remaining > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-700">Tình trạng phiếu</span>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${receiptStatusClass[previewStatus]}`}>{receiptStatusLabel[previewStatus]}</span>
                    </div>
                    {remaining > 0 && (
                      <div className="mt-2 border-t border-amber-200 pt-2 text-amber-900">
                        <label className="mb-1 block font-semibold">Tiền còn nợ {paymentKind === 'monthly' ? 'học phí tháng' : 'học phí khóa'} (VNĐ)</label>
                        <input
                          type="number"
                          min="0"
                          max={due}
                          value={remaining}
                          onChange={(e) => {
                            const enteredDebt = Math.min(Math.max(Number(e.target.value), 0), due);
                            setPaidAmountInput(Math.max(due - enteredDebt, 0));
                          }}
                          className="w-full border border-amber-300 bg-white px-3 py-2 font-extrabold text-amber-900 rounded-xl"
                        />
                        <p className="mt-1 text-[10px] text-amber-800">Số tiền đã đóng sẽ tự điều chỉnh để khớp với số còn nợ.</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {collectError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{collectError}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-3 block font-semibold text-slate-700">Hạn thanh toán<input aria-label="Hạn thanh toán" type="date" value={dueDateInput} onChange={e => setDueDateInput(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
                  <label className="block font-semibold text-slate-700 mb-1">Ngày Thu Tiền *</label>
                  <input
                    type="date"
                    value={paymentDateInput}
                    onChange={(e) => setPaymentDateInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                    required
                  />
                  <p className="mt-0.5 text-[10px] text-emerald-800 font-medium">✓ Ghi nhận doanh thu vào tháng {paymentDateInput.slice(0, 7)}</p>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Hình Thức Thanh Toán</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="Chuyển khoản">Chuyển khoản Ngân hàng</option>
                    <option value="Tiền mặt">Tiền mặt tại trung tâm</option>
                    <option value="Thẻ">Quẹt thẻ POS</option>
                    <option value="Chưa xác định">TM/CK (chưa xác định)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú Thu</label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  placeholder="Ghi chú đợt thanh toán, ví dụ: Đóng học phí đợt cuối..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Người Thu Tiền (Ký & Ghi rõ họ tên)</label>
                <input
                  type="text"
                  value={collectorNameInput}
                  onChange={(e) => setCollectorNameInput(e.target.value)}
                  placeholder="Nhập họ tên người thu tiền (để trống nếu ký tay)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
                <p className="mt-0.5 text-[10px] text-slate-400">Tên này sẽ in ở mục "Người thu tiền" (để trống nếu ký tay trên giấy in).</p>
              </div>

              {editingReceipt && editingReceipt.installments && editingReceipt.installments.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
                  <div className="font-extrabold text-blue-950 mb-1.5 flex items-center justify-between text-xs">
                    <span>Lịch sử các đợt đã đóng ({editingReceipt.installments.length} đợt)</span>
                    <span className="text-emerald-700 font-bold">{editingReceipt.paidAmount.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="space-y-1">
                    {editingReceipt.installments.map((inst, i) => (
                      <div key={inst.id || i} className="flex justify-between items-center text-[11px] text-slate-700 bg-white px-2.5 py-1.5 rounded-lg border border-blue-100">
                        <span>Đợt {i + 1} ({inst.date}): <strong>{inst.amount.toLocaleString('vi-VN')} đ</strong> - {inst.paymentMethod}</span>
                        <span className="text-slate-500 italic">{inst.notes || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsCollectModalOpen(false); setEditingReceipt(null); }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold hover:bg-amber-600 flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Save className="w-4 h-4 text-slate-950" /> {editingReceipt ? 'Hoàn Thành Cập Nhật' : 'Hoàn Thành Lập Phiếu'}
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}

      {/* COLLECT INSTALLMENT (THU TIẾP / ĐÓNG ĐỢT CUỐI) MODAL */}
      {collectingInstallmentReceipt && (
        <DialogFrame label="Thu học phí bổ sung" onClose={() => setCollectingInstallmentReceipt(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-h-[90vh] max-w-lg w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative custom-scrollbar">
            <button aria-label="Đóng"
              onClick={() => setCollectingInstallmentReceipt(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Thu Học Phí Đợt Tiếp Theo / Đóng Đợt Cuối
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Phiếu thu gốc: <strong className="font-mono text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">{collectingInstallmentReceipt.code}</strong> · {paymentKindLabel(collectingInstallmentReceipt)}
            </p>

            {(() => {
              const student = students.find(s => s.id === collectingInstallmentReceipt.studentId);
              const cls = classes.find(c => c.id === collectingInstallmentReceipt.classId);
              const installments = getReceiptInstallments(collectingInstallmentReceipt);
              const totalFee = receiptFee(collectingInstallmentReceipt);

              return (
                <form onSubmit={handleSaveInstallment} className="space-y-4 text-xs">
                  {/* Summary Card */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{student?.name} ({student?.code})</div>
                        <div className="text-slate-500 text-[11px] mt-0.5">Lớp: {cls?.name} · Phụ huynh: {student?.parentName} ({student?.parentPhone})</div>
                      </div>
                      <span className="rounded-full bg-amber-100 text-amber-800 font-bold px-2 py-0.5 text-[10px]">
                        Còn nợ: {collectingInstallmentReceipt.debtAmount.toLocaleString('vi-VN')} đ
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <div className="text-[10px] text-slate-500">Tổng Học Phí</div>
                        <div className="font-bold text-slate-900 text-xs mt-0.5">{totalFee.toLocaleString('vi-VN')} đ</div>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                        <div className="text-[10px] text-emerald-700">Đã Đóng Trước Đó</div>
                        <div className="font-bold text-emerald-800 text-xs mt-0.5">{collectingInstallmentReceipt.paidAmount.toLocaleString('vi-VN')} đ</div>
                      </div>
                      <div className="bg-rose-50 p-2 rounded-lg border border-rose-200">
                        <div className="text-[10px] text-rose-700">Số Tiền Còn Nợ</div>
                        <div className="font-bold text-rose-800 text-xs mt-0.5">{collectingInstallmentReceipt.debtAmount.toLocaleString('vi-VN')} đ</div>
                      </div>
                    </div>
                  </div>

                  {/* Previous installments */}
                  {installments.length > 0 && (
                    <div className="rounded-xl border border-slate-200 p-3 bg-white">
                      <div className="font-bold text-slate-700 mb-2 flex items-center gap-1.5 text-[11px]">
                        <History className="w-3.5 h-3.5 text-slate-500" />
                        Lịch sử các đợt đã đóng ({installments.length} đợt):
                      </div>
                      <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
                        {installments.map((inst, i) => (
                          <div key={inst.id || i} className="flex justify-between items-center text-[11px] p-2 rounded-lg bg-slate-50 border border-slate-100">
                            <div>
                              <span className="font-bold text-slate-800">Đợt {i + 1}</span>
                              <span className="text-slate-500 ml-2">({inst.date})</span>
                              <span className="text-slate-500 ml-2">· {inst.paymentMethod || 'TM/CK'}</span>
                            </div>
                            <div className="font-bold text-emerald-700">+{inst.amount.toLocaleString('vi-VN')} đ</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Collection Form Inputs */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-3">
                    <div className="font-extrabold text-emerald-950 text-xs flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-700" />
                      Thông tin đợt thu này (Đợt {installments.length + 1}):
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Số Tiền Thu Lần Này (VNĐ) *</label>
                        <input
                          type="number"
                          min="1"
                          max={collectingInstallmentReceipt.debtAmount}
                          value={installmentAmountInput}
                          onChange={(e) => {
                            setInstallmentAmountInput(Number(e.target.value));
                            setInstallmentError(null);
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl font-extrabold text-emerald-800 text-sm bg-white"
                          required
                        />
                        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                          <span>Còn nợ: {collectingInstallmentReceipt.debtAmount.toLocaleString('vi-VN')} đ</span>
                          <button
                            type="button"
                            onClick={() => setInstallmentAmountInput(collectingInstallmentReceipt.debtAmount)}
                            className="text-emerald-700 font-bold hover:underline"
                          >
                            Đóng đủ hết nợ
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Ngày Thu Tiền *</label>
                        <input
                          type="date"
                          value={installmentDateInput}
                          onChange={(e) => {
                            setInstallmentDateInput(e.target.value);
                            setInstallmentError(null);
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-bold text-slate-800"
                          required
                        />
                        <p className="mt-1 text-[10px] text-emerald-800 font-medium">
                          ✓ Ghi nhận vào doanh thu tháng {installmentDateInput.slice(0, 7)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Hình Thức Thanh Toán</label>
                        <select
                          value={installmentMethod}
                          onChange={(e) => setInstallmentMethod(e.target.value as any)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                        >
                          <option value="Chuyển khoản">Chuyển khoản Ngân hàng</option>
                          <option value="Tiền mặt">Tiền mặt tại trung tâm</option>
                          <option value="Thẻ">Quẹt thẻ POS</option>
                          <option value="Chưa xác định">TM/CK (chưa xác định)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Ghi Chú Đợt Thu Này</label>
                        <input
                          type="text"
                          value={installmentNotes}
                          onChange={(e) => setInstallmentNotes(e.target.value)}
                          placeholder="Ví dụ: Đóng học phí đợt cuối"
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Người Thu Tiền (Ký & Ghi rõ họ tên)</label>
                      <input
                        type="text"
                        value={installmentCollectorInput}
                        onChange={(e) => setInstallmentCollectorInput(e.target.value)}
                        placeholder="Nhập họ tên người thu đợt này (để trống nếu ký tay)..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    {/* Preview after submit */}
                    {(() => {
                      const remainAfter = Math.max(collectingInstallmentReceipt.debtAmount - installmentAmountInput, 0);
                      const isComplete = remainAfter === 0;
                      return (
                        <div className={`p-2.5 rounded-lg border text-[11px] ${isComplete ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950 font-bold' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                          {isComplete ? (
                            <span>🎉 Học viên sẽ chuyển sang trạng thái <strong>"Đã đóng đủ"</strong>. Doanh thu tháng {installmentDateInput.slice(0, 7)} tăng thêm <strong>+{installmentAmountInput.toLocaleString('vi-VN')} đ</strong>.</span>
                          ) : (
                            <span>Sau khi thu, học viên còn nợ lại <strong>{remainAfter.toLocaleString('vi-VN')} đ</strong>. Doanh thu tháng {installmentDateInput.slice(0, 7)} tăng thêm <strong>+{installmentAmountInput.toLocaleString('vi-VN')} đ</strong>.</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {installmentError && (
                    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                      {installmentError}
                    </p>
                  )}

                  <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCollectingInstallmentReceipt(null)}
                      className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-800 flex items-center gap-1.5 shadow-sm"
                    >
                      <Save className="w-4 h-4 text-emerald-200" /> Xác Nhận Thu Tiền & Cập Nhật Doanh Thu
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </DialogFrame>
      )}

      {deadlineReceipt && <DialogFrame label="Điều chỉnh hạn thanh toán" onClose={() => setDeadlineReceipt(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><form className="dialog-panel w-full max-w-md space-y-4 rounded-2xl bg-white p-5 text-sm" onSubmit={e => { e.preventDefault(); if (!canCollect || (deadlineValue && !isCalendarDate(deadlineValue))) { setDeadlineError('Hạn thanh toán không hợp lệ.'); return; } if (onUpdateReceipt({ ...deadlineReceipt, dueDate: deadlineValue || undefined }) === false) return; setDeadlineReceipt(null); }}><h3 className="font-bold">Hạn thanh toán · {deadlineReceipt.code}</h3><p className="text-xs text-slate-500">Đơn giá và các buổi trên phiếu được giữ nguyên. Dùng Thu đợt tiếp để ghi nhận tiền nhận thêm.</p><label className="block">Hạn thanh toán<input aria-label="Hạn thanh toán phiếu theo buổi" type="date" value={deadlineValue} onChange={e => setDeadlineValue(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>{deadlineError && <p role="alert" className="text-red-700">{deadlineError}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setDeadlineReceipt(null)} className="rounded-lg border px-3 py-2">Đóng</button>{canCollect && <button className="rounded-lg bg-amber-500 px-3 py-2 font-bold">Lưu hạn thanh toán</button>}</div></form></DialogFrame>}
      {pendingReceiptAction && (
        <DialogFrame label="Xác nhận thao tác phiếu thu" onClose={() => setPendingReceiptAction(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section    className="dialog-panel w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-extrabold text-slate-900">{pendingReceiptAction.type === 'delete' ? 'Xóa phiếu thu?' : pendingReceiptAction.isUpdate ? 'Hoàn thành cập nhật?' : 'Hoàn thành lập phiếu?'}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {pendingReceiptAction.type === 'delete'
                ? `Bạn có chắc muốn xóa ${pendingReceiptAction.receipt.code}? Công nợ của học viên sẽ được tính lại ngay.`
                : `${pendingReceiptAction.isUpdate ? 'Cập nhật' : 'Lưu'} ${pendingReceiptAction.receipt.code} cho ${students.find((student) => student.id === pendingReceiptAction.receipt.studentId)?.name || 'học viên'}?`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingReceiptAction(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Không</button>
              <button type="button" onClick={handleConfirmReceiptAction} className={`rounded-xl px-4 py-2 text-xs font-bold text-white ${pendingReceiptAction.type === 'delete' ? 'bg-rose-700 hover:bg-rose-800' : 'bg-emerald-700 hover:bg-emerald-800'}`}>Có, {pendingReceiptAction.type === 'delete' ? 'xóa' : 'hoàn thành'}</button>
            </div>
          </section>
        </DialogFrame>
      )}

      {selectedReceipt && <ReceiptPreview receipt={selectedReceipt} settings={settings} students={students} classes={classes} onClose={() => setSelectedReceipt(null)} onCollectInstallment={handleOpenCollectInstallment} />}

    </div>
  );
};
