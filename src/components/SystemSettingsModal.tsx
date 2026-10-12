import React, { useState } from 'react';
import { CenterSettings } from '../types';
import { Settings, Save, Mail, Phone, MapPin, Globe, Shield, X, CheckCircle } from 'lucide-react';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CenterSettings;
  onUpdateSettings: (s: CenterSettings) => void;
}

export const SystemSettingsModal: React.FC<SystemSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const [formData, setFormData] = useState<CenterSettings>(settings);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-h-[90vh] max-w-lg w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative animate-in fade-in zoom-in-95 custom-scrollbar">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Cài Đặt Hệ Thống Trung Tâm</h3>
            <p className="text-xs text-slate-500">Cấu hình thông tin cơ sở, Email SMTP nhận báo cáo & Tự động sao lưu</p>
          </div>
        </div>

        {savedSuccess && (
          <div className="p-3 mb-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 font-bold text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Đã lưu cài đặt hệ thống thành công!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tên Trung Tâm Anh Ngữ *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Slogan Trung Tâm</label>
            <input
              type="text"
              value={formData.slogan}
              onChange={(e) => setFormData({ ...formData, slogan: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Địa Chỉ Cơ Sở 01</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Hotline Liên Hệ</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Quản Trị 1 (Chính)</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Email Quản Trị 2 (Phụ)</label>
            <input
              type="email"
              value={formData.secondaryEmail || ''}
              onChange={(e) => setFormData({ ...formData, secondaryEmail: e.target.value })}
              placeholder="chauoaingua679@gmail.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Email Admin Nhận Báo Cáo Hằng Tuần (SMTP/Resend) *</label>
            <input
              type="email"
              value={formData.adminReportEmail}
              onChange={(e) => setFormData({ ...formData, adminReportEmail: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900"
              required
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
              <div>
                <div className="font-bold text-slate-800">Tự động gửi email báo cáo Excel/PDF hằng tuần</div>
                <div className="text-[10px] text-slate-500">Hệ thống tổng hợp tình hình học sinh & doanh thu gửi tự động</div>
              </div>
              <input
                type="checkbox"
                checked={formData.autoEmailReport}
                onChange={(e) => setFormData({ ...formData, autoEmailReport: e.target.checked })}
                className="w-4 h-4 text-red-700 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
              <div>
                <div className="font-bold text-slate-800">Tự động sao lưu PostgreSQL hàng ngày</div>
                <div className="text-[10px] text-slate-500">Giữ 30 bản sao lưu gần nhất trong bộ nhớ an toàn</div>
              </div>
              <input
                type="checkbox"
                checked={formData.autoBackup}
                onChange={(e) => setFormData({ ...formData, autoBackup: e.target.checked })}
                className="w-4 h-4 text-red-700 rounded"
              />
            </label>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold hover:bg-amber-600 flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Save className="w-4 h-4 text-slate-950" /> Lưu Cấu Hình
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
