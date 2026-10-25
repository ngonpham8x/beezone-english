import type { TuitionReceipt } from '../../types';

export function formatInvoiceBook(
  item?: { invoiceBook?: string; invoiceNo?: string; bookNo?: string } | null,
): string {
  if (!item) return '......... / .........';
  if (item.invoiceBook?.trim()) return item.invoiceBook.trim();
  if (item.invoiceNo?.trim() || item.bookNo?.trim()) {
    return `${item.invoiceNo?.trim() || '.......'} / ${item.bookNo?.trim() || '.......'}`;
  }
  return '......... / .........';
}

export const receiptStatus = (
  receipt: Pick<TuitionReceipt, 'paidAmount' | 'debtAmount' | 'status'>,
) => {
  if (receipt.debtAmount > 0)
    return receipt.paidAmount > 0 ? ('partial' as const) : ('debt' as const);
  return receipt.paidAmount > 0 ? ('paid' as const) : ('unpaid' as const);
};

export const receiptStatusLabel: Record<'paid' | 'partial' | 'unpaid' | 'debt', string> = {
  paid: 'Đã hoàn thành',
  partial: 'Chưa hoàn thành',
  unpaid: 'Chưa hoàn thành',
  debt: 'Chưa hoàn thành',
};

export const receiptStatusClass: Record<'paid' | 'partial' | 'unpaid' | 'debt', string> = {
  paid: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  unpaid: 'bg-rose-100 text-rose-800',
  debt: 'bg-rose-100 text-rose-800',
};
