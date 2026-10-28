import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X, Layers, AlertCircle, Check } from 'lucide-react';
import { DialogFrame } from '../../components/DialogFrame';
import { ClassRoom, CourseProgram, CustomGradeColumn, GradeSemester } from '../../types';

interface CustomColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: CustomGradeColumn[];
  onAddColumn: (col: { name: string; semester: GradeSemester; programId?: string }) => void;
  onDeleteColumn: (id: string) => void;
  currentSemester: GradeSemester;
  programs: CourseProgram[];
  classes: ClassRoom[];
  selectedClassId: string;
  canEdit: boolean;
}

const SEMESTER_LABELS: Record<GradeSemester, string> = {
  GKI: 'Giữa Kỳ I (GKI)',
  CKI: 'Cuối Kỳ I (CKI)',
  GKII: 'Giữa Kỳ II (GKII)',
  CKII: 'Cuối Kỳ II (CKII)',
};

export const CustomColumnsModal: React.FC<CustomColumnsModalProps> = ({
  isOpen,
  onClose,
  columns,
  onAddColumn,
  onDeleteColumn,
  currentSemester,
  programs,
  classes,
  selectedClassId,
  canEdit,
}) => {
  const [colName, setColName] = useState('');
  const [targetSemester, setTargetSemester] = useState<GradeSemester>(currentSemester);
  const selectedProgramId = classes.find((classroom) => classroom.id === selectedClassId)?.programId;
  const [scopeProgramId, setScopeProgramId] = useState<string>(selectedProgramId || 'all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTargetSemester(currentSemester);
    setScopeProgramId(selectedProgramId || 'all');
    setError(null);
    setSuccess(null);
  }, [currentSemester, isOpen, selectedProgramId]);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = colName.trim();
    if (!trimmed) {
      setError('Vui lòng nhập tên cột điểm (ví dụ: UNIT 3.5, Review 1, Progress Test...)');
      return;
    }

    // Check duplicate in same semester and scope
    const exists = columns.some(
      (c) =>
        c.semester === targetSemester &&
        c.name.toLowerCase() === trimmed.toLowerCase() &&
        (c.programId || (c.classId ? `class:${c.classId}` : 'all')) === (scopeProgramId || 'all'),
    );
    if (exists) {
      setError(`Cột "${trimmed}" đã tồn tại trong ${SEMESTER_LABELS[targetSemester]}.`);
      return;
    }

    onAddColumn({
      name: trimmed,
      semester: targetSemester,
      programId: scopeProgramId !== 'all' ? scopeProgramId : undefined,
    });

    setColName('');
    setSuccess(`Đã thêm cột "${trimmed}" thành công!`);
    setTimeout(() => setSuccess(null), 2500);
  };

  return (
    <DialogFrame label="Quản lý cột điểm tùy chỉnh" onClose={onClose}>
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-auto space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Quản Lý & Thêm Cột Điểm</h3>
              <p className="text-xs text-slate-500">Tùy biến các cột UNIT hoặc bài kiểm tra theo từng giáo trình</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add Column Form */}
        {canEdit ? (
          <form onSubmit={handleAdd} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-amber-600" />
              Thêm cột điểm mới
            </h4>

            {error && (
              <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2 border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs rounded-xl flex items-center gap-2 border border-emerald-200">
                <Check className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Tên cột điểm / UNIT <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="VD: UNIT 3.5, Progress Test 1, Review 1..."
                value={colName}
                onChange={(e) => setColName(e.target.value)}
                maxLength={40}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-medium text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Học kỳ áp dụng</label>
                <select
                  value={targetSemester}
                  onChange={(e) => setTargetSemester(e.target.value as GradeSemester)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500"
                >
                  <option value="GKI">GKI (Giữa kỳ I)</option>
                  <option value="CKI">CKI (Cuối kỳ I)</option>
                  <option value="GKII">GKII (Giữa kỳ II)</option>
                  <option value="CKII">CKII (Cuối kỳ II)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Áp dụng cho</label>
                <select
                  value={scopeProgramId}
                  onChange={(e) => setScopeProgramId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">Tất cả chương trình</option>
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition active:scale-95"
              >
                <Plus className="w-4 h-4 text-slate-950" />
                <span>Thêm cột điểm</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
            Bạn đang ở quyền xem, chỉ quản trị viên hoặc người có quyền sửa điểm mới có thể thêm cột điểm mới.
          </div>
        )}

        {/* Existing Custom Columns List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Danh sách các cột đã tạo ({columns.length})</span>
            <span className="text-[11px] text-slate-400 font-normal">Hiển thị theo từng học kỳ</span>
          </div>

          {columns.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              Chưa có cột điểm tùy chỉnh nào. Các cột mặc định gồm UNIT 1-3 (GKI), UNIT 4-6 (CKI), UNIT 7-9 (GKII), UNIT 10-12 (CKII).
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {columns.map((col) => {
                const scopeLabel = col.programId
                  ? programs.find((program) => program.id === col.programId)?.name || 'Chương trình đã xóa'
                  : col.classId
                    ? classes.find((c) => c.id === col.classId)?.name || 'Lớp cũ'
                    : 'Tất cả chương trình';
                return (
                  <div
                    key={col.id}
                    className="flex items-center justify-between p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 block truncate">{col.name}</span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold border border-amber-200/60">
                          {col.semester}
                        </span>
                        <span>•</span>
                        <span className="truncate max-w-[180px]">{scopeLabel}</span>
                      </div>
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onDeleteColumn(col.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Xóa cột điểm này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};
