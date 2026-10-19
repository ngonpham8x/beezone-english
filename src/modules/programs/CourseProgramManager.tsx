import {
  BookOpen,
  Check,
  ChevronDown,
  Edit2,
  GraduationCap,
  Layers,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { StatCard } from '../../components/StatCard';
import { ClassRoom, CourseProgram, StaffPermissions, Student } from '../../types';

const DEFAULT_CATEGORIES = [
  'Mầm Non',
  'Cambridge (Starters, KET, PET)',
  'IELTS',
  'TOEIC',
  'TOEFL',
  'Tiểu Học (Cấp 1)',
  'THCS (Cấp 2)',
  'THPT (Cấp 3)',
  'Giao Tiếp / Khác',
  'Family and Friends',
  'Kỹ Năng & Thể Chất'
];

interface CourseProgramManagerProps {
  programs: CourseProgram[];
  classes: ClassRoom[];
  students: Student[];
  onAddProgram: (program: CourseProgram) => void;
  onUpdateProgram: (program: CourseProgram) => void;
  onDeleteProgram: (id: string) => void;
  isOwner: boolean;
  permissions?: StaffPermissions;
}

export const CourseProgramManager: React.FC<CourseProgramManagerProps> = ({
  programs,
  classes,
  students,
  onAddProgram,
  onUpdateProgram,
  onDeleteProgram,
  isOwner,
  permissions
}) => {
  const canEdit = isOwner || permissions?.academic?.programs === true;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<CourseProgram | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Form states
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategories, setFormCategories] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [formTuitionFee, setFormTuitionFee] = useState<number | ''>('');
  const [formDescription, setFormDescription] = useState('');
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Close category dropdown on outside click
  useEffect(() => {
    if (!isCategoryDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCategoryDropdownOpen]);

  // All available categories pool (defaults + existing programs + custom added)
  const allAvailableCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    programs.forEach(p => {
      if (p.category) {
        p.category.split(',').forEach(c => {
          const t = c.trim();
          if (t) set.add(t);
        });
      }
    });
    customCategories.forEach(c => {
      if (c.trim()) set.add(c.trim());
    });
    return Array.from(set);
  }, [programs, customCategories]);

  const openCreateModal = () => {
    if (!canEdit) return;
    setEditingProgram(null);
    setFormCode(`ENG-${Date.now().toString().slice(-4)}`);
    setFormName('');
    setFormCategories([]);
    setFormTuitionFee('');
    setFormDescription('');
    setCategorySearch('');
    setIsCategoryDropdownOpen(false);
    setIsModalOpen(true);
  };

  const openEditModal = (prog: CourseProgram) => {
    if (!canEdit) return;
    setEditingProgram(prog);
    setFormCode(prog.code);
    setFormName(prog.name);
    const cats = prog.category
      ? prog.category.split(',').map(c => c.trim()).filter(Boolean)
      : [];
    setFormCategories(cats.length > 0 ? cats : ['Giao Tiếp / Khác']);
    setFormTuitionFee(prog.tuitionFee);
    setFormDescription(prog.description || '');
    setCategorySearch('');
    setIsCategoryDropdownOpen(false);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!formName.trim() || !formCode.trim()) {
      alert('Vui lòng nhập đầy đủ mã và tên chương trình học');
      return;
    }
    if (programs.some(program => program.id !== editingProgram?.id && program.code.trim().toLowerCase() === formCode.trim().toLowerCase())) { alert('Mã chương trình đã tồn tại.'); return; }
    const parsedTuitionFee = formTuitionFee === '' ? 0 : Number(formTuitionFee);
    if (!Number.isFinite(parsedTuitionFee) || parsedTuitionFee < 0) { alert('Học phí phải là số không âm.'); return; }

    const finalCategory = formCategories.length > 0 ? formCategories.join(', ') : 'Giao Tiếp / Khác';

    if (editingProgram) {
      onUpdateProgram({
        ...editingProgram,
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        category: finalCategory,
        tuitionFee: parsedTuitionFee,
        description: formDescription.trim()
      });
    } else {
      const newProgram: CourseProgram = {
        id: `PROG_${Date.now()}`,
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        category: finalCategory,
        tuitionFee: parsedTuitionFee,
        description: formDescription.trim()
      };
      onAddProgram(newProgram);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (prog: CourseProgram) => {
    const linkedClasses = classes.filter(c => c.programId === prog.id);
    const linkedStudents = students.filter(s => s.programId === prog.id);

    if (linkedClasses.length > 0 || linkedStudents.length > 0) {
      alert(
        `Không thể xóa chương trình "${prog.name}" vì đang có ${linkedClasses.length} lớp học và ${linkedStudents.length} học viên liên kết. Vui lòng chuyển lớp/học viên trước.`
      );
      return;
    }

    if (window.confirm(`Bạn có chắc chắn muốn xóa chương trình đào tạo "${prog.name}"?`)) {
      onDeleteProgram(prog.id);
    }
  };

  // Filter categories list
  const availableFilterCategories = useMemo(() => {
    const set = new Set<string>();
    ['Mầm Non', 'Cambridge', 'IELTS', 'TOEIC', 'Tiểu Học (Cấp 1)', 'THCS (Cấp 2)', 'THPT (Cấp 3)', 'Giao Tiếp / Khác'].forEach(c => set.add(c));
    programs.forEach(p => {
      if (p.category) {
        p.category.split(',').forEach(c => {
          const t = c.trim();
          if (t) set.add(t);
        });
      }
    });
    return ['all', ...Array.from(set)];
  }, [programs]);

  // Filtered programs
  const filteredPrograms = useMemo(() => {
    return programs.filter(p => {
      const pCats = p.category ? p.category.split(',').map(c => c.trim().toLowerCase()) : [];
      const matchCat =
        filterCategory === 'all' ||
        pCats.includes(filterCategory.toLowerCase()) ||
        (p.category && p.category.toLowerCase().includes(filterCategory.toLowerCase()));
      const matchKey =
        p.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        p.code.toLowerCase().includes(searchKeyword.toLowerCase());
      return matchCat && matchKey;
    });
  }, [programs, filterCategory, searchKeyword]);

  // Stats
  const totalPrograms = programs.length;
  const avgTuition = totalPrograms > 0
    ? Math.round(programs.reduce((acc, p) => acc + p.tuitionFee, 0) / totalPrograms)
    : 0;
  const totalStudentsEnrolled = students.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-amber-600" />
            Chương Trình Đào Tạo & Khóa Học
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý lộ trình học, chuẩn đầu ra Cambridge, IELTS, TOEIC và biểu phí quy định
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-xl text-xs font-bold hover:brightness-110 transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Tạo Khóa Học Mới
          </button>
        )}
      </div>

      <div className="stats-grid stats-grid--three">
        <StatCard label="Tổng chương trình" value={totalPrograms} icon={Layers} />
        <StatCard label="Học phí trung bình" value={avgTuition.toLocaleString('vi-VN') + ' đ'} icon={Sparkles} tone="emerald" />
        <StatCard label="Tổng học viên" value={totalStudentsEnrolled} icon={Users} tone="sky" />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex min-w-0 flex-1 basis-80 flex-wrap items-center gap-2">
          {availableFilterCategories.map(cat => (
            <button
              key={cat}
              type="button"
              aria-pressed={filterCategory === cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filterCategory === cat
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? 'Tất cả chương trình' : cat}
            </button>
          ))}
        </div>

        <input
          aria-label="Tìm chương trình học"
          type="text"
          placeholder="Tìm tên hoặc mã khóa..."
          value={searchKeyword}
          onChange={e => setSearchKeyword(e.target.value)}
          className="filter-control program-search"
        />
      </div>

      {/* Programs Grid */}
      <div className="entity-grid">
        {filteredPrograms.map(prog => {
          const classCount = classes.filter(c => c.programId === prog.id).length;
          const studentCount = students.filter(s => s.programId === prog.id).length;

          return (
            <div
              key={prog.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(prog.category ? prog.category.split(',') : ['Khác']).map(c => c.trim()).filter(Boolean).map(cat => (
                      <span key={cat} className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-extrabold border border-amber-200">
                        {cat}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-400 shrink-0">
                    {prog.code}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 mt-2.5 line-clamp-1">
                  {prog.name}
                </h3>

                <p className="text-xs text-slate-500 mt-2 line-clamp-2 min-h-[32px]">
                  {prog.description || 'Chưa cập nhật mô tả lộ trình đào tạo.'}
                </p>

                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Học phí chuẩn:</span>
                    <span className="font-extrabold text-sm text-emerald-700">
                      {prog.tuitionFee.toLocaleString('vi-VN')} đ
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Lớp đang mở:</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                      {classCount} lớp
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Học viên tham gia:</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {studentCount} học viên
                    </span>
                  </div>
                </div>
              </div>

              {canEdit && (
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(prog)}
                    className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                    title="Chỉnh sửa khóa học"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(prog)}
                    className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                    title="Xóa khóa học"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <DialogFrame label="Chương trình học" onClose={() => setIsModalOpen(false)} className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="dialog-panel bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-600" />
                {editingProgram ? 'Chỉnh Sửa Chương Trình Học' : 'Tạo Chương Trình Đào Tạo Mới'}
              </h3>
              <button aria-label="Đóng"
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mã khóa học *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    placeholder="VD: CAM-KIDS"
                    className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                  />
                </div>

                <div className="relative" ref={categoryDropdownRef}>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Phân loại *</span>
                    {formCategories.length > 0 && (
                      <span className="text-[10px] font-semibold text-amber-700">
                        {formCategories.length} đã chọn
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCategoryDropdownOpen(prev => !prev)}
                    className="w-full min-h-[38px] text-xs px-3 py-1.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-600 focus:outline-hidden bg-white flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                      {formCategories.length === 0 ? (
                        <span className="text-slate-400 font-normal">Chọn hoặc thêm phân loại...</span>
                      ) : (
                        formCategories.map(cat => (
                          <span
                            key={cat}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold text-[11px]"
                          >
                            <span className="truncate max-w-[120px]">{cat}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                setFormCategories(prev => prev.filter(c => c !== cat));
                              }}
                              className="hover:text-red-700 cursor-pointer ml-0.5 text-xs font-extrabold"
                              title="Bỏ phân loại này"
                            >
                              ×
                            </span>
                          </span>
                        ))
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isCategoryDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 text-xs">
                      <div className="flex gap-1.5 mb-2">
                        <input
                          type="text"
                          value={categorySearch}
                          onChange={e => setCategorySearch(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = categorySearch.trim();
                              if (trimmed) {
                                if (!customCategories.includes(trimmed)) {
                                  setCustomCategories(prev => [...prev, trimmed]);
                                }
                                if (!formCategories.includes(trimmed)) {
                                  setFormCategories(prev => [...prev, trimmed]);
                                }
                                setCategorySearch('');
                              }
                            }
                          }}
                          placeholder="Tìm hoặc gõ thêm phân loại..."
                          className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-600 focus:outline-hidden"
                          autoFocus
                        />
                        {categorySearch.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = categorySearch.trim();
                              if (trimmed) {
                                if (!customCategories.includes(trimmed)) {
                                  setCustomCategories(prev => [...prev, trimmed]);
                                }
                                if (!formCategories.includes(trimmed)) {
                                  setFormCategories(prev => [...prev, trimmed]);
                                }
                                setCategorySearch('');
                              }
                            }}
                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" /> Thêm
                          </button>
                        )}
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-0.5 custom-scrollbar">
                        {allAvailableCategories
                          .filter(c => !categorySearch.trim() || c.toLowerCase().includes(categorySearch.trim().toLowerCase()))
                          .map(cat => {
                            const isSelected = formCategories.includes(cat);
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => {
                                  setFormCategories(prev =>
                                    prev.includes(cat)
                                      ? prev.filter(c => c !== cat)
                                      : [...prev, cat]
                                  );
                                }}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-amber-50 text-amber-900 font-bold'
                                    : 'text-slate-700 hover:bg-slate-100 font-medium'
                                }`}
                              >
                                <span className="truncate">{cat}</span>
                                {isSelected ? (
                                  <Check className="w-4 h-4 text-amber-600 shrink-0 ml-1" />
                                ) : (
                                  <div className="w-4 h-4 rounded border border-slate-300 shrink-0 ml-1" />
                                )}
                              </button>
                            );
                          })}

                        {categorySearch.trim() && !allAvailableCategories.some(c => c.toLowerCase() === categorySearch.trim().toLowerCase()) && (
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = categorySearch.trim();
                              if (trimmed) {
                                if (!customCategories.includes(trimmed)) {
                                  setCustomCategories(prev => [...prev, trimmed]);
                                }
                                if (!formCategories.includes(trimmed)) {
                                  setFormCategories(prev => [...prev, trimmed]);
                                }
                                setCategorySearch('');
                              }
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-amber-700 hover:bg-amber-50 rounded-lg font-bold border-t border-slate-100 mt-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Thêm mới: &ldquo;{categorySearch.trim()}&rdquo;</span>
                          </button>
                        )}
                      </div>

                      <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Tích chọn 1 hoặc nhiều phân loại</span>
                        <button
                          type="button"
                          onClick={() => setIsCategoryDropdownOpen(false)}
                          className="font-bold text-amber-700 hover:text-amber-800 cursor-pointer px-2 py-0.5 rounded-md hover:bg-amber-50"
                        >
                          Xong
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên chương trình đào tạo *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="VD: Cambridge Movers A1 (Lứa tuổi 8-10)"
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mức học phí tiêu chuẩn (VNĐ) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={formTuitionFee}
                  onChange={e => {
                    const val = e.target.value;
                    setFormTuitionFee(val === '' ? '' : Number(val));
                  }}
                  placeholder="Nhập mức học phí tùy ý (VD: 540000)"
                  className="w-full text-xs font-bold px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                />
                {formTuitionFee !== '' && !isNaN(Number(formTuitionFee)) && Number(formTuitionFee) > 0 && (
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <span>Số tiền hiển thị:</span>
                    <span className="font-bold text-emerald-700">
                      {Number(formTuitionFee).toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mô tả lộ trình & Chuẩn đầu ra
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Mô tả mục tiêu kỹ năng, thời lượng buổi học, tài liệu giảng dạy..."
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-600 focus:outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition shadow-sm"
                >
                  {editingProgram ? 'Lưu Thay Đổi' : 'Tạo Khóa Học'}
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}
    </div>
  );
};

