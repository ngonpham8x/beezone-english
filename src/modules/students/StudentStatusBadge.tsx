import React from 'react';
import type { StudentStatus } from '../../types';

interface StudentStatusBadgeProps {
  status: StudentStatus | string;
  className?: string;
}

export function studentStatusLabel(status: StudentStatus | string): string {
  switch (status) {
    case 'active':
      return 'Đang học';
    case 'reserved':
      return 'Tạm nghỉ';
    case 'dropped':
      return 'Nghỉ học';
    case 'registered':
      return 'Ghi danh';
    case 'trial':
      return 'Học thử';
    case 'lead':
      return 'Tiềm năng';
    default:
      return 'Ghi danh';
  }
}

export function StudentStatusBadge({ status, className = '' }: StudentStatusBadgeProps) {
  const label = studentStatusLabel(status);

  let colorClasses = 'bg-blue-50 text-blue-700 border border-blue-200'; // Default: registered / Ghi danh
  if (status === 'active') {
    colorClasses = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  } else if (status === 'reserved') {
    colorClasses = 'bg-amber-50 text-amber-700 border border-amber-200';
  } else if (status === 'dropped') {
    colorClasses = 'bg-slate-100 text-slate-600 border border-slate-300';
  } else if (status === 'trial') {
    colorClasses = 'bg-purple-50 text-purple-700 border border-purple-200';
  } else if (status === 'lead') {
    colorClasses = 'bg-sky-50 text-sky-700 border border-sky-200';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${colorClasses} ${className}`}>
      {label}
    </span>
  );
}

