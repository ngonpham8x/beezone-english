import { AlertCircle, Check, ClipboardList, Layers, Plus, Trash2, X } from 'lucide-react';
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
  programId: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  columns: CustomGradeColumn[];
  onAddColumns: (columns: ColumnDraft[]) => boolean;
  onArchiveColumn: (columnId: string) => boolean;
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

const kindLabel = (kind: CustomGradeColumnKind) => kind === 'assessment' ? 'Cột điểm / bài kiểm tra' : 'Cột bài / UNIT';

export function CustomColumnsModal({
  isOpen,
  onClose,
  columns,
  onAddColumns,
  onArchiveColumn,
  currentSemester,
  programs,
  classes,
  selectedClassId,
  canEdit,
}: Props) {
  const selectedProgramId = classes.find((item) => item.id === selectedClassId)?.programId;
  const [semester, setSemester] = useState<GradeSemester>(currentSemester);
  const [programId, setProgramId] = useState(selectedProgramId || programs[0]?.id || '');
  const [addUnit, setAddUnit] = useState(true);
  const [addAssessment, setAddAssessment] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [assessmentName, setAssessmentName] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const activeColumns = useMemo(() => columns.filter(isActiveCustomGradeColumn), [columns]);

  useEffect(() => {
    if (!isOpen) return;
    setSemester(currentSemester);
    setProgramId(selectedProgramId || programs[0]?.id || '');
    setMessage(null);
  }, [currentSemester, isOpen, programs, selectedProgramId]);

  if (!isOpen) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const drafts: ColumnDraft[] = [];
    if (!programId) return setMessage({ kind: 'error', text: 'Vui lòng chọn chương trình áp dụng.' });
    if (!addUnit && !addAssessment) return setMessage({ kind: 'error', text: 'Hãy tích chọn ít nhất một loại cột cần thêm.' });
    if (addUnit) {
      if (!unitName.trim()) return setMessage({ kind: 'error', text: 'Vui lòng nhập tên cột bài / UNIT.' });
      drafts.push({ name: unitName.trim(), kind: 'unit', semester, programId });
    }
    if (addAssessment) {
      if (!assessmentName.trim()) return setMessage({ kind: 'error', text: 'Vui lòng nhập tên cột điểm / bài kiểm tra.' });
      drafts.push({ name: assessmentName.trim(), kind: 'assessment', semester, programId });
    }
    const duplicate = drafts.find((draft) => activeColumns.some((column) =>
      column.semester === draft.semester &&
      column.programId === draft.programId &&
      column.name.trim().toLocaleLowerCase('vi-VN') === draft.name.toLocaleLowerCase('vi-VN'),
    ));
    if (duplicate) return setMessage({ kind: 'error', text: `Cột “${duplicate.name}” đã tồn tại trong chương trình và học kỳ này.` });
    if (!onAddColumns(drafts)) return;
    setUnitName('');
    setAssessmentName('');
    setMessage({ kind: 'success', text: `Đã thêm và liên kết ${drafts.length} cột vào điểm trung bình.` });
  };

  const archive = async (column: CustomGradeColumn) => {
    const confirmed = await askConfirmation(
      `Xóa cột “${column.name}”? Cột sẽ ngừng hiển thị và không còn tính vào ĐTB. Điểm lịch sử vẫn được giữ trong bản sao lưu.`,
    );
    if (confirmed && onArchiveColumn(column.id)) {
      setMessage({ kind: 'success', text: `Đã xóa cột “${column.name}” và tính lại điểm trung bình.` });
    }
  };

  return (
    <DialogFrame label="Quản lý cột bài và cột điểm" onClose={onClose}>
      <div className="my-auto max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Layers className="h-5 w-5" /></div>
            <div>
              <h3 className="font-extrabold text-slate-950">Thêm / xóa cột bài và cột điểm</h3>
              <p className="text-xs text-slate-500">Cấu hình riêng theo chương trình và học kỳ; các điểm đã nhập được liên kết tự động vào ĐTB.</p>
            </div>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        {canEdit && (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-700">Chương trình áp dụng</label>
                <ResponsiveSelect label="Chương trình áp dụng cho cột điểm" value={programId} onChange={setProgramId} options={programs.map((program) => ({ value: program.id, label: program.name }))} placeholder="Chọn chương trình" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-700">Học kỳ áp dụng</label>
                <ResponsiveSelect label="Học kỳ áp dụng cho cột điểm" value={semester} onChange={(value) => setSemester(value as GradeSemester)} options={SEMESTERS} />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-[11px] font-bold text-slate-700">Tích chọn loại cột muốn thêm</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`rounded-xl border p-3 ${addUnit ? 'border-amber-400 bg-white' : 'border-slate-200 bg-slate-50'}`}>
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-900"><input type="checkbox" checked={addUnit} onChange={(event) => setAddUnit(event.target.checked)} /> Cột bài / UNIT</span>
                  <span className="mt-1 block text-[10px] text-slate-500">Ví dụ: UNIT 13, Bài ôn tập 1</span>
                </label>
                <label className={`rounded-xl border p-3 ${addAssessment ? 'border-indigo-400 bg-white' : 'border-slate-200 bg-slate-50'}`}>
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-900"><input type="checkbox" checked={addAssessment} onChange={(event) => setAddAssessment(event.target.checked)} /> Cột điểm / bài kiểm tra</span>
                  <span className="mt-1 block text-[10px] text-slate-500">Ví dụ: Progress Test, Kiểm tra tháng</span>
                </label>
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              {addUnit && <label className="text-[11px] font-bold text-slate-700">Tên cột bài / UNIT<input aria-label="Tên cột bài hoặc UNIT" value={unitName} onChange={(event) => setUnitName(event.target.value)} maxLength={40} placeholder="VD: UNIT 13" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-amber-500" /></label>}
              {addAssessment && <label className="text-[11px] font-bold text-slate-700">Tên cột điểm / bài kiểm tra<input aria-label="Tên cột điểm hoặc bài kiểm tra" value={assessmentName} onChange={(event) => setAssessmentName(event.target.value)} maxLength={40} placeholder="VD: Progress Test 1" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500" /></label>}
            </div>

            {message && <div className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message.kind === 'error' ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />} {message.text}</div>}
            <div className="flex justify-end"><button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-amber-600"><Plus className="h-4 w-4" /> Thêm {Number(addUnit) + Number(addAssessment)} cột</button></div>
          </form>
        )}

        {!canEdit && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Chỉ Chủ trung tâm được thay đổi cấu trúc cột bài và cột điểm dùng chung.</div>}

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-900">
          Sau khi thêm, hãy chọn một lớp thuộc chương trình đó để nhập điểm. Chế độ “Tất cả lớp” chỉ hiện cột riêng khi các lớp đang xem cùng một chương trình.
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700"><span>Cột đang sử dụng ({activeColumns.length})</span><span className="font-normal text-slate-400">Xóa không làm mất điểm lịch sử</span></div>
          {activeColumns.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">Chưa có cột tùy chỉnh.</div> : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {activeColumns.map((column) => {
                const kind = customGradeColumnKind(column);
                const program = programs.find((item) => item.id === column.programId);
                return <div key={column.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="font-bold text-slate-950">{column.name}</span><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${kind === 'assessment' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'}`}>{kindLabel(kind)}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">{column.semester}</span></div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><ClipboardList className="h-3 w-3" /> {program?.name || (column.classId ? 'Phạm vi lớp cũ' : 'Tất cả chương trình (cũ)')}</div>
                  </div>
                  {canEdit && <button type="button" aria-label={`Xóa cột ${column.name}`} onClick={() => void archive(column)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                </div>;
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-3"><button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">Đóng</button></div>
      </div>
    </DialogFrame>
  );
}
