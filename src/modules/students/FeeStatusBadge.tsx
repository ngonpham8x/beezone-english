import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import type React from 'react';
import type { FeeStatus } from '../../types';
export const FeeStatusBadge: React.FC<{
  feeStatus: FeeStatus;
  monthlyDebt?: number;
  courseDebt?: number;
  sessionDebt?: number;
}> = ({ feeStatus, monthlyDebt = 0, courseDebt = 0, sessionDebt = 0 }) => {
  const isPaid = feeStatus === 'paid' && monthlyDebt + courseDebt + sessionDebt === 0;
  const isUnpaid = feeStatus === 'unpaid';
  const label = isPaid ? 'Đã hoàn thành' : 'Chưa hoàn thành';
  const className = isPaid
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : isUnpaid
      ? 'bg-rose-100 text-rose-800 border-rose-300'
      : 'bg-amber-100 text-amber-800 border-amber-300';
  const Icon = isPaid ? CheckCircle : isUnpaid ? XCircle : AlertCircle;

  return (
    <div className="space-y-1">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${className}`}
      >
        <Icon className="w-3 h-3 mr-1" /> {label}
      </span>
      {monthlyDebt > 0 && (
        <div className="text-[10px] font-bold text-rose-700">
          Còn lại tháng: {monthlyDebt.toLocaleString('vi-VN')} đ
        </div>
      )}
      {courseDebt > 0 && (
        <div className="text-[10px] font-bold text-rose-700">
          Còn lại khóa: {courseDebt.toLocaleString('vi-VN')} đ
        </div>
      )}
      {sessionDebt > 0 && (
        <div className="text-[10px] font-bold text-rose-700">
          Còn lại buổi: {sessionDebt.toLocaleString('vi-VN')} đ
        </div>
      )}
    </div>
  );
};
