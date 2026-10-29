import { AlertCircle, Check, ClipboardList, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import { askConfirmation } from '../../lib/dialogs';
import { customGradeColumnKind, isActiveCustomGradeColumn } from '../../lib/gradebook';
import type { ClassRoom, CourseProgram, CustomGradeColumn, CustomGradeColumnKind, GradeSemester } from '../../types';

interface ColumnDraft {
  name: string;
  kind: CustomGradeColumnKind;
  semester: GradeSemester;
  programId?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  columns: CustomGradeColumn[];
  onAddColumns: (columns: ColumnDraft[]) => boolean;
  onArchiveColumn: (columnId: string) => boolean | Promise<boolean>;
  onRenameColumn?: (columnId: string, newName: string) => boolean;
  currentSemester: GradeSemester;
  programs: CourseProgram[];
  classes: ClassRoom[];
  selectedClassId: string;
  canEdit: boolean;
}

const SEMESTERS: Array<{ value: GradeSemester; label: string }> = [
  { value: 'GKI', label: 'GKI - Giữa kỳ I' },
  { value: 'CKI', label: 'CKI - Cuối kỳ I' },
  { value: 'GKII', label: 'GKII - Giữa kỳ II' },
  { value: 'CKII', label: 'CKII - Cuối kỳ II' },
];

const kindLabel = (kind: CustomGradeColumnKind) =>
  kind === 'assessment' ? 'Cột điểm / bài kiểm tra' : 'Cột bài / UNIT';

export function CustomColumnsModal({
  isOpen,
  onClose,
  columns,
  onAddColumns,
  onArchiveColumn,
  onRenameColumn,
  currentSemester,
  programs,
  classes,
  selectedClassId,
  canEdit,
}: Props) {
  const selectedProgramId = classes.find((item) => item.id === selectedClassId)?.programId;
  const defaultProgramId = selectedProgramId || programs[0]?.id || 'all';
  const [semester, setSemester] = useState<GradeSemester>(currentSemester);
  const [programId, setProgramId] = useState(defaultProgramId);
  const [addUnit, setAddUnit] = useState(true);
  const [addAssessment, setAddAssessment] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [assessmentName, setAssessmentName] = useState('');
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const activeColumns = useMemo(() => columns.filter(isActiveCustomGradeColumn), [columns]);

  useEffect(() => {
    if (!isOpen) return;
    setSemester(currentSemester);
    setProgramId(selectedProgramId || programs[0]?.id || 'all');
    setMessage(null);
  }, [currentSemester, isOpen, programs, selectedProgramId]);

  if (!isOpen) return null;

  const count = Number(addUnit) + Number(addAssessment);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const drafts: ColumnDraft[] = [];
    const resolvedProgramId = (!programId || programId === 'all') ? undefined : programId;
    if (!addUnit && !addAssessment) return setMessage({ kind: 'error', text: 'Hãy tích chọn ít nhất một loại cột cần thêm.' });
    if (addUnit) {
      if (!unitName.trim()) return setMessage({ kind: 'error', text: 'Vui lòng nhập tên cột bài / UNIT.' });
      drafts.push({ name: unitName.trim(), kind: 'unit', semester, programId: resolvedProgramId });
    }
    if (addAssessment) {
      if (!assessmentName.trim()) return setMessage({ kind: 'error', text: 'Vui lòng nhập tên cột điểm / bài kiểm tra.' });
      drafts.push({ name: assessmentName.trim(), kind: 'assessment', semester, programId: resolvedProgramId });
    }
    const duplicate = drafts.find((draft) =>
      activeColumns.some((column) =>
        column.semester === draft.semester &&
        (column.programId || undefined) === draft.programId &&
        column.name.trim().toLocaleLowerCase('vi-VN') === draft.name.toLocaleLowerCase('vi-VN'),
      ),
    );
    if (duplicate) return setMessage({ kind: 'error', text: `Cột “${duplicate.name}” đã tồn tại trong chương trình và học kỳ này.` });
    if (!onAddColumns(drafts)) return;
    setUnitName('');
    setAssessmentName('');
    setMessage({ kind: 'success', text: `Đã thêm và liên kết ${drafts.length} cột vào bảng điểm & tính ĐTB.` });
  };

  const archive = async (column: CustomGradeColumn) => {
    const confirmed = await askConfirmation(
      `Xóa cột “${column.name}”? Cột sẽ ngừng hiển thị và không còn tính vào ĐTB. Điểm lịch sử vẫn được giữ an toàn trong hệ thống.`,
    );
    if (confirmed && (await onArchiveColumn(column.id))) {
      setMessage({ kind: 'success', text: `Đã xóa cột “${column.name}” và tính lại điểm trung bình.` });
    }
  };

  const handleSaveRename = (column: CustomGradeColumn) => {
    if (!onRenameColumn) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setMessage({ kind: 'error', text: 'Tên cột không được để trống.' });
      return;
    }
    if (trimmed.length > 40) {
      setMessage({ kind: 'error', text: 'Tên cột không được vượt quá 40 ký tự.' });
      return;
    }
    const duplicate = activeColumns.some(
      (c) =>
        c.id !== column.id &&
        c.semester === column.semester &&
        c.programId === column.programId &&
        c.name.trim().toLocaleLowerCase('vi-VN') === trimmed.toLocaleLowerCase('vi-VN'),
    );
    if (duplicate) {
      setMessage({ kind: 'error', text: `Cột “${trimmed}” đã tồn tại trong chương trình này.` });
      return;
    }
    if (onRenameColumn(column.id, trimmed)) {
      setEditingColumnId(null);
      setEditingName('');
      setMessage({ kind: 'success', text: `Đã cập nhật tên cột thành “${trimmed}”.` });
    }
  };

  return (
    <DialogFrame
      label="Quản lý cột bài và cột điểm"
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4"
    >
      <div className="dialog-panel w-full max-w-2xl space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-950 text-base">Thêm / xóa cột bài học & cột điểm</h3>
              <p className="text-xs text-slate-500">
                Thêm cột bài (UNIT) hoặc cột điểm kiểm tra theo chương trình & học kỳ; tự động liên kết vào ĐTB.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form thêm cột */}
        {canEdit ? (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-700">Chương trình áp dụng</label>
                <ResponsiveSelect
                  label="Chương trình áp dụng cho cột điểm"
                  value={programId}
                  onChange={setProgramId}
                  options={[
                    { value: 'all', label: 'Tất cả chương trình (Áp dụng chung)' },
                    ...programs.map((program) => ({ value: program.id, label: program.name })),
                  ]}
                  placeholder="Chọn chương trình"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-700">Học kỳ áp dụng</label>
                <ResponsiveSelect
                  label="Học kỳ áp dụng cho cột điểm"
                  value={semester}
                  onChange={(value) => setSemester(value as GradeSemester)}
                  options={SEMESTERS}
                />
              </div>
            </div>

            {/* Sổ ra hai lựa chọn: Cột bài / UNIT hoặc Cột điểm / bài kiểm tra */}
            <fieldset className="space-y-2">
              <div className="flex items-center justify-between">
                <legend className="text-xs font-bold text-slate-800">
                  Lựa chọn loại cột muốn thêm:
                </legend>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setAddUnit(true); setAddAssessment(true); }}
                    className="text-[11px] font-bold text-amber-700 hover:text-amber-900 underline cursor-pointer"
                  >
                    Tích chọn cả hai
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Lựa chọn 1: Cột bài / UNIT */}
                <div
                  className={`rounded-2xl border-2 p-3.5 transition-all ${
                    addUnit ? 'border-amber-400 bg-white shadow-xs' : 'border-slate-200 bg-slate-50 hover:bg-white'
                  }`}
                >
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addUnit}
                      onChange={(event) => setAddUnit(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900">Cột bài / UNIT</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                          UNIT
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Ví dụ: UNIT 13, Bài ôn tập 1, Lesson extra...
                      </p>
                    </div>
                  </label>

                  {addUnit && (
                    <div className="mt-3 pt-2.5 border-t border-amber-100">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Tên cột bài / UNIT
                        <input
                          aria-label="Tên cột bài hoặc UNIT"
                          value={unitName}
                          onChange={(event) => setUnitName(event.target.value)}
                          maxLength={40}
                          placeholder="VD: UNIT 13"
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Lựa chọn 2: Cột điểm / bài kiểm tra */}
                <div
                  className={`rounded-2xl border-2 p-3.5 transition-all ${
                    addAssessment ? 'border-indigo-400 bg-white shadow-xs' : 'border-slate-200 bg-slate-50 hover:bg-white'
                  }`}
                >
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addAssessment}
                      onChange={(event) => setAddAssessment(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900">Cột điểm / bài kiểm tra</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                          ĐIỂM SỐ
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Ví dụ: Progress Test, Kiểm tra tháng...
                      </p>
                    </div>
                  </label>

                  {addAssessment && (
                    <div className="mt-3 pt-2.5 border-t border-indigo-100">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Tên cột điểm / bài kiểm tra
                        <input
                          aria-label="Tên cột điểm hoặc bài kiểm tra"
                          value={assessmentName}
                          onChange={(event) => setAssessmentName(event.target.value)}
                          maxLength={40}
                          placeholder="VD: Progress Test 1"
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-slate-500 pt-0.5">
                💡 <em>Có thể tích chọn cả hai nếu cần tạo đồng thời 2 cột (UNIT và Bài kiểm tra) cùng lúc.</em>
              </div>
            </fieldset>

            {message && (
              <div
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs ${
                  message.kind === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
              >
                {message.kind === 'error' ? (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <Check className="h-4 w-4 shrink-0" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={count === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-black text-slate-950 shadow-sm transition hover:from-amber-600 hover:to-amber-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>
                  {count === 2
                    ? 'Thêm 2 cột (UNIT & Điểm kiểm tra)'
                    : count === 1
                    ? addUnit
                      ? 'Thêm 1 cột (UNIT)'
                      : 'Thêm 1 cột (Điểm kiểm tra)'
                    : 'Tích chọn ít nhất 1 loại cột'}
                </span>
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Bạn đang ở chế độ xem. Chỉ Chủ trung tâm, Hành chính hoặc Bộ phận Đào tạo có quyền sửa điểm mới được thay đổi cấu trúc cột.
          </div>
        )}

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-900">
          Sau khi thêm, hãy chọn lớp thuộc chương trình đó để nhập điểm. Chế độ “Tất cả lớp” sẽ tự động hiển thị cột khi các lớp đang xem cùng một chương trình đào tạo.
        </div>

        {/* Danh sách cột tùy chỉnh đang dùng */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Cột tùy chỉnh đang sử dụng ({activeColumns.length})</span>
            <span className="font-normal text-slate-400">Xóa không làm mất điểm lịch sử</span>
          </div>

          {activeColumns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">
              Chưa có cột bài hoặc cột điểm tùy chỉnh nào. Hãy thêm ở phía trên!
            </div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {activeColumns.map((column) => {
                const kind = customGradeColumnKind(column);
                const program = programs.find((item) => item.id === column.programId);
                const isEditing = editingColumnId === column.id;

                if (isEditing) {
                  return (
                    <div
                      key={column.id}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 rounded-xl border border-amber-300 p-3 bg-amber-50/60 transition"
                    >
                      <div className="flex-1">
                        <input
                          aria-label={`Sửa tên cột ${column.name}`}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          maxLength={40}
                          autoFocus
                          className="w-full rounded-lg border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveRename(column)}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-600 transition cursor-pointer shadow-2xs"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Cập nhật</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingColumnId(null);
                            setEditingName('');
                          }}
                          className="rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300 transition cursor-pointer"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={column.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 bg-white hover:border-slate-300 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-950">{column.name}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            kind === 'assessment'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {kindLabel(kind)}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">
                          {column.semester}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                        <ClipboardList className="h-3 w-3" />
                        <span>{program?.name || (column.classId ? 'Phạm vi lớp cũ' : 'Tất cả chương trình')}</span>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`Sửa tên cột ${column.name}`}
                          onClick={() => {
                            setEditingColumnId(column.id);
                            setEditingName(column.name);
                          }}
                          className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-700 transition cursor-pointer"
                          title="Sửa tên cột này"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Xóa cột ${column.name}`}
                          onClick={() => void archive(column)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                          title="Xóa cột này khỏi bảng điểm"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
