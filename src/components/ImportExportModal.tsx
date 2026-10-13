import { DialogFrame } from './DialogFrame';
import { centerDate } from '../lib/dates';
import React, { useRef, useState } from 'react';
import { CenterWorkbookData, generateMasterExcelWorkbook, parseCenterWorkbookFile, parseExcelStudentFile, ImportValidationResult, ImportedStudentRow } from '../services/excelService';
import { Student, Teacher, ClassRoom, Room, TuitionReceipt, Grade, CenterSettings, StaffPermissions, CourseProgram, AttendanceSession } from '../types';
import { FileSpreadsheet, FileUp, FileDown, CheckCircle2, AlertTriangle, Download, Upload, X, RefreshCw } from 'lucide-react';
import { isLocalPreview } from '../lib/supabase';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  programs: CourseProgram[];
  teachers: Teacher[];
  rooms: Room[];
  classes: ClassRoom[];
  receipts: TuitionReceipt[];
  attendanceSessions?: AttendanceSession[];
  grades: Grade[];
  settings: CenterSettings;
  canSyncCenterData: boolean;
  isOwner: boolean;
  permissions: StaffPermissions;
  onImportStudents: (newStudents: Student[]) => void;
  onImportCenterData: (data: CenterWorkbookData) => boolean;
  onExportExcel: (filename: string) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  students,
  programs,
  teachers,
  rooms,
  classes,
  receipts,
  attendanceSessions = [],
  grades,
  settings,
  canSyncCenterData,
  isOwner,
  permissions,
  onImportStudents,
  onImportCenterData,
  onExportExcel
}) => {
  const canImport = isOwner || (permissions.excel.import && permissions.student.add);
  const canExport = isOwner || permissions.excel.export;
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(canExport ? 'export' : 'import');
  const [isExporting, setIsExporting] = useState(false);
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [isImportingSuccess, setIsImportingSuccess] = useState(false);
  const [fallbackClassId, setFallbackClassId] = useState(classes[0]?.id || '');
  const [fileName, setFileName] = useState('');
  const [centerImport, setCenterImport] = useState<CenterWorkbookData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExportExcel = async () => {
    if (!canExport) return;
    setIsExporting(true);
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

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = `BEEZONE_MasterReport_${centerDate()}.xlsx`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      onExportExcel(filename);
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi tạo file Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectedFile = async (file: File) => {
    if (!canImport) return;
    setCenterImport(null); setValidationResult(null); setIsImportingSuccess(false);
    if (file.size > 25 * 1024 * 1024) { setValidationResult({ validRows: [], errors: [{ row: 0, field: 'Tệp Excel', message: 'Tệp vượt quá giới hạn 25 MB.' }] }); return; }
    setFileName(file.name);

    try {
      const centerResult = await parseCenterWorkbookFile(file);
      if (centerResult.data) {
        setCenterImport(centerResult.data);
        setValidationResult(null);
        return;
      }
      if (classes.length === 0) {
        setCenterImport(null);
        setValidationResult({
          validRows: [],
          errors: centerResult.errors.length ? centerResult.errors : [{ row: 0, field: 'Tệp Excel', message: 'Hãy dùng báo cáo Excel đã chuẩn hoá để nhập dữ liệu lần đầu.' }]
        });
        return;
      }
      const result = await parseExcelStudentFile(file);
      const existingCodes = new Set(students.map((student) => student.code.trim().toLocaleUpperCase('vi-VN')));
      const duplicateRows: ImportedStudentRow[] = [];
      const validRows: ImportedStudentRow[] = [];
      // Add accepted rows to the same set so two identical codes inside one
      // upload cannot create ambiguous tuition/class links.
      result.validRows.forEach((row) => {
        const code = (row.code || '').trim().toLocaleUpperCase('vi-VN');
        if (existingCodes.has(code)) {
          duplicateRows.push(row);
          return;
        }
        existingCodes.add(code);
        validRows.push(row);
      });
      setValidationResult({
        validRows,
        errors: [
          ...result.errors,
          ...duplicateRows.map((row) => ({ row: 0, field: row.code || 'Mã học sinh', message: 'Mã học sinh đã có trong hệ thống.' }))
        ]
      });
      setCenterImport(null);
    } catch (error) {
      console.error(error);
      setValidationResult({ validRows: [], errors: [{ row: 0, field: 'Tệp Excel', message: 'Không thể đọc tệp. Vui lòng dùng tệp .xlsx hoặc .xlsm hợp lệ.' }] });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleSelectedFile(file);
    event.target.value = '';
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void handleSelectedFile(file);
  };

  const handleConfirmCenterImport = () => {
    if (!centerImport || (!canSyncCenterData && !isLocalPreview) || !isOwner || isImportingSuccess) return;
    if (onImportCenterData(centerImport)) setIsImportingSuccess(true);
  };

  const handleConfirmImport = () => {
    if (!canImport || !validationResult || validationResult.validRows.length === 0 || isImportingSuccess) return;

    const fallbackClass = classes.find((item) => item.id === fallbackClassId);
    if (!fallbackClass) return;
    const newStudentsList: Student[] = validationResult.validRows.map((item, idx) => {
      const classCode = (item.classCode || '').trim().toLocaleUpperCase('vi-VN');
      const classroom = classes.find((candidate) => candidate.code.trim().toLocaleUpperCase('vi-VN') === classCode) || fallbackClass;
      return {
        id: `HS_IMP_${Date.now()}_${idx}`,
        code: item.code || '',
        name: item.name || '',
        dob: item.dob || '',
        gender: item.gender || 'Chưa xác định',
        school: item.school || '',
        gradeLevel: item.gradeLevel || '',
        programId: classroom.programId,
        classId: classroom.id,
        address: item.address || '',
        email: item.email || '',
        phone: item.phone || '',
        parentName: item.parentName || '',
        parentPhone: item.parentPhone || '',
        enrollDate: centerDate(),
        notes: `Nhập từ Excel: ${fileName || 'tệp không rõ tên'}`,
        status: 'active',
        feeStatus: 'unpaid'
      };
    });

    onImportStudents(newStudentsList);
    setIsImportingSuccess(true);
  };

  return (
    <DialogFrame label="Nhập và xuất Excel" onClose={onClose} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="dialog-panel bg-white rounded-2xl max-h-[90vh] max-w-xl w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative animate-in fade-in zoom-in-95 custom-scrollbar">
        <button aria-label="Đóng"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Import / Export File ExcelJS</h3>
            <p className="text-xs text-slate-500">Xuất file báo cáo đa sheet tích hợp công thức Excel & nhập dữ liệu chuẩn</p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-100 p-1 rounded-xl mb-5">
          {canExport && <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'export' ? 'bg-amber-500 text-slate-950 font-black shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileDown className="w-4 h-4 text-slate-950" /> Xuất File Excel (Export)
          </button>}
          {canImport && <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'import' ? 'bg-amber-500 text-slate-950 font-black shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileUp className="w-4 h-4 text-slate-950" /> Nhập File Excel (Import)
          </button>}
        </div>

        {activeTab === 'export' && canExport ? (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-slate-700">
              <div className="font-bold text-slate-900 text-sm">Cấu trúc Workbook ExcelJS Xuất Ra:</div>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li><strong>TỔNG QUAN:</strong> Bấm vào tổng thu, công nợ hoặc số tiền từng tháng để mở đúng lớp/sổ thu liên quan.</li>
                <li><strong>Sheet Lớp &amp; Học sinh:</strong> Có tổng tiền theo tháng, tổng từng học sinh và liên kết đến phiếu thu gốc; công thức `SUMIFS` tự mở rộng khi thêm dòng.</li>
              </ul>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleExportExcel}
                disabled={isExporting}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                {isExporting ? 'Đang khởi tạo ExcelJS Workbook...' : 'Tải Xuất File Excel Ngay'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {isImportingSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 font-bold text-center flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Đã import thành công. Bạn vẫn ở trang hiện tại; chỉ đóng cửa sổ khi muốn quay lại.</span>
              </div>
            ) : (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleFileDrop}
                  className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  aria-label="Chọn hoặc kéo thả tệp Excel để nhập"
                >
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <div className="font-bold text-slate-800">Bấm để chọn hoặc kéo thả tệp Excel (.xlsx / .xlsm)</div>
                  <div className="mt-1 text-[11px] text-slate-500">Hệ thống kiểm tra dữ liệu trước khi lưu; có thể chọn lại cùng một tệp.</div>
                  <div className="mt-3 inline-flex rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-2 text-xs font-bold transition shadow-xs">Chọn tệp Excel</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </div>

                {!centerImport && classes.length > 0 && <div>
                  <label className="block font-bold text-slate-700 mb-1">Lớp áp dụng khi file không có “Mã lớp”</label>
                  <select
                    value={fallbackClassId}
                    onChange={(event) => setFallbackClassId(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:ring-2 focus:ring-amber-500"
                  >
                    {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.code} — {classroom.name}</option>)}
                  </select>
                </div>}

                {centerImport && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                    <div className="font-bold">Đã nhận diện báo cáo chuẩn hoá: {fileName}</div>
                    <div className="mt-1 text-[11px]">{centerImport.classes.length} lớp · {centerImport.students.length} học sinh · {centerImport.receipts.length} phiếu thu</div>
                    <p className="mt-2 text-[11px]">Dữ liệu sẽ thay toàn bộ dữ liệu hiện có của trung tâm và đồng bộ vào Supabase theo quyền tài khoản đã đăng nhập.</p>
                    {(canSyncCenterData || isLocalPreview) && isOwner ? (
                      <button onClick={handleConfirmCenterImport} className="mt-3 w-full rounded-xl bg-amber-500 hover:bg-amber-600 py-2 font-bold text-slate-950 shadow-xs transition">
                        Xác nhận nhập toàn bộ dữ liệu
                      </button>
                    ) : <p className="mt-3 rounded-lg bg-amber-100 p-2 text-[11px] font-semibold text-amber-900">{!isOwner ? 'Chỉ Chủ trung tâm được thay toàn bộ dữ liệu.' : 'Chưa kết nối được kho dữ liệu Supabase. Hãy chạy migration `003_center_data.sql`, sau đó tải lại trang.'}</p>}
                  </div>
                )}

                {validationResult && (
                  <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                    <div className="font-bold text-slate-800 mb-1">Kết quả kiểm tra dữ liệu Excel:</div>
                    <div className="text-emerald-700 font-semibold">✓ {validationResult.validRows.length} dòng hợp lệ sẵn sàng thêm</div>
                    {validationResult.errors.length > 0 && (
                      <div className="text-rose-700 font-semibold mt-1">⚠ {validationResult.errors.length} dòng có lỗi</div>
                    )}

                    <button
                      onClick={handleConfirmImport}
                      className="mt-3 w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-xs transition"
                    >
                      <CheckCircle2 className="w-4 h-4 text-slate-950" /> Xác Nhận Lưu Vào Cơ Sở Dữ Liệu
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </DialogFrame>
  );
};
