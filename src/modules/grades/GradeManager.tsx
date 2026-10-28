import {
  AlertCircle,
  Award,
  ChevronDown,
  FileText,
  LayoutGrid,
  PlusCircle,
  Share2,
  Table as TableIcon,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import { useResponsiveView } from '../../hooks/useResponsive';
import { isStudentInClass } from '../../lib/studentClasses';
import { classesVisibleToAccount, hasCenterWideClassScope, isTeachingRole } from '../../lib/accountScope';
import {
  calculateSemesterAverage,
  customGradeColumnKind,
  customGradeColumnsForClass,
  gradeColumnIdsForClass,
  GRADE_SEMESTER_CONFIG,
  GRADE_SEMESTERS,
  normalizeCustomGradeColumns,
} from '../../lib/gradebook';
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
import { GradeCommentEditor } from './GradeCommentEditor';
import { GradeScoreInput } from './GradeScoreInput';
import { GradeYearSummaryView } from './GradeYearSummaryView';
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
  onUpdateGradeColumns?: (columns: CustomGradeColumn[]) => boolean;
  teachers?: Teacher[];
  programs?: CourseProgram[];
  settings?: CenterSettings;
}

const QUICK_COMMENTS = [
  'Phát biểu tốt',
  'Ngoan, chú ý',
  'Cần tập trung',
  'Tiến bộ rõ',
  'Cần luyện nói',
  'Quên làm BTVN',
];

export const GradeManager: React.FC<GradeManagerProps> = ({
  grades,
  students,
  classes,
  permissions,
  isOwner,
  currentUser,
  onUpdateGrade,
  onUpdateGradeColumns,
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
  const [showYearSummary, setShowYearSummary] = useState(false);
  const [isCustomColumnsOpen, setIsCustomColumnsOpen] = useState(false);

  const customColumns = useMemo(
    () => normalizeCustomGradeColumns(settings.gradeColumns),
    [settings.gradeColumns],
  );

  const [reportingStudent, setReportingStudent] = useState<Student | null>(null);
  const [sharingStudent, setSharingStudent] = useState<Student | null>(null);
  const [viewMode, setViewMode] = useResponsiveView('card', 'table');

  useEffect(() => {
    if (!centerWideScope && permittedClasses.length > 0 && selectedClassId !== 'all' && !permittedClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(permittedClasses[0].id);
    }
  }, [permittedClasses, centerWideScope, selectedClassId]);

  const canEdit = isOwner || permissions.grade.edit;
  const canManageColumns = Boolean(
    onUpdateGradeColumns &&
    (isOwner ||
      currentUser?.role === 'owner' ||
      currentUser?.role === 'admin' ||
      currentUser?.role === 'trainer' ||
      permissions.grade.edit) &&
    currentUser?.active !== false,
  );

  const classStudents = students
    .flatMap((student) =>
      permittedClasses
        .filter((c) => isStudentInClass(student, c.id) && (selectedClassId === 'all' || c.id === selectedClassId))
        .map((c) => ({ ...student, classId: c.id, programId: c.programId })),
    );

  const gradeUnitsForClass = useCallback((classId?: string) => {
    const config = GRADE_SEMESTER_CONFIG[semester];
    const defaultUnits = config.defaultUnits.map((u) => ({
      ...u,
      isCustom: false,
      kind: undefined as CustomGradeColumn['kind'],
    }));
    const selectedClass = classes.find((classroom) => classroom.id === classId);
    const filteredCustoms = customGradeColumnsForClass(customColumns, semester, selectedClass)
      .map((col) => ({ key: col.id, label: col.name, isCustom: true, kind: customGradeColumnKind(col) }));
    return [...defaultUnits, ...filteredCustoms];
  }, [semester, customColumns, classes]);

  // A mixed-program table shows only legacy global columns. If every visible
  // class uses one program, its program columns can safely share the table.
  const activeUnitClassId = useMemo(() => {
    if (selectedClassId !== 'all') return selectedClassId;
    const programIds = new Set(permittedClasses.map((classroom) => classroom.programId));
    return programIds.size === 1 ? permittedClasses[0]?.id : undefined;
  }, [permittedClasses, selectedClassId]);
  const activeUnits = useMemo(
    () => gradeUnitsForClass(activeUnitClassId),
    [activeUnitClassId, gradeUnitsForClass],
  );

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

    updated.average = calculateSemesterAverage(
      updated,
      gradeColumnIdsForClass(customColumns, semester, classes.find((item) => item.id === classId)),
    );
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
    updated.average = calculateSemesterAverage(
      updated,
      gradeColumnIdsForClass(customColumns, semester, classes.find((item) => item.id === classId)),
    );
    onUpdateGrade(updated);
  };

  const handleAddCustomColumns = (drafts: Array<{
    name: string;
    kind: 'unit' | 'assessment';
    semester: GradeSemester;
    programId: string;
  }>) => {
    if (!canManageColumns || !onUpdateGradeColumns) return false;
    const now = new Date().toISOString();
    const created = drafts.map((draft, index): CustomGradeColumn => ({
      ...draft,
      id: `col_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
    }));
    return onUpdateGradeColumns([...customColumns, ...created]);
  };

  const handleArchiveCustomColumn = (columnId: string) => {
    if (!canManageColumns || !onUpdateGradeColumns) return false;
    const archivedAt = new Date().toISOString();
    return onUpdateGradeColumns(customColumns.map((column) =>
      column.id === columnId ? { ...column, archivedAt } : column,
    ));
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

  const currentConfig = GRADE_SEMESTER_CONFIG[semester];

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
            Nhập/sửa trực tiếp điểm UNIT và 3 kỹ năng; hệ thống tự tính ĐTB, tổng kết năm và lưu nhận xét học tập
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
          {GRADE_SEMESTERS.map((semKey) => {
            const conf = GRADE_SEMESTER_CONFIG[semKey];
            const isActive = !showYearSummary && semester === semKey;
            return (
              <button
                key={semKey}
                type="button"
                aria-label={`Chọn học kỳ ${semKey}`}
                onClick={() => {
                  setSemester(semKey);
                  setShowYearSummary(false);
                }}
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
          <button
            type="button"
            aria-label="Xem tổng kết cuối năm"
            onClick={() => setShowYearSummary(true)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              showYearSummary
                ? 'bg-emerald-600 text-white font-black shadow-sm ring-1 ring-emerald-500'
                : 'text-slate-600 hover:text-slate-950 hover:bg-white/80'
            }`}
          >
            <Award className="h-4 w-4" />
            <span>TỔNG KẾT NĂM</span>
          </button>
        </div>

        {/* View mode toggle */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsCustomColumnsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-2xs transition hover:bg-amber-50 hover:border-amber-400 active:scale-95 cursor-pointer"
            title="Thêm hoặc xóa cột bài / điểm theo chương trình"
          >
            <PlusCircle className="h-4 w-4 text-amber-600" />
            <span>Thêm / xóa cột</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          {!showYearSummary && <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
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
          </div>}

          <span className="text-xs text-slate-500 font-medium ml-1">
            <strong className="text-slate-900 font-bold">{classStudents.length}</strong> học viên
          </span>
        </div>
      </div>

      {/* GRADE CONTENT: TABLE, MOBILE CARDS OR YEAR SUMMARY */}
      {showYearSummary ? (
        <GradeYearSummaryView students={classStudents} classes={classes} grades={grades} />
      ) : viewMode === 'table' ? (
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
                      title={`Nhập hoặc sửa điểm ${u.label}`}
                    >
                      <div className="font-extrabold text-amber-300">{u.label}</div>
                      {u.isCustom && <span className="text-[9px] text-amber-400/80 font-normal">({u.kind === 'assessment' ? 'Cột điểm' : 'Cột bài'})</span>}
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
                    <div className="mt-0.5 text-[8px] font-semibold normal-case">Kỹ năng + điểm UNIT/bài đã nhập</div>
                  </th>

                  {/* COMMENTS HEADER */}
                  <th
                    rowSpan={2}
                    className="py-3.5 px-3 text-left min-w-[420px] align-middle"
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
                            <GradeScoreInput
                              ariaLabel={`${u.label} - ${st.code} - ${studentClass?.name || st.classId}`}
                              value={unitVal}
                              disabled={!canEdit}
                              onCommit={(value) => handleUnitScoreChange(st.id, st.classId, u.key, value)}
                              className="w-13 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                            />
                          </td>
                        );
                      })}

                      {/* Nghe (Listening) */}
                      <td className="p-1.5 text-center bg-indigo-50/30 border-r border-slate-200/60">
                        <GradeScoreInput
                          ariaLabel={`Nghe - ${st.code} - ${studentClass?.name || st.classId}`}
                          value={hasSaved ? grade.listening : undefined}
                          disabled={!canEdit}
                          onCommit={(value) => handleGradeChange(st.id, st.classId, 'listening', value)}
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Nói (Speaking) */}
                      <td className="p-1.5 text-center bg-indigo-50/30 border-r border-slate-200/60">
                        <GradeScoreInput
                          ariaLabel={`Nói - ${st.code} - ${studentClass?.name || st.classId}`}
                          value={hasSaved ? grade.speaking : undefined}
                          disabled={!canEdit}
                          onCommit={(value) => handleGradeChange(st.id, st.classId, 'speaking', value)}
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Đọc & Viết (Reading & Writing) */}
                      <td className="p-1.5 text-center bg-indigo-50/30 border-r border-slate-200/60">
                        <GradeScoreInput
                          ariaLabel={`Đọc và Viết - ${st.code} - ${studentClass?.name || st.classId}`}
                          value={readingWritingVal === '' ? undefined : readingWritingVal}
                          disabled={!canEdit}
                          onCommit={(value) => handleGradeChange(st.id, st.classId, 'readingWriting', value)}
                          className="w-16 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Điểm Trung Bình (ĐTB) */}
                      <td className="py-3 px-3 text-center bg-amber-50 font-black text-sm text-slate-950 border-r border-amber-200">
                        {hasSaved ? grade.average : '—'}
                      </td>

                      {/* Nhận xét quá trình học tập */}
                      <td className="min-w-[420px] p-3 align-top">
                        <GradeCommentEditor
                          ariaLabel={`Nhận xét lực học - ${st.code} - ${studentClass?.name || st.classId}`}
                          value={grade.comment || ''}
                          canEdit={canEdit}
                          quickComments={QUICK_COMMENTS}
                          onSave={(comment) => handleCommentChange(st.id, st.classId, comment)}
                        />
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
                    <span className="text-[11px] font-bold text-slate-700">Nhập / sửa điểm các UNIT (0 - 10):</span>
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
                          {u.isCustom && <span className="block text-[8px] text-slate-400">{u.kind === 'assessment' ? 'Cột điểm' : 'Cột bài'}</span>}
                          <GradeScoreInput
                            ariaLabel={`${u.label} - ${st.code} - ${studentClass?.name || st.classId}`}
                            value={unitVal}
                            disabled={!canEdit}
                            onCommit={(value) => handleUnitScoreChange(st.id, st.classId, u.key, value)}
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
                      <GradeScoreInput
                        ariaLabel={`Nghe - ${st.code} - ${studentClass?.name || st.classId}`}
                        value={hasSaved ? grade.listening : undefined}
                        disabled={!canEdit}
                        onCommit={(value) => handleGradeChange(st.id, st.classId, 'listening', value)}
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded mt-0.5"
                      />
                    </div>

                    <div className="bg-indigo-50/40 p-1.5 rounded-lg border border-indigo-200/60">
                      <span className="text-[10px] text-indigo-900 font-bold block">Nói</span>
                      <GradeScoreInput
                        ariaLabel={`Nói - ${st.code} - ${studentClass?.name || st.classId}`}
                        value={hasSaved ? grade.speaking : undefined}
                        disabled={!canEdit}
                        onCommit={(value) => handleGradeChange(st.id, st.classId, 'speaking', value)}
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded mt-0.5"
                      />
                    </div>

                    <div className="bg-indigo-50/40 p-1.5 rounded-lg border border-indigo-200/60">
                      <span className="text-[10px] text-indigo-900 font-bold block">Đọc & Viết</span>
                      <GradeScoreInput
                        ariaLabel={`Đọc và Viết - ${st.code} - ${studentClass?.name || st.classId}`}
                        value={readingWritingVal === '' ? undefined : readingWritingVal}
                        disabled={!canEdit}
                        onCommit={(value) => handleGradeChange(st.id, st.classId, 'readingWriting', value)}
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded mt-0.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Nhận xét quá trình học tập */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-800 uppercase block">
                    Nhận xét quá trình học tập:
                  </span>
                  <GradeCommentEditor
                    ariaLabel={`Nhận xét lực học - ${st.code} - ${studentClass?.name || st.classId}`}
                    value={grade.comment || ''}
                    canEdit={canEdit}
                    quickComments={QUICK_COMMENTS}
                    onSave={(comment) => handleCommentChange(st.id, st.classId, comment)}
                  />
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

      <CustomColumnsModal
        isOpen={isCustomColumnsOpen}
        onClose={() => setIsCustomColumnsOpen(false)}
        columns={customColumns}
        onAddColumns={handleAddCustomColumns}
        onArchiveColumn={handleArchiveCustomColumn}
        currentSemester={semester}
        programs={programs}
        classes={classes}
        selectedClassId={selectedClassId}
        canEdit={canManageColumns}
      />

      {/* Report Card Modal */}
      {reportingStudent && (
        <ReportCardModal
          student={reportingStudent}
          semester={semester}
          customUnits={gradeUnitsForClass(reportingStudent.classId)}
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
          customUnits={gradeUnitsForClass(sharingStudent.classId)}
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
