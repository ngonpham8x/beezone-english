import { showAlert } from '../../lib/dialogs';
import { toast } from '../../lib/toast';
import type { TuitionReceipt, UserAccount } from '../../types';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

import { validateSessionReceipt } from '../../lib/sessionBilling';

type Context = Pick<CenterStore, 'classes' | 'receipts' | 'setReceipts' | 'attendanceSessions'> & {
  currentUser: UserAccount | null;
  addLog: ActivityLogger;
};
export function createTuitionActions({
  classes,
  receipts,
  setReceipts,
  attendanceSessions,
  currentUser,
  addLog,
}: Context) {
  // Tuition Handler
  const handleAddReceipt = (r: TuitionReceipt) => {
    if (!currentUser || (currentUser.role !== 'owner' && !currentUser.permissions.tuition.collect))
      return false;
    if (
      r.paymentKind !== 'session' &&
      classes.find((c) => c.id === r.classId)?.billingMode === 'session'
    ) {
      showAlert('Lớp này thu theo buổi. Chọn các buổi đã điểm danh trong mục Học phí theo buổi.');
      return false;
    }
    const issue = validateSessionReceipt(r, attendanceSessions, receipts);
    if (issue) {
      showAlert(issue);
      return false;
    }
    setReceipts((prev) => [r, ...prev]);

    addLog(
      'THÊM',
      'Học phí',
      `Lập phiếu thu ${r.code} số tiền ${r.paidAmount.toLocaleString('vi-VN')} đ`,
    );
    
    toast.success(`Lập phiếu thu ${r.code} thành công!`);
    return true;
  };

  const handleUpdateReceipt = (updatedReceipt: TuitionReceipt) => {
    if (!currentUser || (currentUser.role !== 'owner' && !currentUser.permissions.tuition.collect))
      return false;
    const issue = validateSessionReceipt(updatedReceipt, attendanceSessions, receipts);
    if (issue) {
      showAlert(issue);
      return false;
    }
    setReceipts((prev) =>
      prev.map((receipt) => (receipt.id === updatedReceipt.id ? updatedReceipt : receipt)),
    );
    addLog(
      'SỬA',
      'Học phí',
      `Cập nhật phiếu thu ${updatedReceipt.code} (${updatedReceipt.paymentKind === 'course' ? 'học phí khóa' : updatedReceipt.paymentKind === 'session' ? 'học phí buổi' : 'học phí tháng'})`,
    );
  
    toast.success(`Cập nhật phiếu thu ${updatedReceipt.code} thành công!`);
  };

  const handleDeleteReceipt = (id: string) => {
    if (!currentUser || (currentUser.role !== 'owner' && !currentUser.permissions.tuition.delete))
      return;
    const receipt = receipts.find((item) => item.id === id);
    setReceipts((prev) => prev.filter((item) => item.id !== id));
    if (receipt)
      addLog(
        'XÓA',
        'Học phí',
        `Xóa phiếu thu ${receipt.code} (${receipt.paymentKind === 'course' ? 'học phí khóa' : receipt.paymentKind === 'session' ? 'học phí buổi' : 'học phí tháng'})`,
      );
  
    toast.success(`Đã xóa phiếu thu ${receipt ? receipt.code : ''} thành công!`);
  };

  return { handleAddReceipt, handleUpdateReceipt, handleDeleteReceipt };
}
