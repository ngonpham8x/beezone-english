import type { Dispatch, SetStateAction } from 'react';
import type { ActivityLog, UserAccount } from '../../types';
import { mergeActivityLogs } from '../center/model';
export function createActivityLogger(
  currentUser: UserAccount | null,
  setActivityLogs: Dispatch<SetStateAction<ActivityLog[]>>,
) {
  // Activity Logger
  return (
    action:
      | 'ĐĂNG NHẬP'
      | 'THÊM'
      | 'SỬA'
      | 'XÓA'
      | 'EXPORT'
      | 'IMPORT'
      | 'BACKUP'
      | 'RESTORE'
      | 'ĐỒNG BỘ',
    module: string,
    details: string,
  ) => {
    if (!currentUser) return;
    const newLog: ActivityLog = {
      id: `LOG_${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleString('vi-VN'),
      userEmail: currentUser.email,
      userName: currentUser.name,
      action,
      module,
      details,
    };
    setActivityLogs((prev) => mergeActivityLogs([newLog], prev));
  };
}
export type ActivityLogger = ReturnType<typeof createActivityLogger>;
