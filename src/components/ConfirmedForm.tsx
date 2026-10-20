import React, { useState } from 'react';
import { ConfirmModal } from './ConfirmModal';

type Props = React.FormHTMLAttributes<HTMLFormElement> & { confirmWhen: boolean; entityLabel: string };
/** Confirm the write, while leaving the editable draft intact when cancelled. */
export function ConfirmedForm({ confirmWhen, entityLabel, onSubmit, children, ...props }: Props) {
  const [pending, setPending] = useState<Parameters<NonNullable<Props['onSubmit']>>[0] | null>(null);
  return <>
    <form {...props} onSubmit={event => {
      if (!confirmWhen) { onSubmit?.(event); return; }
      event.preventDefault();
      setPending(event);
    }}>{children}</form>
    <ConfirmModal isOpen={!!pending} title="Xác nhận cập nhật"
      message={`Bạn có muốn lưu các chỉnh sửa ${entityLabel} không?`}
      confirmText="Lưu thay đổi" variant="info"
      onConfirm={() => { if (pending) onSubmit?.(pending); }}
      onClose={() => setPending(null)} />
  </>;
}
