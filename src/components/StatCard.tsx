import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ElementType;
  tone?: 'slate' | 'emerald' | 'rose' | 'amber' | 'sky' | 'violet';
  subtitle?: string;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'slate',
  subtitle,
  onClick,
}: StatCardProps) {
  const content = (
    <>
      <span className="stat-card-label">
        {Icon && <Icon aria-hidden="true" />}
        <span>{label}</span>
      </span>
      <span className="stat-card-value">{value}</span>
      {subtitle && <span className="stat-card-note">{subtitle}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className="stat-card" data-tone={tone} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="stat-card" data-tone={tone}>
      {content}
    </div>
  );
}
