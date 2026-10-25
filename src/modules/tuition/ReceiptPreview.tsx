import { DollarSign, Printer, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import logoImg from '../../assets/images/beezone-logo.png';
import { DialogFrame } from '../../components/DialogFrame';
import {
  getReceiptInstallments,
  paymentKindLabel,
  paymentMethodLabel,
  paymentPeriodLabel,
  receiptFee,
} from '../../lib/tuition';
import type { CenterSettings, ClassRoom, Student, TuitionReceipt } from '../../types';
import { receiptStatus, receiptStatusLabel } from './receiptPresentation';

export function formatInvoiceBook(item?: { invoiceBook?: string; invoiceNo?: string; bookNo?: string; code?: string } | null): string {
  if (!item) return '......... / .........';
  if (item.invoiceBook?.trim()) return item.invoiceBook.trim();
  if (item.invoiceNo?.trim() || item.bookNo?.trim()) {
    return `${item.invoiceNo?.trim() || '.......'} / ${item.bookNo?.trim() || '.......'}`;
  }
  return '......... / .........';
}

interface Props {
  receipt: TuitionReceipt;
  settings: CenterSettings;
  students: Student[];
  classes: ClassRoom[];
  onClose: () => void;
  onCollectInstallment: (receipt: TuitionReceipt) => void;
}
export function ReceiptPreview({
  receipt: selectedReceipt,
  settings,
  students,
  classes,
  onClose,
  onCollectInstallment,
}: Props) {
  const handlePrintReceipt = () => {
    const prevTitle = document.title;
    const invTitle = selectedReceipt?.invoiceBook ? selectedReceipt.invoiceBook.replace(/[^a-zA-Z0-9]/g, '_') : (selectedReceipt?.code || 'HocPhi');
    document.title = `BEEZONE_PhieuThu_${invTitle}`;
    document.body.dataset.printing = 'tuition-receipt';
    const pageStyle = document.createElement('style');
    pageStyle.id = 'tuition-receipt-page-style';
    pageStyle.textContent = '@page { size: A5 portrait !important; margin: 6mm !important; }';
    document.head.appendChild(pageStyle);
    const cleanup = () => {
      delete document.body.dataset.printing;
      pageStyle.remove();
      document.title = prevTitle;
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <DialogFrame
      label="In phiếu thu"
      onClose={onClose}
      data-print-receipt-overlay
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
    >
      <div
        data-print-receipt
        style={{ fontFamily: '"Times New Roman", Times, Georgia, serif', fontSize: '13pt' }}
        className="dialog-panel bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl border border-slate-300 relative print:m-0 print:p-3 print:shadow-none print:border-none print:w-full leading-normal text-slate-900"
      >
        <button
          aria-label="Đóng"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg print:hidden"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Receipt Content */}
        <div className="border-2 border-slate-900 p-6 rounded-xl space-y-4">
          <div className="relative border-b-2 border-slate-900 pb-4 text-center">
            <img
              src={logoImg}
              onError={(event) => {
                event.currentTarget.src = '/beezone-logo.png';
              }}
              alt="Logo BeeZone English"
              className="absolute left-2 top-0 h-14 w-14 rounded-full border border-slate-200 bg-white object-cover"
            />
            <div className="min-h-14 px-16">
              <h2 className="whitespace-nowrap font-extrabold text-slate-900 text-[14px] uppercase tracking-tight">
                {settings.name}
              </h2>
              <p className="text-xs text-slate-600">{settings.address}</p>
              <p className="text-xs text-slate-600">Hotline: {settings.phone}</p>
              <p className="text-xs text-slate-600">Email: {settings.email}</p>
              <h3 className="text-xl font-black text-slate-900 uppercase mt-2.5 tracking-widest">
                PHIẾU THU HỌC PHÍ
              </h3>
              <p className="text-xs font-bold text-amber-900">
                SHĐ/Quyển: {formatInvoiceBook(selectedReceipt)}
              </p>
            </div>
          </div>

          {(() => {
            const student = students.find((s) => s.id === selectedReceipt.studentId);
            const cls = classes.find((c) => c.id === selectedReceipt.classId);
            const installments = getReceiptInstallments(selectedReceipt);

            return (
              <div className="space-y-2 text-xs text-slate-800">
                <div>
                  Họ và tên học sinh: <strong className="text-sm">{student?.name}</strong> (Mã HS:{' '}
                  {student?.code})
                </div>
                <div>
                  Phụ huynh đại diện: <strong>{student?.parentName}</strong> - SĐT:{' '}
                  <strong>{student?.parentPhone}</strong>
                </div>
                <div>
                  Lớp đăng ký học: <strong>{cls?.name}</strong>
                </div>
                <div>
                  {paymentKindLabel(selectedReceipt)}:{' '}
                  <strong>{receiptFee(selectedReceipt).toLocaleString('vi-VN')} đ</strong>
                </div>
                {selectedReceipt.paymentKind === 'session' && (
                  <div className="my-3 rounded-lg border border-slate-200 p-3">
                    <strong>Chi tiết {selectedReceipt.sessionLines?.length || 0} buổi học</strong>
                    {selectedReceipt.sessionLines?.map((line) => (
                      <div
                        key={line.attendanceSessionId}
                        className="mt-1 flex justify-between gap-3"
                      >
                        <span>{line.date.split('-').reverse().join('/')}</span>
                        <span>{line.unitPrice.toLocaleString('vi-VN')} đ</span>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  Khoản thu:{' '}
                  <strong>
                    {paymentKindLabel(selectedReceipt)} · {paymentPeriodLabel(selectedReceipt)}
                  </strong>
                </div>
                <div>
                  Số tiền thực đóng:{' '}
                  <strong className="text-base text-slate-950 font-black">
                    {selectedReceipt.paidAmount.toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                {selectedReceipt.debtAmount > 0 && (
                  <div>
                    Số tiền còn lại:{' '}
                    <strong className="text-rose-700">
                      {selectedReceipt.debtAmount.toLocaleString('vi-VN')} đ
                    </strong>
                  </div>
                )}
                <div>
                  Tình trạng: <strong>{receiptStatusLabel[receiptStatus(selectedReceipt)]}</strong>
                </div>
                <div>
                  Hình thức thanh toán:{' '}
                  <strong>{paymentMethodLabel(selectedReceipt.paymentMethod)}</strong>
                </div>
                <div>
                  Ngày lập phiếu: <strong>{selectedReceipt.paymentDate}</strong>
                </div>
                <div>
                  Ghi chú: <em>{selectedReceipt.notes || 'Đã hoàn tất thanh toán'}</em>
                </div>

                {installments.length > 0 && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="font-extrabold text-slate-900 mb-2 flex items-center justify-between text-xs">
                      <span>Chi tiết các đợt đóng tiền ({installments.length} đợt)</span>
                      <span className="text-emerald-700 font-bold">
                        {selectedReceipt.paidAmount.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {installments.map((inst, idx) => {
                        const instInvoice =
                          formatInvoiceBook(inst) !== '......... / .........'
                            ? formatInvoiceBook(inst)
                            : idx === 0 && formatInvoiceBook(selectedReceipt) !== '......... / .........'
                            ? formatInvoiceBook(selectedReceipt)
                            : '......... / .........';

                        return (
                          <div
                            key={inst.id || idx}
                            className="flex flex-wrap justify-between items-center text-[12px] bg-white p-2.5 rounded-lg border border-slate-200 gap-1"
                          >
                            <div>
                              <span className="font-bold text-slate-900">
                                Đợt {idx + 1} ({inst.date}):
                              </span>
                              <span className="text-emerald-800 font-bold ml-1.5">
                                +{inst.amount.toLocaleString('vi-VN')} đ
                              </span>
                              <span className="text-slate-500 ml-1.5">
                                ({inst.paymentMethod || 'TM/CK'})
                              </span>
                              <span className="text-amber-900 font-bold ml-2">
                                · SHĐ/Quyển: {instInvoice}
                              </span>
                            </div>
                            <span className="text-slate-500 italic text-[11px]">
                              {inst.notes || '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="pt-8 grid grid-cols-2 text-center text-xs font-bold">
            <div>
              <p>HỌC SINH / PHỤ HUYNH</p>
              <p className="text-[10px] text-slate-400 font-normal">(Ký & ghi rõ họ tên)</p>
              <div className="h-14 flex items-end justify-center text-slate-400 text-[11px] font-normal italic print:text-transparent">
                (Ký tay)
              </div>
            </div>
            <div>
              <p>NGƯỜI THU TIỀN</p>
              <p className="text-[10px] text-slate-400 font-normal">(Ký & ghi rõ họ tên)</p>
              <div className="h-14 flex items-end justify-center font-bold text-slate-900">
                {selectedReceipt.collectorName ? (
                  <span>{selectedReceipt.collectorName}</span>
                ) : (
                  <span className="text-slate-400 text-[11px] font-normal italic print:text-transparent">
                    (Ký tay)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Đóng
          </button>
          {selectedReceipt.debtAmount > 0 && (
            <button
              onClick={() => {
                const rc = selectedReceipt;
                onClose();
                onCollectInstallment(rc);
              }}
              className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 flex items-center gap-1.5 shadow-sm"
            >
              <DollarSign className="w-4 h-4 text-emerald-200" /> Thu Nợ / Đóng Đợt Tiếp
            </button>
          )}
          <button
            onClick={handlePrintReceipt}
            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Printer className="w-4 h-4 text-amber-400" /> In Phiếu Thu (PDF)
          </button>
        </div>
      </div>
    </DialogFrame>,
    document.body,
  );
}
