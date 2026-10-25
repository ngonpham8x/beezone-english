import { Save, ShieldCheck, X } from 'lucide-react';
import React, { useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { StaffPermissions, UserAccount } from '../../types';

interface StaffPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffAccount: UserAccount;
  onUpdatePermissions: (staffId: string, perms: StaffPermissions) => void;
}

export const StaffPermissionModal: React.FC<StaffPermissionModalProps> = ({
  isOpen,
  onClose,
  staffAccount,
  onUpdatePermissions
}) => {
  const [perms, setPerms] = useState<StaffPermissions>(staffAccount.permissions);

  if (!isOpen) return null;

  const handleToggle = (module: keyof StaffPermissions, action: string) => {
    setPerms(prev => ({
      ...prev,
      [module]: {
        ...(prev[module] as any),
        [action]: !(prev[module] as any)[action]
      }
    }));
  };

  const handleSave = () => {
    onUpdatePermissions(staffAccount.id, perms);
    onClose();
  };

  return (
    <DialogFrame label="Phân quyền giáo viên" onClose={onClose} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="dialog-panel bg-white rounded-2xl max-h-[90vh] max-w-lg w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative animate-in fade-in zoom-in-95 custom-scrollbar">
        <button aria-label="Đóng"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Phân Quyền Giáo Viên</h3>
            <p className="text-xs text-slate-500">Bật/Tắt chi tiết từng thao tác cho tài khoản: <strong>{staffAccount.name.replace(/\s*\(Quản [L|l]ý\)/gi, '')}</strong></p>
          </div>
        </div>

        <div className="space-y-3 text-xs text-slate-800 max-h-[60vh] overflow-y-auto pr-1">
          {/* Học sinh */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="font-bold text-red-900 uppercase">1. Quản lý Học Sinh</div>
            <div className="grid grid-cols-4 gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.student.view} onChange={() => handleToggle('student', 'view')} />
                <span>Xem</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.student.add} onChange={() => handleToggle('student', 'add')} />
                <span>Thêm</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.student.edit} onChange={() => handleToggle('student', 'edit')} />
                <span>Sửa</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-rose-700 font-bold">
                <input type="checkbox" checked={perms.student.delete} onChange={() => handleToggle('student', 'delete')} />
                <span>Xóa</span>
              </label>
            </div>
            <div className="pt-1.5 border-t border-slate-200/80">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  className="rounded text-red-600 focus:ring-red-500"
                  checked={perms.student.export ?? false}
                  onChange={() => handleToggle('student', 'export')}
                />
                <span className="text-[11px] text-slate-700 font-semibold">Tải / Xuất dữ liệu học viên (Excel/CSV)</span>
              </label>
            </div>
          </div>

          {/* Giáo viên */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="font-bold text-red-900 uppercase">2. Quản lý Giáo Viên</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.teacher.view} onChange={() => handleToggle('teacher', 'view')} />
                <span>Xem</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.teacher.edit} onChange={() => handleToggle('teacher', 'edit')} />
                <span>Sửa</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-rose-700 font-bold">
                <input type="checkbox" checked={perms.teacher.delete} onChange={() => handleToggle('teacher', 'delete')} />
                <span>Xóa</span>
              </label>
            </div>
          </div>

          {/* Học phí */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="font-bold text-red-900 uppercase">3. Quản lý Học Phí</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.tuition.view} onChange={() => handleToggle('tuition', 'view')} />
                <span>Xem</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.tuition.collect} onChange={() => handleToggle('tuition', 'collect')} />
                <span>Thu Học Phí</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-rose-700 font-bold">
                <input type="checkbox" checked={perms.tuition.delete} onChange={() => handleToggle('tuition', 'delete')} />
                <span>Xóa Phiếu Thu</span>
              </label>
            </div>
            <div className="pt-1.5 border-t border-slate-200/80">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  className="rounded text-red-600 focus:ring-red-500"
                  checked={perms.tuition.showDebt ?? false}
                  onChange={() => handleToggle('tuition', 'showDebt')}
                />
                <span className="text-[11px] text-slate-700 font-semibold">Hiển thị số tiền học phí còn lại cho giáo viên thu</span>
              </label>
            </div>
          </div>

          {/* Điểm */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="font-bold text-red-900 uppercase">4. Quản lý Điểm Số</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.grade.view} onChange={() => handleToggle('grade', 'view')} />
                <span>Xem Điểm</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.grade.edit} onChange={() => handleToggle('grade', 'edit')} />
                <span>Nhập / Sửa Điểm</span>
              </label>
            </div>
          </div>

          {/* Excel */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="font-bold text-red-900 uppercase">5. Thao Tác Excel</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.excel.import} onChange={() => handleToggle('excel', 'import')} />
                <span>Import Excel</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.excel.export} onChange={() => handleToggle('excel', 'export')} />
                <span>Xuất File Excel</span>
              </label>
            </div>
          </div>

          {/* Báo cáo */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="font-bold text-red-900 uppercase">6. Báo Cáo System</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={perms.report.view} onChange={() => handleToggle('report', 'view')} />
                <span>Xem Báo Cáo Tình Hình</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-amber-800 font-bold">
                <input type="checkbox" checked={perms.report.revenue} onChange={() => handleToggle('report', 'revenue')} />
                <span>Xem Báo Cáo Doanh Thu</span>
              </label>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Save className="w-4 h-4 text-slate-950" /> Lưu Cấu Hình Quyền
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};
