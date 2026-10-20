import { ConfirmedForm } from '../../components/ConfirmedForm';
import { nextStudentCode, nextRoomId } from '../../lib/identifiers';
import { academicPermission } from '../../lib/permissions';
import { showAlert } from '../../lib/dialogs';
import { isStudentInClass, classProgramIds, classMatchesProgram } from '../../lib/studentClasses';
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock,
  DoorOpen,
  Edit,
  Eye,
  Plus,
  Save,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { ConfirmModal } from '../../components/ConfirmModal';
import { StatCard } from '../../components/StatCard';
import { TeacherAvatar } from '../../components/TeacherAvatar';
import { useLanguage } from '../../context/LanguageContext';
import { centerDate } from '../../lib/dates';
import { courseStatusLabels, validateCourse, validateRecurringChanges } from '../../lib/operations';
import { findScheduleConflict } from '../../lib/schedule';
import { matchesSearch } from '../../lib/search';
import { absencePolicyLabels } from '../../lib/sessionBilling';
import { debtBreakdown } from '../../lib/tuition';
import type { ScheduleChange } from '../../types';
import {
  AttendanceSession,
  ClassEnrollment,
  ClassRoom,
  CourseProgram,
  Room,
  StaffPermissions,
  Student,
  Teacher,
  TimetableSlot,
  TuitionReceipt,
} from '../../types';

interface ClassManagerProps {
  classes: ClassRoom[];
  teachers: Teacher[];
  rooms: Room[];
  programs: CourseProgram[];
  students: Student[];
  receipts: TuitionReceipt[];
  attendanceSessions?: AttendanceSession[];
  enrollments?: ClassEnrollment[];
  scheduleChanges?: ScheduleChange[];
  timetableSlots: TimetableSlot[];
  permissions: StaffPermissions;
  isOwner: boolean;
  searchQuery?: string;
  onAddClass: (c: ClassRoom) => void;
  onUpdateClass: (c: ClassRoom) => void;
  onDeleteClass: (id: string) => void;
  onReplaceClassSchedule: (classId: string, slots: TimetableSlot[]) => void;
  onCreateRoom: (room: Room) => void;
  onCreateProgram: (program: CourseProgram) => void;
  onCreateTeacher?: (teacher: Teacher) => void;
  onAddStudent?: (student: Student) => void;
  onUpdateStudent?: (student: Student) => void;
  editRequest?: ClassRoom | null;
  onEditRequestHandled?: () => void;
}

type ScheduleDraft = Pick<TimetableSlot, 'dayOfWeek' | 'startTime' | 'endTime'>;

const weekDays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

const sortSchedule = (slots: ScheduleDraft[]) => [...slots].sort((left, right) => (
  weekDays.indexOf(left.dayOfWeek) - weekDays.indexOf(right.dayOfWeek) || left.startTime.localeCompare(right.startTime)
));

const scheduleDescription = (slots: ScheduleDraft[]) => sortSchedule(slots)
  .map((slot) => `${slot.dayOfWeek}: ${slot.startTime}–${slot.endTime}`)
  .join(' · ');

const normaliseTime = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})\s*:\s*(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const ClassManager: React.FC<ClassManagerProps> = ({
  classes,
  teachers,
  rooms,
  programs,
  students,
  receipts,
  attendanceSessions = [],
  enrollments = [],
  scheduleChanges = [],
  timetableSlots,
  permissions,
  isOwner,
  searchQuery = '',
  onAddClass,
  onUpdateClass,
  onDeleteClass,
  onReplaceClassSchedule,
  onCreateRoom,
  onCreateProgram,
  onCreateTeacher,
  onAddStudent,
  onUpdateStudent,
  editRequest,
  onEditRequestHandled,
}) => {
  const { t, language } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  const [classToDelete, setClassToDelete] = useState<ClassRoom | null>(null);
  const [viewingClassStudents, setViewingClassStudents] = useState<ClassRoom | null>(null);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleDraft[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [programInput, setProgramInput] = useState('');
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [isProgramDropdownOpen, setIsProgramDropdownOpen] = useState(false);
  const [isQuickProgramOpen, setIsQuickProgramOpen] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [newProgramTuition, setNewProgramTuition] = useState<number | ''>('');
  const programDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isProgramDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (programDropdownRef.current && !programDropdownRef.current.contains(e.target as Node)) {
        setIsProgramDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProgramDropdownOpen]);

  const handleCreateQuickProgram = () => {
    if (!canCreateProgram) return;
    const trimmed = newProgramName.trim();
    if (!trimmed) return;
    const existing = programs.find(p => p.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (!selectedProgramIds.includes(existing.id)) {
        const next = [...selectedProgramIds, existing.id];
        setSelectedProgramIds(next);
        setProgramInput(next.map(id => programs.find(p => p.id === id)?.name || id).join(', '));
      }
    } else {
      const newProg: CourseProgram = {
        id: `PROG_${Date.now()}`,
        code: `CT-${String(programs.length + 1).padStart(3, '0')}`,
        name: trimmed,
        category: 'Khác',
        tuitionFee: Number(newProgramTuition) || 0,
        description: 'Tạo trực tiếp khi lập lớp học.',
      };
      onCreateProgram(newProg);
      const next = [...selectedProgramIds, newProg.id];
      setSelectedProgramIds(next);
      setProgramInput(next.map(id => (id === newProg.id ? newProg.name : programs.find(p => p.id === id)?.name || id)).join(', '));
    }
    setNewProgramName('');
    setNewProgramTuition('');
    setIsQuickProgramOpen(false);
  };
  const [isQuickRoomOpen, setIsQuickRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState(0);
  const [isQuickTeacherOpen, setIsQuickTeacherOpen] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherPhone, setNewTeacherPhone] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [isQuickStudentOpen, setIsQuickStudentOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentParent, setNewStudentParent] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');

  const canEdit = isOwner || academicPermission(permissions, 'classes', 'edit');
  const canAdd = isOwner || academicPermission(permissions, 'classes', 'add');
  const canDelete = isOwner || academicPermission(permissions, 'classes', 'delete');
  const canCreateProgram = isOwner || academicPermission(permissions, 'programs', 'add');
  const canCreateRoom = isOwner || academicPermission(permissions, 'rooms', 'add');
  const canCreateTeacher = isOwner || (permissions.teacher.add ?? permissions.teacher.edit) === true;

  useEffect(() => {
    if (!editRequest) return;
    handleOpenEdit(editRequest);
    onEditRequestHandled?.();
  }, [editRequest]);

  const handleOpenAdd = () => {
    if (!canAdd) return;
    setEditingClass({
      id: `CLASS_${crypto.randomUUID()}`,
      code: `LOP-0${classes.length + 1}`,
      name: '',
      programId: '',
      teacherId: '',
      roomId: '',
      scheduleTime: '',
      days: [],
      capacity: 0,
      studentIds: []
    });
    setScheduleEntries([]);
    setScheduleError(null);
    setProgramInput('');
    setIsQuickRoomOpen(false);
    setNewRoomName('');
    setNewRoomCapacity(0);
    setIsQuickTeacherOpen(false);
    setNewTeacherName('');
    setNewTeacherPhone('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (classroom: ClassRoom) => {
    if (!canEdit) return;
    const existingSlots = timetableSlots
      .filter((slot) => slot.classId === classroom.id)
      .map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }));
    const legacyRange = classroom.scheduleTime.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
    setEditingClass(classroom);
    setProgramInput(programs.find((program) => program.id === classroom.programId)?.name || '');
    setScheduleEntries(existingSlots.length ? existingSlots : classroom.days.map((dayOfWeek) => ({
      dayOfWeek,
      startTime: legacyRange?.[1] || '18:00',
      endTime: legacyRange?.[2] || '19:30',
    })));
    setScheduleError(null);
    setIsQuickRoomOpen(false);
    setNewRoomName('');
    setNewRoomCapacity(0);
    setIsQuickTeacherOpen(false);
    setNewTeacherName('');
    setNewTeacherPhone('');
    setIsModalOpen(true);
  };

  const handleCreateTeacher = () => {
    if (!canCreateTeacher) return;
    const trimmed = newTeacherName.trim();
    if (!trimmed) {
      setScheduleError('Vui lòng nhập tên giáo viên mới.');
      return;
    }
    const created: Teacher = {
      id: `TEA_${Date.now()}`,
      name: trimmed,
      phone: newTeacherPhone.trim() || 'Chưa cập nhật',
      email: `${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '') || 'giaovien'}@beezone.local`,
      address: '',
      specialty: 'Tiếng Anh',
      assignedClassIds: editingClass ? [editingClass.id] : [],
    };
    onCreateTeacher?.(created);
    setEditingClass((current) => current ? { ...current, teacherId: created.id } : current);
    setNewTeacherName('');
    setNewTeacherPhone('');
    setIsQuickTeacherOpen(false);
    setScheduleError(null);
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCreateStudentQuick = () => {
    if (!onAddStudent || (!isOwner && (!permissions.student.add || !permissions.student.edit))) return;
    if (!newStudentName.trim()) {
      showAlert('Vui lòng nhập họ tên học sinh');
      return;
    }
    const studentId = `ST_${Date.now()}`;
    const code = nextStudentCode(students);
    const newStudent: Student = {
      id: studentId,
      code,
      name: newStudentName.trim(),
      parentName: newStudentParent.trim(),
      parentPhone: newStudentPhone.trim(),
      phone: newStudentPhone.trim(),
      status: 'registered',
      classId: classes.some(item => item.id === editingClass?.id) ? editingClass!.id : '',
      additionalClassIds: [],
      enrollDate: centerDate(),
      programId: editingClass?.programId || '',
      address: '',
      email: '',
      school: '',
      gradeLevel: 'Khác',
      feeStatus: 'unpaid',
      gender: 'Chưa xác định',
      dob: '',
    };
    onAddStudent?.(newStudent);
    setSelectedStudentIds((prev) => [...prev, studentId]);
    setNewStudentName('');
    setNewStudentParent('');
    setNewStudentPhone('');
    setIsQuickStudentOpen(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if ((classes.some(item => item.id === editingClass?.id) ? !canEdit : !canAdd) || !editingClass || !editingClass.name.trim()) return;
    const courseError = validateCourse(editingClass);
    if (courseError) { setScheduleError(courseError); return; }
    if (!editingClass.code.trim() || classes.some(c => c.id !== editingClass.id && c.code.trim().toLowerCase() === editingClass.code.trim().toLowerCase())) { setScheduleError('Mã lớp không được bỏ trống hoặc trùng với lớp khác.'); return; }
    if (!Number.isInteger(editingClass.capacity) || editingClass.capacity < 0) { setScheduleError('Sĩ số tối đa phải là số nguyên không âm.'); return; }
    const room = rooms.find(r => r.id === editingClass.roomId);
    if (room?.status === 'maintenance') { setScheduleError('Phòng đang bảo trì. Hãy chọn phòng khác.'); return; }
    if (editingClass.capacity > 0 && students.filter(s => isStudentInClass(s, editingClass.id) && s.status === 'active').length > editingClass.capacity) { setScheduleError('Sĩ số tối đa thấp hơn số học viên đang học.'); return; }
    const normalisedEntries = scheduleEntries.map((entry) => ({
      ...entry,
      startTime: normaliseTime(entry.startTime),
      endTime: normaliseTime(entry.endTime),
    }));
    if (normalisedEntries.some((entry) => !entry.startTime || !entry.endTime || entry.startTime >= entry.endTime)) {
      setScheduleError('Mỗi buổi học cần nhập giờ dạng HH:MM và giờ kết thúc phải sau giờ bắt đầu.');
      return;
    }
    const validEntries = normalisedEntries as Array<ScheduleDraft & { startTime: string; endTime: string }>;
    if (validEntries.length && (!teachers.some(item => item.id === editingClass.teacherId) || !rooms.some(item => item.id === editingClass.roomId))) {
      setScheduleError('Có thể tạo lớp trước và để trống lịch. Khi xếp buổi học, hãy chọn giáo viên và phòng học.'); return;
    }
    const previousSlots = timetableSlots.filter(slot => slot.classId === editingClass.id);
    const candidateSlots = validEntries.map((entry, index) => ({ ...entry, id: previousSlots.find(slot => slot.dayOfWeek === entry.dayOfWeek)?.id || `draft-${index}`, classId: editingClass.id, teacherId: editingClass.teacherId, roomId: editingClass.roomId }));
    const datedError = validateRecurringChanges([...classes.filter(c => c.id !== editingClass.id), editingClass], [...timetableSlots.filter(slot => slot.classId !== editingClass.id), ...candidateSlots], scheduleChanges);
    if (datedError) { setScheduleError(datedError); return; }
    for (const entry of validEntries) {
      const conflict = findScheduleConflict(timetableSlots.filter(slot => slot.classId !== editingClass.id), { ...entry, id: 'draft', classId: editingClass.id, teacherId: editingClass.teacherId, roomId: editingClass.roomId });
      if (conflict) { setScheduleError(`Trùng giáo viên hoặc phòng với lớp ${classes.find(c => c.id === conflict.classId)?.name || conflict.classId} vào ${entry.dayOfWeek}.`); return; }
    }

    const programName = programInput.trim();
    const matchingProgram = programs.find((program) => (
      program.name.trim().toLocaleLowerCase('vi-VN') === programName.toLocaleLowerCase('vi-VN')
      || program.code.trim().toLocaleLowerCase('vi-VN') === programName.toLocaleLowerCase('vi-VN')
    ));
    const createdProgram = programName && !matchingProgram ? {
      id: `PROG_${Date.now()}`,
      code: `CT-${String(programs.length + 1).padStart(3, '0')}`,
      name: programName,
      category: 'Khác' as const,
      tuitionFee: 0,
      description: 'Tạo trực tiếp khi lập lớp học.',
    } : null;
    if (createdProgram && !canCreateProgram) { setScheduleError('Bạn chưa có quyền tạo chương trình học. Hãy chọn chương trình có sẵn.'); return; }
    const savedClass: ClassRoom = {
      ...editingClass,
      programId: matchingProgram?.id || createdProgram?.id || editingClass.programId,
      studentIds: selectedStudentIds,
      days: sortSchedule(validEntries).map((entry) => entry.dayOfWeek),
      scheduleTime: scheduleDescription(validEntries),
    };
    const previous = classes.find(c => c.id === savedClass.id);
    if (previous && students.some(student => isStudentInClass(student, savedClass.id)) &&
        (previous.programId !== savedClass.programId || previous.courseStatus !== savedClass.courseStatus) &&
        !isOwner && !permissions.student.edit) {
      setScheduleError('Cần thêm quyền sửa học viên để đổi chương trình hoặc trạng thái của lớp đang có học viên.');
      return;
    }
    if (createdProgram) onCreateProgram(createdProgram);

    if (onUpdateStudent && classes.some(item => item.id === savedClass.id)) {
      for (const st of students) {
        const shouldBeInClass = selectedStudentIds.includes(st.id);
        const isCurrentlyIn = isStudentInClass(st, savedClass.id);
        if (shouldBeInClass && !isCurrentlyIn) {
          const nextClassId = st.classId ? st.classId : savedClass.id;
          const nextAddIds = st.classId && st.classId !== savedClass.id
            ? [...(st.additionalClassIds || []), savedClass.id]
            : (st.additionalClassIds || []);
          onUpdateStudent({ ...st, classId: nextClassId, additionalClassIds: Array.from(new Set(nextAddIds)) });
        } else if (!shouldBeInClass && isCurrentlyIn) {
          if (st.classId === savedClass.id) {
            const nextClassId = st.additionalClassIds?.[0] || '';
            const nextAddIds = (st.additionalClassIds || []).slice(1);
            onUpdateStudent({ ...st, classId: nextClassId, additionalClassIds: nextAddIds });
          } else {
            const nextAddIds = (st.additionalClassIds || []).filter(id => id !== savedClass.id);
            onUpdateStudent({ ...st, additionalClassIds: nextAddIds });
          }
        }
      }
    }

    if (classes.some(c => c.id === savedClass.id)) {
      onUpdateClass(savedClass);
    } else {
      onAddClass(savedClass);
    }

    const existingSlots = timetableSlots.filter((slot) => slot.classId === savedClass.id);
    onReplaceClassSchedule(savedClass.id, sortSchedule(validEntries).map((entry, index) => ({
      id: existingSlots.find((slot) => slot.dayOfWeek === entry.dayOfWeek)?.id || `TT_${savedClass.id}_${Date.now()}_${index}`,
      classId: savedClass.id,
      teacherId: savedClass.teacherId,
      roomId: savedClass.roomId,
      ...entry,
    })));

    setIsModalOpen(false);
    setEditingClass(null);
    setScheduleEntries([]);
    setScheduleError(null);
    setProgramInput('');
    setIsQuickRoomOpen(false);
  };

  const toggleDay = (dayStr: string) => {
    setScheduleEntries((current) => current.some((entry) => entry.dayOfWeek === dayStr)
      ? current.filter((entry) => entry.dayOfWeek !== dayStr)
      : [...current, { dayOfWeek: dayStr, startTime: '18:00', endTime: '19:30' }]);
    setScheduleError(null);
  };

  const handleClassCodeChange = (code: string) => {
    if (!editingClass) return;
    setEditingClass({ ...editingClass, code });
  };

  const handleCreateRoom = () => {
    if ((!canEdit && !canAdd) || !canCreateRoom || !editingClass || !newRoomName.trim()) return;
    const existingRoom = rooms.find((room) => room.name.trim().toLocaleLowerCase('vi-VN') === newRoomName.trim().toLocaleLowerCase('vi-VN'));
    const room = existingRoom || {
      id: nextRoomId(rooms),
      name: newRoomName.trim(),
      capacity: Math.max(0, newRoomCapacity),
      status: 'available' as const,
      notes: 'Tạo nhanh khi lập lớp học.',
    };
    if (!existingRoom) onCreateRoom(room);
    setEditingClass({ ...editingClass, roomId: room.id });
    setNewRoomName('');
    setNewRoomCapacity(0);
    setIsQuickRoomOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-amber-600" />
            {t('class.title')} ({classes.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'vi' ? 'Danh sách các lớp học đang mở tại Trung tâm ngoại ngữ BeeZone' : 'Active class list at BeeZone Language Center'}
          </p>
        </div>

        {canAdd && (
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            {t('class.add_new')}
          </button>
        )}
      </div>

      <div className="stats-grid">
        <StatCard label="Tổng lớp mở" value={classes.length + ' lớp'} icon={BookOpen} />
        <StatCard label="Đã phân công giáo viên" value={classes.filter(c => c.teacherId).length + ' / ' + classes.length} icon={UserCheck} tone="emerald" />
        <StatCard label="Học viên theo lớp" value={classes.reduce((sum,c) => sum+students.filter(s => isStudentInClass(s, c.id)).length,0) + ' bạn'} icon={Users} tone="sky" />
        <StatCard label="Tổng sức chứa" value={classes.reduce((sum,c) => sum+(c.capacity || 0),0) + ' chỗ'} icon={DoorOpen} tone="violet" />
      </div>

      {/* Class Cards Grid */}
      <div className="entity-grid">
        {classes.filter(cls => matchesSearch(searchQuery, cls.name, cls.code)).map((cls) => {
          const teacher = teachers.find(t => t.id === cls.teacherId);
          const room = rooms.find(r => r.id === cls.roomId);
          const program = programs.find(p => p.id === cls.programId);
          const classSchedule = timetableSlots.filter((slot) => slot.classId === cls.id);
          const displaySchedule = classSchedule.length ? scheduleDescription(classSchedule) : (cls.scheduleTime || 'Chưa xếp lịch');
          const classStudents = students.filter(s => isStudentInClass(s, cls.id));
          const currentCount = classStudents.length;
          const capacityKnown = cls.capacity > 0;
          const percentFull = capacityKnown ? Math.round((currentCount / cls.capacity) * 100) : 0;

          return (
            <div
              key={cls.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-amber-50 text-amber-900 border border-amber-200/60">
                      {cls.code}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base mt-1.5 leading-snug">{cls.name}</h3>
                    <div className="text-xs text-amber-700 font-semibold mt-0.5 flex flex-wrap gap-1">
                      {(() => {
                        const pIds = classProgramIds(cls);
                        const names = pIds.map(id => programs.find(p => p.id === id)?.name || id).filter(Boolean);
                        return names.length > 0 ? (
                          names.map((pName, idx) => (
                            <span key={idx} className="bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 text-[11px] font-semibold">
                              {pName}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">Chưa chọn chương trình</span>
                        );
                      })()}
                    </div>
                  </div>

                  {(canEdit || canDelete) && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button hidden={!canEdit}
                        aria-label={`Sửa lớp ${cls.name}`}
                        onClick={() => {
                          handleOpenEdit(cls);
                        }}
                        className="icon-button p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                        title="Sửa"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button hidden={!canDelete}
                        aria-label={`Xóa lớp ${cls.name}`}
                        onClick={() => setClassToDelete(cls)}
                        className="icon-button p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>{t('class.teacher')} <strong>{teacher ? teacher.name : (language === 'vi' ? 'Chưa phân công' : 'Unassigned')}</strong></span>
                  </div>

                  <div className="flex items-center gap-2">
                    <DoorOpen className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    <span>{t('class.room')} <strong>{room ? room.name : (language === 'vi' ? 'Chưa xếp phòng' : 'Unassigned')}</strong></span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>{t('class.schedule_time')} <strong>{displaySchedule}</strong></span>
                  </div>
                </div>

                {/* Sĩ số Bar */}
                <div className="mt-3 rounded-xl bg-sky-50 p-3 text-xs text-sky-950">
                  <strong>{courseStatusLabels[cls.courseStatus || 'active']}</strong>
                  <div className="mt-1">{cls.startDate || 'Chưa đặt ngày khai giảng'} → {cls.endDate || 'Chưa đặt ngày kết thúc'}</div>
                  <div className="mt-1">Đã ghi nhận {attendanceSessions.filter(item => item.classId === cls.id).length}{cls.totalSessions ? ` / ${cls.totalSessions}` : ''} buổi · {enrollments.filter(item => item.classId === cls.id).length} hồ sơ đăng ký</div>
                  {cls.billingMode === 'session' && <div className="mt-1 font-semibold text-violet-700">Thu theo buổi · {cls.sessionRate?.toLocaleString('vi-VN')} đ/buổi · {absencePolicyLabels[cls.sessionAbsencePolicy || 'attended']}</div>}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
                    <span className="text-slate-600">{t('class.capacity')}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-900 font-bold">{currentCount} / {capacityKnown ? cls.capacity : (language === 'vi' ? 'Chưa cập nhật' : 'Unspecified')} {t('class.students')}</span>
                      {capacityKnown && (
                        <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded ${percentFull >= 90 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {percentFull}%
                        </span>
                      )}
                    </div>
                  </div>
                  {capacityKnown ? (
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          percentFull >= 90 ? 'bg-rose-600' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.min(percentFull, 100)}%` }}
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-700">Chưa có sức chứa trong file nguồn.</p>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 px-5 py-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">{language === 'vi' ? 'Cơ sở 01' : 'Campus 01'}</span>
                <button
                  onClick={() => setViewingClassStudents(cls)}
                  className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-600" /> {t('class.view_roster')} ({classStudents.length})
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* VIEW CLASS ROSTER MODAL */}
      {viewingClassStudents && (
        <DialogFrame label="Học viên trong lớp" onClose={() => setViewingClassStudents(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 relative max-h-[85vh] overflow-y-auto">
            <button aria-label="Đóng"
              onClick={() => setViewingClassStudents(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Danh Sách Học Sinh: {viewingClassStudents.name} ({viewingClassStudents.code})
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Lịch học: {(() => {
                const slots = timetableSlots.filter((slot) => slot.classId === viewingClassStudents.id);
                return slots.length ? scheduleDescription(slots) : viewingClassStudents.scheduleTime;
              })()}
            </p>

            <div className="divide-y divide-slate-100">
              {students.filter(s => isStudentInClass(s, viewingClassStudents.id)).length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Lớp học này hiện chưa có học sinh nào.
                </div>
              ) : (
                students
                  .filter(s => isStudentInClass(s, viewingClassStudents.id))
                  .map((st, idx) => {
                    const debt = debtBreakdown(receipts.filter((receipt) => receipt.studentId === st.id));
                    return (
                      <div key={st.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-400 w-5 text-center">{idx + 1}</span>
                          <TeacherAvatar teacher={st} className="h-8 w-8 text-[9px]" />
                          <div>
                            <div className="font-bold text-slate-900">{st.name}</div>
                            <div className="text-[10px] text-slate-500">{st.code} • Phụ huynh: {st.parentName} ({st.parentPhone})</div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            st.feeStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {debt.total > 0 ? 'Đóng thiếu' : st.feeStatus === 'paid' ? 'Đã đóng đủ' : 'Chưa đóng'}
                          </span>
                          {debt.monthly > 0 && <div className="mt-1 text-[10px] font-bold text-rose-700">Tháng: {debt.monthly.toLocaleString('vi-VN')} đ</div>}
                          {debt.course > 0 && <div className="mt-1 text-[10px] font-bold text-rose-700">Khóa: {debt.course.toLocaleString('vi-VN')} đ</div>}{debt.session > 0 && <div className="mt-1 text-[10px] font-bold text-rose-700">Buổi: {debt.session.toLocaleString('vi-VN')} đ</div>}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setViewingClassStudents(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </DialogFrame>
      )}

      {/* EDIT / ADD CLASS MODAL */}
      {isModalOpen && editingClass && (
        <DialogFrame label="Thông tin lớp học" onClose={() => {
                setIsModalOpen(false);
                setEditingClass(null);
                setScheduleEntries([]);
                setScheduleError(null);
                setProgramInput('');
                setIsQuickRoomOpen(false);
              }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-h-[90vh] max-w-lg w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative custom-scrollbar">
            <button aria-label="Đóng"
              onClick={() => {
                setIsModalOpen(false);
                setEditingClass(null);
                setScheduleEntries([]);
                setScheduleError(null);
                setProgramInput('');
                setIsQuickRoomOpen(false);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-600" />
              {classes.some(c => c.id === editingClass.id) ? 'Cập Nhật Lớp Học' : 'Tạo Lớp Học Mới'}
            </h3>

            <ConfirmedForm confirmWhen={classes.some(item => item.id === editingClass?.id)} entityLabel="lớp học" onSubmit={handleSave} className="space-y-3 text-xs">
              <fieldset className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                <legend className="px-1 font-bold text-sky-950">Đợt học</legend>
                <p className="mb-3 text-slate-600">Tạo lớp với mã mới cho mỗi đợt để giữ điểm, học phí và điểm danh của đợt trước.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>Ngày khai giảng<input aria-label="Ngày khai giảng" type="date" value={editingClass.startDate || ''} onChange={e => setEditingClass({ ...editingClass, startDate: e.target.value || undefined })} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                  <label>Ngày kết thúc<input aria-label="Ngày kết thúc" type="date" value={editingClass.endDate || ''} onChange={e => setEditingClass({ ...editingClass, endDate: e.target.value || undefined })} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                  <label>Số buổi dự kiến<input aria-label="Số buổi dự kiến" type="number" min="1" step="1" value={editingClass.totalSessions ?? ''} onChange={e => setEditingClass({ ...editingClass, totalSessions: e.target.value ? Number(e.target.value) : undefined })} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                  <label>Trạng thái đợt học<select aria-label="Trạng thái đợt học" value={editingClass.courseStatus || 'active'} onChange={e => setEditingClass({ ...editingClass, courseStatus: e.target.value as ClassRoom['courseStatus'] })} className="mt-1 w-full rounded-lg border border-slate-300 p-2">{Object.entries(courseStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                </div>
              </fieldset>
              <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <legend className="px-1 font-bold text-amber-950">Hình thức học phí</legend>
                <label className="block">Thu học phí theo<select aria-label="Hình thức học phí của lớp" value={editingClass.billingMode || 'course'} onChange={e => setEditingClass({ ...editingClass, billingMode: e.target.value as ClassRoom['billingMode'], sessionBillingStartDate: editingClass.sessionBillingStartDate || centerDate(), sessionAbsencePolicy: editingClass.sessionAbsencePolicy || 'attended' })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2"><option value="course">Theo khóa</option><option value="monthly">Theo tháng</option><option value="session">Theo buổi học</option></select></label>
                {editingClass.billingMode === 'session' && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>Đơn giá mỗi buổi (VNĐ)<input aria-label="Đơn giá mỗi buổi" type="number" min="1" step="1" required value={editingClass.sessionRate ?? ''} onChange={e => setEditingClass({ ...editingClass, sessionRate: e.target.value ? Number(e.target.value) : undefined })} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                  <label>Bắt đầu tính phí từ<input aria-label="Ngày bắt đầu tính phí theo buổi" type="date" required value={editingClass.sessionBillingStartDate || ''} onChange={e => setEditingClass({ ...editingClass, sessionBillingStartDate: e.target.value || undefined })} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                  <label className="sm:col-span-2">Quy tắc buổi vắng<select aria-label="Quy tắc tính phí buổi vắng" value={editingClass.sessionAbsencePolicy || 'attended'} onChange={e => setEditingClass({ ...editingClass, sessionAbsencePolicy: e.target.value as ClassRoom['sessionAbsencePolicy'] })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2">{Object.entries(absencePolicyLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <p className="text-xs text-slate-600 sm:col-span-2">Đơn giá được giữ theo buổi điểm danh mới. Các buổi cũ và phiếu đã lập giữ mức phí trước đó.</p>
                </div>}
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mã Lớp *</label>
                  <input
                    type="text"
                    value={editingClass.code}
                    onChange={(e) => handleClassCodeChange(e.target.value)}
                    list="class-code-options"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold font-mono text-amber-900"
                    placeholder="Chọn hoặc nhập mã mới"
                    required
                  />
                  <datalist id="class-code-options">
                    {classes.map((classroom) => <option key={classroom.id} value={classroom.code}>{classroom.name}</option>)}
                  </datalist>
                  <p className="mt-1 text-[10px] text-slate-500">Có thể chọn mã lớp có sẵn để sửa, hoặc gõ một mã mới để tạo lớp.</p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sức Chứa Tối Đa</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editingClass.capacity || ''}
                    onChange={(e) => setEditingClass({ ...editingClass, capacity: e.target.value === '' ? 0 : Number(e.target.value) })}
                    placeholder="VD: 20"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tên Lớp Học *</label>
                <input
                  type="text"
                  value={editingClass.name}
                  onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  required
                />
              </div>

              <div className="relative" ref={programDropdownRef}>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Chương Trình Học *</label>
                  {selectedProgramIds.length > 0 && (
                    <span className="text-[11px] font-bold text-amber-700">
                      Đã chọn {selectedProgramIds.length} chương trình
                    </span>
                  )}
                </div>

                {/* Display tags for already selected programs */}
                {selectedProgramIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedProgramIds.map((pId) => {
                      const p = programs.find((prog) => prog.id === pId);
                      return (
                        <span
                          key={pId}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold shadow-2xs"
                        >
                          <span>{p?.name || pId}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextIds = selectedProgramIds.filter((id) => id !== pId);
                              setSelectedProgramIds(nextIds);
                              setProgramInput(nextIds.map(id => programs.find(p => p.id === id)?.name || id).join(', '));
                            }}
                            className="text-amber-700 hover:text-amber-950 p-0.5 rounded-full"
                            title="Bỏ chọn chương trình này"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    value={programInput}
                    onChange={(e) => {
                      setProgramInput(e.target.value);
                      setIsProgramDropdownOpen(true);
                    }}
                    onFocus={() => setIsProgramDropdownOpen(true)}
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden text-xs"
                    placeholder={canCreateProgram ? 'Chọn chương trình đã import hoặc nhập mới' : 'Chọn chương trình có sẵn'}
                  />
                  <button
                    type="button"
                    onClick={() => setIsProgramDropdownOpen((prev) => !prev)}
                    className="absolute right-2 top-2 p-1 text-slate-400 hover:text-amber-700 transition cursor-pointer"
                    title="Sổ danh sách chương trình"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isProgramDropdownOpen ? 'rotate-180 text-amber-600' : ''
                      }`}
                    />
                  </button>
                </div>

                {/* Dropdown Menu with Checkboxes */}
                {isProgramDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 space-y-2 max-h-72 flex flex-col">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 pb-1 border-b border-slate-100">
                      <span>Tích chọn một hoặc nhiều chương trình cho lớp:</span>
                      {selectedProgramIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProgramIds([]);
                            setProgramInput('');
                          }}
                          className="text-rose-600 hover:underline"
                        >
                          Xóa chọn
                        </button>
                      )}
                    </div>

                    <div className="overflow-y-auto space-y-1 flex-1 pr-1 custom-scrollbar">
                      {programs.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">
                          Chưa có chương trình học nào trong hệ thống
                        </div>
                      ) : (
                        programs
                          .filter((p) => {
                            if (!programInput.trim()) return true;
                            const q = programInput.trim().toLowerCase();
                            return (
                              p.name.toLowerCase().includes(q) ||
                              p.code.toLowerCase().includes(q) ||
                              (p.category && p.category.toLowerCase().includes(q))
                            );
                          })
                          .map((prog) => {
                            const isChecked = selectedProgramIds.includes(prog.id);
                            return (
                              <label
                                key={prog.id}
                                className={`flex items-start gap-2.5 p-2 rounded-xl cursor-pointer transition text-xs ${
                                  isChecked
                                    ? 'bg-amber-50 border border-amber-200 text-amber-950 font-semibold'
                                    : 'hover:bg-slate-50 border border-transparent text-slate-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const nextIds = isChecked
                                      ? selectedProgramIds.filter((id) => id !== prog.id)
                                      : [...selectedProgramIds, prog.id];
                                    setSelectedProgramIds(nextIds);
                                    setProgramInput(
                                      nextIds.map((id) => programs.find((p) => p.id === id)?.name || id).join(', ')
                                    );
                                  }}
                                  className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold truncate">{prog.name}</span>
                                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                                      {prog.code}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                    {prog.tuitionFee > 0 && (
                                      <span className="text-emerald-700 font-bold">
                                        {prog.tuitionFee.toLocaleString('vi-VN')} đ
                                      </span>
                                    )}
                                    {prog.category && (
                                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                                        {prog.category}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </label>
                            );
                          })
                      )}
                    </div>

                    {/* Quick Create Program */}
                    {canCreateProgram && (
                      <div className="pt-2 border-t border-slate-100 shrink-0">
                        {!isQuickProgramOpen ? (
                          <button
                            type="button"
                            onClick={() => setIsQuickProgramOpen(true)}
                            className="w-full py-1.5 text-center text-xs font-bold text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" /> Tạo thêm chương trình mới...
                          </button>
                        ) : (
                          <div className="space-y-1.5 p-2 bg-amber-50/60 rounded-xl border border-amber-200">
                            <div className="text-[11px] font-bold text-amber-900">Tạo nhanh chương trình mới</div>
                            <input
                              type="text"
                              value={newProgramName}
                              onChange={(e) => setNewProgramName(e.target.value)}
                              placeholder="Tên chương trình (VD: Tiếng Anh Giao Tiếp)"
                              className="w-full px-2 py-1 text-xs border border-amber-200 rounded-lg bg-white"
                            />
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={handleCreateQuickProgram}
                                className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 cursor-pointer"
                              >
                                Tạo & Chọn
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsQuickProgramOpen(false)}
                                className="px-2 py-1 text-slate-600 hover:text-slate-800 text-xs cursor-pointer"
                              >
                                Hủy
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 shrink-0 text-xs">
                      <span className="text-[11px] text-slate-500 font-medium">
                        Đã chọn: <strong className="text-amber-700">{selectedProgramIds.length}</strong> chương trình
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsProgramDropdownOpen(false)}
                        className="px-3 py-1 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                      >
                        Xong
                      </button>
                    </div>
                  </div>
                )}
                <p className="mt-1 text-[10px] text-slate-500">
                  {canCreateProgram
                    ? 'Có thể tích chọn một hoặc nhiều chương trình học cho lớp, hoặc nhập tên mới.'
                    : 'Tích chọn chương trình học có sẵn trong danh mục.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giáo Viên Dạy</label>
                  <select
                    value={editingClass.teacherId}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsQuickTeacherOpen(true);
                      } else {
                        setEditingClass({ ...editingClass, teacherId: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="">-- Chọn giáo viên dạy --</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                    {canCreateTeacher && (
                      <option value="__NEW__">➕ Tạo thêm giáo viên mới...</option>
                    )}
                  </select>
                  {canCreateTeacher && (
                    <button
                      type="button"
                      onClick={() => setIsQuickTeacherOpen((open) => !open)}
                      className="mt-1.5 text-[11px] font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
                    >
                      + Tạo giáo viên mới
                    </button>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phòng Học</label>
                  <select
                    value={editingClass.roomId}
                    onChange={(e) => setEditingClass({ ...editingClass, roomId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="">-- Chọn phòng học --</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.capacity > 0 ? `(Sức chứa: ${r.capacity} chỗ)` : ''}
                      </option>
                    ))}
                  </select>
                  {canCreateRoom && <button type="button" onClick={() => setIsQuickRoomOpen((open) => !open)} className="mt-1.5 text-[11px] font-bold text-blue-700 hover:text-blue-900 cursor-pointer">+ Tạo phòng học mới</button>}
                  {(() => {
                    const currentRoom = rooms.find(r => r.id === editingClass.roomId);
                    if (currentRoom && currentRoom.capacity > 0 && editingClass.capacity > currentRoom.capacity) {
                      return (
                        <p className="mt-1 text-[10px] text-amber-700 font-medium">
                          ⚠️ Lưu ý: Sĩ số lớp ({editingClass.capacity}) lớn hơn sức chứa phòng ({currentRoom.capacity} chỗ).
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {canCreateTeacher && isQuickTeacherOpen && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="mb-2 text-xs font-bold text-amber-950">Tạo giáo viên mới</div>
                  <div className="grid grid-cols-1 min-[480px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                    <input
                      type="text"
                      value={newTeacherName}
                      onChange={(event) => setNewTeacherName(event.target.value)}
                      placeholder="Tên giáo viên (VD: Cô Lan, Thầy Alex)"
                      className="min-w-0 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={newTeacherPhone}
                      onChange={(event) => setNewTeacherPhone(event.target.value)}
                      placeholder="Số điện thoại / Chuyên môn"
                      className="min-w-0 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleCreateTeacher}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white hover:bg-amber-700 text-xs shrink-0 cursor-pointer"
                    >
                      Thêm
                    </button>
                  </div>
                </div>
              )}

              {canCreateRoom && isQuickRoomOpen && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <div className="mb-2 text-xs font-bold text-blue-900">Tạo phòng học mới</div>
                  <div className="grid grid-cols-1 min-[480px]:grid-cols-[minmax(0,1fr)_100px_auto] gap-2">
                    <input type="text" value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} placeholder="Tên phòng, ví dụ P02" className="min-w-0 rounded-lg border border-blue-200 bg-white px-2 py-1.5" />
                    <input type="number" min="0" value={newRoomCapacity} onChange={(event) => setNewRoomCapacity(Number(event.target.value))} placeholder="Sức chứa" className="min-w-0 rounded-lg border border-blue-200 bg-white px-2 py-1.5" />
                    <button type="button" onClick={handleCreateRoom} className="rounded-lg bg-blue-700 px-3 py-1.5 font-bold text-white hover:bg-blue-800">Thêm</button>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chọn Ngày Học</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {weekDays.map((day) => {
                    const isSelected = scheduleEntries.some((entry) => entry.dayOfWeek === day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {scheduleEntries.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-900"><CalendarDays className="h-4 w-4" /> Ca học theo từng buổi</div>
                  <div className="space-y-2">
                    {sortSchedule(scheduleEntries).map((entry) => (
                      <div key={entry.dayOfWeek} className="grid grid-cols-2 min-[480px]:grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2">
                        <span className="col-span-2 min-[480px]:col-span-1 font-semibold text-slate-700">{entry.dayOfWeek}</span>
                        <label className="relative">
                          <span className="sr-only">Giờ bắt đầu {entry.dayOfWeek}</span>
                          <input
                          type="text"
                          inputMode="numeric"
                          value={entry.startTime}
                          onChange={(event) => setScheduleEntries((current) => current.map((item) => item.dayOfWeek === entry.dayOfWeek ? { ...item, startTime: event.target.value } : item))}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-800"
                          aria-label={`Giờ bắt đầu ${entry.dayOfWeek}`}
                          placeholder="Từ 17:00"
                        />
                        </label>
                        <label className="relative">
                          <span className="sr-only">Giờ kết thúc {entry.dayOfWeek}</span>
                          <input
                          type="text"
                          inputMode="numeric"
                          value={entry.endTime}
                          onChange={(event) => setScheduleEntries((current) => current.map((item) => item.dayOfWeek === entry.dayOfWeek ? { ...item, endTime: event.target.value } : item))}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-800"
                          aria-label={`Giờ kết thúc ${entry.dayOfWeek}`}
                          placeholder="Đến 19:00"
                        />
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-slate-600">Tự gõ bất kỳ khung giờ nào theo dạng HH:MM, ví dụ Thứ 6: 17:00–19:00 và Chủ Nhật: 07:00–09:00. Lịch sẽ tự xuất hiện trong Thời khóa biểu.</p>
                </div>
              )}

              {/* DANH SÁCH HỌC VIÊN TRONG LỚP (TÍCH CHỌN) */}
              <fieldset className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <legend className="px-1 font-bold text-slate-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-600" />
                    <span>Học viên trong lớp ({selectedStudentIds.length}{editingClass.capacity > 0 ? ` / ${editingClass.capacity}` : ''})</span>
                  </legend>
                  {onAddStudent && (isOwner || (permissions.student.add && permissions.student.edit)) && (
                    <button
                      type="button"
                      onClick={() => setIsQuickStudentOpen((prev) => !prev)}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tạo học sinh mới
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 mb-2">
                  Tích chọn các học viên tham gia lớp này. Có thể tìm kiếm theo tên hoặc mã học sinh.
                </p>

                {/* Quick Student Create Form */}
                {isQuickStudentOpen && (
                  <div className="mb-3 p-3 bg-amber-50/80 rounded-xl border border-amber-200">
                    <div className="text-xs font-bold text-amber-950 mb-1.5">Thêm nhanh học sinh mới</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                      <input
                        type="text"
                        value={newStudentName}
                        onChange={(e) => setNewStudentName(e.target.value)}
                        placeholder="Họ tên học sinh *"
                        className="px-2 py-1.5 text-xs bg-white border border-amber-200 rounded-lg"
                      />
                      <input
                        type="text"
                        value={newStudentParent}
                        onChange={(e) => setNewStudentParent(e.target.value)}
                        placeholder="Tên phụ huynh"
                        className="px-2 py-1.5 text-xs bg-white border border-amber-200 rounded-lg"
                      />
                      <input
                        type="text"
                        value={newStudentPhone}
                        onChange={(e) => setNewStudentPhone(e.target.value)}
                        placeholder="Số điện thoại"
                        className="px-2 py-1.5 text-xs bg-white border border-amber-200 rounded-lg"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCreateStudentQuick}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 cursor-pointer"
                      >
                        Tạo & Thêm vào lớp
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsQuickStudentOpen(false)}
                        className="px-2 py-1.5 text-slate-600 text-xs cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}

                {/* Search Students */}
                <div className="relative mb-2">
                  <input
                    type="text"
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    placeholder="Tìm học sinh theo tên, mã HS hoặc số điện thoại..."
                    className="w-full px-3 py-1.5 pl-8 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  {studentSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStudentSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Student Checkbox List */}
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {students.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">Chưa có học sinh nào trong hệ thống</div>
                  ) : (
                    students
                      .filter((s) => {
                        if (!studentSearchQuery) return true;
                        const q = studentSearchQuery.toLowerCase();
                        return (
                          s.name.toLowerCase().includes(q) ||
                          s.code.toLowerCase().includes(q) ||
                          (s.phone && s.phone.toLowerCase().includes(q)) ||
                          (s.parentPhone && s.parentPhone.toLowerCase().includes(q))
                        );
                      })
                      .map((st) => {
                        const isChecked = selectedStudentIds.includes(st.id);
                        const otherClasses = classes.filter((c) => c.id !== editingClass.id && isStudentInClass(st, c.id));
                        return (
                          <label
                            key={st.id}
                            className={`flex items-center justify-between gap-2 p-2 rounded-lg cursor-pointer transition text-xs ${
                              isChecked
                                ? 'bg-amber-100/70 border border-amber-300/80 font-bold text-slate-900'
                                : 'hover:bg-slate-100/80 border border-transparent text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleStudent(st.id)}
                                className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer shrink-0"
                              />
                              <TeacherAvatar teacher={{ name: st.name, avatar: st.avatar }} className="w-6 h-6 rounded-full text-[10px] shrink-0" />
                              <div className="min-w-0 truncate">
                                <span className="font-semibold">{st.name}</span>
                                <span className="text-slate-400 font-mono text-[11px] ml-1.5">({st.code})</span>
                                {otherClasses.length > 0 && (
                                  <span className="text-[10px] text-slate-500 ml-1.5 truncate">
                                    • Lớp khác: {otherClasses.map((c) => c.name).join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5 text-[10px]">
                              <span
                                className={`px-1.5 py-0.5 rounded font-medium ${
                                  st.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {st.status === 'active' ? 'Đang học' : st.status === 'reserved' ? 'Bảo lưu' : st.status}
                              </span>
                            </div>
                          </label>
                        );
                      })
                  )}
                </div>
              </fieldset>

              {scheduleError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{scheduleError}</p>}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingClass(null);
                    setScheduleEntries([]);
                    setScheduleError(null);
                    setProgramInput('');
                    setIsQuickRoomOpen(false);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold hover:bg-amber-600 flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Save className="w-4 h-4 text-slate-950" /> Lưu Lớp Học
                </button>
              </div>
            </ConfirmedForm>
          </div>
        </DialogFrame>
      )}
      {/* CONFIRM DELETE CLASS MODAL */}
      <ConfirmModal
        isOpen={!!classToDelete}
        title="Xác nhận xóa lớp học"
        message={
          classToDelete ? (
            <>
              Bạn có chắc chắn muốn xóa lớp học <strong>{classToDelete.name}</strong> ({classToDelete.code})?
              <span className="block mt-2 text-xs text-slate-500">
                Thao tác này sẽ xóa lớp học khỏi danh sách. Lưu ý: Chỉ xóa được lớp chưa có lịch sử điểm, điểm danh hoặc phiếu thu.
              </span>
            </>
          ) : null
        }
        confirmText="Xác nhận xóa"
        cancelText="Hủy bỏ"
        variant="danger"
        onConfirm={() => {
          if (classToDelete) {
            onDeleteClass(classToDelete.id);
            setClassToDelete(null);
          }
        }}
        onClose={() => setClassToDelete(null)}
      />
    </div>
  );
};
