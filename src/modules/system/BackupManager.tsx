import { reportError } from '../../lib/diagnostics';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileArchive,
  FileDown,
  FileJson,
  FileSpreadsheet,
  History,
  Mail,
  Printer,
  RotateCcw,
  Shield,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { parseBackupArchive, type BackupArchive } from '../../lib/centerData';
import { centerDate } from '../../lib/dates';
import { generateMasterExcelWorkbook } from '../../services/excelService';
import {
  ActivityLog,
  AttendanceSession,
  CenterBackupData,
  CenterSettings,
  ClassEnrollment,
  ClassRoom,
  CourseProgram,
  Grade,
  Room,
  ScheduleChange,
  Student,
  SystemBackup,
  Teacher,
  TimetableSlot,
  TuitionReceipt,
} from '../../types';

const BACKUP_SCHEMA_VERSION = 1;

interface BackupManagerProps {
  backups: SystemBackup[];
  settings: CenterSettings;
  students?: Student[];
  teachers?: Teacher[];
  rooms?: Room[];
  classes?: ClassRoom[];
  receipts?: TuitionReceipt[];
  grades?: Grade[];
  programs?: CourseProgram[];
  timetableSlots?: TimetableSlot[];
  activityLogs?: ActivityLog[];
  attendanceSessions?: AttendanceSession[];
  enrollments?: ClassEnrollment[]; scheduleChanges?: ScheduleChange[];
  onOpenImportExportModal?: () => void;
  onBackupCreated?: (backup: SystemBackup) => void;
  onRestoreBackup?: (data: CenterBackupData, filename: string) => void;
}

export const BackupManager: React.FC<BackupManagerProps> = ({
  backups,
  settings,
  students = [],
  teachers = [],
  rooms = [],
  classes = [],
  receipts = [],
  grades = [],
  programs = [],
  timetableSlots = [],
  activityLogs = [],
  attendanceSessions = [],
  enrollments = [], scheduleChanges = [],
  onOpenImportExportModal,
  onBackupCreated,
  onRestoreBackup,
}) => {
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<{ archive: BackupArchive; filename: string } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const makeBackupRecord = (filename: string, sizeBytes: number): SystemBackup => ({
    id: `BACKUP_${Date.now()}`,
    filename,
    timestamp: new Date().toLocaleString('vi-VN'),
    sizeKb: Math.max(1, Math.ceil(sizeBytes / 1024)),
    type: 'Thủ công',
    status: 'Thành công',
  });

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // 1. Export Entire System Excel Master Report
  const handleExportSystemExcelReport = async () => {
    setIsExportingExcel(true);
    setStatusMessage(null);
    try {
      const blob = await generateMasterExcelWorkbook({
        centerName: settings.name,
        programs,
        students,
        classes,
        teachers,
        rooms,
        receipts,
        grades,
        attendanceSessions
      });

      const fileName = `BEEZONE_BaoCaoToanHeThong_${centerDate()}.xlsx`;
      downloadBlob(blob, fileName);
      onBackupCreated?.(makeBackupRecord(fileName, blob.size));

      setStatusMessage(`Đã xuất báo cáo toàn bộ hệ thống Excel (${fileName}) thành công!`);
    } catch (err) {
      reportError('backup.file', err);
      setStatusMessage('Có lỗi xảy ra khi tạo báo cáo Excel toàn hệ thống.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // 2. Export Entire System JSON Database Backup
  const handleExportSystemJson = () => {
    setStatusMessage(null);
    try {
      const fileName = `BEEZONE_DatabaseBackup_Full_${centerDate()}.json`;
      const backupRecord = makeBackupRecord(fileName, 0);
      const systemData: BackupArchive = {
        app: 'BEEZONE',
        schemaVersion: BACKUP_SCHEMA_VERSION,
        centerName: settings.name,
        exportedAt: new Date().toISOString(),
        data: {
          settings,
          programs,
          students,
          teachers,
          rooms,
          classes,
          timetableSlots,
          receipts,
          grades,
          backups: [backupRecord, ...backups],
          activityLogs,
          attendanceSessions, enrollments, scheduleChanges, sessionBillingVersion: 1,
        },
      };

      // Calculate the final file size before serialising it one last time so
      // the history embedded in the archive describes the downloaded file.
      let sizeKb = 0;
      let jsonStr = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        backupRecord.sizeKb = sizeKb;
        jsonStr = JSON.stringify(systemData, null, 2);
        const nextSizeKb = Math.max(1, Math.ceil(new Blob([jsonStr]).size / 1024));
        if (nextSizeKb === sizeKb) break;
        sizeKb = nextSizeKb;
      }
      backupRecord.sizeKb = sizeKb;
      jsonStr = JSON.stringify(systemData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      downloadBlob(blob, fileName);
      onBackupCreated?.(backupRecord);

      setStatusMessage(`Đã tải xuống toàn bộ CSDL dữ liệu hệ thống JSON (${fileName}) thành công!`);
    } catch (err) {
      reportError('backup.file', err);
      setStatusMessage('Không thể đóng gói CSDL JSON.');
    }
  };

  // The browser cannot retain the original file contents between sessions.
  // Offer a fresh full export instead of implying that a historic file exists.
  const handleDownloadBackup = (bk: SystemBackup) => {
    setStatusMessage(`Tệp gốc “${bk.filename}” không được lưu trên máy chủ. Đang tạo một bản JSON đầy đủ mới từ dữ liệu hiện tại.`);
    handleExportSystemJson();
  };

  const handleRestoreFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setRestoreError(null);
    setRestoreCandidate(null);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Tệp sao lưu vượt quá giới hạn 25 MB.');
      const archive = parseBackupArchive(JSON.parse(await file.text()), settings);
      if (!archive) throw new Error('Tệp không đúng định dạng sao lưu đầy đủ của trung tâm BeeZone, hoặc được tạo bởi phiên bản cũ.');
      setRestoreCandidate({ archive, filename: file.name });
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'Không thể đọc tệp JSON sao lưu.');
    }
  };

  const handleConfirmRestore = () => {
    if (!restoreCandidate || !onRestoreBackup) return;
    onRestoreBackup(restoreCandidate.archive.data, restoreCandidate.filename);
    setStatusMessage(`Đã khôi phục dữ liệu từ ${restoreCandidate.filename}. Dữ liệu mới sẽ được đồng bộ sau ít phút.`);
    setRestoreCandidate(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="page-heading bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/80 text-white border border-amber-500/30">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold mb-2 border border-amber-400/30">
            <Sparkles className="w-3.5 h-3.5" /> AN TOÀN DỮ LIỆU CƠ SỞ DỮ LIỆU
          </div>
          <h2 className="text-2xl font-black flex items-center gap-2 tracking-tight">
            <Database className="w-7 h-7 text-amber-400" />
            Quản Lý Sao Lưu & Xuất Báo Cáo Toàn Bộ Hệ Thống
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Xuất dữ liệu hiện tại dưới dạng Excel hoặc JSON đầy đủ. Bạn có thể dùng tệp JSON để khôi phục dữ liệu sau khi đã xác nhận.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">Chọn Excel hoặc JSON bên dưới để sao lưu</span>
        </div>
      </div>

      {/* PROMINENT SECTION: XUẤT BÁO CÁO TOÀN BỘ HỆ THỐNG */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
              Nút Xuất Báo Cáo & Dữ Liệu Toàn Bộ Hệ Thống
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tải toàn bộ học sinh ({students.length}), giáo viên ({teachers.length}), lớp học ({classes.length}), học phí ({receipts.length}) & điểm số ({grades.length})
            </p>
          </div>

          <div className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
            Tổng cộng: {students.length} Học Sinh • {classes.length} Lớp
          </div>
        </div>

        <div className="entity-grid">
          {/* Option 1: Master Excel Report */}
          <div className="p-4 bg-gradient-to-br from-emerald-50 via-white to-slate-50 rounded-xl border border-emerald-200 flex flex-col justify-between space-y-3 hover:shadow-sm transition-all">
            <div>
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase mb-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" /> Báo Cáo Excel Đa Sheet
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Xuất Báo Cáo Excel Toàn Hệ Thống</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Xuất file Excel Master đa sheet chứa Trang Tổng Hợp, danh sách Lớp Học, Bảng Học Phí và Điểm Số tích hợp công thức tự động.
              </p>
            </div>

            <button
              onClick={handleExportSystemExcelReport}
              disabled={isExportingExcel}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <FileDown className="w-4 h-4 text-amber-300" />
              {isExportingExcel ? 'Đang tạo Excel Master...' : 'Xuất Báo Cáo Toàn Bộ Hệ Thống (Excel)'}
            </button>
          </div>

          {/* Option 2: Full JSON Database Backup */}
          <div className="p-4 bg-gradient-to-br from-blue-50 via-white to-slate-50 rounded-xl border border-blue-200 flex flex-col justify-between space-y-3 hover:shadow-sm transition-all">
            <div>
              <div className="flex items-center gap-2 text-blue-800 font-bold text-xs uppercase mb-1">
                <FileJson className="w-4 h-4 text-blue-700" /> CSDL JSON Toàn Diện
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Tải Xuất CSDL JSON Hệ Thống</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Tải xuống toàn bộ cấu trúc CSDL JSON bao gồm tất cả dữ liệu thực tế để phục vụ khôi phục khẩn cấp hoặc lưu trữ offline.
              </p>
            </div>

            <button
              onClick={handleExportSystemJson}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Download className="w-4 h-4 text-blue-200" />
              Tải Xuất CSDL JSON Toàn Bộ
            </button>
          </div>

          <div className="p-4 bg-gradient-to-br from-rose-50 via-white to-slate-50 rounded-xl border border-rose-200 flex flex-col justify-between space-y-3 hover:shadow-sm transition-all">
            <div>
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs uppercase mb-1">
                <RotateCcw className="w-4 h-4 text-rose-700" /> Khôi phục có xác nhận
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Khôi Phục Từ Bản Sao JSON</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Chỉ nhận tệp JSON đầy đủ do hệ thống xuất. Việc khôi phục sẽ thay thế toàn bộ dữ liệu trung tâm hiện tại.
              </p>
            </div>

            <input ref={jsonInputRef} type="file" accept="application/json,.json" onChange={(event) => void handleRestoreFile(event)} className="hidden" />
            <button
              type="button"
              onClick={() => jsonInputRef.current?.click()}
              className="w-full py-2.5 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Upload className="w-4 h-4 text-rose-200" /> Chọn Tệp JSON Để Khôi Phục
            </button>
          </div>

          {/* Option 3: Import/Export Excel Modal */}
          <div className="p-4 bg-gradient-to-br from-amber-50 via-white to-slate-50 rounded-xl border border-amber-200 flex flex-col justify-between space-y-3 hover:shadow-sm transition-all">
            <div>
              <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase mb-1">
                <Printer className="w-4 h-4 text-amber-700" /> Công Cụ Import / Export
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Import / Export Dữ Liệu Hàng Loạt</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Mở cửa sổ quản lý nhập dữ liệu danh sách học sinh từ file Excel hoặc tùy chỉnh cấu hình xuất file chi tiết.
              </p>
            </div>

            {onOpenImportExportModal && (
              <button
                onClick={onOpenImportExportModal}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-950" />
                Mở Cửa Sổ Import / Export Excel
              </button>
            )}
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 font-bold text-xs flex items-center gap-2 shadow-2xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {restoreError && (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 font-bold text-xs flex items-center gap-2 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{restoreError}</span>
        </div>
      )}

      {/* Settings Info Banner */}
      <div className="entity-grid entity-grid--rooms text-xs">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
            <Shield className="w-4 h-4 text-emerald-600" /> Sao Lưu Thủ Công
          </div>
          <div className="text-slate-500">Xuất JSON đầy đủ trước khi thay đổi lớn. Tệp được tải về chỉ do trung tâm lưu giữ.</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
            <Mail className="w-4 h-4 text-blue-600" /> Email Báo Cáo
          </div>
          <div className="text-slate-500">
            Chưa có máy chủ gửi email tự động. Email nhận báo cáo đã cấu hình: <strong>{settings.adminReportEmail || 'Chưa cấu hình'}</strong>.
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
            <History className="w-4 h-4 text-amber-600" /> Lịch Sử Bản Xuất
          </div>
          <div className="text-slate-500">Hệ thống ghi nhận các bản xuất ở thiết bị này; nội dung tệp chỉ nằm trong nơi lưu do trung tâm quản lý.</div>
        </div>
      </div>

      {/* Backup History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-800 text-slate-200 font-bold text-xs uppercase flex flex-wrap items-center justify-between gap-2">
          <span>Lịch Sử 30 Bản Sao Lưu Gần Nhất ({backups.length})</span>
          <span className="text-[10px] text-amber-400 font-medium">Chỉ hiển thị bản xuất đã ghi nhận</span>
        </div>

        <HorizontalScroll label="Lịch sử sao lưu" className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Mã / Tên File Backup</th>
                <th className="py-3 px-4">Thời Gian Tạo</th>
                <th className="py-3 px-4">Dung Lượng</th>
                <th className="py-3 px-4">Loại Sao Lưu</th>
                <th className="py-3 px-4">Trạng Thái</th>
                <th className="py-3 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Chưa có bản sao lưu máy chủ. Hãy xuất Excel hoặc JSON để lưu tệp sao lưu.
                  </td>
                </tr>
              ) : (
                backups.map((bk) => (
                  <tr key={bk.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                      <FileArchive className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>{bk.filename}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{bk.timestamp}</td>
                    <td className="py-3 px-4 font-semibold">{bk.sizeKb} KB</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                        {bk.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        ✓ {bk.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownloadBackup(bk)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-[11px] flex items-center gap-1 border border-slate-300"
                          title="Tạo lại bản sao JSON từ dữ liệu hiện tại"
                        >
                          <Download className="w-3.5 h-3.5 text-blue-600" /> Tạo lại
                        </button>

                        <span className="px-2.5 py-1 text-[11px] font-semibold text-slate-400">Khôi phục cần tệp JSON</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </HorizontalScroll>
      </div>

      {restoreCandidate && (
        <DialogFrame label="Xác nhận khôi phục dữ liệu" onClose={() => setRestoreCandidate(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section    className="dialog-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl custom-scrollbar">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-extrabold text-rose-800"><AlertTriangle className="h-3.5 w-3.5" /> THAO TÁC GHI ĐÈ</div>
                <h3 id="restore-backup-title" className="text-lg font-black text-slate-900">Xác nhận khôi phục dữ liệu</h3>
              </div>
              <button type="button" onClick={() => setRestoreCandidate(null)} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Tệp <b>{restoreCandidate.filename}</b> chứa {restoreCandidate.archive.data.students.length} học sinh, {restoreCandidate.archive.data.classes.length} lớp và {restoreCandidate.archive.data.receipts.length} phiếu thu. Dữ liệu hiện tại sẽ bị thay thế.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setRestoreCandidate(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Hủy</button>
              <button type="button" onClick={handleConfirmRestore} className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800">Xác nhận khôi phục</button>
            </div>
          </section>
        </DialogFrame>
      )}
    </div>
  );
};
