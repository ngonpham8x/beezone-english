import { DollarSign, Printer, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
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
import { formatInvoiceBook, formatReceiptDate, receiptStatus, receiptStatusLabel } from './receiptPresentation';

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
  const cleanPhone = (settings.phone || '').replace(/[-–•|]?\s*Email\s*:?.*$/i, '').trim() || '0847 163 670 - 038 440 6157';
  const cleanEmail = (settings.email || '').trim() || 'beezone.englishcenter@gmail.com';
  const installmentOptions = useMemo(
    () => getReceiptInstallments(selectedReceipt).map((installment, index) => ({
      installment,
      index,
      key: `${index}:${installment.id || 'installment'}`,
    })),
    [selectedReceipt],
  );
  const allInstallmentKeys = useMemo(
    () => installmentOptions.map((option) => option.key),
    [installmentOptions],
  );
  const [selectedInstallmentKeys, setSelectedInstallmentKeys] = useState<string[]>(allInstallmentKeys);

  useEffect(() => {
    setSelectedInstallmentKeys(allInstallmentKeys);
  }, [allInstallmentKeys]);

  const selectedInstallmentKeySet = new Set(selectedInstallmentKeys);
  const selectedInstallmentOptions = installmentOptions.filter((option) => selectedInstallmentKeySet.has(option.key));
  const selectedInstallmentTotal = selectedInstallmentOptions.reduce(
    (sum, option) => sum + option.installment.amount,
    0,
  );
  const allInstallmentsSelected = installmentOptions.length > 0 && selectedInstallmentOptions.length === installmentOptions.length;
  const canPrintReceipt = installmentOptions.length === 0 || selectedInstallmentOptions.length > 0;

  const handlePrintReceipt = () => {
    const prevTitle = document.title;
    const invTitle = selectedReceipt?.invoiceBook ? selectedReceipt.invoiceBook.replace(/[^a-zA-Z0-9]/g, '_') : (selectedReceipt?.code || 'HocPhi');
    document.title = `BEEZONE_PhieuThu_${invTitle}`;
    document.body.dataset.printing = 'tuition-receipt';
    const pageStyle = document.createElement('style');
    pageStyle.id = 'tuition-receipt-page-style';
    pageStyle.textContent = '@page { size: A5 portrait !important; margin: 5mm !important; }';
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
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50"
    >
      <div
        data-print-receipt
        style={{ fontFamily: '"Times New Roman", Times, Georgia, serif', fontSize: '13pt' }}
        className="dialog-panel bg-white rounded-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-slate-300 relative print:m-0 print:p-2 print:shadow-none print:border-none print:w-full leading-normal text-slate-900"
      >
        <button
          aria-label="Đóng"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg print:hidden"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Receipt Content */}
        <div className="border-2 border-slate-900 p-5 rounded-xl space-y-3.5 print:border-2 print:p-4">
          <div className="relative border-b-2 border-slate-900 pb-3 text-center">
            <img
              src={logoImg}
              onError={(event) => {
                event.currentTarget.src = '/beezone-logo.png';
              }}
              alt="Logo BeeZone English"
              className="absolute left-1 top-0 h-14 w-14 rounded-full border border-slate-200 bg-white object-cover print:h-12 print:w-12"
            />
            <div className="min-h-14 px-12 sm:px-14">
              <h2 className="whitespace-nowrap font-extrabold text-slate-900 text-[15px] uppercase tracking-tight">
                {settings.name || 'ANH NGỮ BEEZONE'}
              </h2>
              <p className="text-[12px] text-slate-700 leading-tight">{settings.address}</p>
              <p className="text-[12px] text-slate-700 leading-tight">Hotline: {cleanPhone}</p>
              <p className="text-[12px] text-slate-700 leading-tight">Email: {cleanEmail}</p>
              <h3 className="text-xl font-black text-slate-900 uppercase mt-2 tracking-widest">
                PHIẾU THU HỌC PHÍ
              </h3>
              <p className="text-sm font-bold text-amber-900 mt-0.5">
                SHĐ/Quyển: {formatInvoiceBook(selectedReceipt)}
              </p>
            </div>
          </div>

          {(() => {
            const student = students.find((s) => s.id === selectedReceipt.studentId);
            const cls = classes.find((c) => c.id === selectedReceipt.classId);

            return (
              <div
                className="space-y-1.5 text-[13pt] text-slate-900 leading-snug"
                style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
              >
                <div>
                  Họ và tên học sinh: <strong className="text-[13.5pt]">{student?.name}</strong> (Mã HS:{' '}
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
                  <div className="my-2 rounded-lg border border-slate-300 p-2.5">
                    <strong>Chi tiết {selectedReceipt.sessionLines?.length || 0} buổi học</strong>
                    {selectedReceipt.sessionLines?.map((line) => (
                      <div
                        key={line.attendanceSessionId}
                        className="mt-1 flex justify-between gap-3 text-[12pt]"
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
                  <strong className="text-[14pt] text-slate-950 font-black">
                    {selectedReceipt.paidAmount.toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                <div>
                  Số tiền còn lại:{' '}
                  <strong className={selectedReceipt.debtAmount > 0 ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}>
                    {selectedReceipt.debtAmount.toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                <div>
                  Tình trạng: <strong>{receiptStatusLabel[receiptStatus(selectedReceipt)]}</strong>
                </div>
                <div>
                  Hình thức thanh toán:{' '}
                  <strong>{paymentMethodLabel(selectedReceipt.paymentMethod)}</strong>
                </div>
                <div>
                  Ngày lập phiếu: <strong>{formatReceiptDate(selectedReceipt.paymentDate)}</strong>
                </div>
                <div>
                  Ghi chú: <em>{selectedReceipt.notes || 'Đã hoàn tất thanh toán'}</em>
                </div>

                {installmentOptions.length > 0 && (
                  <div className="mt-2.5 rounded-xl border border-slate-300 bg-slate-50/80 p-2.5">
                    <div className="font-extrabold text-slate-900 mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[12.5pt]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Chi tiết các đợt đóng tiền ({selectedInstallmentOptions.length} đợt đã chọn)</span>
                        <label className="print:hidden inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10.5pt] font-bold text-slate-700">
                          <input
                            type="checkbox"
                            aria-label="Chọn tất cả các đợt để in"
                            checked={allInstallmentsSelected}
                            onChange={(event) => setSelectedInstallmentKeys(event.target.checked ? allInstallmentKeys : [])}
                            className="h-4 w-4 accent-amber-500"
                          />
                          Chọn tất cả
                        </label>
                      </div>
                      <span className="text-emerald-700 font-bold">
                        {selectedInstallmentTotal.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {installmentOptions.map(({ installment: inst, index: idx, key }) => {
                        const selectedForPrint = selectedInstallmentKeySet.has(key);
                        const instInvoice =
                          formatInvoiceBook(inst) !== '......... / .........'
                            ? formatInvoiceBook(inst)
                            : installmentOptions.length === 1 && formatInvoiceBook(selectedReceipt) !== '......... / .........'
                            ? formatInvoiceBook(selectedReceipt)
                            : '......... / .........';

                        return (
                          <label
                            key={key}
                            data-print-installment-selected={selectedForPrint ? 'true' : 'false'}
                            className={`flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 text-[12pt] leading-snug transition ${
                              selectedForPrint ? 'border-slate-200' : 'border-slate-200 opacity-55'
                            }`}
                          >
                            <input
                              type="checkbox"
                              aria-label={`In đợt ${idx + 1} ngày ${formatReceiptDate(inst.date)}`}
                              checked={selectedForPrint}
                              onChange={(event) => setSelectedInstallmentKeys((current) =>
                                event.target.checked
                                  ? (current.includes(key) ? current : [...current, key])
                                  : current.filter((item) => item !== key),
                              )}
                              className="print:hidden h-4 w-4 shrink-0 cursor-pointer accent-amber-500"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-slate-900">
                                Đợt {idx + 1} ({formatReceiptDate(inst.date)}):
                              </span>
                              <span className="text-emerald-800 font-bold ml-1.5">
                                +{inst.amount.toLocaleString('vi-VN')} đ
                              </span>
                              <span className="text-slate-600 ml-1.5">
                                ({inst.paymentMethod || 'TM/CK'})
                              </span>
                              <span className="text-amber-900 font-bold ml-2">
                                · SHĐ/Quyển: {instInvoice}
                              </span>
                            </div>
                            <span className="text-slate-500 italic text-[11pt]">
                              {inst.notes || '—'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="pt-6 grid grid-cols-2 text-center text-[12pt] font-bold">
            <div>
              <p>HỌC SINH / PHỤ HUYNH</p>
              <p className="text-[10pt] text-slate-500 font-normal">(Ký & ghi rõ họ tên)</p>
              <div className="h-12 flex items-end justify-center text-slate-400 text-[10pt] font-normal italic print:text-transparent">
                (Ký tay)
              </div>
            </div>
            <div>
              <p>NGƯỜI THU TIỀN</p>
              <p className="text-[10pt] text-slate-500 font-normal">(Ký & ghi rõ họ tên)</p>
              <div className="h-12 flex items-end justify-center font-bold text-slate-900">
                {selectedReceipt.collectorName ? (
                  <span>{selectedReceipt.collectorName}</span>
                ) : (
                  <span className="text-slate-400 text-[10pt] font-normal italic print:text-transparent">
                    (Ký tay)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3 print:hidden">
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
              <DollarSign className="w-4 h-4 text-emerald-200" /> Thu Tiếp / Đóng Đợt Tiếp
            </button>
          )}
          <button
            onClick={handlePrintReceipt}
            disabled={!canPrintReceipt}
            title={!canPrintReceipt ? 'Chọn ít nhất một đợt đóng tiền để in.' : undefined}
            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 flex items-center gap-1.5 shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:active:scale-100"
          >
            <Printer className="w-4 h-4 text-amber-400" /> In Phiếu Thu (PDF)
          </button>
        </div>
      </div>
    </DialogFrame>,
    document.body,
  );
}
