import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { debtBreakdown, paymentKindLabel, paymentPeriodLabel } from '../lib/tuition';
import { isStudentInClass, getStudentClassIds } from '../lib/student';
import {
  Student,
  CourseProgram,
  ClassRoom,
  Teacher,
  Room,
  TuitionReceipt,
  TimetableSlot,
  StaffPermissions,
  StudentStatus,
  FeeStatus
} from '../types';
import {
  Users,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  FileSpreadsheet,
  Phone,
  Mail,
  MapPin,
  Calendar,
  School,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  User,
  X,
  Save,
  UserPlus,
  LayoutGrid,
  Table as TableIcon,
  DoorOpen,
  GraduationCap,
  BookOpen,
  CalendarDays,
  DollarSign,
  UserCheck
} from 'lucide-react';

const FeeStatusBadge: React.FC<{ feeStatus: FeeStatus; monthlyDebt?: number; courseDebt?: number }> = ({ feeStatus, monthlyDebt = 0, courseDebt = 0 }) => {
  const isPaid = feeStatus === 'paid';
  const isUnpaid = feeStatus === 'unpaid';
  const label = isPaid ? 'Đã đóng đủ' : isUnpaid ? 'Chưa đóng' : 'Đóng thiếu';
  const className = isPaid
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : isUnpaid
      ? 'bg-rose-100 text-rose-800 border-rose-300'
      : 'bg-amber-100 text-amber-800 border-amber-300';
  const Icon = isPaid ? CheckCircle : isUnpaid ? XCircle : AlertCircle;

  return (
    <div className="space-y-1">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${className}`}>
        <Icon className="w-3 h-3 mr-1" /> {label}
      </span>
      {monthlyDebt > 0 && <div className="text-[10px] font-bold text-rose-700">Nợ tháng: {monthlyDebt.toLocaleString('vi-VN')} đ</div>}
      {courseDebt > 0 && <div className="text-[10px] font-bold text-rose-700">Nợ khóa: {courseDebt.toLocaleString('vi-VN')} đ</div>}
    </div>
  );
};

interface StudentManagerProps {
  students: Student[];
  programs: CourseProgram[];
  classes: ClassRoom[];
  receipts: TuitionReceipt[];
  timetableSlots: TimetableSlot[];
  teachers?: Teacher[];
  rooms?: Room[];
  permissions: StaffPermissions;
  isOwner: boolean;
  searchQuery: string;
  onAddStudent: (newStudent: Student) => void;
  onUpdateStudent: (updatedStudent: Student) => void;
  onDeleteStudent: (id: string) => void;
  onOpenImportExportModal: () => void;
  onOpenTuition: () => void;
  onCreateProgram: (program: CourseProgram) => void;
}

export const StudentManager: React.FC<StudentManagerProps> = ({
  students,
  programs,
  classes,
  receipts,
  timetableSlots,
  teachers = [],
  rooms = [],
  permissions,
  isOwner,
  searchQuery,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onOpenImportExportModal,
  onOpenTuition,
  onCreateProgram
}) => {
  const { t, language } = useLanguage();
  const [filterProgram, setFilterProgram] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  // On phones, cards are readable without horizontal scrolling; desktops keep
  // the denser table as the default.
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'card' : 'table'
  ));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [programEntryMode, setProgramEntryMode] = useState<'catalog' | 'manual'>('catalog');
  const [manualProgramName, setManualProgramName] = useState('');

  const canAdd = isOwner || permissions.student.add;
  const canEdit = isOwner || permissions.student.edit;
  const canDelete = isOwner || permissions.student.delete;
  // Báo cáo workbook có cả dữ liệu học phí, nên chỉ quyền Excel mới được mở.
  const canExport = isOwner || permissions.excel.import || permissions.excel.export;
  const debtForStudent = (studentId: string) => debtBreakdown(receipts.filter((receipt) => receipt.studentId === studentId));

  // Filtered list
  const filteredStudents = students.filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.includes(searchQuery) ||
      s.parentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.parentPhone.includes(searchQuery);

    const matchesProgram = filterProgram === 'all' || s.programId === filterProgram;
    const filterClassObj = classes.find(c => c.id === filterClass);
    const matchesClass = filterClass === 'all' || isStudentInClass(s, filterClass, filterClassObj);
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus;

    return matchesSearch && matchesProgram && matchesClass && matchesStatus;
  });

  // Empty new student form builder
  const handleOpenAddModal = () => {
    const nextCodeNum = students.length + 1;
    const autoCode = `HS${nextCodeNum.toString().padStart(3, '0')}`;
    setEditingStudent({
      id: `HS_NEW_${Date.now()}`,
      code: autoCode,
      name: '',
      dob: '',
      gender: 'Chưa xác định',
      school: '',
      gradeLevel: '',
      programId: '',
      classId: '',
      extraClassIds: [],
      address: '',
      email: '',
      phone: '',
      parentName: '',
      parentPhone: '',
      enrollDate: new Date().toISOString().split('T')[0],
      notes: '',
      status: 'active',
      feeStatus: 'unpaid'
    });
    setProgramEntryMode('catalog');
    setManualProgramName('');
    setIsModalOpen(true);
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    if (!editingStudent.name.trim()) {
      alert('Vui lòng nhập họ và tên học sinh');
      return;
    }

    const code = editingStudent.code.trim();
    if (!code) {
      alert('Vui lòng nhập mã học sinh.');
      return;
    }
    if (students.some((student) => student.id !== editingStudent.id && student.code.trim().toLocaleUpperCase('vi-VN') === code.toLocaleUpperCase('vi-VN'))) {
      alert(`Mã học sinh “${code}” đã tồn tại. Mỗi học sinh cần một mã duy nhất để đồng bộ chính xác với học phí, lớp học và Excel.`);
      return;
    }

    const classInput = editingStudent.classId.trim();
    const selectedClass = classInput ? classes.find((classroom) => (
      classroom.id === classInput
      || classroom.code.trim().toLocaleUpperCase('vi-VN') === classInput.toLocaleUpperCase('vi-VN')
      || classroom.name.trim().toLocaleUpperCase('vi-VN') === classInput.toLocaleUpperCase('vi-VN')
    )) : undefined;
    if (classInput && !selectedClass) {
      alert(`Không tìm thấy lớp “${classInput}”. Hãy tạo lớp tại Quản lý lớp học trước, rồi chọn hoặc nhập đúng mã/tên lớp để dữ liệu không bị đứt liên kết.`);
      return;
    }

    const cleanExtraClasses = (editingStudent.extraClassIds || []).filter(id => id && id !== (selectedClass?.id || ''));
    let studentToSave = { ...editingStudent, code, classId: selectedClass?.id || '', extraClassIds: cleanExtraClasses };
    if (programEntryMode === 'manual') {
      const name = manualProgramName.trim();
      if (!name) {
        alert('Vui lòng nhập tên chương trình học.');
        return;
      }
      const classProgram = selectedClass ? programs.find((program) => program.id === selectedClass.programId) : undefined;
      if (classProgram && classProgram.name.trim().toLocaleUpperCase('vi-VN') !== name.toLocaleUpperCase('vi-VN')) {
        alert(`Học sinh đã được xếp vào ${selectedClass.name}; chương trình phải là “${classProgram.name}” để đồng bộ với lớp.`);
        return;
      }
      const existingProgram = programs.find((program) => program.name.trim().toLocaleLowerCase('vi-VN') === name.toLocaleLowerCase('vi-VN'));
      const program = existingProgram ?? {
        id: `PROG_CUSTOM_${Date.now()}`,
        code: `CUSTOM-${Date.now().toString().slice(-6)}`,
        name,
        category: 'Khác' as const,
        tuitionFee: 0,
        description: 'Tạo thủ công tại hồ sơ học viên.'
      };
      if (!existingProgram) onCreateProgram(program);
      studentToSave = { ...studentToSave, programId: program.id };
    }

    if (selectedClass) {
      studentToSave = { ...studentToSave, classId: selectedClass.id, programId: selectedClass.programId, extraClassIds: cleanExtraClasses };
    }

    if (!studentToSave.programId) {
      alert('Vui lòng chọn hoặc nhập chương trình học.');
      return;
    }

    const existing = students.find(s => s.id === studentToSave.id);
    if (existing) {
      onUpdateStudent(studentToSave);
    } else {
      onAddStudent(studentToSave);
    }

    setIsModalOpen(false);
    setEditingStudent(null);
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-red-700" />
            Quản Lý Học Sinh
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Hiển thị {filteredStudents.length} / {students.length} học sinh toàn trung tâm
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canExport ? (
            <button
              onClick={onOpenImportExportModal}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5 border border-slate-300 shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              Excel Import / Export
            </button>
          ) : (
            <button
              disabled
              title={language === 'vi' ? "Cần Chủ cơ sở cấp quyền 'Tải / Xuất dữ liệu học viên'" : "Requires Owner permission"}
              className="px-3.5 py-2 bg-slate-100 text-slate-400 font-medium rounded-xl text-xs flex items-center gap-1.5 border border-slate-200 cursor-not-allowed opacity-60"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-400" />
              {language === 'vi' ? 'Xuất Dữ Liệu (Bị Khóa)' : 'Export Data (Locked)'}
            </button>
          )}

          {canAdd && (
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 bg-red-800 hover:bg-red-900 text-white font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4 text-amber-400" />
              {t('student.add_new')}
            </button>
          )}
        </div>
      </div>

      {/* Filters & View Mode Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-slate-400" /> {t('student.filters')}
          </div>

          {/* Program Filter */}
          <select
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-700 font-medium"
          >
            <option value="all">{t('student.all_programs')}</option>
            {programs.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Class Filter */}
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-700 font-medium"
          >
            <option value="all">{t('student.all_classes')}</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-700 font-medium"
          >
            <option value="all">{t('student.all_statuses')}</option>
            <option value="active">{t('actions.active')}</option>
            <option value="reserved">{t('actions.reserved')}</option>
            <option value="dropped">{t('actions.dropped')}</option>
          </select>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'table'
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Dạng Bảng</span>
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'card'
                ? 'bg-red-800 text-white shadow-2xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
            <span>Dạng Thẻ Mobile</span>
          </button>
        </div>
      </div>

      {/* STUDENT LIST: TABLE OR MOBILE CARDS */}
      {viewMode === 'table' ? (
        /* Student Table View */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">{t('student.table_code')}</th>
                  <th className="py-3.5 px-4">{t('student.table_name')}</th>
                  <th className="py-3.5 px-4">{t('student.table_grade_school')}</th>
                  <th className="py-3.5 px-4">{t('student.table_program_class')}</th>
                  <th className="py-3.5 px-4">{t('student.table_phone')}</th>
                  <th className="py-3.5 px-4">{t('student.table_fee')}</th>
                  <th className="py-3.5 px-4">{t('student.table_status')}</th>
                  <th className="py-3.5 px-4 text-right">{t('student.table_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      {t('student.no_matching')}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => {
                    const program = programs.find(p => p.id === st.programId);
                    const debt = debtForStudent(st.id);

                    return (
                      <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-red-800">
                          {st.code}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={st.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"}
                              alt={st.name}
                              className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-2xs"
                            />
                            <div>
                              <div className="font-bold text-slate-900 text-sm">{st.name}</div>
                              <div className="text-[10px] text-slate-500">{st.gender === 'Nam' ? (language === 'vi' ? 'Nam' : 'Male') : (st.gender === 'Nữ' ? (language === 'vi' ? 'Nữ' : 'Female') : (language === 'vi' ? 'Chưa xác định' : 'Unspecified'))} • {language === 'vi' ? 'NS' : 'DOB'}: {st.dob || '—'}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-slate-800 font-medium">{st.gradeLevel}</div>
                          <div className="text-[11px] text-slate-500">{st.school}</div>
                        </td>

                        <td className="py-3 px-4">
                          {(() => {
                            const enrolledIds = getStudentClassIds(st, classes);
                            const enrolledClasses = classes.filter(c => enrolledIds.includes(c.id));
                            if (!enrolledClasses.length) {
                              const fallbackText = st.classId || 'Chưa xếp lớp';
                              return <div className="font-semibold text-slate-800">{fallbackText}</div>;
                            }
                            return (
                              <div className="space-y-1">
                                {enrolledClasses.map(c => {
                                  const isPrimary = st.classId === c.id;
                                  return (
                                    <div key={c.id} className="flex items-center gap-1.5">
                                      <span className="font-semibold text-slate-800">{c.name}</span>
                                      {!isPrimary && (
                                        <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-100 text-amber-800">
                                          Lớp thêm
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          <div className="text-[11px] text-amber-700 font-medium">{program ? program.name : ''}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-red-700 flex-shrink-0" />
                            <span>{t('student.student_phone')} <span className="font-bold text-red-800">{st.phone || (language === 'vi' ? 'Chưa cập nhật' : 'N/A')}</span></span>
                          </div>
                          <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                            <span>PH ({st.parentName}): <a href={`tel:${st.parentPhone}`} className="font-medium text-slate-800 hover:text-red-700">{st.parentPhone}</a></span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <FeeStatusBadge feeStatus={st.feeStatus} monthlyDebt={debt.monthly} courseDebt={debt.course} />
                        </td>

                        <td className="py-3 px-4">
                          {st.status === 'active' && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {t('actions.active')}
                            </span>
                          )}
                          {st.status === 'reserved' && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              {t('actions.reserved')}
                            </span>
                          )}
                          {st.status === 'dropped' && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">
                              {t('actions.dropped')}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setViewingStudent(st)}
                              className="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 border border-blue-200"
                              title="Xem chi tiết & Lịch học"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                            </button>

                            {canEdit && (
                              <button
                                onClick={() => {
                                  setEditingStudent(st);
                                  setProgramEntryMode(programs.some((program) => program.id === st.programId) ? 'catalog' : 'manual');
                                  setManualProgramName(programs.find((program) => program.id === st.programId)?.name || st.programId);
                                  setIsModalOpen(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Sửa học sinh"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}

                            {canDelete && (
                              <button
                                onClick={() => {
                                  if (confirm(`Xác nhận xóa học sinh ${st.name} (${st.code})?`)) {
                                    onDeleteStudent(st.id);
                                  }
                                }}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Xóa học sinh"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Mobile Card Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
              {t('student.no_matching')}
            </div>
          ) : (
            filteredStudents.map((st) => {
              const program = programs.find(p => p.id === st.programId);
              const cls = classes.find(c => c.id === st.classId);
              const debt = debtForStudent(st.id);

              const classNameText = cls ? cls.name : (st.classId || 'Chưa xếp lớp');
              const scheduleText = cls ? `${cls.scheduleTime} (${cls.days.join(', ')})` : 'T2-T4-T6 (18:00 - 19:30)';

              return (
                <div key={st.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    {/* Header: Code, Avatar, Name & Status */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <img
                          src={st.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"}
                          alt={st.name}
                          className="w-12 h-12 rounded-full object-cover border-2 border-red-700 shadow-2xs"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded font-black text-[10px] bg-red-100 text-red-900 border border-red-200">
                              {st.code}
                            </span>
                            {st.status === 'active' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Đang học
                              </span>
                            )}
                            {st.status === 'reserved' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                Bảo lưu
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-900 text-base mt-1">{st.name}</h3>
                          <div className="text-[11px] text-slate-500 font-medium">
                            {st.gradeLevel} • {st.school}
                          </div>
                        </div>
                      </div>

                      {/* Fee Badge */}
                      <div className="shrink-0 text-right">
                        <FeeStatusBadge feeStatus={st.feeStatus} monthlyDebt={debt.monthly} courseDebt={debt.course} />
                      </div>
                    </div>

                    {/* Class & Schedule Pill */}
                    {(() => {
                      const enrolledIds = getStudentClassIds(st, classes);
                      const enrolledClasses = classes.filter(c => enrolledIds.includes(c.id));
                      return (
                        <div className="my-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                          <div className="flex items-center justify-between text-slate-800 font-bold">
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5 text-red-700" />
                              {enrolledClasses.length ? enrolledClasses.map(c => c.name).join(' + ') : (st.classId || 'Chưa xếp lớp')}
                            </span>
                            <span className="text-[10px] text-amber-800 bg-amber-100 font-bold px-1.5 py-0.5 rounded">
                              {program?.name || 'Khóa Tiếng Anh'}
                            </span>
                          </div>
                          {enrolledClasses.map(c => (
                            <div key={c.id} className="flex items-center gap-1 text-[11px] text-slate-600">
                              <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>{c.code}: <strong className="text-slate-800">{c.scheduleTime || 'Chưa xếp lịch'} ({c.days.join(', ')})</strong></span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Parent Contact */}
                    <div className="text-xs text-slate-600 space-y-1 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Phụ huynh: <strong>{st.parentName}</strong></span>
                        <a
                          href={`tel:${st.parentPhone}`}
                          className="font-bold text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-emerald-600" /> {st.parentPhone}
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setViewingStudent(st)}
                      className="flex-1 py-1.5 bg-red-800 hover:bg-red-900 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-amber-400" />
                      <span>Xem chi tiết & Lịch học</span>
                    </button>

                    {canEdit && (
                      <button
                        onClick={() => {
                          setEditingStudent(st);
                          setProgramEntryMode(programs.some((program) => program.id === st.programId) ? 'catalog' : 'manual');
                          setManualProgramName(programs.find((program) => program.id === st.programId)?.name || st.programId);
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                        title="Sửa"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}

                    {canDelete && (
                      <button
                        onClick={() => {
                          if (confirm(`Xác nhận xóa học sinh ${st.name}?`)) {
                            onDeleteStudent(st.id);
                          }
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* RICH VIEW STUDENT DETAIL MODAL */}
      {viewingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 custom-scrollbar">
            <button
              onClick={() => setViewingStudent(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Profile Header */}
            <div className="flex flex-col sm:flex-row items-center gap-4 pb-5 border-b border-slate-200">
              <img
                src={viewingStudent.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"}
                alt={viewingStudent.name}
                className="w-20 h-20 rounded-full object-cover border-4 border-red-700 shadow-md"
              />
              <div className="text-center sm:text-left flex-1">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-900 border border-red-300">
                    MÃ HỌC SINH: {viewingStudent.code}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                    {viewingStudent.status === 'active' ? 'Đang theo học' : viewingStudent.status === 'reserved' ? 'Bảo lưu' : 'Nghỉ học'}
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 mt-1">{viewingStudent.name}</h3>
                <div className="text-xs text-slate-500 font-medium flex items-center justify-center sm:justify-start gap-3 mt-0.5">
                  <span>{viewingStudent.gender === 'Nam' ? 'Nam 👦' : (viewingStudent.gender === 'Nữ' ? 'Nữ 👧' : 'Chưa xác định')}</span>
                  <span>•</span>
                  <span>NS: {viewingStudent.dob}</span>
                  <span>•</span>
                  <span className="font-bold text-slate-700">{viewingStudent.gradeLevel} ({viewingStudent.school})</span>
                </div>
              </div>
            </div>

            {/* SECTION: INDIVIDUAL TIMETABLE / LỊCH HỌC CÁ NHÂN */}
            {(() => {
              const enrolledClassIds = getStudentClassIds(viewingStudent, classes);
              const enrolledClasses = classes.filter(c => enrolledClassIds.includes(c.id));
              const cls = classes.find(c => c.id === viewingStudent.classId) || enrolledClasses[0];
              const program = programs.find(p => p.id === viewingStudent.programId);
              const teacher = teachers.find(t => t.id === cls?.teacherId);
              const room = rooms.find(r => r.id === cls?.roomId);
              const classSlots = timetableSlots
                .filter((slot) => enrolledClassIds.includes(slot.classId))
                .sort((left, right) => left.startTime.localeCompare(right.startTime));

              const activeDays = classSlots.length ? [...new Set(classSlots.map((slot) => slot.dayOfWeek))] : (cls ? cls.days : ['Thứ 2', 'Thứ 4', 'Thứ 6']);
              const scheduleSummary = classSlots.length
                ? classSlots.map((slot) => `${slot.dayOfWeek}: ${slot.startTime}–${slot.endTime}`).join(' · ')
                : (cls?.scheduleTime || '18:00 - 19:30');
              const className = enrolledClasses.length
                ? enrolledClasses.map(c => c.name).join(' + ')
                : (viewingStudent.classId || 'Chưa xếp lớp');

              const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

              return (
                <div className="my-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4 text-purple-700" /> Lịch Học Cá Nhân Học Viên
                    </h4>
                    <span className="text-[11px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      Lớp: {className}
                    </span>
                  </div>

                  {/* Class Info Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gradient-to-r from-red-50/50 via-slate-50 to-amber-50/50 p-4 rounded-xl border border-slate-200 text-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <BookOpen className="w-4 h-4 text-red-700 shrink-0" />
                        <span>Chương trình: <strong className="text-slate-900">{program?.name || 'Anh Văn Phổ Thông'}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>Khung giờ ca học: <strong className="text-purple-800 font-extrabold">{scheduleSummary}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Lịch trong tuần: <strong className="text-emerald-800">{activeDays.join(', ')}</strong></span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <GraduationCap className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>Giáo viên phụ trách: <strong className="text-indigo-900">{teacher ? teacher.name : 'Thầy Mark Harrison'}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <DoorOpen className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Phòng học cố định: <strong className="text-rose-900">{room ? room.name : 'Phòng P102 (Tầng 1)'}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Ngày bắt đầu học: <strong className="text-slate-900">{viewingStudent.enrollDate}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Visual Weekly Grid for Student */}
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Ma trận thời khóa biểu hàng tuần của {viewingStudent.name}:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5 text-center">
                      {daysOfWeek.map((day) => {
                        const daySlots = classSlots.filter((slot) => slot.dayOfWeek === day);
                        const isStudyDay = daySlots.length > 0 || (classSlots.length === 0 && activeDays.includes(day));
                        return (
                          <div
                            key={day}
                            className={`p-2 rounded-xl text-xs border transition-all ${
                              isStudyDay
                                ? 'bg-red-800 text-white border-red-900 shadow-2xs font-bold'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                          >
                            <div className="text-[10px] uppercase font-bold opacity-80">{day}</div>
                            {isStudyDay ? (
                              <div className="text-[11px] mt-1 font-extrabold text-amber-300">
                                {daySlots[0]?.startTime || '18:00'}
                                {daySlots[0] && <div className="text-[9px] font-medium text-white/90">đến {daySlots[0].endTime}</div>}
                                <div className="text-[9px] font-medium text-white/90 truncate">{className}</div>
                              </div>
                            ) : (
                              <div className="text-[10px] mt-1 font-normal italic text-slate-400">
                                Nghỉ học
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* SECTION: PARENT & CONTACT */}
            <div className="space-y-3 my-5 pt-3 border-t border-slate-200">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-700" /> Thông Tin Phụ Huynh & Liên Hệ
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <div className="text-slate-400 text-[10px] font-bold uppercase">Họ tên phụ huynh</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{viewingStudent.parentName || 'Chưa cập nhật'}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] font-bold uppercase">Số điện thoại phụ huynh</div>
                  <a href={`tel:${viewingStudent.parentPhone}`} className="font-extrabold text-emerald-700 text-sm hover:underline flex items-center gap-1 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" /> {viewingStudent.parentPhone || 'Chưa cập nhật'}
                  </a>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] font-bold uppercase">Số điện thoại học sinh</div>
                  <div className="font-bold text-slate-800 mt-0.5">{viewingStudent.phone || 'Chưa cập nhật'}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] font-bold uppercase">Địa chỉ nhà</div>
                  <div className="font-bold text-slate-800 mt-0.5">{viewingStudent.address || 'TP. Tây Ninh'}</div>
                </div>
              </div>
            </div>

            {/* SECTION: TUITION & NOTES */}
            <div className="space-y-3 my-5 pt-3 border-t border-slate-200">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-700" /> Tình Trạng Học Phí & Ghi Chú
              </h4>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200 text-xs">
                <div>
                  <div className="text-slate-500 font-medium">Trạng thái đóng phí:</div>
                  <div className="mt-1">
                    <FeeStatusBadge
                      feeStatus={viewingStudent.feeStatus}
                      monthlyDebt={debtForStudent(viewingStudent.id).monthly}
                      courseDebt={debtForStudent(viewingStudent.id).course}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-500 font-medium">Ghi chú bổ sung:</div>
                  <div className="italic text-slate-700 font-medium">{viewingStudent.notes || 'Không có ghi chú đặc biệt'}</div>
                </div>
              </div>
              {(() => {
                const debtReceipts = receipts.filter((receipt) => receipt.studentId === viewingStudent.id && receipt.debtAmount > 0);
                if (!debtReceipts.length) return null;
                return (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-950">
                    <div className="font-extrabold">Các khoản còn thiếu cần thu</div>
                    <div className="mt-2 space-y-1.5">
                      {debtReceipts.map((receipt) => (
                        <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-rose-200 pt-1.5 first:border-t-0 first:pt-0">
                          <span className="font-semibold">{paymentKindLabel(receipt)} · {paymentPeriodLabel(receipt)}</span>
                          <strong>{receipt.debtAmount.toLocaleString('vi-VN')} đ</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">Trung Tâm Anh Ngữ Phúc Phúc Thịnh</span>
              <button
                onClick={() => setViewingStudent(null)}
                className="px-5 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT STUDENT MODAL */}
      {isModalOpen && editingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setEditingStudent(null);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-red-700" />
              {students.some(s => s.id === editingStudent.id) ? 'Cập Nhật Thông Tin Học Sinh' : 'Thêm Học Sinh Mới'}
            </h3>

            {receipts.some((receipt) => receipt.studentId === editingStudent.id) && (
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingStudent(null);
                  onOpenTuition();
                }}
                className="mb-4 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
              >
                <DollarSign className="h-4 w-4" /> Xem học phí và phiếu thu của học viên này
              </button>
            )}

            <form onSubmit={handleSaveStudent} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mã Học Sinh (Tự động)</label>
                  <input
                    type="text"
                    value={editingStudent.code}
                    onChange={(e) => setEditingStudent({ ...editingStudent, code: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-100 font-bold text-red-800"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Họ Và Tên *</label>
                  <input
                    type="text"
                    value={editingStudent.name}
                    onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                    placeholder="Nguyễn Văn A"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ngày Sinh</label>
                  <input
                    type="date"
                    value={editingStudent.dob}
                    onChange={(e) => setEditingStudent({ ...editingStudent, dob: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giới Tính</label>
                  <select
                    value={editingStudent.gender}
                    onChange={(e) => setEditingStudent({ ...editingStudent, gender: e.target.value as 'Nam' | 'Nữ' | 'Chưa xác định' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Chưa xác định">Chưa xác định</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trường Đang Học</label>
                  <input
                    type="text"
                    value={editingStudent.school}
                    onChange={(e) => setEditingStudent({ ...editingStudent, school: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                    placeholder="THPT Chuyên Hoàng Lê Kha"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Khối Lớp</label>
                  <input
                    type="text"
                    value={editingStudent.gradeLevel}
                    onChange={(e) => setEditingStudent({ ...editingStudent, gradeLevel: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                    placeholder="Khối 11"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chương Trình Học</label>
                  <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-[10px] font-bold">
                    <button type="button" onClick={() => setProgramEntryMode('catalog')} className={`rounded-lg px-2 py-1.5 transition ${programEntryMode === 'catalog' ? 'bg-white text-red-800 shadow-sm' : 'text-slate-500'}`}>Từ danh mục / Excel</button>
                    <button type="button" onClick={() => setProgramEntryMode('manual')} className={`rounded-lg px-2 py-1.5 transition ${programEntryMode === 'manual' ? 'bg-white text-red-800 shadow-sm' : 'text-slate-500'}`}>Nhập tay</button>
                  </div>
                  {programEntryMode === 'catalog' ? (
                    <>
                      <select
                        value={editingStudent.programId}
                        onChange={(e) => setEditingStudent({ ...editingStudent, programId: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 font-semibold"
                        required
                      >
                        <option value="">Chọn chương trình đã nhập từ Excel / danh mục</option>
                        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <p className="mt-1 text-[10px] text-slate-500">Danh sách gồm cả chương trình đã nhập từ file Excel.</p>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={manualProgramName}
                        onChange={(e) => setManualProgramName(e.target.value)}
                        list="student-program-options"
                        placeholder="Nhập tên chương trình học..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 font-semibold"
                        required
                      />
                      <datalist id="student-program-options">{programs.map((program) => <option key={program.id} value={program.name} />)}</datalist>
                      <p className="mt-1 text-[10px] text-slate-500">Tên mới sẽ được tạo trong danh mục và dùng được khi xuất/nhập Excel.</p>
                    </>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Xếp Vào Lớp Học / Tên Lớp Học</label>
                  <div className="space-y-1.5">
                    <select
                      value={editingStudent.classId}
                      onChange={(e) => setEditingStudent({ ...editingStudent, classId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 font-semibold text-slate-900"
                    >
                      <optgroup label="Danh Sách Lớp Học Tại Trung Tâm">
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                        ))}
                      </optgroup>
                    </select>

                    <div className="pt-1">
                      <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">Hoặc nhập mã / tên lớp đã tạo:</label>
                      <input
                        type="text"
                        value={editingStudent.classId}
                        onChange={(e) => setEditingStudent({ ...editingStudent, classId: e.target.value })}
                        placeholder="Ví dụ: L9-PPTE hoặc Lớp 9 - Global Success"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-red-700 bg-amber-50/30"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">Chỉ nhận lớp đã tạo để học sinh, học phí, bảng điểm và Excel luôn liên kết đúng.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Lớp Học Thêm / Lớp Bổ Sung (Dành cho bé học từ 2 lớp)
                  </label>
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 space-y-1.5 custom-scrollbar">
                    {classes.filter(c => c.id !== editingStudent.classId).length === 0 ? (
                      <p className="text-[11px] text-slate-400 py-1">Không có lớp học khác để chọn.</p>
                    ) : (
                      classes.filter(c => c.id !== editingStudent.classId).map(c => {
                        const isSelected = Array.isArray(editingStudent.extraClassIds) && editingStudent.extraClassIds.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 text-xs font-semibold text-slate-800 hover:bg-white p-1 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const currentExtras = editingStudent.extraClassIds || [];
                                const nextExtras = e.target.checked
                                  ? [...currentExtras, c.id]
                                  : currentExtras.filter(id => id !== c.id);
                                setEditingStudent({ ...editingStudent, extraClassIds: nextExtras });
                              }}
                              className="rounded border-slate-300 text-red-700 focus:ring-red-600 h-3.5 w-3.5"
                            />
                            <span>{c.name} ({c.code})</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Tích chọn thêm nếu học viên học từ 2 lớp trở lên. Bé sẽ xuất hiện đầy đủ trong danh sách và báo cáo của tất cả các lớp đã chọn.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số Điện Thoại Học Viên</label>
                  <input
                    type="text"
                    value={editingStudent.phone || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 font-semibold text-red-900"
                    placeholder="0936 123 456"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Họ Tên Phụ Huynh *</label>
                  <input
                    type="text"
                    value={editingStudent.parentName}
                    onChange={(e) => setEditingStudent({ ...editingStudent, parentName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                    placeholder="Nguyễn Văn Hùng"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">SĐT Phụ Huynh *</label>
                  <input
                    type="text"
                    value={editingStudent.parentPhone}
                    onChange={(e) => setEditingStudent({ ...editingStudent, parentPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                    placeholder="0918 222 333"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trạng Thái Học</label>
                  <select
                    value={editingStudent.status}
                    onChange={(e) => setEditingStudent({ ...editingStudent, status: e.target.value as StudentStatus })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  >
                    <option value="active">Đang học</option>
                    <option value="reserved">Bảo lưu</option>
                    <option value="dropped">Nghỉ học</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tình Trạng Học Phí</label>
                  <select
                    value={editingStudent.feeStatus}
                    disabled
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="paid" className="text-emerald-700 font-bold">🟢 Đã đóng đủ</option>
                    <option value="unpaid" className="text-red-700 font-bold">🔴 Chưa đóng học phí</option>
                    <option value="debt" className="text-amber-700 font-bold">🟡 Đóng thiếu</option>
                    <option value="partial" className="text-blue-700 font-bold">🔵 Đóng thiếu</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">Tự tính từ phiếu thu; không sửa tay để tránh sai doanh thu hoặc công nợ.</p>
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); setEditingStudent(null); onOpenTuition(); }}
                    className="mt-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline"
                  >
                    Lập / cập nhật phiếu thu cho học viên
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Địa Chỉ Thường Trú</label>
                <input
                  type="text"
                  value={editingStudent.address}
                  onChange={(e) => setEditingStudent({ ...editingStudent, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  placeholder="TP. Tây Ninh"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú</label>
                <textarea
                  value={editingStudent.notes || ''}
                  onChange={(e) => setEditingStudent({ ...editingStudent, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  placeholder="Ghi chú thêm về học sinh..."
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingStudent(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-100"
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 bg-red-800 text-white rounded-xl font-bold hover:bg-red-900 shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4 text-amber-400" /> Lưu Học Sinh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
