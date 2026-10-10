import { FeeStatus, TuitionReceipt } from '../types';

export type TuitionPaymentKind = 'course' | 'monthly';

export const paymentKindOf = (receipt: Pick<TuitionReceipt, 'paymentKind'>): TuitionPaymentKind => (
  receipt.paymentKind === 'course' ? 'course' : 'monthly'
);

export const paymentKindLabel = (receipt: Pick<TuitionReceipt, 'paymentKind'>) => (
  paymentKindOf(receipt) === 'course' ? 'Học phí khóa' : 'Học phí tháng'
);

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
  return period || (paymentKindOf(receipt) === 'monthly' ? `Tháng ${receipt.paymentDate.slice(5, 7)}/${receipt.paymentDate.slice(0, 4)}` : 'Chưa ghi mốc khóa');
};

export interface TuitionDebtBreakdown {
  total: number;
  monthly: number;
  course: number;
}

export const debtBreakdown = (receipts: TuitionReceipt[]): TuitionDebtBreakdown => {
  // Nhóm các phiếu thu theo học viên và kỳ/khóa để tính công nợ chính xác
  // khi học viên đóng học phí nhiều đợt (đợt 1, đợt 2, đợt cuối...)
  const courseGroups = new Map<string, TuitionReceipt[]>();
  const monthlyGroups = new Map<string, TuitionReceipt[]>();

  for (const receipt of receipts) {
    const periodKey = (receipt.billingPeriod || '').trim().toLowerCase();
    const key = `${receipt.studentId}::${receipt.classId || 'default'}::${periodKey}`;
    if (paymentKindOf(receipt) === 'course') {
      const group = courseGroups.get(key) || [];
      group.push(receipt);
      courseGroups.set(key, group);
    } else {
      const group = monthlyGroups.get(key) || [];
      group.push(receipt);
      monthlyGroups.set(key, group);
    }
  }

  let courseDebt = 0;
  for (const group of courseGroups.values()) {
    if (group.length === 1) {
      courseDebt += Math.max(group[0].debtAmount || 0, 0);
    } else {
      const maxCourseFee = Math.max(...group.map(r => r.courseFee || 0));
      const maxDiscount = Math.max(...group.map(r => r.discount || 0));
      const totalPaid = group.reduce((sum, r) => sum + Math.max(r.paidAmount || 0, 0), 0);
      const totalDue = Math.max(maxCourseFee - maxDiscount, 0);
      if (totalDue > 0) {
        courseDebt += Math.max(totalDue - totalPaid, 0);
      } else {
        courseDebt += group.reduce((sum, r) => sum + Math.max(r.debtAmount || 0, 0), 0);
      }
    }
  }

  let monthlyDebt = 0;
  for (const group of monthlyGroups.values()) {
    if (group.length === 1) {
      monthlyDebt += Math.max(group[0].debtAmount || 0, 0);
    } else {
      const maxMonthlyFee = Math.max(...group.map(r => r.monthlyFee || 0));
      const maxDiscount = Math.max(...group.map(r => r.discount || 0));
      const totalPaid = group.reduce((sum, r) => sum + Math.max(r.paidAmount || 0, 0), 0);
      const totalDue = Math.max(maxMonthlyFee - maxDiscount, 0);
      if (totalDue > 0) {
        monthlyDebt += Math.max(totalDue - totalPaid, 0);
      } else {
        monthlyDebt += group.reduce((sum, r) => sum + Math.max(r.debtAmount || 0, 0), 0);
      }
    }
  }

  return {
    total: courseDebt + monthlyDebt,
    monthly: monthlyDebt,
    course: courseDebt,
  };
};

export const feeStatusForReceipts = (receipts: TuitionReceipt[]): FeeStatus => {
  const debt = debtBreakdown(receipts).total;
  const paid = receipts.reduce((sum, receipt) => sum + Math.max(receipt.paidAmount || 0, 0), 0);
  if (debt > 0) return paid > 0 ? 'partial' : 'debt';
  return paid > 0 ? 'paid' : 'unpaid';
};
