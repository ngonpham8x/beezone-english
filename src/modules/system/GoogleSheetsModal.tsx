import { CheckCircle2, FileSpreadsheet, RefreshCw, Save, X } from 'lucide-react';
import React, { useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { GoogleSheetsConfig } from '../../types';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GoogleSheetsConfig;
  onSaveConfig: (cfg: GoogleSheetsConfig) => void;
  onManualSync: () => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onManualSync
}) => {
  const [formData, setFormData] = useState<GoogleSheetsConfig>(config);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSyncNow = () => {
    setIsSyncing(true);
    setSyncSuccessMsg(null);
    setTimeout(() => {
      onManualSync();
      setIsSyncing(false);
      setSyncSuccessMsg('Đã đồng bộ 2 chiều thành công với Google Sheets!');
    }, 1200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(formData);
    onClose();
  };

  return (
    <DialogFrame label="Google Sheets" onClose={onClose} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="dialog-panel bg-white rounded-2xl max-h-[90vh] max-w-lg w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative animate-in fade-in zoom-in-95 custom-scrollbar">
        <button aria-label="Đóng"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Kết Nối Google Sheets API</h3>
            <p className="text-xs text-slate-500">Tự động đồng bộ Học sinh, Lịch học, Học phí & Điểm số 2 chiều</p>
          </div>
        </div>

        {syncSuccessMsg && (
          <div className="p-3 mb-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Google Spreadsheet ID *</label>
            <input
              type="text"
              value={formData.spreadsheetId}
              onChange={(e) => setFormData({ ...formData, spreadsheetId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-slate-800 focus:ring-2 focus:ring-emerald-600"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tên Sheet Chính (Worksheet Name)</label>
            <input
              type="text"
              value={formData.sheetName}
              onChange={(e) => setFormData({ ...formData, sheetName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <div className="font-bold text-slate-800">Tự động đồng bộ theo lịch</div>
              <div className="text-[11px] text-slate-500">Đồng bộ liên tục không cần thao tác thủ công</div>
            </div>
            <input
              type="checkbox"
              checked={formData.autoSync}
              onChange={(e) => setFormData({ ...formData, autoSync: e.target.checked })}
              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tần Suất Đồng Bộ</label>
            <select
              value={formData.syncInterval}
              onChange={(e) => setFormData({ ...formData, syncInterval: e.target.value as any })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            >
              <option value="realtime">Thời gian thực (Realtime)</option>
              <option value="daily">Hằng ngày lúc 00:00</option>
              <option value="weekly">Hằng tuần (Chủ Nhật)</option>
            </select>
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px]">
            Lần đồng bộ gần nhất: <strong>{formData.lastSync || 'Chưa đồng bộ'}</strong>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Đang đồng bộ...' : 'Đồng Bộ Ngay'}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 flex items-center gap-1"
              >
                <Save className="w-4 h-4" /> Lưu Cấu Hình
              </button>
            </div>
          </div>
        </form>
      </div>
    </DialogFrame>
  );
};
