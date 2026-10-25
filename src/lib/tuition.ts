import { ClassRoom, CourseProgram, FeeStatus, Student, TuitionInstallment, TuitionReceipt } from '../types';
import { isStudentInClass, studentClassIds } from './studentClasses';

export type TuitionPaymentKind = 'course' | 'monthly' | 'session';

export const paymentKindOf = (receipt: Pick<TuitionReceipt, 'paymentKind'>): TuitionPaymentKind => (
  receipt.paymentKind === 'course' ? 'course' : receipt.paymentKind === 'session' ? 'session' : 'monthly'
);

export const paymentKindLabel = (receipt: Pick<TuitionReceipt, 'paymentKind'>) => (
  paymentKindOf(receipt) === 'course' ? 'Học phí khóa' : paymentKindOf(receipt) === 'session' ? 'Học phí buổi' : 'Học phí tháng'
);

export const receiptFee = (receipt: TuitionReceipt) => paymentKindOf(receipt) === 'session' ? receipt.sessionFee || 0 : paymentKindOf(receipt) === 'course' ? receipt.courseFee : receipt.monthlyFee || 0;

// "Chưa xác định" is an internal value. Documents should display the
// conventional cash/bank-transfer placeholder instead of an unfinished state.
export const paymentMethodLabel = (method?: TuitionReceipt['paymentMethod']) => (
  !method || method === 'Chưa xác định' ? 'TM/CK' : method
);

export const paymentPeriodLabel = (receipt: Pick<TuitionReceipt, 'paymentKind' | 'billingPeriod' | 'paymentDate'>) => {
  const period = receipt.billingPeriod?.trim();
  if (paymentKindOf(receipt) === 'monthly' && period && /^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-');
    return `Tháng ${month}/${year}`;
  }
  return period || (paymentKindOf(receipt) === 'monthly' ? `Tháng ${receipt.paymentDate.slice(5, 7)}/${receipt.paymentDate.slice(0, 4)}` : paymentKindOf(receipt) === 'session' ? 'Thu theo buổi học' : 'Chưa ghi mốc khóa');
};

export interface TuitionDebtBreakdown {
  total: number;
  monthly: number;
  course: number;
  session: number;
}

export const debtBreakdown = (receipts: TuitionReceipt[]): TuitionDebtBreakdown => receipts.reduce<TuitionDebtBreakdown>((summary, receipt) => {
  const debt = Math.max(receipt.debtAmount || 0, 0);
  if (!debt) return summary;
  summary.total += debt;
  if (paymentKindOf(receipt) === 'course') summary.course += debt;
  else if (paymentKindOf(receipt) === 'session') summary.session += debt;
  else summary.monthly += debt;
  return summary;
}, { total: 0, monthly: 0, course: 0, session: 0 });

const emptyDebt = (): TuitionDebtBreakdown => ({ total: 0, monthly: 0, course: 0, session: 0 });

type DebtStudent = Pick<Student, 'id' | 'status' | 'feeStatus' | 'programId' | 'classId' | 'additionalClassIds'>;
type DebtClass = Pick<ClassRoom, 'id' | 'billingMode'> & Partial<Pick<ClassRoom, 'programId'>>;

const unbilledClassFee = (
  student: DebtStudent,
  classId: string,
  receipts: TuitionReceipt[],
  programs: Pick<CourseProgram, 'id' | 'tuitionFee'>[],
  classroom?: DebtClass,
): number => {
  if (student.status !== 'active' || classroom?.billingMode === 'session') return 0;
  // A paid legacy profile without any receipt may predate per-class billing.
  // A receipt for a different (former) class must not waive the current class.
  if (studentClassIds(student).length <= 1 && student.feeStatus === 'paid' &&
      !receipts.some(receipt => receipt.studentId === student.id)) return 0;
  if (receipts.some(receipt => receipt.studentId === student.id && receipt.classId === classId)) return 0;
  return Math.max(programs.find(item => item.id === (classroom?.programId || student.programId))?.tuitionFee || 0, 0);
};

/** Current class tuition without a receipt. Existing receipts retain their own agreed prices. */
export const unbilledDebtForStudent = (
  student: DebtStudent,
  receipts: TuitionReceipt[],
  programs: Pick<CourseProgram, 'id' | 'tuitionFee'>[],
  classes: DebtClass[],
): TuitionDebtBreakdown => {
  const result = emptyDebt();
  const ids = studentClassIds(student);
  for (const classId of ids.length ? ids : ['']) {
    const classroom = classes.find(item => item.id === classId);
    const amount = unbilledClassFee(student, classId, receipts, programs, classroom);
    result.total += amount;
    if (classroom?.billingMode === 'course') result.course += amount;
    else result.monthly += amount;
  }
  return result;
};

export const classTuitionDebtBreakdown = (
  classroom: DebtClass,
  students: DebtStudent[],
  receipts: TuitionReceipt[],
  programs: Pick<CourseProgram, 'id' | 'tuitionFee'>[],
): TuitionDebtBreakdown => {
  const result = debtBreakdown(receipts.filter(receipt => receipt.classId === classroom.id));
  for (const student of students) {
    if (!isStudentInClass(student, classroom.id)) continue;
    const amount = unbilledClassFee(student, classroom.id, receipts, programs, classroom);
    result.total += amount;
    if (classroom.billingMode === 'course') result.course += amount;
    else result.monthly += amount;
  }
  return result;
};

export const studentTuitionDebtBreakdown = (
  student: DebtStudent,
  receipts: TuitionReceipt[],
  programs: Pick<CourseProgram, 'id' | 'tuitionFee'>[],
  classes: DebtClass[],
): TuitionDebtBreakdown => {
  const recorded = debtBreakdown(receipts.filter(receipt => receipt.studentId === student.id));
  const unbilled = unbilledDebtForStudent(student, receipts, programs, classes);
  return {
    total: recorded.total + unbilled.total,
    monthly: recorded.monthly + unbilled.monthly,
    course: recorded.course + unbilled.course,
    session: recorded.session + unbilled.session,
  };
};

export const totalTuitionDebtBreakdown = (
  students: DebtStudent[],
  receipts: TuitionReceipt[],
  programs: Pick<CourseProgram, 'id' | 'tuitionFee'>[],
  classes: DebtClass[],
): TuitionDebtBreakdown => {
  const result = debtBreakdown(receipts);
  for (const student of students) {
    const unbilled = unbilledDebtForStudent(student, receipts, programs, classes);
    result.total += unbilled.total;
    result.monthly += unbilled.monthly;
    result.course += unbilled.course;
  }
  return result;
};

export const feeStatusForReceipts = (receipts: TuitionReceipt[]): FeeStatus => {
  const debt = debtBreakdown(receipts).total;
  const paid = receipts.reduce((sum, receipt) => sum + Math.max(receipt.paidAmount || 0, 0), 0);
  if (debt > 0) return paid > 0 ? 'partial' : 'debt';
  return paid > 0 ? 'paid' : 'unpaid';
};

export const isStudentOwingTuition = (
  student: Pick<Student, 'id' | 'status' | 'feeStatus'> & Partial<Pick<Student, 'classId' | 'additionalClassIds'>>,
  receipts: TuitionReceipt[] = [],
  classes: Pick<ClassRoom, 'id' | 'billingMode'>[] = [],
): boolean => {
  const studentReceipts = receipts.filter((receipt) => receipt.studentId === student.id);
  const debt = debtBreakdown(studentReceipts).total;
  if (debt > 0) return true;
  const ids = studentClassIds({ classId: student.classId || '', additionalClassIds: student.additionalClassIds });
  if (student.status === 'active' && (ids.length > 1 || studentReceipts.length > 0) &&
      ids.some(id => classes.find(c => c.id === id)?.billingMode !== 'session' && !studentReceipts.some(r => r.classId === id))) return true;
  return student.status === 'active' && student.feeStatus !== 'paid';
};

export const unbilledTuitionForStudents = (
  students: DebtStudent[],
  receipts: TuitionReceipt[] = [],
  programs: Pick<CourseProgram, 'id' | 'tuitionFee'>[] = [],
  classes: DebtClass[] = [],
): number => students.reduce((sum, student) => sum + unbilledDebtForStudent(student, receipts, programs, classes).total, 0);

export interface ReceiptPaymentEntry {
  receiptId: string;
  receiptCode: string;
  studentId: string;
  classId: string;
  date: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  amount: number;
  paymentKind: TuitionPaymentKind;
  paymentMethod: TuitionReceipt['paymentMethod'];
  collectorName: string;
  notes?: string;
  receipt: TuitionReceipt;
  isInstallment: boolean;
  installmentId?: string;
}

/**
 * Trả về danh sách từng giao dịch thu tiền thực tế (theo từng đợt đóng hoặc phiếu thu đơn lẻ).
 * Đối với học viên đóng nhiều đợt, mỗi đợt sẽ mang đúng ngày thu và số tiền của đợt đó để tính
 * doanh thu theo ngày/tuần/tháng chính xác tuyệt đối.
 */
export const getReceiptPaymentEntries = (receipts: TuitionReceipt[]): ReceiptPaymentEntry[] => {
  const entries: ReceiptPaymentEntry[] = [];

  for (const receipt of receipts) {
    if (Array.isArray(receipt.installments) && receipt.installments.length > 0) {
      let installmentsSum = 0;
      receipt.installments.forEach((inst, idx) => {
        if (inst.amount > 0) {
          installmentsSum += inst.amount;
          const date = inst.date || receipt.paymentDate;
          entries.push({
            receiptId: receipt.id,
            receiptCode: receipt.code,
            studentId: receipt.studentId,
            classId: receipt.classId,
            date,
            monthKey: date.slice(0, 7),
            amount: inst.amount,
            paymentKind: paymentKindOf(receipt),
            paymentMethod: inst.paymentMethod || receipt.paymentMethod,
            collectorName: inst.collectorName || receipt.collectorName,
            notes: inst.notes || (idx === 0 ? 'Thu đợt 1' : `Thu đợt ${idx + 1}`),
            receipt,
            isInstallment: true,
            installmentId: inst.id,
          });
        }
      });

      // Nếu tổng các đợt nhỏ hơn paidAmount, ghi nhận phần chênh lệch còn lại vào ngày paymentDate
      if (receipt.paidAmount > installmentsSum) {
        const remainingInitAmount = receipt.paidAmount - installmentsSum;
        const date = receipt.paymentDate || '';
        entries.push({
          receiptId: receipt.id,
          receiptCode: receipt.code,
          studentId: receipt.studentId,
          classId: receipt.classId,
          date,
          monthKey: date.slice(0, 7),
          amount: remainingInitAmount,
          paymentKind: paymentKindOf(receipt),
          paymentMethod: receipt.paymentMethod,
          collectorName: receipt.collectorName,
          notes: receipt.notes || 'Thu đợt 1',
          receipt,
          isInstallment: false,
        });
      }
    } else if (receipt.paidAmount > 0) {
      const date = receipt.paymentDate || '';
      entries.push({
        receiptId: receipt.id,
        receiptCode: receipt.code,
        studentId: receipt.studentId,
        classId: receipt.classId,
        date,
        monthKey: date.slice(0, 7),
        amount: receipt.paidAmount,
        paymentKind: paymentKindOf(receipt),
        paymentMethod: receipt.paymentMethod,
        collectorName: receipt.collectorName,
        notes: receipt.notes,
        receipt,
        isInstallment: false,
      });
    }
  }

  return entries;
};

/**
 * Trả về danh sách đầy đủ các đợt đóng tiền của 1 phiếu thu.
 * Nếu phiếu chưa có mảng installments, tự động chuẩn hóa 1 đợt ban đầu từ receipt.paidAmount.
 */
export const getReceiptInstallments = (receipt: TuitionReceipt): TuitionInstallment[] => {
  if (Array.isArray(receipt.installments) && receipt.installments.length > 0) {
    const installments = [...receipt.installments];
    const recorded = installments.reduce((sum, entry) => sum + Math.max(entry.amount, 0), 0);
    if (receipt.paidAmount > recorded) installments.unshift({
      id: `inst_${receipt.id}_init`, date: receipt.paymentDate,
      amount: receipt.paidAmount - recorded, paymentMethod: receipt.paymentMethod,
      collectorName: receipt.collectorName,
      invoiceNo: receipt.invoiceNo,
      bookNo: receipt.bookNo,
      invoiceBook: receipt.invoiceBook,
      notes: 'Khoản đã thu trước các đợt ghi nhận',
    });
    return installments;
  }
  if (receipt.paidAmount > 0) {
    return [
      {
        id: `inst_${receipt.id}_init`,
        date: receipt.paymentDate,
        amount: receipt.paidAmount,
        paymentMethod: receipt.paymentMethod,
        collectorName: receipt.collectorName,
        invoiceNo: receipt.invoiceNo,
        bookNo: receipt.bookNo,
        invoiceBook: receipt.invoiceBook,
        notes: 'Đóng học phí đợt 1',
      },
    ];
  }
  return [];
};
