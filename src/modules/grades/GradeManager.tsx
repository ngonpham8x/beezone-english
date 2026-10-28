import {
  AlertCircle,
  Award,
  Calendar,
  FileText,
  LayoutGrid,
  PlusCircle,
  Share2,
  Table as TableIcon,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import { useResponsiveView } from '../../hooks/useResponsive';
import { isStudentInClass } from '../../lib/studentClasses';
import { classesVisibleToAccount, hasCenterWideClassScope, isTeachingRole } from '../../lib/accountScope';
import {
  CenterSettings,
  ClassRoom,
  CourseProgram,
  CustomGradeColumn,
  Grade,
  GradeSemester,
  StaffPermissions,
  Student,
  Teacher,
  UserAccount,
} from '../../types';
import { CustomColumnsModal } from './CustomColumnsModal';
import { ReportCardModal } from './ReportCardModal';
import { ShareReportCardModal } from './ShareReportCardModal';

interface GradeManagerProps {
  grades: Grade[];
  students: Student[];
  classes: ClassRoom[];
  permissions: StaffPermissions;
  isOwner: boolean;
  currentUser?: UserAccount;
  onUpdateGrade: (updatedGrade: Grade) => void;
  teachers?: Teacher[];
  programs?: CourseProgram[];
  settings?: CenterSettings;
}

const SEMESTER_CONFIG: Record<
  GradeSemester,
  {
    name: string;
    subLabel: string;
    gpaLabel: string;
    defaultUnits: { key: string; label: string }[];
  }
> = {
  GKI: {
    name: 'GKI',
    subLabel: 'Giữa Kỳ I',
    gpaLabel: 'ĐTBGKI',
    defaultUnits: [
      { key: 'unit1', label: 'UNIT 1' },
      { key: 'unit2', label: 'UNIT 2' },
      { key: 'unit3', label: 'UNIT 3' },
    ],
  },
  CKI: {
    name: 'CKI',
    subLabel: 'Cuối Kỳ I',
    gpaLabel: 'ĐTBCKI',
    defaultUnits: [
      { key: 'unit4', label: 'UNIT 4' },
      { key: 'unit5', label: 'UNIT 5' },
      { key: 'unit6', label: 'UNIT 6' },
    ],
  },
  GKII: {
    name: 'GKII',
    subLabel: 'Giữa Kỳ II',
    gpaLabel: 'ĐTBGKII',
    defaultUnits: [
      { key: 'unit7', label: 'UNIT 7' },
      { key: 'unit8', label: 'UNIT 8' },
      { key: 'unit9', label: 'UNIT 9' },
    ],
  },
  CKII: {
    name: 'CKII',
    subLabel: 'Cuối Kỳ II',
    gpaLabel: 'ĐTBCKII',
    defaultUnits: [
      { key: 'unit10', label: 'UNIT 10' },
      { key: 'unit11', label: 'UNIT 11' },
      { key: 'unit12', label: 'UNIT 12' },
    ],
  },
};

const QUICK_COMMENTS = [
  'Phát biểu tốt',
  'Ngoan, chú ý',
  'Cần tập trung',
  'Tiến bộ rõ',
  'Cần luyện nói',
  'Quên làm BTVN',
];

const CUSTOM_COLUMNS_STORAGE_KEY = 'beezone_custom_grade_columns';

export const GradeManager: React.FC<GradeManagerProps> = ({
  grades,
  students,
  classes,
  permissions,
  isOwner,
  currentUser,
  onUpdateGrade,
  teachers = [],
  programs = [],
  settings = {
    name: 'TRUNG TÂM NGOẠI NGỮ BEEZONE',
    slogan: 'Nâng tầm tri thức - Vươn tầm quốc tế',
    address: '111 Ngô Quyền, Long Hải, Long Hoa, Tây Ninh',
    phone: '0847563679',
    email: 'beezone.tayninh@gmail.com',
    adminReportEmail: '',
    autoEmailReport: false,
    autoBackup: false,
    sheetsConfig: { spreadsheetId: '', sheetName: '', autoSync: false, syncInterval: 'weekly', connected: false },
  },
}) => {
  const centerWideScope = isOwner || hasCenterWideClassScope(currentUser);
  const showPersonalInfo = !isTeachingRole(currentUser?.role);

  // Classes visible to account
  const permittedClasses = useMemo(() => {
    if (centerWideScope) return classes;
    if (!currentUser) return [];
    return classesVisibleToAccount(currentUser, classes, teachers);
  }, [classes, centerWideScope, currentUser, teachers]);

  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return centerWideScope ? 'all' : permittedClasses[0]?.id || 'all';
  });

  // Semester Selector State
  const [semester, setSemester] = useState<GradeSemester>('GKI');

  // Custom Columns State
  const [customColumns, setCustomColumns] = useState<CustomGradeColumn[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_COLUMNS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore JSON parse error
    }
    return settings.gradeColumns || [];
  });

  const [isCustomColumnsOpen, setIsCustomColumnsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportingStudent, setReportingStudent] = useState<Student | null>(null);
  const [sharingStudent, setSharingStudent] = useState<Student | null>(null);
  const [viewMode, setViewMode] = useResponsiveView('card', 'table');

  useEffect(() => {
    if (!centerWideScope && permittedClasses.length > 0 && selectedClassId !== 'all' && !permittedClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(permittedClasses[0].id);
    }
  }, [permittedClasses, centerWideScope, selectedClassId]);

  const canEdit = isOwner || permissions.grade.edit;

  const classStudents = students
    .flatMap((student) =>
      permittedClasses
        .filter((c) => isStudentInClass(student, c.id) && (selectedClassId === 'all' || c.id === selectedClassId))
        .map((c) => ({ ...student, classId: c.id, programId: c.programId })),
    )
    .filter((student) => student.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Active units for current semester and selected class
  const activeUnits = useMemo(() => {
    const config = SEMESTER_CONFIG[semester];
    const defaultUnits = config.defaultUnits.map((u) => ({ ...u, isCustom: false }));
    const filteredCustoms = customColumns
      .filter((col) => col.semester === semester && (!col.classId || col.classId === 'all' || selectedClassId === 'all' || col.classId === selectedClassId))
      .map((col) => ({ key: col.id, label: col.name, isCustom: true }));
    return [...defaultUnits, ...filteredCustoms];
  }, [semester, customColumns, selectedClassId]);

  // Handle adding custom column
  const handleAddCustomColumn = (col: { name: string; semester: GradeSemester; classId?: string }) => {
    const newCol: CustomGradeColumn = {
      id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: col.name,
      semester: col.semester,
      classId: col.classId,
      createdAt: new Date().toISOString(),
    };
    const updated = [...customColumns, newCol];
    setCustomColumns(updated);
    try {
      localStorage.setItem(CUSTOM_COLUMNS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Handle deleting custom column
  const handleDeleteCustomColumn = (id: string) => {
    const updated = customColumns.filter((c) => c.id !== id);
    setCustomColumns(updated);
    try {
      localStorage.setItem(CUSTOM_COLUMNS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Helper to get grade record for a student in selected semester
  const getGradeForStudent = (studentId: string, classId: string): { grade: Grade; hasSaved: boolean } => {
    const existing = grades.find(
      (g) => g.studentId === studentId && g.classId === classId && (g.semester || 'GKI') === semester,
    );
    if (existing) {
      return { grade: existing, hasSaved: true };
    }
    return {
      grade: {
        id: `GR_${studentId}_${classId}_${semester}`,
        studentId,
        classId,
        semester,
        listening: 0,
        speaking: 0,
        readingWriting: undefined,
        reading: 0,
        writing: 0,
        midterm: 0,
        finalExam: 0,
        attendance: 0,
        average: 0,
        unitScores: {},
        comment: '',
      },
      hasSaved: false,
    };
  };

  // Calculate Average GPA based on 3 exam columns (Listening, Speaking, Reading & Writing)
  const calculateSemesterGpa = (g: Grade): number => {
    const listening = Number(g.listening) || 0;
    const speaking = Number(g.speaking) || 0;
    const readingWriting =
      g.readingWriting !== undefined
        ? Number(g.readingWriting) || 0
        : ((Number(g.reading) || 0) + (Number(g.writing) || 0)) / 2;

    const gpa = (listening + speaking + readingWriting) / 3;
    return Math.round(gpa * 10) / 10;
  };

  // Change exam grade (listening, speaking, readingWriting)
  const handleGradeChange = (
    studentId: string,
    classId: string,
    field: 'listening' | 'speaking' | 'readingWriting',
    value: number,
  ) => {
    const student = students.find((s) => s.id === studentId);
    if (!canEdit || !student || !Number.isFinite(value) || !classStudents.some((s) => s.id === studentId && s.classId === classId)) {
      return;
    }

    const { grade: existing } = getGradeForStudent(studentId, classId);
    const clamped = Math.min(Math.max(value, 0), 10);

    const updated: Grade = {
      ...existing,
      semester,
      [field]: clamped,
    };

    // Keep legacy reading/writing in sync with readingWriting
    if (field === 'readingWriting') {
      updated.reading = clamped;
      updated.writing = clamped;
    }

    updated.average = calculateSemesterGpa(updated);
    onUpdateGrade(updated);
  };

  // Change Unit score
  const handleUnitScoreChange = (
    studentId: string,
    classId: string,
    unitKey: string,
    value: number,
  ) => {
    const student = students.find((s) => s.id === studentId);
    if (!canEdit || !student || !Number.isFinite(value) || !classStudents.some((s) => s.id === studentId && s.classId === classId)) {
      return;
    }

    const { grade: existing } = getGradeForStudent(studentId, classId);
    const clamped = Math.min(Math.max(value, 0), 10);

    const updated: Grade = {
      ...existing,
      semester,
      unitScores: {
        ...(existing.unitScores || {}),
        [unitKey]: clamped,
      },
    };
    onUpdateGrade(updated);
  };

  // Change comment
  const handleCommentChange = (studentId: string, classId: string, comment: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!canEdit || !student || !classStudents.some((s) => s.id === studentId && s.classId === classId)) {
      return;
    }

    const { grade: existing } = getGradeForStudent(studentId, classId);
    const updated: Grade = {
      ...existing,
      semester,
      comment,
    };
    onUpdateGrade(updated);
  };

  // Append quick comment chip
  const handleAddQuickComment = (studentId: string, classId: string, text: string) => {
    if (!canEdit) return;
    const { grade } = getGradeForStudent(studentId, classId);
    const current = (grade.comment || '').trim();
    const newComment = current ? `${current}. ${text}` : text;
    handleCommentChange(studentId, classId, newComment);
  };

  const currentConfig = SEMESTER_CONFIG[semester];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-600" />
            Bảng Điểm & Đánh Giá Kỹ Năng
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý điểm các UNIT, 3 cột điểm kỳ (Nghe, Nói, Đọc & Viết), tính ĐTB tự động và nhận xét học tập
          </p>
        </div>

        <div className="class-picker flex items-center gap-2">
          <ResponsiveSelect
            label="Lớp xem điểm"
            value={selectedClassId}
            onChange={setSelectedClassId}
            disabled={permittedClasses.length === 0}
            placeholder="Chưa có lớp được phân quyền"
            options={[
              ...(centerWideScope
                ? [{ value: 'all', label: 'Tất cả lớp học' }]
                : permittedClasses.length > 1
                ? [{ value: 'all', label: 'Tất cả lớp được phân công' }]
                : []),
              ...permittedClasses.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
      </div>

      {permittedClasses.length === 0 && (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Bạn chưa được phân quyền phụ trách lớp học nào để chấm điểm</h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Theo quy định phân quyền của Trung tâm Ngoại ngữ BeeZone, giáo viên chỉ có quyền xem và nhập điểm cho các lớp được Chủ trung tâm phân công. Vui lòng liên hệ Quản lý / Chủ trung tâm để được cấp quyền lớp học.
            </p>
          </div>
        </div>
      )}

      {/* SEMESTER PICKER BAR & ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
        {/* Semester Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 overflow-x-auto custom-scrollbar">
          {(['GKI', 'CKI', 'GKII', 'CKII'] as GradeSemester[]).map((semKey) => {
            const conf = SEMESTER_CONFIG[semKey];
            const isActive = semester === semKey;
            return (
              <button
                key={semKey}
                type="button"
                aria-label={`Chọn học kỳ ${semKey}`}
                onClick={() => setSemester(semKey)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-black shadow-sm ring-1 ring-amber-400'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-white/80'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isActive ? 'bg-slate-950 ring-2 ring-white/60' : 'bg-slate-400'
                  }`}
                />
                <span>{conf.name}</span>
                <span
                  className={`text-[10px] hidden sm:inline ${
                    isActive ? 'text-slate-900 font-bold' : 'text-slate-400'
                  }`}
                >
                  ({conf.subLabel})
                </span>
              </button>
            );
          })}
        </div>

        {/* View mode toggle & Add Custom Column button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsCustomColumnsOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-slate-800 hover:text-amber-700 border border-slate-200 hover:border-amber-400 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="Thêm các cột UNIT hoặc bài kiểm tra tùy chỉnh cho chương trình"
          >
            <PlusCircle className="w-4 h-4 text-amber-600" />
            <span>+ Thêm cột điểm</span>
          </button>

          {/* View mode toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              aria-pressed={viewMode === 'table'}
              onClick={() => setViewMode('table')}
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
              aria-pressed={viewMode === 'card'}
              onClick={() => setViewMode('card')}
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

          <span className="text-xs text-slate-500 font-medium ml-1">
            <strong className="text-slate-900 font-bold">{classStudents.length}</strong> học viên
          </span>
        </div>
      </div>

      {/* GRADE CONTENT: TABLE OR MOBILE CARDS */}
      {viewMode === 'table' ? (
        /* Gradebook Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <HorizontalScroll label="Điểm số" className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[1200px] text-left text-xs text-slate-700 border-collapse">
              <thead>
                {/* Main Header Row */}
                <tr className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold">
                  <th
                    rowSpan={2}
                    className="py-3.5 px-3 w-28 min-w-[112px] max-w-[112px] sticky left-0 bg-slate-800 z-20 whitespace-nowrap text-center align-middle"
                  >
                    MÃ HS
                  </th>
                  <th
                    rowSpan={2}
                    className="py-3.5 px-4 min-w-[170px] sticky left-28 bg-slate-800 z-20 border-r border-slate-700 shadow-r whitespace-nowrap align-middle"
                  >
                    HỌ VÀ TÊN
                  </th>

                  {/* UNIT COLUMNS HEADER */}
                  {activeUnits.map((u) => (
                    <th
                      key={u.key}
                      rowSpan={2}
                      className="py-3.5 px-2.5 text-center bg-slate-850 min-w-[76px] whitespace-nowrap align-middle border-r border-slate-700/60"
                      title={u.label}
                    >
                      <div className="font-extrabold text-amber-300">{u.label}</div>
                      {u.isCustom && <span className="text-[9px] text-amber-400/80 font-normal">(Tự tạo)</span>}
                    </th>
                  ))}

                  {/* 3 EXAM SKILLS HEADER (Listening, Speaking, Reading & Writing) */}
                  <th
                    colSpan={3}
                    className="py-2 px-3 text-center bg-indigo-950/80 text-indigo-200 border-r border-indigo-900/60 text-[11px] font-extrabold tracking-wider"
                  >
                    {semester} (3 CỘT ĐIỂM THI ĐÁNH GIÁ)
                  </th>

                  {/* GPA HEADER */}
                  <th
                    rowSpan={2}
                    className="py-3.5 px-3.5 text-center bg-amber-600 text-slate-950 font-black min-w-[90px] whitespace-nowrap align-middle border-r border-amber-700"
                  >
                    {currentConfig.gpaLabel}
                  </th>

                  {/* COMMENTS HEADER */}
                  <th
                    rowSpan={2}
                    className="py-3.5 px-3 text-left min-w-[280px] align-middle"
                  >
                    NHẬN XÉT QUÁ TRÌNH HỌC TẬP
                  </th>

                  {/* ACTIONS HEADER */}
                  <th
                    rowSpan={2}
                    className="py-3.5 px-3 text-center min-w-[170px] whitespace-nowrap align-middle"
                  >
                    HÀNH ĐỘNG
                  </th>
                </tr>

                {/* Sub-Header for Exam Skills */}
                <tr className="bg-slate-900 text-slate-300 uppercase text-[10px] font-bold">
                  <th className="py-2 px-2 text-center bg-slate-900/90 min-w-[92px] border-r border-slate-800">
                    Nghe (Listening)
                  </th>
                  <th className="py-2 px-2 text-center bg-slate-900/90 min-w-[92px] border-r border-slate-800">
                    Nói (Speaking)
                  </th>
                  <th className="py-2 px-2 text-center bg-slate-900/90 min-w-[120px] border-r border-indigo-900/60">
                    Đọc & Viết (Reading & Writing)
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 font-medium">
                {classStudents.map((st) => {
                  const { grade, hasSaved } = getGradeForStudent(st.id, st.classId);
                  const studentClass = classes.find((c) => c.id === st.classId);
                  const readingWritingVal =
                    hasSaved && grade.readingWriting !== undefined
                      ? grade.readingWriting
                      : hasSaved
                      ? ((grade.reading || 0) + (grade.writing || 0)) / 2
                      : '';

                  return (
                    <tr
                      key={`${st.id}:${st.classId}:${semester}`}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      {/* Mã HS */}
                      <td className="py-3 px-3 w-28 min-w-[112px] max-w-[112px] font-bold font-mono text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap text-center">
                        {st.code}
                      </td>

                      {/* Họ Và Tên */}
                      <td className="py-3 px-4 min-w-[170px] font-bold text-slate-900 sticky left-28 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 shadow-r whitespace-nowrap">
                        {st.name}
                        <div
                          className="max-w-[170px] truncate text-[10px] font-medium text-slate-500"
                          title={studentClass?.name}
                        >
                          {studentClass?.name}
                        </div>
                      </td>

                      {/* UNIT SCORES INPUTS */}
                      {activeUnits.map((u) => {
                        const unitVal = grade.unitScores?.[u.key];
                        return (
                          <td
                            key={u.key}
                            className="p-1.5 text-center bg-amber-50/20 border-r border-slate-200/60"
                          >
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="10"
                              aria-label={`${u.label} - ${st.code} - ${studentClass?.name || st.classId}`}
                              placeholder="—"
                              value={unitVal !== undefined ? unitVal : ''}
                              disabled={!canEdit}
                              onChange={(e) =>
                                handleUnitScoreChange(
                                  st.id,
                                  st.classId,
                                  u.key,
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="w-13 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                            />
                          </td>
                        );
                      })}

                      {/* Nghe (Listening) */}
                      <td className="p-1.5 text-center bg-indigo-50/30 border-r border-slate-200/60">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          aria-label={`Nghe - ${st.code} - ${studentClass?.name || st.classId}`}
                          placeholder="—"
                          value={hasSaved ? grade.listening : ''}
                          disabled={!canEdit}
                          onChange={(e) =>
                            handleGradeChange(
                              st.id,
                              st.classId,
                              'listening',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Nói (Speaking) */}
                      <td className="p-1.5 text-center bg-indigo-50/30 border-r border-slate-200/60">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          aria-label={`Nói - ${st.code} - ${studentClass?.name || st.classId}`}
                          placeholder="—"
                          value={hasSaved ? grade.speaking : ''}
                          disabled={!canEdit}
                          onChange={(e) =>
                            handleGradeChange(
                              st.id,
                              st.classId,
                              'speaking',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Đọc & Viết (Reading & Writing) */}
                      <td className="p-1.5 text-center bg-indigo-50/30 border-r border-slate-200/60">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          aria-label={`Đọc và Viết - ${st.code} - ${studentClass?.name || st.classId}`}
                          placeholder="—"
                          value={readingWritingVal}
                          disabled={!canEdit}
                          onChange={(e) =>
                            handleGradeChange(
                              st.id,
                              st.classId,
                              'readingWriting',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-16 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Điểm Trung Bình (ĐTB) */}
                      <td className="py-3 px-3 text-center bg-amber-50 font-black text-sm text-slate-950 border-r border-amber-200">
                        {hasSaved ? grade.average : '—'}
                      </td>

                      {/* Nhận xét quá trình học tập */}
                      <td className="p-2 min-w-[280px]">
                        <div className="space-y-1">
                          <input
                            type="text"
                            aria-label={`Nhận xét lực học - ${st.code} - ${studentClass?.name || st.classId}`}
                            placeholder="Nhập nhận xét lực học của bé, quá trình học tập..."
                            value={grade.comment || ''}
                            maxLength={2000}
                            disabled={!canEdit}
                            onChange={(e) => handleCommentChange(st.id, st.classId, e.target.value)}
                            className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white placeholder:text-slate-400 placeholder:italic"
                          />
                          {/* Quick suggestions */}
                          {canEdit && (
                            <div className="flex items-center gap-1 flex-wrap pt-0.5">
                              {QUICK_COMMENTS.slice(0, 4).map((cmt) => (
                                <button
                                  key={cmt}
                                  type="button"
                                  onClick={() => handleAddQuickComment(st.id, st.classId, cmt)}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 transition-colors cursor-pointer"
                                >
                                  +{cmt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Hành Động */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!hasSaved}
                            onClick={() => setReportingStudent(st)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 text-white rounded-lg text-[11px] font-bold hover:bg-slate-800 disabled:opacity-40 transition shadow-2xs cursor-pointer"
                            title={`Xem và In Phiếu Báo Điểm ${semester}`}
                          >
                            <FileText className="w-3.5 h-3.5 text-amber-400" />
                            Phiếu Điểm
                          </button>
                          <button
                            type="button"
                            disabled={!hasSaved}
                            onClick={() => setSharingStudent(st)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-[11px] font-bold transition shadow-2xs active:scale-95 cursor-pointer"
                            title={`Gửi kết quả ${semester} qua Zalo, tin nhắn`}
                          >
                            <Share2 className="w-3.5 h-3.5 text-white" />
                            Gửi
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </HorizontalScroll>
        </div>
      ) : (
        /* Mobile Card View */
        <div className="entity-grid">
          {classStudents.map((st) => {
            const { grade, hasSaved } = getGradeForStudent(st.id, st.classId);
            const studentClass = classes.find((c) => c.id === st.classId);
            const readingWritingVal =
              hasSaved && grade.readingWriting !== undefined
                ? grade.readingWriting
                : hasSaved
                ? ((grade.reading || 0) + (grade.writing || 0)) / 2
                : '';

            return (
              <div
                key={`${st.id}:${st.classId}:${semester}`}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-md transition-all space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                      {st.code}
                    </span>
                    <h4 className="font-extrabold text-slate-900 text-sm mt-1 truncate">{st.name}</h4>
                    <span className="text-[10px] text-slate-500 font-medium block truncate">
                      {studentClass?.name}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      {currentConfig.gpaLabel}
                    </span>
                    <span className="text-base font-black text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-lg border border-amber-300">
                      {hasSaved ? grade.average : '—'}
                    </span>
                  </div>
                </div>

                {/* UNIT SCORES GRID */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700">Điểm các UNIT (0 - 10):</span>
                    <span className="text-[10px] text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.2 rounded">
                      Học kỳ {semester}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 text-center">
                    {activeUnits.map((u) => {
                      const unitVal = grade.unitScores?.[u.key];
                      return (
                        <div key={u.key} className="bg-amber-50/40 p-1.5 rounded-lg border border-amber-200/60">
                          <span className="text-[10px] text-slate-600 font-bold block truncate" title={u.label}>
                            {u.label}
                          </span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="10"
                            aria-label={`${u.label} - ${st.code} - ${studentClass?.name || st.classId}`}
                            placeholder="—"
                            value={unitVal !== undefined ? unitVal : ''}
                            disabled={!canEdit}
                            onChange={(e) =>
                              handleUnitScoreChange(st.id, st.classId, u.key, parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded mt-0.5"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3 EXAM SKILLS SCORES */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    3 Cột điểm thi {semester} (0 - 10):
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-indigo-50/40 p-1.5 rounded-lg border border-indigo-200/60">
                      <span className="text-[10px] text-indigo-900 font-bold block">Nghe</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        aria-label={`Nghe - ${st.code} - ${studentClass?.name || st.classId}`}
                        placeholder="—"
                        value={hasSaved ? grade.listening : ''}
                        disabled={!canEdit}
                        onChange={(e) =>
                          handleGradeChange(st.id, st.classId, 'listening', parseFloat(e.target.value) || 0)
                        }
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded mt-0.5"
                      />
                    </div>

                    <div className="bg-indigo-50/40 p-1.5 rounded-lg border border-indigo-200/60">
                      <span className="text-[10px] text-indigo-900 font-bold block">Nói</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        aria-label={`Nói - ${st.code} - ${studentClass?.name || st.classId}`}
                        placeholder="—"
                        value={hasSaved ? grade.speaking : ''}
                        disabled={!canEdit}
                        onChange={(e) =>
                          handleGradeChange(st.id, st.classId, 'speaking', parseFloat(e.target.value) || 0)
                        }
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded mt-0.5"
                      />
                    </div>

                    <div className="bg-indigo-50/40 p-1.5 rounded-lg border border-indigo-200/60">
                      <span className="text-[10px] text-indigo-900 font-bold block">Đọc & Viết</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        aria-label={`Đọc và Viết - ${st.code} - ${studentClass?.name || st.classId}`}
                        placeholder="—"
                        value={readingWritingVal}
                        disabled={!canEdit}
                        onChange={(e) =>
                          handleGradeChange(st.id, st.classId, 'readingWriting', parseFloat(e.target.value) || 0)
                        }
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded mt-0.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Nhận xét quá trình học tập */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-800 uppercase block">
                    Nhận xét quá trình học tập:
                  </span>
                  <textarea
                    rows={2}
                    aria-label={`Nhận xét lực học - ${st.code} - ${studentClass?.name || st.classId}`}
                    placeholder="Nhập nhận xét lực học của bé, quá trình học tập..."
                    value={grade.comment || ''}
                    maxLength={2000}
                    disabled={!canEdit}
                    onChange={(e) => handleCommentChange(st.id, st.classId, e.target.value)}
                    className="w-full p-2 text-xs border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white placeholder:text-slate-400 resize-none leading-relaxed"
                  />
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                      {QUICK_COMMENTS.map((cmt) => (
                        <button
                          key={cmt}
                          type="button"
                          onClick={() => handleAddQuickComment(st.id, st.classId, cmt)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white hover:bg-amber-100 text-slate-600 hover:text-amber-900 border border-slate-200 transition-colors cursor-pointer"
                        >
                          +{cmt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!hasSaved}
                    onClick={() => setReportingStudent(st)}
                    className="flex-1 py-1.5 px-3 bg-slate-900 disabled:opacity-40 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>Phiếu Điểm</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasSaved}
                    onClick={() => setSharingStudent(st)}
                    className="flex-1 py-1.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 disabled:opacity-40 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                  >
                    <Share2 className="w-3.5 h-3.5 text-slate-950" />
                    <span>Gửi Phụ Huynh</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Quản lý Cột Điểm Tùy Chỉnh */}
      <CustomColumnsModal
        isOpen={isCustomColumnsOpen}
        onClose={() => setIsCustomColumnsOpen(false)}
        columns={customColumns}
        onAddColumn={handleAddCustomColumn}
        onDeleteColumn={handleDeleteCustomColumn}
        currentSemester={semester}
        classes={permittedClasses}
        selectedClassId={selectedClassId}
        canEdit={canEdit}
      />

      {/* Report Card Modal */}
      {reportingStudent && (
        <ReportCardModal
          student={reportingStudent}
          semester={semester}
          customUnits={activeUnits}
          grade={getGradeForStudent(reportingStudent.id, reportingStudent.classId).grade}
          classroom={classes.find((c) => c.id === reportingStudent.classId)}
          teacher={teachers.find(
            (t) => t.id === classes.find((c) => c.id === reportingStudent.classId)?.teacherId,
          )}
          program={programs.find((p) => p.id === reportingStudent.programId)}
          settings={settings}
          onClose={() => setReportingStudent(null)}
          onUpdateGrade={onUpdateGrade}
          showPersonalInfo={showPersonalInfo}
        />
      )}

      {/* Quick Share Report Card Modal */}
      {sharingStudent && (
        <ShareReportCardModal
          isOpen={Boolean(sharingStudent)}
          onClose={() => setSharingStudent(null)}
          student={sharingStudent}
          semester={semester}
          customUnits={activeUnits}
          grade={getGradeForStudent(sharingStudent.id, sharingStudent.classId).grade}
          classroom={classes.find((c) => c.id === sharingStudent.classId)}
          teacher={teachers.find(
            (t) => t.id === classes.find((c) => c.id === sharingStudent.classId)?.teacherId,
          )}
          program={programs.find((p) => p.id === sharingStudent.programId)}
          settings={settings}
          onUpdateGrade={onUpdateGrade}
          showPersonalInfo={showPersonalInfo}
          onPrintPdf={() => {
            setReportingStudent(sharingStudent);
            setSharingStudent(null);
          }}
        />
      )}
    </div>
  );
};
