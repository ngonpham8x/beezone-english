import { useSyncExternalStore } from 'react';
import { currentDialog, settleDialog, subscribeDialogs } from '../lib/dialogs';
import { AlertModal, ConfirmModal } from './ConfirmModal';

export function NotificationDialogs() {
  const dialog = useSyncExternalStore(subscribeDialogs, currentDialog, () => null);
  if (!dialog) return null;
  return dialog.confirm ? (
    <ConfirmModal isOpen title="Xác nhận thao tác" message={dialog.message}
      confirmText="Xác nhận" onConfirm={() => settleDialog(true)}
      onClose={() => { if (currentDialog() === dialog) settleDialog(false); }} />
  ) : (
    <AlertModal isOpen message={dialog.message} onClose={() => settleDialog(false)} />
  );
}
