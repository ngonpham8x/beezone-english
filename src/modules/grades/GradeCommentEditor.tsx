import { ChevronDown, ChevronUp, Pencil, Save, Trash2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value?: string;
  canEdit: boolean;
  ariaLabel: string;
  onSave: (value: string) => void;
  quickComments?: string[];
}

export function GradeCommentEditor({ value = '', canEdit, ariaLabel, onSave, quickComments = [] }: Props) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !editing) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 96), expanded ? 360 : 220)}px`;
  }, [draft, editing, expanded]);

  if (!editing) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex w-full items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
          aria-label={`${expanded ? 'Thu gọn' : 'Mở rộng'} ${ariaLabel}`}
        >
          <span className={expanded ? 'whitespace-pre-wrap leading-relaxed' : 'line-clamp-2 leading-relaxed'}>
            {value || 'Chưa có nhận xét quá trình học tập.'}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </button>
        {canEdit && (
          <div className="flex flex-wrap justify-end gap-1.5">
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-200">
              <Pencil className="h-3 w-3" /> {value ? 'Sửa' : 'Thêm nhận xét'}
            </button>
            {value && (
              <button type="button" onClick={() => onSave('')} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100">
                <Trash2 className="h-3 w-3" /> Xóa
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        autoFocus
        rows={4}
        aria-label={ariaLabel}
        placeholder="Nhập nhận xét quá trình học tập, điểm mạnh, nội dung cần cải thiện..."
        value={draft}
        maxLength={2000}
        onChange={(event) => setDraft(event.target.value)}
        className="min-h-24 max-h-[360px] w-full resize-y rounded-xl border border-amber-300 bg-white p-3 text-xs leading-relaxed text-slate-800 shadow-inner focus:ring-2 focus:ring-amber-500"
      />
      <div className="flex flex-wrap items-center gap-1">
        {quickComments.map((comment) => (
          <button
            key={comment}
            type="button"
            onClick={() => setDraft((current) => current.trim() ? `${current.trim()}. ${comment}` : comment)}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:border-amber-300 hover:bg-amber-50"
          >
            +{comment}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Thu gọn' : 'Mở rộng'}
        </button>
      </div>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
        >
          <X className="h-3 w-3" /> Hủy
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              onSave('');
              setDraft('');
              setEditing(false);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100"
          >
            <Trash2 className="h-3 w-3" /> Xóa
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const next = draft.trim();
            onSave(next);
            setDraft(next);
            setEditing(false);
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
        >
          <Save className="h-3 w-3" /> Lưu nhận xét
        </button>
      </div>
    </div>
  );
}
