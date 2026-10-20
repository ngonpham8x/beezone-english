import { isStudentInClass } from '../../lib/studentClasses';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CalendarCheck,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  History,
  LayoutGrid,
  Save,
  Table as TableIcon,
  Users,
  XCircle,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import { useResponsiveView } from '../../hooks/useResponsive';
import { centerDate, isCalendarDate } from '../../lib/dates';
import { lessonsOn } from '../../lib/operations';
import { snapshotForSession } from '../../lib/sessionBilling';
import type { ClassEnrollment, ScheduleChange, TimetableSlot } from '../../types';
import { AttendanceSession, AttendanceStatus, ClassRoom, Student, Teacher } from '../../types';
import type { TaskDestination } from '../dashboard/TodayTasks';
import { ParentContactButton, ParentContactDialog } from './ParentContactDialog';
import { canContactParent, retainContactHistory, splitAttendanceNote } from './parentContact';
import type { ParentContactRequest } from './parentContact';

import { UserAccount } from '../../types';
const EMPTY_ENROLLMENTS: ClassEnrollment[] = [];

interface AttendanceManagerProps {
  timetableSlots?: TimetableSlot[];
  scheduleChanges?: ScheduleChange[];
  enrollments?: ClassEnrollment[];
  request?: TaskDestination | null;
  onRequestHandled?: () => void;
  classes: ClassRoom[];
  students: Student[];
  teachers: Teacher[];
  attendanceSessions: AttendanceSession[];
  onSaveSession: (session: AttendanceSession) => boolean | void;
  onRecordParentContact?: (request: ParentContactRequest) => string | null;
  centerName?: string;
  isOwner: boolean;
  currentUser?: UserAccount;
}

export const AttendanceManager: React.FC<AttendanceManagerProps> = ({
  classes,
  students,
  teachers,
  attendanceSessions,
  onSaveSession,
  onRecordParentContact,
  centerName = 'BeeZone',
  isOwner,
  currentUser,
  timetableSlots, scheduleChanges = [], enrollments = EMPTY_ENROLLMENTS, request, onRequestHandled
}) => {
  // Determine classes the current teacher/staff is permitted to access
  const permittedClasses = useMemo(() => {
    if (isOwner) return classes;
    if (!currentUser) return [];

    const assignedIds = currentUser.permissions.assignedClassIds || [];
    const teacherId = currentUser.permissions.teacherId;

    const teacherProfile = teachers.find(
      t => (teacherId && t.id === teacherId) || (currentUser.email && t.email && t.email.toLowerCase() === currentUser.email.toLowerCase())
    );

    return classes.filter(c => {
      if (assignedIds.includes(c.id)) return true;
      if (teacherProfile && (c.teacherId === teacherProfile.id || teacherProfile.assignedClassIds?.includes(c.id))) return true;
      if (teacherId && c.teacherId === teacherId) return true;
      return false;
    });
  }, [classes, isOwner, currentUser, teachers]);
  const canSave = isOwner || Boolean(currentUser?.permissions.student.edit || currentUser?.permissions.teacher.edit);

  const [selectedClassId, setSelectedClassId] = useState<string>(() => permittedClasses[0]?.id || '');
  const [sessionDate, setSessionDate] = useState<string>(
    centerDate()
  );
  const [lessonTopic, setLessonTopic] = useState<string>('');
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [showTopicNote, setShowTopicNote] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [applyOldSessionBilling, setApplyOldSessionBilling] = useState(false);
  const [viewMode, setViewMode] = useResponsiveView('card', 'table');
  const [contactStudentId, setContactStudentId] = useState<string | null>(null);
  React.useEffect(() => setContactStudentId(null), [selectedClassId, sessionDate]);

  // Sync selected class if permitted classes changes
  React.useEffect(() => {
    if (!permittedClasses.some(c => c.id === selectedClassId)) {
      setSelectedClassId(permittedClasses[0]?.id || '');
    }
  }, [permittedClasses, selectedClassId]);

  const selectedClass = useMemo(
    () => permittedClasses.find(c => c.id === selectedClassId),
    [permittedClasses, selectedClassId]
  );

  // Existing session for this class on this date if any
  const existingSession = useMemo(
    () => attendanceSessions.find(
      s => s.classId === selectedClassId && s.date === sessionDate
    ),
    [attendanceSessions, selectedClassId, sessionDate]
  );

  // Filter students for attendance:
  // ACTIVE students are always included.
  // Reserved / Dropped / Leads are excluded from daily attendance, UNLESS they were already recorded in a past session.
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    const recordedIds = existingSession ? existingSession.entries.map(e => e.studentId) : [];
    return students.filter(s => {
      if (recordedIds.includes(s.id)) return true;
      const history = enrollments.filter(item => item.studentId === s.id && item.classId === selectedClassId);
      if (history.length) return history.some(item => item.status !== 'reserved' && (!item.startDate || sessionDate >= item.startDate) && (item.endDate ? (item.status === 'transferred' || item.status === 'dropped' ? sessionDate < item.endDate : sessionDate <= item.endDate) : item.status === 'active'));
      if (!isStudentInClass(s, selectedClassId)) return false;
      if (s.status === 'active') return true;
      if (recordedIds.includes(s.id)) return true;
      return false;
    });
  }, [students, selectedClassId, existingSession, enrollments, sessionDate]);

  const teacher = useMemo(
    () => teachers.find(t => t.id === selectedClass?.teacherId),
    [teachers, selectedClass]
  );
  const datedLesson = timetableSlots ? lessonsOn(sessionDate, classes, timetableSlots, scheduleChanges).find(item => item.classId === selectedClassId) : undefined;
  const hasSchedule = timetableSlots?.some(slot => slot.classId === selectedClassId) || scheduleChanges.some(c => c.classId === selectedClassId);
  const noLesson = Boolean(hasSchedule && !datedLesson && !existingSession);
  React.useEffect(() => {
    if (!request?.classId) return;
    if (permittedClasses.some(c => c.id === request.classId)) {
      setSelectedClassId(request.classId); if (request.date) setSessionDate(request.date);
    }
    onRequestHandled?.();
  }, [request, permittedClasses, onRequestHandled]);

  // Working entries state
  const [entries, setEntries] = useState<
    Record<string, { status: AttendanceStatus; homeworkCompleted: boolean; note: string }>
  >({});

  // Sync entries when class or date changes
  React.useEffect(() => {
    setApplyOldSessionBilling(false);
    if (existingSession) {
      setLessonTopic(existingSession.lessonTopic || '');
      setGeneralNotes(existingSession.generalNotes || '');
      const map: Record<string, { status: AttendanceStatus; homeworkCompleted: boolean; note: string }> = {};
      classStudents.forEach(st => {
        const found = existingSession.entries.find(e => e.studentId === st.id);
        map[st.id] = {
          status: found?.status || 'present',
          homeworkCompleted: found?.homeworkCompleted ?? true,
          note: found?.note || ''
        };
      });
      setEntries(map);
    } else {
      setLessonTopic('');
      setGeneralNotes('');
      const map: Record<string, { status: AttendanceStatus; homeworkCompleted: boolean; note: string }> = {};
      classStudents.forEach(st => {
        map[st.id] = {
          status: 'present',
          homeworkCompleted: true,
          note: ''
        };
      });
      setEntries(map);
    }
  }, [existingSession, selectedClassId, sessionDate, classStudents]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setEntries(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status
      }
    }));
  };

  const handleHomeworkChange = (studentId: string, homeworkCompleted: boolean) => {
    setEntries(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        homeworkCompleted
      }
    }));
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setEntries(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        note: retainContactHistory(note, prev[studentId]?.note)
      }
    }));
  };

  const hasUnsavedChanges = !existingSession || applyOldSessionBilling ||
    (lessonTopic.trim() || 'Buổi học theo thời khóa biểu') !== (existingSession.lessonTopic || 'Buổi học theo thời khóa biểu') ||
    generalNotes.trim() !== (existingSession.generalNotes || '').trim() ||
    classStudents.some(student => {
      const draft = entries[student.id];
      const saved = existingSession.entries.find(entry => entry.studentId === student.id);
      return !draft || !saved || draft.status !== saved.status || draft.homeworkCompleted !== (saved.homeworkCompleted ?? true) || draft.note !== (saved.note || '');
    });
  const contactReason = !canContactParent(currentUser, selectedClass) ? 'Bạn không có quyền ghi nhận liên hệ cho lớp này.' :
    !isCalendarDate(sessionDate) || sessionDate > centerDate() ? 'Chỉ báo vắng cho buổi học đã diễn ra.' :
    hasUnsavedChanges ? 'Lưu điểm danh trước khi báo phụ huynh.' : '';
  const contactReady = !contactReason;
  const contactStudent = classStudents.find(student => student.id === contactStudentId);
  const parentContactButton = (student: Student) => onRecordParentContact && <ParentContactButton
    studentName={student.name} absent={entries[student.id]?.status === 'absent'}
    note={existingSession?.entries.find(entry => entry.studentId === student.id)?.note}
    ready={contactReady && existingSession?.entries.find(entry => entry.studentId === student.id)?.status === 'absent'}
    reason={contactReason || 'Lưu điểm danh trước khi báo phụ huynh.'}
    onOpen={() => setContactStudentId(student.id)}
  />;

  const handleMarkAllPresent = () => {
    const updated: typeof entries = {};
    classStudents.forEach(st => {
      updated[st.id] = {
        ...entries[st.id],
        status: 'present'
      };
    });
    setEntries(updated);
    setStatusMessage('Đã đánh dấu tất cả học viên có mặt!');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSave = () => {
    if (!canSave || !selectedClass || !sessionDate) return;
    if (selectedClass.billingMode === 'session' && sessionDate > centerDate()) { setStatusMessage('Chỉ ghi nhận học phí cho buổi đã tổ chức; ngày điểm danh không được ở tương lai.'); return; }
    if (noLesson) { setStatusMessage('Ngày này không có buổi học theo lịch thực tế. Kiểm tra lịch nghỉ hoặc học bù.'); return; }

    const sessionData: AttendanceSession = {
      id: existingSession ? existingSession.id : `ATT_${Date.now()}`,
      classId: selectedClassId,
      date: sessionDate,
      lessonTopic: lessonTopic.trim() || 'Buổi học theo thời khóa biểu',
      teacherId: existingSession?.teacherId || datedLesson?.teacherId || selectedClass?.teacherId,
      billing: snapshotForSession(selectedClass, sessionDate, applyOldSessionBilling ? undefined : existingSession),
      generalNotes: generalNotes.trim(),
      entries: [...(existingSession?.entries || []).filter(entry => !classStudents.some(st => st.id === entry.studentId)), ...classStudents.map(st => ({
        studentId: st.id,
        status: entries[st.id]?.status || 'present',
        homeworkCompleted: entries[st.id]?.homeworkCompleted ?? true,
        note: entries[st.id]?.note || ''
      }))]
    };

    if (onSaveSession(sessionData) === false) return;
    setStatusMessage('✅ Đã lưu kết quả điểm danh thành công!');
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Stats
  const totalStudents = classStudents.length;
  const entriesList = Object.values(entries) as Array<{ status: AttendanceStatus; homeworkCompleted: boolean; note: string }>;
  const presentCount = entriesList.filter(e => e.status === 'present').length;
  const lateCount = entriesList.filter(e => e.status === 'late').length;
  const excusedCount = entriesList.filter(e => e.status === 'excused').length;
  const absentCount = entriesList.filter(e => e.status === 'absent').length;
  const attendanceRate = totalStudents > 0
    ? Math.round(((presentCount + lateCount) / totalStudents) * 100)
    : 0;

  // Class session history
  const classHistory = useMemo(
    () => attendanceSessions
      .filter(s => isStudentInClass(s, selectedClassId))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [attendanceSessions, selectedClassId]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 sm:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-72">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 shrink-0" />
              Điểm Danh & Nhận Xét Buổi Học
            </h2>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Theo dõi sĩ số chuyên cần, làm bài tập về nhà và nhận xét thái độ học tập từng buổi
            </p>
          </div>

          <div className="attendance-filters">
            <ResponsiveSelect label="Lớp điểm danh" value={selectedClassId} onChange={setSelectedClassId}
              icon={BookOpen} disabled={permittedClasses.length === 0} placeholder="Chưa có lớp được phân quyền"
              options={permittedClasses.map(c => ({ value: c.id, label: c.name }))} />

            <input
              aria-label="Ngày điểm danh"
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              className="filter-control filter-control--date"
            />
          </div>
        </div>

        {/* Quick Class Summary & Topic Toggle */}
        {selectedClass && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
              <span>
                Lớp: <strong className="text-slate-900 font-bold">{selectedClass.name.replace(/\s*\([^)]*\)/g, '').trim()}</strong>
              </span>
              <span>
                GV: <strong className="text-indigo-700 font-bold">{teacher?.name || 'Chưa phân công'}</strong>
              </span>
              <span className="text-slate-500">
                Lịch: <strong className="text-slate-700 font-semibold">{selectedClass.scheduleTime || 'N/A'}</strong>
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowTopicNote(prev => !prev)}
              className="text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200/80 transition flex items-center gap-1 active:scale-95"
            >
              <FileText className="w-3.5 h-3.5 text-amber-700" />
              <span>{showTopicNote ? 'Thu gọn bài học & ghi chú' : (lessonTopic || generalNotes ? '✏️ Đã có chủ đề/ghi chú' : '+ Chủ đề bài học & ghi chú')}</span>
              {showTopicNote ? <ChevronUp className="w-3.5 h-3.5 text-amber-700" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-700" />}
            </button>
          </div>
        )}

        {/* Topic & Notes Panel */}
        {showTopicNote && (
          <div className="pt-2 border-t border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200 animate-in fade-in duration-200">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Chủ đề bài học / Giáo trình hôm nay:
              </label>
              <input
                type="text"
                placeholder="VD: Unit 4: Speaking Practice & Flashcards..."
                value={lessonTopic}
                onChange={e => setLessonTopic(e.target.value)}
                className="w-full text-xs font-medium px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Ghi chú chung cả lớp:
              </label>
              <input
                type="text"
                placeholder="VD: Lớp học sôi nổi, các con tiếp thu tốt..."
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                className="w-full text-xs font-medium px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
              />
            </div>
          </div>
        )}
      </div>

      {permittedClasses.length === 0 && (
        <div className="p-4 sm:p-6 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Bạn chưa được phân quyền phụ trách lớp học nào để điểm danh</h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Theo quy định phân quyền của Trung tâm Ngoại ngữ BeeZone, giáo viên chỉ có quyền điểm danh các lớp được Chủ trung tâm phân công phụ trách. Vui lòng liên hệ Quản lý / Chủ trung tâm để được kích hoạt quyền lớp học.
            </p>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {statusMessage}
        </div>
      )}

      {/* Attendance Stats Cards - Responsive 3-col on mobile, 6-col on desktop */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
        <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 text-center shadow-xs">
          <p className="text-[10px] sm:text-[11px] font-bold text-slate-500">Sĩ Số</p>
          <p className="text-base sm:text-xl font-extrabold text-slate-900 mt-0.5 sm:mt-1">{totalStudents}</p>
        </div>
        <div className="bg-emerald-50 p-2.5 sm:p-3 rounded-xl border border-emerald-200 text-center shadow-xs">
          <p className="text-[10px] sm:text-[11px] font-bold text-emerald-700">Có Mặt</p>
          <p className="text-base sm:text-xl font-extrabold text-emerald-800 mt-0.5 sm:mt-1">{presentCount}</p>
        </div>
        <div className="bg-amber-50 p-2.5 sm:p-3 rounded-xl border border-amber-200 text-center shadow-xs">
          <p className="text-[10px] sm:text-[11px] font-bold text-amber-700">Đi Muộn</p>
          <p className="text-base sm:text-xl font-extrabold text-amber-800 mt-0.5 sm:mt-1">{lateCount}</p>
        </div>
        <div className="bg-blue-50 p-2.5 sm:p-3 rounded-xl border border-blue-200 text-center shadow-xs">
          <p className="text-[10px] sm:text-[11px] font-bold text-blue-700">Có Phép</p>
          <p className="text-base sm:text-xl font-extrabold text-blue-800 mt-0.5 sm:mt-1">{excusedCount}</p>
        </div>
        <div className="bg-red-50 p-2.5 sm:p-3 rounded-xl border border-red-200 text-center shadow-xs">
          <p className="text-[10px] sm:text-[11px] font-bold text-red-700">Vắng Mặt</p>
          <p className="text-base sm:text-xl font-extrabold text-red-800 mt-0.5 sm:mt-1">{absentCount}</p>
        </div>
        <div className="bg-indigo-50 p-2.5 sm:p-3 rounded-xl border border-indigo-200 text-center shadow-xs">
          <p className="text-[10px] sm:text-[11px] font-bold text-indigo-700">Tỷ Lệ Đến Lớp</p>
          <p className="text-base sm:text-xl font-extrabold text-indigo-900 mt-0.5 sm:mt-1">{attendanceRate}%</p>
        </div>
      </div>

      {/* Actions & View Switcher Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Left: Quick actions */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleMarkAllPresent}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer"
          >
            <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Tất Cả Có Mặt</span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
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
          </div>
        </div>

        {/* Right: Scroll helper for Table view or Save button */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || !selectedClass}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition shadow-sm active:scale-95 cursor-pointer"
          >
            <Save className="w-4 h-4 shrink-0" />
            <span>Lưu Điểm Danh</span>
          </button>
        </div>
      </div>

      {/* ATTENDANCE CONTENT: CARD OR TABLE VIEW */}
      {selectedClass?.billingMode === 'session' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Lớp thu học phí theo buổi. Khi lưu điểm danh, hệ thống ghi nhận buổi phải thu theo quy tắc của lớp; thu tiền tại mục Học phí. Buổi cũ chưa áp dụng hình thức này giữ nguyên.</p>}
      {isOwner && existingSession && !existingSession.billing && selectedClass?.billingMode === 'session' && sessionDate >= (selectedClass.sessionBillingStartDate || '9999') && <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white p-3 text-sm"><input type="checkbox" checked={applyOldSessionBilling} onChange={e => setApplyOldSessionBilling(e.target.checked)} />Ghi nhận học phí cho buổi cũ này theo đơn giá hiện tại</label>}
      {viewMode === 'card' ? (
        /* Attendance Roster - Responsive Mobile Card View */
        <div className="space-y-3">
          {classStudents.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Lớp này hiện chưa có học viên nào.
            </div>
          ) : (
            <div className="grid grid-cols-1 @min-[640px]:grid-cols-2 @min-[1050px]:grid-cols-3 gap-3">
              {classStudents.map((st, index) => {
                const entry = entries[st.id] || {
                  status: 'present',
                  homeworkCompleted: true,
                  note: ''
                };

                const quickNotes = ['Phát biểu tốt', 'Ngoan, chú ý', 'Cần tập trung', 'Quên làm BTVN', 'Tiến bộ rõ'];

                return (
                  <div
                    key={st.id}
                    className={`bg-white p-3.5 rounded-2xl border shadow-2xs space-y-3 transition-all ${
                      entry.status === 'present'
                        ? 'border-emerald-200/90'
                        : entry.status === 'late'
                        ? 'border-amber-200/90'
                        : entry.status === 'excused'
                        ? 'border-blue-200/90'
                        : 'border-red-200/90'
                    }`}
                  >
                    {/* Header: STT, Mã, Tên, BTVN */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="font-mono text-[11px] font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50 shrink-0">
                            {st.code}
                          </span>
                        </div>
                        <span className="mt-1 block break-words font-extrabold text-sm text-slate-900">
                          {st.name}
                        </span>
                      </div>

                      <label className="flex items-center gap-1.5 cursor-pointer shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                        <input
                          type="checkbox"
                          checked={entry.homeworkCompleted}
                          onChange={e => handleHomeworkChange(st.id, e.target.checked)}
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                        />
                        <span className={`text-[11px] font-bold ${entry.homeworkCompleted ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {entry.homeworkCompleted ? 'BTVN: Có' : 'BTVN: Chưa'}
                        </span>
                      </label>
                    </div>

                    {/* 4-way Status Selector with touch-friendly pills */}
                    <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(st.id, 'present')}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                          entry.status === 'present'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Có mặt</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(st.id, 'late')}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                          entry.status === 'late'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>Muộn</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(st.id, 'excused')}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                          entry.status === 'excused'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Phép</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(st.id, 'absent')}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                          entry.status === 'absent'
                            ? 'bg-red-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Vắng</span>
                      </button>
                    </div>

                    {/* Student Note Input & Quick Chips */}
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        placeholder="Nhập nhận xét buổi học..."
                        value={splitAttendanceNote(entry.note).text}
                        onChange={e => handleNoteChange(st.id, e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                      />
                      <div className="flex flex-wrap items-center gap-1">
                        {quickNotes.map(qn => (
                          <button
                            key={qn}
                            type="button"
                            onClick={() => {
                              const note = splitAttendanceNote(entry.note).text;
                              const newNote = note ? `${note}, ${qn}` : qn;
                              handleNoteChange(st.id, newNote);
                            }}
                            className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-900 rounded-md font-medium transition cursor-pointer border border-slate-200/60"
                          >
                            + {qn}
                          </button>
                        ))}
                      </div>
                    </div>
                    {parentContactButton(st)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Attendance Roster Table - Responsive Desktop Table View */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <HorizontalScroll label="Điểm danh" className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[980px] text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold">
                <tr>
                  <th className="py-3 px-4 w-12 text-center sticky left-0 bg-slate-800 z-20">STT</th>
                  <th className="py-3 px-4 w-24 sticky left-12 bg-slate-800 z-20">Mã HS</th>
                  <th className="py-3 px-4 sticky left-36 bg-slate-800 z-20 shadow-r border-r border-slate-700 min-w-[190px]">Họ Và Tên</th>
                  <th className="py-3 px-4 text-center min-w-[320px]">Trạng Thái Điểm Danh</th>
                  <th className="py-3 px-4 text-center min-w-[110px]">Làm BTVN</th>
                  <th className="py-3 px-4 min-w-[260px]">Nhận Xét Buổi Học</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {classStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      Lớp này hiện chưa có học viên nào.
                    </td>
                  </tr>
                ) : (
                  classStudents.map((st, index) => {
                    const entry = entries[st.id] || {
                      status: 'present',
                      homeworkCompleted: true,
                      note: ''
                    };

                    return (
                      <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-400 font-bold sticky left-0 bg-white z-10">
                          {index + 1}
                        </td>
                        <td className="py-3 px-4 font-bold font-mono text-slate-900 sticky left-12 bg-white z-10">
                          {st.code}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 sticky left-36 bg-white z-10 shadow-r border-r border-slate-100">
                          {st.name}
                        </td>

                        {/* Status Badges Selector */}
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex rounded-xl p-0.5 bg-slate-100 border border-slate-200 gap-1">
                            <button
                              type="button"
                              onClick={() => handleStatusChange(st.id, 'present')}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                entry.status === 'present'
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Có mặt
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(st.id, 'late')}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                entry.status === 'late'
                                  ? 'bg-amber-500 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <Clock className="w-3.5 h-3.5" />
                              Đi muộn
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(st.id, 'excused')}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                entry.status === 'excused'
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              Có phép
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(st.id, 'absent')}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                entry.status === 'absent'
                                  ? 'bg-red-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Vắng mặt
                            </button>
                          </div>
                        </td>

                        {/* Homework */}
                        <td className="py-3 px-4 text-center">
                          <label className="inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={entry.homeworkCompleted}
                              onChange={e => handleHomeworkChange(st.id, e.target.checked)}
                              className="w-4 h-4 text-emerald-600 rounded-sm border-slate-300 focus:ring-emerald-500"
                            />
                            <span className={`ml-1.5 text-xs font-semibold ${entry.homeworkCompleted ? 'text-emerald-700' : 'text-slate-400'}`}>
                              {entry.homeworkCompleted ? 'Đã làm' : 'Chưa làm'}
                            </span>
                          </label>
                        </td>

                        {/* Note */}
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            placeholder="VD: Phát biểu tốt, cần chú ý phát âm..."
                            value={splitAttendanceNote(entry.note).text}
                            onChange={e => handleNoteChange(st.id, e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                          />
                          {parentContactButton(st)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </HorizontalScroll>
        </div>
      )}

      {contactStudent && existingSession && onRecordParentContact && <ParentContactDialog
        key={`${existingSession.id}-${contactStudent.id}`}
        student={contactStudent} session={existingSession} className={selectedClass?.name || ''} centerName={centerName}
        canRecord={contactReady && existingSession.entries.find(entry => entry.studentId === contactStudent.id)?.status === 'absent'}
        unavailableReason={contactReason || 'Học viên không còn được ghi nhận vắng trong buổi này.'}
        onRecord={onRecordParentContact} onClose={() => setContactStudentId(null)}
      />}

      {/* History of Previous Sessions for This Class */}
      {classHistory.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-slate-500" />
            Lịch Sử Các Buổi Đã Điểm Danh Của Lớp ({classHistory.length} buổi)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {classHistory.map(item => {
              const pCount = item.entries.filter(e => e.status === 'present').length;
              const isSelected = item.date === sessionDate;

              return (
                <div
                  key={item.id}
                  onClick={() => setSessionDate(item.date)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-slate-900 mb-1">
                    <span className="flex items-center gap-1 text-emerald-800">
                      <Calendar className="w-3.5 h-3.5" />
                      {item.date}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {pCount}/{item.entries.length} có mặt
                    </span>
                  </div>
                  <p className="text-slate-700 font-medium truncate flex items-center gap-1">
                    <FileText className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    {item.lessonTopic || 'Không có tiêu đề'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
