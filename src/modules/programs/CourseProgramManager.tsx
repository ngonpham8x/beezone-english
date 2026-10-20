import { ConfirmedForm } from '../../components/ConfirmedForm';
import { academicPermission } from '../../lib/permissions';
import { askConfirmation } from '../../lib/dialogs';
import { showAlert } from '../../lib/dialogs';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Phone,
  Search,
  UserPlus,
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
import { ConfirmModal } from '../../components/ConfirmModal';
import { StatCard } from '../../components/StatCard';
import { splitProgramCategories } from '../../lib/programCategories';
import { isStudentInClass, classMatchesProgram } from '../../lib/studentClasses';
import { TeacherAvatar } from '../../components/TeacherAvatar';
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
  onUpdateStudent?: (student: Student) => void;
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
  onUpdateStudent,
  isOwner,
  permissions
}) => {
  const canEdit = isOwner || academicPermission(permissions, 'programs', 'edit');
  const canAdd = isOwner || academicPermission(permissions, 'programs', 'add');
  const canDelete = isOwner || academicPermission(permissions, 'programs', 'delete');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<CourseProgram | null>(null);
  const [programToDelete, setProgramToDelete] = useState<CourseProgram | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [viewingProgramStudents, setViewingProgramStudents] = useState<CourseProgram | null>(null);
  const [programStudentSearch, setProgramStudentSearch] = useState('');
  const [programStatusFilter, setProgramStatusFilter] = useState<string>('all');
  const [programFeeFilter, setProgramFeeFilter] = useState<string>('all');
  const [isAssignDrawerOpen, setIsAssignDrawerOpen] = useState(false);
  const [selectedStudentIdsToAssign, setSelectedStudentIdsToAssign] = useState<string[]>([]);
  const [assignSearch, setAssignSearch] = useState('');

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
        splitProgramCategories(p.category).forEach(c => {
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
    if (!canAdd) return;
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
      ? splitProgramCategories(prog.category)
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
    if (editingProgram ? !canEdit : !canAdd) return;
    if (!formName.trim() || !formCode.trim()) {
      showAlert('Vui lòng nhập đầy đủ mã và tên chương trình học');
      return;
    }
    if (programs.some(program => program.id !== editingProgram?.id && program.code.trim().toLowerCase() === formCode.trim().toLowerCase())) { showAlert('Mã chương trình đã tồn tại.'); return; }
    const parsedTuitionFee = formTuitionFee === '' ? 0 : Number(formTuitionFee);
    if (!Number.isFinite(parsedTuitionFee) || parsedTuitionFee < 0) { showAlert('Học phí phải là số không âm.'); return; }

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
    const linkedClasses = classes.filter(c => classMatchesProgram(c, prog.id));
    const linkedStudents = students.filter(s => s.programId === prog.id);

    if (linkedClasses.length > 0 || linkedStudents.length > 0) {
      showAlert(
        `Không thể xóa chương trình "${prog.name}" vì đang có ${linkedClasses.length} lớp học và ${linkedStudents.length} học viên liên kết. Vui lòng chuyển lớp/học viên trước.`
      );
      return;
    }

    setProgramToDelete(prog);
  };

  // Filter categories list
  const availableFilterCategories = useMemo(() => {
    const set = new Set<string>();
    ['Mầm Non', 'Cambridge', 'IELTS', 'TOEIC', 'Tiểu Học (Cấp 1)', 'THCS (Cấp 2)', 'THPT (Cấp 3)', 'Giao Tiếp / Khác'].forEach(c => set.add(c));
    programs.forEach(p => {
      if (p.category) {
        splitProgramCategories(p.category).forEach(c => {
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
      const pCats = splitProgramCategories(p.category).map(c => c.toLowerCase());
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

        {canAdd && (
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
          const linkedClasses = classes.filter(c => classMatchesProgram(c, prog.id));
          const classCount = linkedClasses.length;
          const progStudents = students.filter(s => s.programId === prog.id || classes.some(c => classMatchesProgram(c, prog.id) && isStudentInClass(s, c.id)));
          const studentCount = progStudents.length;

          return (
            <div
              key={prog.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(prog.category ? splitProgramCategories(prog.category) : ['Khác']).map(cat => (
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

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500 font-medium">Học viên tham gia:</span>
                    <button
                      type="button"
                      onClick={() => setExpandedProgramId(expandedProgramId === prog.id ? null : prog.id)}
                      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 shadow-2xs cursor-pointer"
                      title={expandedProgramId === prog.id ? 'Thu gọn danh sách học viên' : 'Sổ ra danh sách học viên'}
                    >
                      <Users className="w-3.5 h-3.5 text-amber-600" />
                      <span>{studentCount} học viên</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-amber-600 transition-transform duration-200 ${
                          expandedProgramId === prog.id ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* SỔ RA DANH SÁCH HỌC VIÊN CỦA CHƯƠNG TRÌNH */}
                {expandedProgramId === prog.id && (
                  <div className="mt-4 pt-3 border-t border-amber-200 bg-amber-50/50 -mx-5 -mb-5 p-4 rounded-b-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-amber-600" />
                        Danh sách học viên ({progStudents.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewingProgramStudents(prog)}
                        className="text-[11px] font-bold text-amber-700 hover:text-amber-900 flex items-center gap-0.5 cursor-pointer"
                      >
                        Chi tiết <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>

                    {progStudents.length === 0 ? (
                      <div className="text-center py-3 text-xs text-slate-500">
                        <p>Chưa có học viên nào trong chương trình này.</p>
                        {onUpdateStudent && canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setViewingProgramStudents(prog);
                              setIsAssignDrawerOpen(true);
                            }}
                            className="mt-2 text-xs font-bold text-amber-700 bg-white border border-amber-200 px-3 py-1 rounded-lg hover:bg-amber-50 shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Gán học viên vào chương trình
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                        {progStudents.slice(0, 5).map((st) => {
                          const stClasses = classes.filter(c => classMatchesProgram(c, prog.id) && isStudentInClass(st, c.id));
                          return (
                            <div
                              key={st.id}
                              className="bg-white p-2 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <TeacherAvatar teacher={st} className="w-6 h-6 rounded-full text-[10px] shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 truncate">{st.name}</div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    <span className="font-mono text-slate-400 mr-1">{st.code}</span>
                                    {stClasses.length > 0 ? (
                                      <span className="text-slate-600 font-medium">
                                        • {stClasses.map(c => c.name).join(', ')}
                                      </span>
                                    ) : (
                                      <span className="text-amber-600 italic">• Chưa xếp lớp</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    st.feeStatus === 'paid'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  {st.feeStatus === 'paid' ? 'Đã đóng' : 'Chưa đóng'}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    st.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : st.status === 'reserved'
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {st.status === 'active' ? 'Đang học' : st.status === 'reserved' ? 'Bảo lưu' : st.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {progStudents.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setViewingProgramStudents(prog)}
                            className="w-full py-1 text-center text-xs font-bold text-amber-700 hover:text-amber-800 hover:bg-amber-100/50 rounded-lg transition cursor-pointer"
                          >
                            + Xem thêm {progStudents.length - 5} học viên khác ➔
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setViewingProgramStudents(prog)}
                  className="px-2.5 py-1 text-xs font-bold text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition flex items-center gap-1 cursor-pointer"
                  title="Xem danh sách chi tiết học viên"
                >
                  <Users className="w-3.5 h-3.5" /> Chi tiết học viên
                </button>

                {(canEdit || canDelete) && (
                  <div className="flex items-center gap-1">
                    <button hidden={!canEdit}
                      type="button"
                      onClick={() => openEditModal(prog)}
                      className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                      title="Chỉnh sửa khóa học"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button hidden={!canDelete}
                      type="button"
                      onClick={() => handleDelete(prog)}
                      className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="Xóa khóa học"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
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

            <ConfirmedForm confirmWhen={programs.some(item => item.id === editingProgram?.id)} entityLabel="chương trình học" onSubmit={handleSubmit} className="space-y-4">
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

                <div className="relative" ref={categoryDropdownRef} onKeyDown={event => {
                  if (event.key === 'Escape' && isCategoryDropdownOpen) {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsCategoryDropdownOpen(false);
                    categoryDropdownRef.current?.querySelector('button')?.focus();
                  }
                }}>
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
                    aria-label="Chọn phân loại chương trình"
                    aria-expanded={isCategoryDropdownOpen}
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
            </ConfirmedForm>
          </div>
        </DialogFrame>
      )}
      {/* CONFIRM DELETE PROGRAM MODAL */}
      <ConfirmModal
        isOpen={!!programToDelete}
        title="Xác nhận xóa chương trình học"
        message={
          programToDelete ? (
            <>
              Bạn có chắc chắn muốn xóa chương trình học <strong>{programToDelete.name}</strong> ({programToDelete.code})?
              <span className="block mt-2 text-xs text-slate-500">
                Thao tác này sẽ xóa hoàn toàn chương trình học khỏi danh mục đào tạo của trung tâm.
              </span>
            </>
          ) : null
        }
        confirmText="Xác nhận xóa"
        cancelText="Hủy bỏ"
        variant="danger"
        onConfirm={() => {
          if (programToDelete) {
            onDeleteProgram(programToDelete.id);
            setProgramToDelete(null);
          }
        }}
        onClose={() => setProgramToDelete(null)}
      />

      {/* CHI TIẾT HỌC VIÊN CHƯƠNG TRÌNH ĐÀO TẠO MODAL */}
      {viewingProgramStudents && (
        <DialogFrame
          label="Chi tiết học viên chương trình"
          onClose={() => {
            setViewingProgramStudents(null);
            setIsAssignDrawerOpen(false);
            setSelectedStudentIdsToAssign([]);
          }}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div className="dialog-panel bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-amber-50/40">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {viewingProgramStudents.name}
                    </h3>
                    <span className="font-mono text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                      {viewingProgramStudents.code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    Học phí chuẩn: <strong className="text-emerald-700">{viewingProgramStudents.tuitionFee.toLocaleString('vi-VN')} đ</strong> · Phân loại: {viewingProgramStudents.category || 'Chung'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setViewingProgramStudents(null);
                  setIsAssignDrawerOpen(false);
                  setSelectedStudentIdsToAssign([]);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
              {(() => {
                const progId = viewingProgramStudents.id;
                const progStudents = students.filter(
                  (s) => s.programId === progId || classes.some((c) => classMatchesProgram(c, progId) && isStudentInClass(s, c.id))
                );
                const activeCount = progStudents.filter((s) => s.status === 'active').length;
                const paidCount = progStudents.filter((s) => s.feeStatus === 'paid').length;
                const unpaidCount = progStudents.length - paidCount;

                const filtered = progStudents.filter((st) => {
                  if (programStatusFilter !== 'all' && st.status !== programStatusFilter) return false;
                  if (programFeeFilter === 'paid' && st.feeStatus !== 'paid') return false;
                  if (programFeeFilter === 'unpaid' && st.feeStatus === 'paid') return false;
                  if (programStudentSearch.trim()) {
                    const q = programStudentSearch.trim().toLowerCase();
                    const stClasses = classes.filter((c) => classMatchesProgram(c, progId) && isStudentInClass(st, c.id));
                    const matchName = st.name.toLowerCase().includes(q);
                    const matchCode = st.code.toLowerCase().includes(q);
                    const matchPhone = (st.phone && st.phone.includes(q)) || (st.parentPhone && st.parentPhone.includes(q));
                    const matchClass = stClasses.some((c) => c.name.toLowerCase().includes(q));
                    if (!matchName && !matchCode && !matchPhone && !matchClass) return false;
                  }
                  return true;
                });

                const unassignedStudents = students.filter(
                  (s) => s.programId !== progId && !classes.some((c) => classMatchesProgram(c, progId) && isStudentInClass(s, c.id))
                );

                return (
                  <>
                    {/* Quick Stats Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">Tổng học viên</div>
                        <div className="text-xl font-extrabold text-slate-900 mt-0.5">{progStudents.length}</div>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-center">
                        <div className="text-[11px] font-bold text-emerald-700 uppercase">Đang học</div>
                        <div className="text-xl font-extrabold text-emerald-800 mt-0.5">{activeCount}</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-3 text-center">
                        <div className="text-[11px] font-bold text-blue-700 uppercase">Đã đóng học phí</div>
                        <div className="text-xl font-extrabold text-blue-800 mt-0.5">{paidCount}</div>
                      </div>
                      <div className="bg-rose-50 border border-rose-200/80 rounded-xl p-3 text-center">
                        <div className="text-[11px] font-bold text-rose-700 uppercase">Chưa hoàn thành</div>
                        <div className="text-xl font-extrabold text-rose-800 mt-0.5">{unpaidCount}</div>
                      </div>
                    </div>

                    {/* Filter and Action Bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={programStudentSearch}
                          onChange={(e) => setProgramStudentSearch(e.target.value)}
                          placeholder="Tìm học sinh theo tên, mã HS, SĐT, lớp..."
                          className="w-full pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                        {programStudentSearch && (
                          <button
                            type="button"
                            onClick={() => setProgramStudentSearch('')}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={programStatusFilter}
                          onChange={(e) => setProgramStatusFilter(e.target.value)}
                          className="px-2.5 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium text-slate-700"
                        >
                          <option value="all">Tất cả trạng thái</option>
                          <option value="active">Đang học</option>
                          <option value="reserved">Bảo lưu</option>
                          <option value="dropped">Nghỉ học</option>
                          <option value="lead">Tiềm năng</option>
                          <option value="trial">Học thử</option>
                        </select>

                        <select
                          value={programFeeFilter}
                          onChange={(e) => setProgramFeeFilter(e.target.value)}
                          className="px-2.5 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium text-slate-700"
                        >
                          <option value="all">Tất cả học phí</option>
                          <option value="paid">Đã đóng đủ</option>
                          <option value="unpaid">Chưa đóng / Nợ</option>
                        </select>

                        {onUpdateStudent && canEdit && (
                          <button
                            type="button"
                            onClick={() => setIsAssignDrawerOpen((prev) => !prev)}
                            className="px-3 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>{isAssignDrawerOpen ? 'Đóng form gán' : 'Gán học viên'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ASSIGN STUDENTS DRAWER WITH CHECKBOXES */}
                    {isAssignDrawerOpen && (
                      <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                              <UserPlus className="w-4 h-4 text-amber-600" />
                              Tích chọn học viên để liên kết vào chương trình này
                            </h4>
                            <p className="text-[11px] text-amber-800 mt-0.5">
                              Học viên được chọn sẽ được gán trực tiếp vào chương trình đào tạo {viewingProgramStudents.name}.
                            </p>
                          </div>
                          {selectedStudentIdsToAssign.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                for (const sid of selectedStudentIdsToAssign) {
                                  const targetSt = students.find((s) => s.id === sid);
                                  if (targetSt && onUpdateStudent) {
                                    onUpdateStudent({ ...targetSt, programId: progId });
                                  }
                                }
                                setSelectedStudentIdsToAssign([]);
                                setIsAssignDrawerOpen(false);
                              }}
                              className="px-4 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 shadow-sm cursor-pointer"
                            >
                              Xác nhận liên kết ({selectedStudentIdsToAssign.length} học viên)
                            </button>
                          )}
                        </div>

                        {/* Search in assign */}
                        <div className="relative">
                          <input
                            type="text"
                            value={assignSearch}
                            onChange={(e) => setAssignSearch(e.target.value)}
                            placeholder="Tìm học viên chưa có trong chương trình này..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-amber-200 rounded-lg"
                          />
                          <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                        </div>

                        {/* Unassigned Students List with Checkboxes */}
                        <div className="max-h-48 overflow-y-auto space-y-1 bg-white p-2 rounded-xl border border-amber-200/60 custom-scrollbar">
                          {unassignedStudents.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-500">
                              Tất cả học viên trong hệ thống đã thuộc chương trình này!
                            </div>
                          ) : (
                            unassignedStudents
                              .filter((s) => {
                                if (!assignSearch.trim()) return true;
                                const q = assignSearch.trim().toLowerCase();
                                return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
                              })
                              .map((st) => {
                                const isChecked = selectedStudentIdsToAssign.includes(st.id);
                                return (
                                  <label
                                    key={st.id}
                                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs ${
                                      isChecked
                                        ? 'bg-amber-100/70 border border-amber-300 font-bold text-amber-950'
                                        : 'hover:bg-slate-50 border border-transparent text-slate-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          setSelectedStudentIdsToAssign((prev) =>
                                            prev.includes(st.id) ? prev.filter((id) => id !== st.id) : [...prev, st.id]
                                          );
                                        }}
                                        className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                                      />
                                      <TeacherAvatar teacher={st} className="w-6 h-6 rounded-full text-[10px]" />
                                      <span>{st.name}</span>
                                      <span className="font-mono text-[10px] text-slate-400">({st.code})</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500">
                                      CT hiện tại: {programs.find((p) => p.id === st.programId)?.name || 'Chưa gán'}
                                    </span>
                                  </label>
                                );
                              })
                          )}
                        </div>
                      </div>
                    )}

                    {/* Students Table */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                      {filtered.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs">
                          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-semibold text-slate-700">Không tìm thấy học viên phù hợp</p>
                          <p className="text-slate-400 mt-1">Hãy thử đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                              <tr>
                                <th className="py-3 px-3 w-12 text-center">STT</th>
                                <th className="py-3 px-3">Học sinh</th>
                                <th className="py-3 px-3">Lớp đang theo học</th>
                                <th className="py-3 px-3">Phụ huynh & Liên hệ</th>
                                <th className="py-3 px-3">Trạng thái</th>
                                <th className="py-3 px-3">Học phí</th>
                                {onUpdateStudent && canEdit && <th className="py-3 px-3 text-right">Thao tác</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {filtered.map((st, idx) => {
                                const stClasses = classes.filter(
                                  (c) => classMatchesProgram(c, progId) && isStudentInClass(st, c.id)
                                );
                                return (
                                  <tr key={st.id} className="hover:bg-amber-50/30 transition">
                                    <td className="py-3 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-2.5">
                                        <TeacherAvatar teacher={st} className="w-8 h-8 rounded-full text-xs shrink-0" />
                                        <div>
                                          <div className="font-bold text-slate-900">{st.name}</div>
                                          <div className="text-[10px] text-slate-400 font-mono">
                                            {st.code} · {st.gender || 'Chưa xác định'}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3">
                                      {stClasses.length > 0 ? (
                                        <div className="space-y-0.5">
                                          {stClasses.map((c) => (
                                            <div key={c.id} className="font-semibold text-slate-800">
                                              {c.name}
                                              <span className="text-[10px] text-slate-400 font-mono ml-1">({c.code})</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-amber-700 italic text-[11px]">Chưa xếp lớp</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3">
                                      <div className="font-medium text-slate-800">{st.parentName || st.name}</div>
                                      {(st.phone || st.parentPhone) && (
                                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                          <Phone className="w-3 h-3 text-slate-400" />
                                          <a
                                            href={`tel:${st.parentPhone || st.phone}`}
                                            className="hover:text-amber-700 hover:underline"
                                          >
                                            {st.parentPhone || st.phone}
                                          </a>
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-3 px-3">
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                          st.status === 'active'
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : st.status === 'reserved'
                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        {st.status === 'active'
                                          ? 'Đang học'
                                          : st.status === 'reserved'
                                          ? 'Bảo lưu'
                                          : st.status === 'dropped'
                                          ? 'Nghỉ học'
                                          : st.status}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3">
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                          st.feeStatus === 'paid'
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                                        }`}
                                      >
                                        {st.feeStatus === 'paid' ? 'Đã đóng đủ' : 'Chưa đóng / Nợ'}
                                      </span>
                                    </td>
                                    {onUpdateStudent && canEdit && (
                                      <td className="py-3 px-3 text-right">
                                        {st.programId === progId && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              if (await askConfirmation(`Hủy liên kết học viên ${st.name} khỏi chương trình ${viewingProgramStudents.name}?`)) {
                                                onUpdateStudent({ ...st, programId: '' });
                                              }
                                            }}
                                            className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline cursor-pointer"
                                            title="Hủy liên kết khỏi chương trình này"
                                          >
                                            Hủy liên kết
                                          </button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setViewingProgramStudents(null);
                  setIsAssignDrawerOpen(false);
                  setSelectedStudentIdsToAssign([]);
                }}
                className="px-5 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition cursor-pointer"
              >
                Đóng Cửa Sổ
              </button>
            </div>
          </div>
        </DialogFrame>
      )}

    </div>
  );
};

