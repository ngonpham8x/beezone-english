import { isStudentInClass, studentClassIds, studentClassNames, validateStudentClasses } from '../../lib/studentClasses';
import {
  AlertCircle,
  BookOpen,
  Clock,
  DollarSign,
  Edit,
  Eye,
  FileSpreadsheet,
  LayoutGrid,
  PauseCircle,
  Phone,
  RotateCcw,
  Save,
  Table as TableIcon,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { toast } from '../../lib/toast';
import { DialogFrame } from '../../components/DialogFrame';
import { ConfirmModal, AlertModal } from '../../components/ConfirmModal';
import { DateInput } from '../../components/DateInput';
import { parseDateInput } from '../../lib/dates';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { StatCard } from '../../components/StatCard';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import { useLanguage } from '../../context/LanguageContext';
import { useResponsiveView } from '../../hooks/useResponsive';
import { centerDate } from '../../lib/dates';
import { matchesSearch as matchesSearchText } from '../../lib/search';
import { debtBreakdown, isStudentOwingTuition } from '../../lib/tuition';
import {
  ClassEnrollment,
  ClassRoom,
  CourseProgram,
  Room,
  StaffPermissions,
  Student,
  StudentStatus,
  Teacher,
  TimetableSlot,
  TuitionReceipt,
} from '../../types';
import { FeeStatusBadge } from './FeeStatusBadge';
import { StudentProfileDialog } from './StudentProfileDialog';

interface StudentManagerProps {
  enrollments?: ClassEnrollment[];
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
  onReserveStudent?: (studentId: string, reserveDate: string, expectedReturnDate: string, reason: string) => void;
  onDropStudent?: (studentId: string, dropDate: string, reason: string) => void;
  onReEnrollStudent?: (studentId: string, targetClassId: string, returnDate: string, note?: string) => boolean | void;
  onOpenImportExportModal: () => void;
  onOpenTuition: () => void;
  onCreateProgram: (program: CourseProgram) => void;
  onAddClass?: (c: ClassRoom) => void;
}

export const StudentManager: React.FC<StudentManagerProps> = ({
  enrollments = [],
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
  onReserveStudent,
  onDropStudent,
  onReEnrollStudent,
  onOpenImportExportModal,
  onOpenTuition,
  onCreateProgram,
  onAddClass,
}) => {
  const { t, language } = useLanguage();
  const [filterProgram, setFilterProgram] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  // On phones, cards are readable without horizontal scrolling; desktops keep
  // the denser table as the default.
  const [viewMode, setViewMode] = useResponsiveView('card', 'table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [programEntryMode, setProgramEntryMode] = useState<'catalog' | 'manual'>('catalog');
  const [manualProgramName, setManualProgramName] = useState('');

  // Reservation Modal state
  const [reservingStudent, setReservingStudent] = useState<Student | null>(null);
  const [reserveStartDate, setReserveStartDate] = useState<string>(centerDate());
  const [reserveEndDate, setReserveEndDate] = useState<string>('');
  const [reserveReason, setReserveReason] = useState<string>('Bận lịch học tại trường chính khóa');
  const [reserveNote, setReserveNote] = useState<string>('');

  // Drop Modal state
  const [droppingStudent, setDroppingStudent] = useState<Student | null>(null);
  const [dropDate, setDropDate] = useState<string>(centerDate());
  const [dropReason, setDropReason] = useState<string>('Chuyển nơi ở / trường học');
  const [dropNote, setDropNote] = useState<string>('');

  // Re-enroll Modal state
  const [reEnrollingStudent, setReEnrollingStudent] = useState<Student | null>(null);
  const [reEnrollClassId, setReEnrollClassId] = useState<string>('');
  const [reEnrollDate, setReEnrollDate] = useState<string>(centerDate());
  const [reEnrollNote, setReEnrollNote] = useState<string>('');
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [deleteAlertMessage, setDeleteAlertMessage] = useState<string | null>(null);
  const [isQuickClassOpen, setIsQuickClassOpen] = useState(false);
  const [newClassCode, setNewClassCode] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassTuition, setNewClassTuition] = useState<number>(0);
  const [isQuickProgramOpen, setIsQuickProgramOpen] = useState(false);
  const [newProgramCode, setNewProgramCode] = useState('');
  const [newProgramName, setNewProgramName] = useState('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [classSearchQuery, setClassSearchQuery] = useState('');
  const classDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isClassDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (classDropdownRef.current && !classDropdownRef.current.contains(event.target as Node)) {
        setIsClassDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isClassDropdownOpen]);

  const selectedClassIds = useMemo(() => {
    if (!editingStudent) return [];
    return [editingStudent.classId, ...(editingStudent.additionalClassIds || [])].filter(Boolean);
  }, [editingStudent?.classId, editingStudent?.additionalClassIds]);

  const selectedClasses = useMemo(() => {
    return selectedClassIds
      .map(id => classes.find(c => c.id === id))
      .filter((c): c is typeof classes[0] => Boolean(c));
  }, [selectedClassIds, classes]);

  const filteredDropdownClasses = useMemo(() => {
    if (!classSearchQuery.trim()) return classes;
    const q = classSearchQuery.trim().toLowerCase();
    return classes.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [classes, classSearchQuery]);

  const handleToggleClass = (classIdToToggle: string) => {
    if (!editingStudent) return;
    const isSelected = selectedClassIds.includes(classIdToToggle);
    let nextIds: string[];
    if (isSelected) {
      nextIds = selectedClassIds.filter(id => id !== classIdToToggle);
    } else {
      nextIds = [...selectedClassIds, classIdToToggle];
    }
    const nextPrimaryId = nextIds[0] || '';
    const nextAdditionalIds = nextIds.slice(1);
    const nextPrimaryClass = classes.find(c => c.id === nextPrimaryId);
    const nextProgramId = nextPrimaryClass?.programId || editingStudent.programId;

    setEditingStudent({
      ...editingStudent,
      classId: nextPrimaryId,
      additionalClassIds: nextAdditionalIds,
      programId: nextProgramId,
    });
  };

  const handleSetPrimaryClass = (classId: string) => {
    if (!editingStudent || !selectedClassIds.includes(classId)) return;
    const reordered = [classId, ...selectedClassIds.filter(id => id !== classId)];
    const nextPrimaryClass = classes.find(c => c.id === classId);
    setEditingStudent({
      ...editingStudent,
      classId: reordered[0],
      additionalClassIds: reordered.slice(1),
      programId: nextPrimaryClass?.programId || editingStudent.programId,
    });
  };

  const handleClearAllClasses = () => {
    if (!editingStudent) return;
    setEditingStudent({
      ...editingStudent,
      classId: '',
      additionalClassIds: [],
    });
  };


  const handleCreateClassQuick = () => {
    if (!newClassName.trim()) {
      alert('Vui lòng nhập tên lớp học');
      return;
    }
    const code = newClassCode.trim() || `LOP-${String(classes.length + 1).padStart(2, '0')}`;
    const newClass: ClassRoom = {
      id: `CLASS_${Date.now()}`,
      code,
      name: newClassName.trim(),
      capacity: 20,
      programId: editingStudent?.programId || programs[0]?.id || '',
      teacherId: '',
      roomId: '',
      days: [],
      scheduleTime: '',
      studentIds: editingStudent ? [editingStudent.id] : [],
      courseStatus: 'active',
      billingMode: 'course',
    };
    onAddClass?.(newClass);
    if (editingStudent) {
      setEditingStudent({ ...editingStudent, classId: newClass.id });
    }
    setNewClassCode('');
    setNewClassName('');
    setNewClassTuition(0);
    setIsQuickClassOpen(false);
  };

  const handleCreateProgramQuick = () => {
    if (!newProgramName.trim()) {
      alert('Vui lòng nhập tên chương trình đào tạo');
      return;
    }
    const code = newProgramCode.trim() || `CT-${String(programs.length + 1).padStart(3, '0')}`;
    const newProg: CourseProgram = {
      id: `PROG_${Date.now()}`,
      code,
      name: newProgramName.trim(),
      category: 'Khác',
      tuitionFee: 0,
      description: 'Tạo trực tiếp từ quản lý học viên',
    };
    onCreateProgram?.(newProg);
    if (editingStudent) {
      setEditingStudent({ ...editingStudent, programId: newProg.id });
    }
    setNewProgramCode('');
    setNewProgramName('');
    setIsQuickProgramOpen(false);
  };

  const handleOpenReserve = (st: Student) => {
    setReservingStudent(st);
    setReserveStartDate(centerDate());
    setReserveEndDate('');
    setReserveReason('Bận lịch học tại trường chính khóa');
    setReserveNote('');
  };

  const handleOpenDrop = (st: Student) => {
    setDroppingStudent(st);
    setDropDate(centerDate());
    setDropReason('Chuyển nơi ở / trường học');
    setDropNote('');
  };

  const handleOpenReEnroll = (st: Student) => {
    setReEnrollingStudent(st);
    const available = classes.filter(c => c.courseStatus !== 'completed' && c.courseStatus !== 'paused' && (st.status !== 'active' || c.id !== st.classId));
    setReEnrollClassId(available.find(c => c.id === st.classId)?.id || available[0]?.id || '');
    setReEnrollDate(centerDate());
    setReEnrollNote('');
  };

  const handleConfirmReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservingStudent) return;
    if (onReserveStudent) {
      onReserveStudent(reservingStudent.id, reserveStartDate, reserveEndDate, `${reserveReason}. ${reserveNote}`.trim());
    } else {
      const appendedNote = `[BẢO LƯU]: Từ ${reserveStartDate} đến ${reserveEndDate || 'chưa định ngày'}. Lý do: ${reserveReason}. ${reserveNote}`.trim();
      onUpdateStudent({
        ...reservingStudent,
        status: 'reserved',
        notes: reservingStudent.notes ? `${reservingStudent.notes}\n${appendedNote}` : appendedNote
      });
    }
    setReservingStudent(null);
  };

  const handleConfirmDrop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!droppingStudent) return;
    if (onDropStudent) {
      onDropStudent(droppingStudent.id, dropDate, `${dropReason}. ${dropNote}`.trim());
    } else {
      const appendedNote = `[NGHỈ HỌC NGANG]: Ngày ${dropDate}. Lý do: ${dropReason}. ${dropNote}`.trim();
      onUpdateStudent({
        ...droppingStudent,
        status: 'dropped',
        notes: droppingStudent.notes ? `${droppingStudent.notes}\n${appendedNote}` : appendedNote
      });
    }
    setDroppingStudent(null);
  };

  const handleConfirmReEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reEnrollingStudent || !reEnrollClassId) return;
    if (onReEnrollStudent) {
      if (onReEnrollStudent(reEnrollingStudent.id, reEnrollClassId, reEnrollDate, reEnrollNote) === false) return;
    } else {
      const targetClass = classes.find(c => c.id === reEnrollClassId);
      const appendedNote = `[QUAY LẠI HỌC]: Ngày ${reEnrollDate} tại lớp ${targetClass?.name || reEnrollClassId}. ${reEnrollNote}`.trim();
      onUpdateStudent({
        ...reEnrollingStudent,
        status: 'active',
        classId: reEnrollClassId,
        notes: reEnrollingStudent.notes ? `${reEnrollingStudent.notes}\n${appendedNote}` : appendedNote
      });
    }
    setReEnrollingStudent(null);
  };

  const canAdd = isOwner || permissions.student.add;
  const canEdit = isOwner || permissions.student.edit;
  const canDelete = isOwner || permissions.student.delete;
  // Báo cáo workbook có cả dữ liệu học phí, nên chỉ quyền Excel mới được mở.
  const canExport = isOwner || permissions.excel.import || permissions.excel.export;
  const debtForStudent = (studentId: string) => debtBreakdown(receipts.filter((receipt) => receipt.studentId === studentId));

  // Filtered list
  const filteredStudents = students.filter(s => {
    const matchesSearch =
      matchesSearchText(searchQuery, s.name, s.code, s.phone, s.parentName, s.parentPhone, studentClassNames(s, classes), ...classes.filter(c => isStudentInClass(s, c.id)).map(c => c.code));

    const matchesProgram = filterProgram === 'all' || s.programId === filterProgram || classes.some(c => isStudentInClass(s, c.id) && c.programId === filterProgram);
    const matchesClass = filterClass === 'all' || isStudentInClass(s, filterClass);
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus;

    return matchesSearch && matchesProgram && matchesClass && matchesStatus;
  });

  // Empty new student form builder
  const handleOpenAddModal = () => {
    if (!canAdd) return;
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
      address: '',
      email: '',
      phone: '',
      parentName: '',
      parentPhone: '',
      enrollDate: centerDate(),
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
    const isExisting = students.some(student => student.id === editingStudent.id);
    if (isExisting ? !canEdit : !canAdd) return;

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
    if (editingStudent.status === 'active' && !selectedClass) { alert('Học viên đang học cần được xếp lớp.'); return; }
    const dob = parseDateInput(editingStudent.dob || "");
    let studentToSave = { ...editingStudent, dob, code, classId: selectedClass?.id || '', additionalClassIds: editingStudent.additionalClassIds?.filter(id => id !== selectedClass?.id) };
    const membershipError = validateStudentClasses(studentToSave, classes, students);
    if (membershipError) { alert(membershipError); return; }
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
      if (!existingProgram && !isOwner && permissions.academic?.programs !== true) { alert('Bạn chưa được cấp quyền tạo chương trình học mới.'); return; }
      if (!existingProgram) onCreateProgram(program);
      studentToSave = { ...studentToSave, programId: program.id };
    }

    if (selectedClass) {
      studentToSave = { ...studentToSave, classId: selectedClass.id, programId: selectedClass.programId };
    }

    if (!studentToSave.programId) {
      alert('Vui lòng chọn hoặc nhập chương trình học.');
      return;
    }

    const existing = students.find(s => s.id === studentToSave.id);
    if (existing) {
      onUpdateStudent(studentToSave);
      toast.success(`Đã cập nhật học viên “${studentToSave.name}” thành công!`);
    } else {
      onAddStudent(studentToSave);
      toast.success(`Đã thêm mới học viên “${studentToSave.name}” thành công!`);
    }

    setIsModalOpen(false);
    setEditingStudent(null);
    setIsClassDropdownOpen(false);
    setClassSearchQuery('');
  };

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-600" />
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
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
            >
              <UserPlus className="w-4 h-4 text-slate-950" />
              {t('student.add_new')}
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Tổng học sinh" value={students.length + ' HS'} icon={Users} />
        <StatCard label="Đang theo học" value={students.filter(s => s.status === 'active').length + ' HS'} icon={UserCheck} tone="emerald" />
        <StatCard label="Đang bảo lưu" value={students.filter(s => s.status === 'reserved').length + ' HS'} icon={Clock} tone="amber" />
        <StatCard label="Còn nợ học phí" value={students.filter(s => isStudentOwingTuition(s, receipts, classes)).length + ' HS'} icon={AlertCircle} tone="rose" />
      </div>

      {/* Filters & View Mode Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t('student.filters')} className="student-filters">
          {/* Program Filter */}
          <ResponsiveSelect label="Lọc chương trình học viên" value={filterProgram} onChange={setFilterProgram} options={[
            { value: 'all', label: t('student.all_programs') },
            ...programs.map(p => ({ value: p.id, label: p.name })),
          ]} />

          {/* Class Filter */}
          <ResponsiveSelect label="Lọc lớp học viên" value={filterClass} onChange={setFilterClass} options={[
            { value: 'all', label: t('student.all_classes') },
            ...classes.map(c => ({ value: c.id, label: c.name })),
          ]} />

          {/* Status Filter */}
          <ResponsiveSelect label="Lọc trạng thái học viên" value={filterStatus} onChange={setFilterStatus} options={[
            { value: 'all', label: t('student.all_statuses') },
            { value: 'active', label: t('actions.active') },
            { value: 'reserved', label: t('actions.reserved') },
            { value: 'dropped', label: t('actions.dropped') },
          ]} />
        </div>

        {/* View Mode Switcher & Scroll Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Dạng Bảng</span>
            </button>
            <button
              aria-pressed={viewMode === 'card'} onClick={() => setViewMode('card')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'card'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-amber-600" />
              <span>Dạng Thẻ</span>
            </button>
          </div>
        </div>
      </div>

      {/* STUDENT LIST: TABLE OR MOBILE CARDS */}
      {viewMode === 'table' ? (
        /* Student Table View */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <HorizontalScroll label="Học viên" className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[1080px] text-left text-xs text-slate-600 border-collapse">
              <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 sticky left-0 bg-slate-800 z-20 min-w-[110px]">{t('student.table_code')}</th>
                  <th className="py-3.5 px-4 sticky left-[110px] bg-slate-800 z-20 shadow-r border-r border-slate-700 min-w-[200px]">{t('student.table_name')}</th>
                  <th className="py-3.5 px-4 min-w-[150px]">{t('student.table_grade_school')}</th>
                  <th className="py-3.5 px-4 min-w-[160px]">{t('student.table_program_class')}</th>
                  <th className="py-3.5 px-4 min-w-[150px]">{t('student.table_phone')}</th>
                  <th className="py-3.5 px-4 min-w-[140px]">{t('student.table_fee')}</th>
                  <th className="py-3.5 px-4 min-w-[120px]">{t('student.table_status')}</th>
                  <th className="py-3.5 px-4 text-right min-w-[140px]">{t('student.table_actions')}</th>
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
                      <tr key={st.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-3 px-4 font-bold sticky left-0 bg-white group-hover:bg-slate-50 z-10">
                          <span className="font-mono text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 text-xs font-bold">
                            {st.code}
                          </span>
                        </td>

                        <td className="py-3 px-4 sticky left-[110px] bg-white group-hover:bg-slate-50 z-10 shadow-r border-r border-slate-100">
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
                          <div className="font-semibold text-slate-800">
                            {(() => {
                                if (studentClassIds(st).length > 1) return studentClassNames(st, classes);
                              const cls = classes.find(c => c.id === st.classId);
                              if (cls) return cls.name;
                              if (st.classId === 'CLASS_G1') return 'Lớp 1 (Tiểu Học)';
                              if (st.classId === 'CLASS_G2') return 'Lớp 2 (Tiểu Học)';
                              if (st.classId === 'CLASS_G3') return 'Lớp 3 (Tiểu Học)';
                              if (st.classId === 'CLASS_G4') return 'Lớp 4 (Tiểu Học)';
                              if (st.classId === 'CLASS_G5') return 'Lớp 5 (Tiểu Học)';
                              if (st.classId === 'CLASS_G6') return 'Lớp 6 (THCS)';
                              if (st.classId === 'CLASS_G7') return 'Lớp 7 (THCS)';
                              if (st.classId === 'CLASS_G8') return 'Lớp 8 (THCS)';
                              if (st.classId === 'CLASS_G9') return 'Lớp 9 (THCS)';
                              if (st.classId === 'CLASS_G10') return 'Lớp 10 (THPT)';
                              if (st.classId === 'CLASS_G11') return 'Lớp 11 (THPT)';
                              if (st.classId === 'CLASS_G12') return 'Lớp 12 (THPT)';
                              if (st.classId === 'CLASS_MN') return 'Anh Văn Mầm Non';
                              if (st.classId === 'CLASS_CAM') return 'Lớp Cambridge';
                              if (st.classId === 'CLASS_IELTS') return 'Lớp IELTS Academic';
                              return st.classId || 'Chưa xếp lớp';
                            })()}
                          </div>
                          <div className="text-[11px] text-amber-700 font-medium">{program ? program.name : ''}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-amber-600 flex-shrink-0" />
                            <span>{t('student.student_phone')} <span className="font-bold text-slate-900">{st.phone || (language === 'vi' ? 'Chưa cập nhật' : 'N/A')}</span></span>
                          </div>
                          <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                            <span>PH ({st.parentName}): <a href={`tel:${st.parentPhone}`} className="font-medium text-slate-800 hover:text-amber-700">{st.parentPhone}</a></span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <FeeStatusBadge feeStatus={st.feeStatus} monthlyDebt={debt.monthly} courseDebt={debt.course} sessionDebt={debt.session} />
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

                            {/* Chức năng Bảo lưu & Nghỉ học & Học lại */}
                            {canEdit && st.status === 'active' && (
                              <>
                                <button
                                  onClick={() => handleOpenReserve(st)}
                                  className="p-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200"
                                  title="Bảo lưu học tập"
                                >
                                  <PauseCircle className="w-4 h-4 text-amber-600" />
                                </button>
                                <button
                                  onClick={() => handleOpenDrop(st)}
                                  className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                                  title="Nghỉ học ngang"
                                >
                                  <UserMinus className="w-4 h-4 text-slate-500" />
                                </button>
                              </>
                            )}

                            {canEdit && (st.status === 'reserved' || st.status === 'dropped') && (
                              <button
                                onClick={() => handleOpenReEnroll(st)}
                                className="px-2 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-300 flex items-center gap-1"
                                title="Kích hoạt quay lại học tiếp"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Học lại</span>
                              </button>
                            )}

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
                                onClick={() => setStudentToDelete(st)}
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
          </HorizontalScroll>
        </div>
      ) : (
        /* Mobile Card Grid View */
        <div className="entity-grid">
          {filteredStudents.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
              {t('student.no_matching')}
            </div>
          ) : (
            filteredStudents.map((st) => {
              const program = programs.find(p => p.id === st.programId);
              const cls = classes.find(c => c.id === st.classId);
              const debt = debtForStudent(st.id);

              const classNameText = studentClassNames(st, classes);
              const scheduleText = classes.filter(c => isStudentInClass(st, c.id)).map(c => `${c.name}: ${c.scheduleTime} (${c.days.join(', ')})`).join(' · ') || 'Chưa xếp lịch';

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
                        <FeeStatusBadge feeStatus={st.feeStatus} monthlyDebt={debt.monthly} courseDebt={debt.course} sessionDebt={debt.session} />
                      </div>
                    </div>

                    {/* Class & Schedule Pill */}
                    <div className="my-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-800 font-bold">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                          {classNameText}
                        </span>
                        <span className="text-[10px] text-amber-800 bg-amber-100 font-bold px-1.5 py-0.5 rounded">
                          {program?.name || 'Khóa Tiếng Anh'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-600">
                        <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>Lịch học: <strong className="text-slate-800">{scheduleText}</strong></span>
                      </div>
                    </div>

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
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap">
                    <button
                      onClick={() => setViewingStudent(st)}
                      className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs min-w-[120px] active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5 text-amber-400" />
                      <span>Chi tiết</span>
                    </button>

                    {/* Chức năng Bảo lưu & Nghỉ học & Học lại */}
                    {canEdit && st.status === 'active' && onReEnrollStudent && <button onClick={() => handleOpenReEnroll(st)} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900" title="Đăng ký đợt học tiếp theo">Học đợt tiếp</button>}
                    {canEdit && st.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleOpenReserve(st)}
                          className="p-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200"
                          title="Bảo lưu học tập"
                        >
                          <PauseCircle className="w-4 h-4 text-amber-600" />
                        </button>
                        <button
                          onClick={() => handleOpenDrop(st)}
                          className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                          title="Nghỉ học ngang"
                        >
                          <UserMinus className="w-4 h-4 text-slate-500" />
                        </button>
                      </>
                    )}

                    {canEdit && (st.status === 'reserved' || st.status === 'dropped') && (
                      <button
                        onClick={() => handleOpenReEnroll(st)}
                        className="px-2.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors border border-emerald-300 flex items-center gap-1"
                        title="Kích hoạt quay lại học tiếp"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Học lại</span>
                      </button>
                    )}

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
                        onClick={() => setStudentToDelete(st)}
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

      {viewingStudent && <StudentProfileDialog student={viewingStudent} programs={programs} classes={classes} teachers={teachers} rooms={rooms} timetableSlots={timetableSlots} receipts={receipts} enrollments={enrollments} onClose={() => setViewingStudent(null)} />}

      {/* ADD / EDIT STUDENT MODAL */}
      {isModalOpen && editingStudent && (
        <DialogFrame label="Thông tin học viên" onClose={() => {
                setIsModalOpen(false);
                setEditingStudent(null);
              }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
            <button aria-label="Đóng"
              onClick={() => {
                setIsModalOpen(false);
                setEditingStudent(null);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-amber-600" />
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-100 font-bold font-mono text-amber-900"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Họ Và Tên *</label>
                  <input
                    type="text"
                    value={editingStudent.name}
                    onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giới Tính</label>
                  <select
                    value={editingStudent.gender}
                    onChange={(e) => setEditingStudent({ ...editingStudent, gender: e.target.value as 'Nam' | 'Nữ' | 'Chưa xác định' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                    placeholder="THPT Chuyên Hoàng Lê Kha"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Khối Lớp</label>
                  <input
                    type="text"
                    value={editingStudent.gradeLevel}
                    onChange={(e) => setEditingStudent({ ...editingStudent, gradeLevel: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                    placeholder="Khối 11"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chương Trình Học</label>
                  <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-[10px] font-bold">
                    <button type="button" onClick={() => setProgramEntryMode('catalog')} className={`rounded-lg px-2 py-1.5 transition ${programEntryMode === 'catalog' ? 'bg-white text-amber-800 shadow-sm' : 'text-slate-500'}`}>Từ danh mục / Excel</button>
                    <button type="button" onClick={() => setProgramEntryMode('manual')} className={`rounded-lg px-2 py-1.5 transition ${programEntryMode === 'manual' ? 'bg-white text-amber-800 shadow-sm' : 'text-slate-500'}`}>Nhập tay</button>
                  </div>
                  {programEntryMode === 'catalog' ? (
                    <>
                      <select
                        value={editingStudent.programId}
                        onChange={(e) => setEditingStudent({ ...editingStudent, programId: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
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
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
                        required
                      />
                      <datalist id="student-program-options">{programs.map((program) => <option key={program.id} value={program.name} />)}</datalist>
                      <p className="mt-1 text-[10px] text-slate-500">Tên mới sẽ được tạo trong danh mục và dùng được khi xuất/nhập Excel.</p>
                    </>
                  )}
                </div>

                <div className="relative" ref={classDropdownRef}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="font-semibold text-slate-700 text-xs">
                      Lớp học ({selectedClassIds.length > 0 ? `${selectedClassIds.length} lớp đã chọn` : 'Chưa xếp lớp'})
                    </label>
                    {onAddClass && (
                      <button
                        type="button"
                        onClick={() => setIsQuickClassOpen(true)}
                        className="text-[11px] font-bold text-amber-700 hover:text-amber-900 cursor-pointer flex items-center gap-1"
                      >
                        + Tạo lớp mới
                      </button>
                    )}
                  </div>

                  {/* Trigger Button */}
                  <button
                    type="button"
                    onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                    className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white text-left flex items-center justify-between gap-2 shadow-xs transition hover:border-amber-400"
                    aria-expanded={isClassDropdownOpen}
                    aria-haspopup="listbox"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                      {selectedClasses.length === 0 ? (
                        <span className="text-slate-400 font-normal text-xs">-- Nhấn vào đây để chọn / tìm kiếm lớp học --</span>
                      ) : (
                        selectedClasses.map((cls, idx) => (
                          <span
                            key={cls.id}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold ${
                              idx === 0
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-sky-50 text-sky-900 border border-sky-200'
                            }`}
                          >
                            <span>{cls.name}</span>
                            <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-black/10 font-bold">
                              {cls.code}
                            </span>
                            {idx === 0 && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800 bg-amber-200/80 px-1 rounded">
                                Chính
                              </span>
                            )}
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleClass(cls.id);
                              }}
                              className="ml-0.5 text-slate-400 hover:text-rose-600 cursor-pointer text-xs font-bold"
                              title="Bỏ chọn lớp này"
                            >
                              ×
                            </span>
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-slate-400">
                      <span className="text-xs font-medium">
                        {selectedClasses.length > 0 ? `${selectedClasses.length} lớp` : ''}
                      </span>
                      <svg className={`w-4 h-4 transition-transform duration-200 ${isClassDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Dropdown Menu */}
                  <div className={`mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden transition-all ${isClassDropdownOpen ? 'block' : 'hidden'}`}>
                    {/* Search and Quick Actions */}
                    <div className="p-2 border-b border-slate-100 bg-slate-50/80 space-y-2">
                      <div className="relative">
                        <input
                          type="text"
                          value={classSearchQuery}
                          onChange={(e) => {
                            const val = e.target.value;
                            setClassSearchQuery(val);
                            const matchedClass = classes.find(
                              c => c.code.trim().toLocaleLowerCase('vi-VN') === val.trim().toLocaleLowerCase('vi-VN') ||
                                   c.name.trim().toLocaleLowerCase('vi-VN') === val.trim().toLocaleLowerCase('vi-VN') ||
                                   c.id === val.trim()
                            );
                            if (matchedClass) {
                              if (!selectedClassIds.includes(matchedClass.id)) {
                                handleToggleClass(matchedClass.id);
                              }
                            }
                          }}
                          placeholder="Ví dụ: L9-PPTE hoặc Lớp 9 - Global Success"
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                        />
                        <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>

                      <div className="flex items-center justify-between text-[11px] px-1">
                        <span className="text-slate-500">
                          {filteredDropdownClasses.length} lớp học phù hợp
                        </span>
                        {selectedClassIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleClearAllClasses()}
                            className="text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                          >
                            Bỏ chọn tất cả ({selectedClassIds.length})
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Class List with Checkboxes */}
                    <div className="max-h-56 overflow-y-auto p-1.5 space-y-1 divide-y divide-slate-100/60 custom-scrollbar">
                      {filteredDropdownClasses.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500">
                          Không tìm thấy lớp học nào khớp với "{classSearchQuery}"
                        </div>
                      ) : (
                        filteredDropdownClasses.map((c) => {
                          const isChecked = selectedClassIds.includes(c.id);
                          const isPrimary = selectedClassIds[0] === c.id;
                          const isCompletedOrPaused = ['completed', 'paused'].includes(c.courseStatus || '');
                          const isFull = c.capacity > 0 && students.filter(s => s.id !== editingStudent.id && s.status === 'active' && isStudentInClass(s, c.id)).length >= c.capacity;
                          const isDisabled = (!isChecked && isCompletedOrPaused) || (!isChecked && editingStudent.status === 'active' && isFull);

                          return (
                            <label
                              key={c.id}
                              className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition select-none ${
                                isChecked
                                  ? isPrimary
                                    ? 'bg-amber-50/80 hover:bg-amber-100/80 border border-amber-200'
                                    : 'bg-sky-50/70 hover:bg-sky-100/70 border border-sky-200'
                                  : isDisabled
                                  ? 'opacity-50 cursor-not-allowed bg-slate-50'
                                  : 'hover:bg-slate-100/80'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                aria-label={`${c.name} (${c.code})`}
                                disabled={isDisabled}
                                onChange={() => {
                                  if (!isDisabled) handleToggleClass(c.id);
                                }}
                                className="mt-1 h-4 w-4 shrink-0 rounded accent-amber-600 cursor-pointer"
                              />

                              <div className="min-w-0 flex-1 text-xs">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-slate-800">{c.name}</span>
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                                    {c.code}
                                  </span>
                                  {isChecked && isPrimary && (
                                    <span className="text-[10px] font-bold text-amber-800 bg-amber-200/90 px-1.5 py-0.2 rounded-full">
                                      ★ Lớp chính
                                    </span>
                                  )}
                                  {isChecked && !isPrimary && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleSetPrimaryClass(c.id);
                                      }}
                                      className="text-[10px] text-sky-700 hover:text-sky-900 hover:underline font-semibold cursor-pointer"
                                      title="Đặt lớp này làm lớp học chính"
                                    >
                                      [Đặt làm lớp chính]
                                    </button>
                                  )}
                                </div>

                                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                                  <span>Chương trình: <strong className="text-slate-600">{programs.find(p => p.id === c.programId)?.name || 'Chưa gán'}</strong></span>
                                  {c.billingMode && (
                                    <span>· Thu: {c.billingMode === 'session' ? 'Theo buổi' : c.billingMode === 'course' ? 'Theo khóa' : 'Hàng tháng'}</span>
                                  )}
                                  {isCompletedOrPaused && (
                                    <span className="text-amber-600 font-bold">· Đã kết thúc / tạm dừng</span>
                                  )}
                                  {isFull && (
                                    <span className="text-rose-600 font-bold">· Đã đủ sĩ số</span>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* Dropdown Footer */}
                    <div className="p-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
                      <p className="text-[11px] text-slate-500">
                        💡 Tích chọn nhiều lớp nếu học sinh học đồng thời. Mỗi lớp sẽ tách biệt học phí khi thu tiền.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsClassDropdownOpen(false)}
                        className="px-3 py-1 bg-amber-600 text-white rounded-lg font-bold text-[11px] hover:bg-amber-700 shadow-xs cursor-pointer"
                      >
                        Đóng
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số Điện Thoại Học Viên</label>
                  <input
                    type="text"
                    value={editingStudent.phone || ''}
                    onChange={(e) => setEditingStudent({ ...editingStudent, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold text-slate-900"
                    placeholder="0936 123 456"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Họ Tên Phụ Huynh *</label>
                  <input
                    type="text"
                    value={editingStudent.parentName}
                    onChange={(e) => setEditingStudent({ ...editingStudent, parentName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                    placeholder="0918 222 333"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trạng Thái Học</label>
                  <select
                    value={editingStudent.status}
                    onChange={(e) => setEditingStudent({ ...editingStudent, status: e.target.value as StudentStatus })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                  className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold hover:bg-amber-600 shadow-sm flex items-center gap-1.5 active:scale-95"
                >
                  <Save className="w-4 h-4 text-slate-950" /> Lưu Học Sinh
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}

      {/* MODAL BẢO LƯU HỌC TẬP */}
      {reservingStudent && (
        <DialogFrame label="Bảo lưu học viên" onClose={() => setReservingStudent(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="dialog-panel bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative">
            <button aria-label="Đóng"
              onClick={() => setReservingStudent(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <PauseCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Bảo Lưu Học Tập</h3>
                <p className="text-xs text-slate-500">Tạm dừng học và rút khỏi danh sách điểm danh lớp</p>
              </div>
            </div>

            <form onSubmit={handleConfirmReservation} className="space-y-3.5 text-xs">
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80">
                <div className="font-bold text-slate-900 text-sm">{reservingStudent.name} ({reservingStudent.code})</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Lớp: <span className="font-semibold text-amber-800">{studentClassNames(reservingStudent, classes)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ngày Bắt Đầu *</label>
                  <input
                    type="date"
                    value={reserveStartDate}
                    onChange={e => setReserveStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dự Kiến Học Lại</label>
                  <input
                    type="date"
                    value={reserveEndDate}
                    onChange={e => setReserveEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lý Do Bảo Lưu *</label>
                <select
                  value={reserveReason}
                  onChange={e => setReserveReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 font-medium"
                >
                  <option value="Bận lịch học tại trường chính khóa">Bận lịch học tại trường chính khóa</option>
                  <option value="Lý do sức khỏe / điều trị y tế">Lý do sức khỏe / điều trị y tế</option>
                  <option value="Việc gia đình bận đột xuất">Việc gia đình bận đột xuất</option>
                  <option value="Tạm nghỉ ôn thi học kỳ">Tạm nghỉ ôn thi học kỳ</option>
                  <option value="Khác">Lý do khác</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú Chi Tiết</label>
                <textarea
                  rows={2}
                  value={reserveNote}
                  onChange={e => setReserveNote(e.target.value)}
                  placeholder="Ghi chú thêm từ phụ huynh hoặc thỏa thuận giữ học phí..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReservingStudent(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-sm flex items-center gap-1.5"
                >
                  <PauseCircle className="w-4 h-4" /> Xác Nhận Bảo Lưu
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}

      {/* MODAL NGHỈ HỌC NGANG */}
      {droppingStudent && (
        <DialogFrame label="Nghỉ học" onClose={() => setDroppingStudent(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="dialog-panel bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative">
            <button aria-label="Đóng"
              onClick={() => setDroppingStudent(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center">
                <UserMinus className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Xác Nhận Nghỉ Học Ngang</h3>
                <p className="text-xs text-slate-500">Ghi nhận học viên thôi học và cập nhật trạng thái</p>
              </div>
            </div>

            <form onSubmit={handleConfirmDrop} className="space-y-3.5 text-xs">
              <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200/80">
                <div className="font-bold text-slate-900 text-sm">{droppingStudent.name} ({droppingStudent.code})</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Lớp: <span className="font-semibold text-amber-800">{studentClassNames(droppingStudent, classes)}</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ngày Chính Thức Nghỉ Học *</label>
                <input
                  type="date"
                  value={dropDate}
                  onChange={e => setDropDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lý Do Nghỉ Học *</label>
                <select
                  value={dropReason}
                  onChange={e => setDropReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 font-medium"
                >
                  <option value="Chuyển nơi ở / trường học">Chuyển nơi ở / trường học</option>
                  <option value="Không phù hợp thời gian ca học">Không phù hợp thời gian ca học</option>
                  <option value="Hoàn cảnh kinh tế gia đình">Hoàn cảnh kinh tế gia đình</option>
                  <option value="Không theo kịp trình độ lớp">Không theo kịp trình độ lớp</option>
                  <option value="Lý do cá nhân khác">Lý do cá nhân khác</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú Đóng Hồ Sơ</label>
                <textarea
                  rows={2}
                  value={dropNote}
                  onChange={e => setDropNote(e.target.value)}
                  placeholder="Ghi nhận phản hồi của phụ huynh khi nghỉ học..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDroppingStudent(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl font-bold shadow-sm flex items-center gap-1.5"
                >
                  <UserMinus className="w-4 h-4" /> Xác Nhận Nghỉ Học
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}

      {/* MODAL HỌC VIÊN QUAY LẠI HỌC TIẾP */}
      {reEnrollingStudent && (
        <DialogFrame label="Đăng ký học lại" onClose={() => setReEnrollingStudent(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="dialog-panel bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative">
            <button aria-label="Đóng"
              onClick={() => setReEnrollingStudent(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{reEnrollingStudent.status === 'active' ? 'Đăng ký đợt học tiếp theo' : 'Quay lại học tiếp'}</h3>
                <p className="text-xs text-slate-500">Giữ lịch sử đợt cũ và xếp lớp. Lập học phí đợt mới tại mục Học phí.</p>
              </div>
            </div>

            <form onSubmit={handleConfirmReEnroll} className="space-y-3.5 text-xs">
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80">
                <div className="font-bold text-slate-900 text-sm">{reEnrollingStudent.name} ({reEnrollingStudent.code})</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Trạng thái trước đó: <span className="font-bold text-amber-800">{reEnrollingStudent.status === 'active' ? 'Đang học' : reEnrollingStudent.status === 'reserved' ? 'Bảo lưu' : 'Nghỉ học'}</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chọn Lớp Học Tiếp Tục *</label>
                <select
                  value={reEnrollClassId}
                  onChange={e => setReEnrollClassId(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-emerald-500 rounded-xl focus:ring-2 focus:ring-emerald-600 font-bold text-slate-900 bg-white"
                  required
                >
                  {classes.filter(c => c.courseStatus !== 'completed' && c.courseStatus !== 'paused' && (reEnrollingStudent.status !== 'active' || c.id !== reEnrollingStudent.classId)).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.scheduleTime} ({c.studentIds ? c.studentIds.length : 0}/{c.capacity} HS)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ngày Bắt Đầu Đi Học Lại *</label>
                <input
                  type="date"
                  value={reEnrollDate}
                  onChange={e => setReEnrollDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú Khi Nhập Học Lại</label>
                <textarea
                  rows={2}
                  value={reEnrollNote}
                  onChange={e => setReEnrollNote(e.target.value)}
                  placeholder="Ghi chú về bảo lưu học phí cũ, kiểm tra xếp lớp lại..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReEnrollingStudent(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" /> Xác Nhận Vào Học Lại
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}
      <ConfirmModal
        isOpen={!!studentToDelete}
        title="Xác nhận xóa học sinh"
        message={
          studentToDelete ? (
            <>
              Bạn có chắc chắn muốn xóa học sinh <strong>{studentToDelete.name}</strong> ({studentToDelete.code}) khỏi hệ thống?
              <span className="block mt-2 text-xs text-slate-500">
                Lưu ý: Chỉ xóa được học viên chưa có lịch sử đóng học phí hoặc điểm danh.
              </span>
            </>
          ) : null
        }
        confirmText="Xác nhận xóa"
        cancelText="Hủy bỏ"
        variant="danger"
        onConfirm={() => {
          if (studentToDelete) {
            const id = studentToDelete.id;
            const name = studentToDelete.name;
            setStudentToDelete(null);
            const res = (onDeleteStudent as (id: string) => string | null | void)(id);
            if (typeof res === 'string' && res) {
              setDeleteAlertMessage(res);
            } else {
              toast.success(`Đã xóa học viên “${name}” thành công!`);
            }
          }
        }}
        onClose={() => setStudentToDelete(null)}
      />

      <AlertModal
        isOpen={!!deleteAlertMessage}
        title="Không thể xóa học sinh"
        message={deleteAlertMessage}
        onClose={() => setDeleteAlertMessage(null)}
      />
    </div>
  );
};