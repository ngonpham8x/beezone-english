import { DialogFrame } from './DialogFrame';
import { useResponsiveView } from '../hooks/useResponsive';
import { centerDate } from '../lib/dates';
import React, { useState, useMemo, useRef } from 'react';
import {
  Student,
  CourseProgram,
  ClassRoom,
  Teacher,
  StudentStatus,
  StaffPermissions
} from '../types';
import {
  UserPlus,
  Users,
  Search,
  Filter,
  GraduationCap,
  BookOpen,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  Edit,
  Trash2,
  X,
  Save,
  Sparkles,
  School,
  AlertCircle,
  CheckCheck,
  LayoutGrid,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface AdmissionsManagerProps {
  students: Student[];
  programs: CourseProgram[];
  classes: ClassRoom[];
  teachers: Teacher[];
  permissions: StaffPermissions;
  isOwner: boolean;
  onAddStudent: (student: Student) => void;
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent: (id: string) => void;
  onEnrollStudent: (studentId: string, classId: string, enrollDate: string) => boolean;
}

export const AdmissionsManager: React.FC<AdmissionsManagerProps> = ({
  students,
  programs,
  classes,
  teachers,
  permissions,
  isOwner,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onEnrollStudent
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProgram, setFilterProgram] = useState<string>('all');
  const [viewMode, setViewMode] = useResponsiveView('card', 'table');
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const scrollTable = (direction: 'left' | 'right') => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollBy({
        left: direction === 'left' ? -350 : 350,
        behavior: 'smooth'
      });
    }
  };

  // Modal states
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Partial<Student> | null>(null);

  // Enrollment modal state
  const [enrollingCandidate, setEnrollingCandidate] = useState<Student | null>(null);
  const [enrollClassId, setEnrollClassId] = useState<string>('');
  const [enrollDate, setEnrollDate] = useState<string>(
    centerDate()
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canEdit = isOwner || permissions.student.edit;
  const canAdd = isOwner || permissions.student.add;
  const canDelete = isOwner || permissions.student.delete;

  // Filter admissions candidates: status is lead, trial, registered OR active students who enrolled recently
  const admissionsList = useMemo(() => {
    return students.filter(s => {
      const isCandidate = s.status === 'lead' || s.status === 'trial' || s.status === 'registered';
      const matchesSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.parentPhone.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.code.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all'
        ? (isCandidate || s.status === 'active')
        : s.status === filterStatus;

      const matchesProgram = filterProgram === 'all' || s.programId === filterProgram;

      return matchesSearch && matchesStatus && matchesProgram;
    });
  }, [students, searchTerm, filterStatus, filterProgram]);

  // Statistics
  const stats = useMemo(() => {
    const leads = students.filter(s => s.status === 'lead').length;
    const trials = students.filter(s => s.status === 'trial').length;
    const registered = students.filter(s => s.status === 'registered').length;
    const officiallyEnrolled = students.filter(s => s.status === 'active').length;
    return { leads, trials, registered, officiallyEnrolled };
  }, [students]);

  // Open add new lead modal
  const handleOpenAddNew = () => {
    const nextIndex = students.length + 1;
    setEditingCandidate({
      id: `TS_${Date.now()}`,
      code: `TS${nextIndex.toString().padStart(3, '0')}`,
      name: '',
      dob: '2016-01-01',
      gender: 'Nam',
      school: '',
      gradeLevel: 'Lớp 3',
      programId: programs[0]?.id || '',
      classId: '',
      address: 'Tây Ninh',
      email: '',
      phone: '',
      parentName: '',
      parentPhone: '',
      enrollDate: centerDate(),
      notes: '',
      status: 'lead',
      feeStatus: 'unpaid'
    });
    setIsAddEditOpen(true);
  };

  // Save add/edit candidate
  const handleSaveCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCandidate || !editingCandidate.name?.trim()) return;
    const exists = students.some(s => s.id === editingCandidate.id);
    if (exists ? !canEdit : !canAdd) return;
    if (students.some(s => s.id !== editingCandidate.id && s.code.trim().toLowerCase() === editingCandidate.code?.trim().toLowerCase())) { alert('Mã học viên đã tồn tại.'); return; }

    const studentToSave: Student = {
      id: editingCandidate.id || `TS_${Date.now()}`,
      code: editingCandidate.code || `TS${(students.length + 1).toString().padStart(3, '0')}`,
      name: editingCandidate.name.trim(),
      avatar: editingCandidate.avatar || '',
      dob: editingCandidate.dob || '',
      gender: editingCandidate.gender || 'Chưa xác định',
      school: editingCandidate.school || '',
      gradeLevel: editingCandidate.gradeLevel || '',
      programId: editingCandidate.programId || programs[0]?.id || '',
      classId: editingCandidate.classId || '',
      address: editingCandidate.address || 'Tây Ninh',
      email: editingCandidate.email || '',
      phone: editingCandidate.phone || '',
      parentName: editingCandidate.parentName || '',
      parentPhone: editingCandidate.parentPhone || '',
      enrollDate: editingCandidate.enrollDate || centerDate(),
      notes: editingCandidate.notes || '',
      status: (editingCandidate.status as StudentStatus) || 'lead',
      feeStatus: editingCandidate.feeStatus || 'unpaid'
    };

    if (students.some(s => s.id === studentToSave.id)) {
      onUpdateStudent(studentToSave);
      setStatusMessage(`Đã cập nhật thông tin học viên ${studentToSave.name}!`);
    } else {
      onAddStudent(studentToSave);
      setStatusMessage(`Đã thêm hồ sơ tuyển sinh mới ${studentToSave.name}!`);
    }

    setIsAddEditOpen(false);
    setEditingCandidate(null);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Open enrollment modal
  const handleOpenEnroll = (candidate: Student) => {
    setEnrollingCandidate(candidate);
    // Suggest matching class from candidate's interested program
    const matchingClasses = classes.filter(c => c.programId === candidate.programId);
    setEnrollClassId(matchingClasses[0]?.id || classes[0]?.id || '');
    setEnrollDate(centerDate());
  };

  // Confirm official enrollment
  const handleConfirmEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollingCandidate || !enrollClassId) return;
    const classroom = classes.find(c => c.id === enrollClassId);
    if (!classroom || (classroom.capacity > 0 && students.filter(s => s.classId === enrollClassId && s.status === 'active').length >= classroom.capacity)) { setStatusMessage('Lớp không còn chỗ. Vui lòng chọn lớp khác.'); return; }

    if (!onEnrollStudent(enrollingCandidate.id, enrollClassId, enrollDate)) return;
    const targetClass = classes.find(c => c.id === enrollClassId);

    setStatusMessage(`🎉 Chúc mừng! Đã chuyển ${enrollingCandidate.name} vào lớp chính thức ${targetClass?.name || enrollClassId}!`);
    setEnrollingCandidate(null);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Quick status change
  const handleQuickStatusChange = (candidate: Student, newStatus: StudentStatus) => {
    onUpdateStudent({
      ...candidate,
      status: newStatus
    });
    setStatusMessage(`Đã chuyển trạng thái của ${candidate.name} thành "${getStatusLabel(newStatus)}"`);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const getStatusBadge = (status: StudentStatus) => {
    switch (status) {
      case 'lead':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Tiềm năng / Tư vấn
          </span>
        );
      case 'trial':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" /> Đang Học Thử
          </span>
        );
      case 'registered':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
            <CheckCheck className="w-3 h-3" /> Đã Đăng Ký (Chờ Xếp Lớp)
          </span>
        );
      case 'active':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Đã Nhập Học Chính Thức
          </span>
        );
      case 'reserved':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1">
            Bảo Lưu
          </span>
        );
      case 'dropped':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300 flex items-center gap-1">
            Nghỉ Học
          </span>
        );
      default:
        return null;
    }
  };

  const getStatusLabel = (status: StudentStatus) => {
    switch (status) {
      case 'lead': return 'Tiềm năng';
      case 'trial': return 'Học thử';
      case 'registered': return 'Đã đăng ký';
      case 'active': return 'Chính thức';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-amber-600" />
            Phân Hệ Tuyển Sinh & Tiếp Nhận Học Viên
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tiếp nhận hồ sơ tư vấn, xếp lịch học thử và tự động phân vào lớp chính thức khi đăng ký
          </p>
        </div>

        {canAdd && (
          <button
            onClick={handleOpenAddNew}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-2 active:scale-95"
          >
            <UserPlus className="w-4 h-4 text-slate-950" />
            Tiếp Nhận Học Viên Mới
          </button>
        )}
      </div>

      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          {statusMessage}
        </div>
      )}

      {/* Admissions Pipeline Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-indigo-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-700">
            <span>Tiềm Năng / Tư Vấn</span>
            <Users className="w-4 h-4 opacity-70" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{stats.leads}</div>
          <div className="mt-1 text-[11px] text-slate-500">Đang tìm hiểu & nhận tư vấn</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-amber-700">
            <span>Đang Học Thử</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{stats.trials}</div>
          <div className="mt-1 text-[11px] text-slate-500">Trải nghiệm 1-2 buổi miễn phí</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-blue-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-blue-700">
            <span>Đã Đăng Ký</span>
            <CheckCheck className="w-4 h-4 opacity-70" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{stats.registered}</div>
          <div className="mt-1 text-[11px] text-slate-500">Đã chốt học - Chờ xếp lớp</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-700">
            <span>Đã Vào Lớp Chính Thức</span>
            <GraduationCap className="w-4 h-4 opacity-70" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{stats.officiallyEnrolled}</div>
          <div className="mt-1 text-[11px] text-slate-500">Đang theo học tại trung tâm</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm tên học viên, SĐT phụ huynh..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent font-semibold text-slate-700 focus:outline-hidden"
            >
              <option value="all">Tất cả giai đoạn</option>
              <option value="lead">Tiềm năng / Tư vấn</option>
              <option value="trial">Đang học thử</option>
              <option value="registered">Đã đăng ký (Chờ lớp)</option>
              <option value="active">Đã nhập học chính thức</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs">
            <BookOpen className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="bg-transparent font-semibold text-slate-700 focus:outline-hidden"
            >
              <option value="all">Tất cả chương trình</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* View Switcher & Horizontal Scroll Helper Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* View mode toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
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
            type="button"
            aria-pressed={viewMode === 'card'} onClick={() => setViewMode('card')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'card'
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-amber-600" />
            <span>Dạng Thẻ Mobile</span>
          </button>
        </div>

        {/* Scroll helper buttons for Table view */}
        {viewMode === 'table' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline-flex items-center gap-1">
              ◂ Cuộn ngang xem đầy đủ {admissionsList.length} hồ sơ ▸
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollTable('left')}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 transition flex items-center gap-1 cursor-pointer"
                title="Cuộn bảng sang trái"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cuộn trái</span>
              </button>
              <button
                type="button"
                onClick={() => scrollTable('right')}
                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                title="Cuộn bảng sang phải"
              >
                <span className="hidden sm:inline">Cuộn phải</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ADMISSIONS CONTENT: TABLE OR RESPONSIVE CARDS */}
      {viewMode === 'table' ? (
        /* Admissions Candidate Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div ref={tableScrollRef} className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[1100px] text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold">
                <tr>
                  <th className="py-3 px-4 w-12 text-center sticky left-0 bg-slate-800 z-20">STT</th>
                  <th className="py-3 px-4 sticky left-12 bg-slate-800 z-20 shadow-r border-r border-slate-700 min-w-[200px]">Mã / Học Viên</th>
                  <th className="py-3 px-4 min-w-[170px]">Khóa Học Quan Tâm</th>
                  <th className="py-3 px-4 min-w-[200px]">Thông Tin Phụ Huynh</th>
                  <th className="py-3 px-4 text-center min-w-[160px]">Trạng Thái</th>
                  <th className="py-3 px-4 min-w-[180px]">Ghi Chú Nhu Cầu</th>
                  <th className="py-3 px-4 text-right min-w-[170px]">Thao Tác Tuyển Sinh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {admissionsList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      <UserPlus className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      Không tìm thấy hồ sơ tuyển sinh nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  admissionsList.map((candidate, idx) => {
                    const program = programs.find(p => p.id === candidate.programId);
                    const currentClass = classes.find(c => c.id === candidate.classId);
                    const isAlreadyActive = candidate.status === 'active';

                    return (
                      <tr key={candidate.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-400 font-bold sticky left-0 bg-white z-10">
                          {idx + 1}
                        </td>

                        <td className="py-3 px-4 sticky left-12 bg-white z-10 shadow-r border-r border-slate-100">
                          <div className="font-bold text-slate-900 text-sm">{candidate.name}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="font-semibold font-mono text-amber-900 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60">{candidate.code}</span>
                            <span>•</span>
                            <span>{candidate.gender}</span>
                            <span>•</span>
                            <span>{candidate.gradeLevel || 'Chưa rõ khối'}</span>
                          </div>
                          {candidate.school && (
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <School className="w-3 h-3 text-slate-400" /> {candidate.school}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">
                            {program?.name || 'Chưa chọn khóa'}
                          </div>
                          {program && (
                            <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                              {program.tuitionFee.toLocaleString('vi-VN')} đ / khóa
                            </div>
                          )}
                          {currentClass && (
                            <div className="text-[10px] text-indigo-700 font-bold mt-1 bg-indigo-50 px-2 py-0.5 rounded inline-block">
                              Lớp: {currentClass.name}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">
                            {candidate.parentName || 'Chưa cập nhật tên PH'}
                          </div>
                          <div className="text-[11px] mt-0.5">
                            {candidate.parentPhone || candidate.phone ? (
                              <a
                                href={`tel:${candidate.parentPhone || candidate.phone}`}
                                className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <Phone className="w-3 h-3" /> {candidate.parentPhone || candidate.phone}
                              </a>
                            ) : (
                              <span className="text-slate-400">Chưa có SĐT</span>
                            )}
                          </div>
                          {candidate.address && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[150px] mt-0.5">
                              <MapPin className="w-3 h-3 inline mr-0.5 text-slate-400" />
                              {candidate.address}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {getStatusBadge(candidate.status)}
                            {/* Quick change dropdown for non-active */}
                            {!isAlreadyActive && canEdit && (
                              <select
                                value={candidate.status}
                                onChange={(e) => handleQuickStatusChange(candidate, e.target.value as StudentStatus)}
                                className="mt-1 text-[10px] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 font-semibold text-slate-700 cursor-pointer"
                              >
                                <option value="lead">Đổi sang: Tiềm năng</option>
                                <option value="trial">Đổi sang: Học thử</option>
                                <option value="registered">Đổi sang: Đã đăng ký</option>
                              </select>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 max-w-xs">
                          <p className="text-xs text-slate-600 italic line-clamp-2">
                            {candidate.notes || 'Chưa có ghi chú tư vấn.'}
                          </p>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* ACTION: Xác nhận nhập học chính thức */}
                            {!isAlreadyActive && canEdit && (
                              <button
                                onClick={() => handleOpenEnroll(candidate)}
                                className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                                title="Xác nhận học sinh đăng ký chính thức & Tự động thêm vào lớp"
                              >
                                <GraduationCap className="w-3.5 h-3.5" />
                                <span>Xếp Lớp Chính Thức</span>
                              </button>
                            )}

                            {isAlreadyActive && (
                              <span className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200">
                                Đang học lớp {currentClass?.name || 'N/A'}
                              </span>
                            )}

                            {canEdit && (
                              <button
                                onClick={() => {
                                  setEditingCandidate(candidate);
                                  setIsAddEditOpen(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                title="Sửa thông tin"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}

                            {canDelete && !isAlreadyActive && (
                              <button
                                onClick={() => {
                                  if (confirm(`Xác nhận xóa hồ sơ tuyển sinh ${candidate.name}?`)) {
                                    onDeleteStudent(candidate.id);
                                  }
                                }}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Xóa hồ sơ"
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
        /* Responsive Card View (Mobile & Compact View) */
        <div className="space-y-3">
          {admissionsList.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
              <UserPlus className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Không tìm thấy hồ sơ tuyển sinh nào phù hợp.
            </div>
          ) : (
            <div className="grid grid-cols-1 @min-[640px]:grid-cols-2 @min-[1050px]:grid-cols-3 gap-3.5">
              {admissionsList.map((candidate, idx) => {
                const program = programs.find(p => p.id === candidate.programId);
                const currentClass = classes.find(c => c.id === candidate.classId);
                const isAlreadyActive = candidate.status === 'active';

                return (
                  <div
                    key={candidate.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all p-4 flex flex-col justify-between space-y-3"
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-mono text-xs font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                            {candidate.code}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {candidate.gender}
                          </span>
                        </div>
                        <h4 className="font-extrabold text-slate-900 text-base mt-1 truncate">
                          {candidate.name}
                        </h4>
                        {candidate.gradeLevel && (
                          <p className="text-[11px] text-slate-500">
                            {candidate.gradeLevel} {candidate.school ? `• ${candidate.school}` : ''}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {getStatusBadge(candidate.status)}
                        {!isAlreadyActive && canEdit && (
                          <select
                            value={candidate.status}
                            onChange={(e) => handleQuickStatusChange(candidate, e.target.value as StudentStatus)}
                            className="text-[10px] bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-semibold text-slate-700 cursor-pointer"
                          >
                            <option value="lead">Tiềm năng</option>
                            <option value="trial">Học thử</option>
                            <option value="registered">Đã đăng ký</option>
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-700 bg-slate-50 p-2 rounded-xl">
                        <span className="font-semibold text-slate-500 text-[11px]">Khóa học:</span>
                        <div className="text-right">
                          <strong className="text-slate-900 block">{program?.name || 'Chưa chọn khóa'}</strong>
                          {program && (
                            <span className="text-[11px] text-emerald-700 font-bold">
                              {program.tuitionFee.toLocaleString('vi-VN')} đ
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Parent info with direct Call button */}
                      <div className="p-2 rounded-xl border border-slate-100 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 font-medium">Phụ huynh:</span>
                          <strong className="text-slate-900 text-xs">{candidate.parentName || 'Chưa cập nhật'}</strong>
                        </div>
                        {(candidate.parentPhone || candidate.phone) && (
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[11px] text-slate-500 font-medium">SĐT liên hệ:</span>
                            <a
                              href={`tel:${candidate.parentPhone || candidate.phone}`}
                              className="font-bold text-blue-600 hover:underline flex items-center gap-1 text-xs bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200"
                            >
                              <Phone className="w-3 h-3" /> {candidate.parentPhone || candidate.phone}
                            </a>
                          </div>
                        )}
                        {candidate.address && (
                          <p className="text-[11px] text-slate-500 truncate pt-0.5">
                            <MapPin className="w-3 h-3 inline mr-1 text-slate-400" />
                            {candidate.address}
                          </p>
                        )}
                      </div>

                      {candidate.notes && (
                        <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-200/60 text-[11px] text-slate-700 italic">
                          "{candidate.notes}"
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCandidate(candidate);
                              setIsAddEditOpen(true);
                            }}
                            className="px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:text-amber-700 hover:bg-amber-50 rounded-lg border border-slate-200 transition flex items-center gap-1 cursor-pointer"
                            title="Sửa thông tin"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Sửa</span>
                          </button>
                        )}
                        {canDelete && !isAlreadyActive && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Xác nhận xóa hồ sơ tuyển sinh ${candidate.name}?`)) {
                                onDeleteStudent(candidate.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Xóa hồ sơ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {!isAlreadyActive && canEdit ? (
                        <button
                          type="button"
                          onClick={() => handleOpenEnroll(candidate)}
                          className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                        >
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span>Xếp Lớp</span>
                        </button>
                      ) : isAlreadyActive ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200">
                          Lớp {currentClass?.name || 'N/A'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: TIẾP NHẬN / SỬA HỌC VIÊN MỚI */}
      {isAddEditOpen && editingCandidate && (
        <DialogFrame label="Hồ sơ tuyển sinh" onClose={() => {
                setIsAddEditOpen(false);
                setEditingCandidate(null);
              }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-h-[92vh] max-w-xl w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative custom-scrollbar">
            <button aria-label="Đóng"
              onClick={() => {
                setIsAddEditOpen(false);
                setEditingCandidate(null);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-amber-600" />
              {students.some(s => s.id === editingCandidate.id) ? 'Cập Nhật Hồ Sơ Tuyển Sinh' : 'Tiếp Nhận Học Viên Mới'}
            </h3>

            <form onSubmit={handleSaveCandidate} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Họ Và Tên Học Sinh *</label>
                  <input
                    type="text"
                    value={editingCandidate.name || ''}
                    onChange={e => setEditingCandidate({ ...editingCandidate, name: e.target.value })}
                    placeholder="VD: Nguyễn Nhật Nam"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ngày Sinh</label>
                  <input
                    type="date"
                    value={editingCandidate.dob || '2016-01-01'}
                    onChange={e => setEditingCandidate({ ...editingCandidate, dob: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giới Tính</label>
                  <select
                    value={editingCandidate.gender || 'Nam'}
                    onChange={e => setEditingCandidate({ ...editingCandidate, gender: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Chưa xác định">Chưa xác định</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trường Học Hiện Tại</label>
                  <input
                    type="text"
                    value={editingCandidate.school || ''}
                    onChange={e => setEditingCandidate({ ...editingCandidate, school: e.target.value })}
                    placeholder="TH Chu Văn An"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Khối Lớp</label>
                  <input
                    type="text"
                    value={editingCandidate.gradeLevel || ''}
                    onChange={e => setEditingCandidate({ ...editingCandidate, gradeLevel: e.target.value })}
                    placeholder="Lớp 3"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Khóa Học Quan Tâm *</label>
                  <select
                    value={editingCandidate.programId || programs[0]?.id || ''}
                    onChange={e => setEditingCandidate({ ...editingCandidate, programId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 font-semibold"
                  >
                    {programs.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.tuitionFee.toLocaleString('vi-VN')} đ)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giai Đoạn Tuyển Sinh</label>
                  <select
                    value={editingCandidate.status || 'lead'}
                    onChange={e => setEditingCandidate({ ...editingCandidate, status: e.target.value as StudentStatus })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 font-semibold text-red-900"
                  >
                    <option value="lead">Tiềm năng / Nhận tư vấn</option>
                    <option value="trial">Học thử (Trải nghiệm)</option>
                    <option value="registered">Đã đăng ký (Chờ xếp lớp chính thức)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-3">
                <div className="font-bold text-amber-900 uppercase text-[11px] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Thông Tin Phụ Huynh & Liên Hệ
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Họ Tên Phụ Huynh</label>
                    <input
                      type="text"
                      value={editingCandidate.parentName || ''}
                      onChange={e => setEditingCandidate({ ...editingCandidate, parentName: e.target.value })}
                      placeholder="Phụ huynh học sinh"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">SĐT Phụ Huynh *</label>
                    <input
                      type="tel"
                      value={editingCandidate.parentPhone || ''}
                      onChange={e => setEditingCandidate({ ...editingCandidate, parentPhone: e.target.value })}
                      placeholder="09xx xxx xxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 bg-white"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Địa Chỉ</label>
                    <input
                      type="text"
                      value={editingCandidate.address || ''}
                      onChange={e => setEditingCandidate({ ...editingCandidate, address: e.target.value })}
                      placeholder="Tây Ninh"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Email (nếu có)</label>
                    <input
                      type="email"
                      value={editingCandidate.email || ''}
                      onChange={e => setEditingCandidate({ ...editingCandidate, email: e.target.value })}
                      placeholder="parent@gmail.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nhu Cầu Học & Ghi Chú Tư Vấn
                </label>
                <textarea
                  rows={2}
                  value={editingCandidate.notes || ''}
                  onChange={e => setEditingCandidate({ ...editingCandidate, notes: e.target.value })}
                  placeholder="VD: Muốn cải thiện phản xạ giao tiếp, bố mẹ đưa đón sau 17h30..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddEditOpen(false);
                    setEditingCandidate(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold hover:bg-amber-600 flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Save className="w-4 h-4 text-slate-950" /> Lưu Hồ Sơ
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}

      {/* MODAL 2: XÁC NHẬN NHẬP HỌC CHÍNH THỨC */}
      {enrollingCandidate && (
        <DialogFrame label="Xác nhận ghi danh" onClose={() => setEnrollingCandidate(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="dialog-panel bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative">
            <button aria-label="Đóng"
              onClick={() => setEnrollingCandidate(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-md">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Xác Nhận Nhập Học Chính Thức</h3>
                <p className="text-xs text-slate-500">Tự động chuyển vào lớp, tạo bảng điểm & phiếu thu học phí</p>
              </div>
            </div>

            <form onSubmit={handleConfirmEnroll} className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Học viên:</span>
                  <span className="font-bold text-slate-900 text-sm">{enrollingCandidate.name} ({enrollingCandidate.code})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Khóa học đăng ký:</span>
                  <span className="font-bold text-amber-800">
                    {programs.find(p => p.id === enrollingCandidate.programId)?.name || 'Khóa học tiêu chuẩn'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">SĐT Phụ huynh:</span>
                  <span className="font-bold text-slate-800">{enrollingCandidate.parentPhone || enrollingCandidate.phone}</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1.5">
                  1. Chọn Lớp Học Chính Thức Tiếp Nhận *
                </label>
                <select
                  value={enrollClassId}
                  onChange={e => setEnrollClassId(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-emerald-500/80 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden bg-white"
                  required
                >
                  {classes.map(cls => {
                    const teacher = teachers.find(t => t.id === cls.teacherId);
                    const currentCount = cls.studentIds ? cls.studentIds.length : 0;
                    return (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} — {cls.scheduleTime} — GV: {teacher?.name || 'Chưa gán'} ({currentCount}/{cls.capacity} HS)
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Học sinh sẽ được thêm vào danh sách sĩ số của lớp này ngay lập tức.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1.5">
                  2. Ngày Bắt Đầu Học Chính Thức *
                </label>
                <input
                  type="date"
                  value={enrollDate}
                  onChange={e => setEnrollDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 font-semibold text-slate-800"
                  required
                />
              </div>

              {/* Automatic actions preview */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 space-y-1.5">
                <div className="font-bold text-[11px] uppercase tracking-wide flex items-center gap-1 text-emerald-800">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Hệ thống tự động thực hiện:
                </div>
                <div className="text-[11px] space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>Cập nhật trạng thái học sinh: <strong>Đang học chính thức (active)</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>Thêm học sinh vào danh sách lớp để điểm danh hằng ngày</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>Khởi tạo bảng điểm 4 kỹ năng & chuyên cần cho giáo viên chấm</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>Tạo phiếu báo thu học phí ban đầu theo khóa học</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEnrollingCandidate(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-300" />
                  Xác Nhận & Xếp Vào Lớp Ngay
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}
    </div>
  );
};

