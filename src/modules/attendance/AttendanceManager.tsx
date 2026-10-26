import { showAlert } from '../../lib/dialogs';
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
  Send,
  Table as TableIcon,
  Users,
  XCircle,
  Trash2,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useResponsiveView } from '../../hooks/useResponsive';
import { centerDate, isCalendarDate } from '../../lib/dates';
import { lessonsOn } from '../../lib/operations';
import { snapshotForSession } from '../../lib/sessionBilling';
import type { ClassEnrollment, ScheduleChange, TimetableSlot } from '../../types';
import { AttendanceSession, AttendanceStatus, AttendanceStudentEntry, ClassRoom, LearningAttitude, Student, Teacher } from '../../types';
import type { TaskDestination } from '../dashboard/TodayTasks';
import { ParentContactButton, ParentContactDialog } from './ParentContactDialog';
import { ShareReviewDialog } from './ShareReviewDialog';
import { canContactParent, retainContactHistory, splitAttendanceNote } from './parentContact';
import type { ParentContactRequest } from './parentContact';
import { canEditAttendanceClass, canViewAttendanceClass, isAttendanceManagementRole, canShareSessionReview } from './access';

import { UserAccount } from '../../types';
const EMPTY_ENROLLMENTS: ClassEnrollment[] = [];
type AttendanceDraftEntry = {
  status: AttendanceStatus;
  homeworkCompleted: boolean;
  note: string;
  homeworkAssignment: string;
  rating: number;
  learningAttitude: LearningAttitude | '';
  sessionScore: number | '';
};

const DEFAULT_ENTRY: AttendanceDraftEntry = {
  status: 'present',
  homeworkCompleted: true,
  note: '',
  homeworkAssignment: '',
  rating: 0,
  learningAttitude: '',
  sessionScore: '',
};

const LEARNING_ATTITUDES: Array<{ value: LearningAttitude; label: string }> = [
  { value: 'excellent', label: 'Rất tích cực' },
  { value: 'good', label: 'Tốt' },
  { value: 'normal', label: 'Bình thường' },
  { value: 'needs_focus', label: 'Cần tập trung' },
  { value: 'needs_support', label: 'Cần hỗ trợ' },
];

const QUICK_NOTES = ['Phát biểu tốt', 'Ngoan, chú ý', 'Cần tập trung', 'Quên làm BTVN', 'Tiến bộ rõ'];

const appendQuickNote = (current: string, quickNote: string) => {
  const parts = current.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.some((part) => part.toLocaleLowerCase('vi-VN') === quickNote.toLocaleLowerCase('vi-VN'))) {
    parts.push(quickNote);
  }
  return parts.join(', ');
};

type AutoGrowTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & {
  value: string;
  minHeight?: number;
};

const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  value,
  minHeight = 72,
  onInput,
  style,
  ...props
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const resize = React.useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`;
  }, [minHeight]);

  React.useEffect(resize, [resize, value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      value={value}
      style={style}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
    />
  );
};

interface StudentFeedbackFieldsProps {
  student: Student;
  entry: AttendanceDraftEntry;
  disabled: boolean;
  compact?: boolean;
  onNoteChange: (value: string) => void;
  onUpdate: (changes: Partial<AttendanceDraftEntry>) => void;
}

const StudentFeedbackFields: React.FC<StudentFeedbackFieldsProps> = ({
  student,
  entry,
  disabled,
  compact = false,
  onNoteChange,
  onUpdate,
}) => {
  const absent = entry.status === 'absent';
  const excused = entry.status === 'excused';
  const notAttending = absent || excused;
  const note = splitAttendanceNote(entry.note).text;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = React.useId();
  const hasOptionalDetails = Boolean(
    entry.homeworkAssignment.trim() ||
    entry.rating ||
    entry.learningAttitude ||
    typeof entry.sessionScore === 'number',
  );
  const detailLabel = notAttending ? 'Dặn dò học bù' : 'Dặn dò & đánh giá thêm';

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-slate-700">
          {absent ? 'Lý do vắng / Ghi chú' : excused ? 'Lý do xin phép / Ghi chú' : 'Nhận xét nhanh (không bắt buộc)'}
        </label>
        <AutoGrowTextarea
          rows={1}
          minHeight={compact ? 40 : 44}
          maxLength={5000}
          disabled={disabled}
          aria-label={notAttending ? `Ghi chú điểm danh của ${student.name}` : `Nhận xét trên lớp của ${student.name}`}
          placeholder={absent
            ? 'Nhập lý do vắng nếu có...'
            : excused
              ? 'Nhập lý do xin phép nếu có...'
              : 'VD: Tiếp thu tốt, cần tập trung thêm...'}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          className={`w-full overflow-hidden resize-none rounded-lg border px-2.5 py-2 text-xs leading-relaxed text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 disabled:bg-slate-100 ${
            absent
              ? 'border-rose-200 bg-rose-50/40 focus:border-rose-400 focus:ring-rose-200'
              : excused
                ? 'border-blue-200 bg-blue-50/40 focus:border-blue-400 focus:ring-blue-200'
                : 'border-slate-200 bg-slate-50 focus:border-emerald-500 focus:ring-emerald-200'
          }`}
        />
      </div>

      <button
        type="button"
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        onClick={() => setDetailsOpen((open) => !open)}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-300 cursor-pointer"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-sky-600" />
        <span>{detailsOpen ? 'Thu gọn' : detailLabel}</span>
        {hasOptionalDetails && !detailsOpen && (
          <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-800">Đã có nội dung</span>
        )}
        {detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {detailsOpen && (
        <div id={detailsId} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
          {!notAttending && (
            <div className="flex flex-wrap items-center gap-1">
              {QUICK_NOTES.map((quickNote) => (
                <button
                  key={quickNote}
                  type="button"
                  disabled={disabled}
                  onClick={() => onNoteChange(appendQuickNote(note, quickNote))}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  + {quickNote}
                </button>
              ))}
            </div>
          )}

          <label className="block text-[11px] font-semibold text-slate-700">
            {notAttending ? 'Dặn dò / Bài tập học bù' : 'Dặn dò / BTVN riêng gửi phụ huynh'}
            <AutoGrowTextarea
              rows={1}
              minHeight={44}
              maxLength={3000}
              disabled={disabled}
              aria-label={`Nội dung dặn dò hoặc bài tập về nhà riêng của ${student.name}`}
              placeholder={notAttending ? 'Nội dung cần học bù nếu có...' : 'Bài tập riêng nếu có...'}
              value={entry.homeworkAssignment}
              onChange={(event) => onUpdate({ homeworkAssignment: event.target.value })}
              className="mt-1 w-full overflow-hidden resize-none rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-xs font-normal leading-relaxed text-slate-800 focus:border-sky-500 focus:outline-hidden focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100"
            />
          </label>

          {!notAttending && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="min-w-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Thái độ học tập
                <select
                  disabled={disabled}
                  aria-label={`Thái độ học tập của ${student.name}`}
                  value={entry.learningAttitude}
                  onChange={(event) => onUpdate({ learningAttitude: event.target.value as LearningAttitude | '' })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium normal-case tracking-normal text-slate-800 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100"
                >
                  <option value="">Không đánh giá</option>
                  {LEARNING_ATTITUDES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="min-w-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Điểm buổi học (nếu cần)
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  disabled={disabled}
                  aria-label={`Điểm buổi học của ${student.name}`}
                  value={entry.sessionScore}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const value = raw === '' ? '' : Math.min(10, Math.max(0, Number(raw)));
                    onUpdate({ sessionScore: value });
                  }}
                  placeholder="0–10"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold normal-case tracking-normal text-slate-800 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100"
                />
              </label>
            </div>
          )}

          {entry.rating > 0 && (
            <p className="text-[10px] text-slate-500">
              Đánh giá sao đã lưu trước đây: <strong>{entry.rating}/5</strong>. Hệ thống vẫn giữ nguyên dữ liệu này.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

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
  onDeleteSession?: (sessionId: string) => boolean | void;
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
  onDeleteSession,
  onRecordParentContact,
  centerName = 'BeeZone',
  isOwner,
  currentUser,
  timetableSlots, scheduleChanges = [], enrollments = EMPTY_ENROLLMENTS, request, onRequestHandled
}) => {
  // Chủ trung tâm, Hành chính và Đào tạo có phạm vi quản lý toàn trung tâm.
  // Giáo viên chỉ thấy lớp được phân công; quyền sửa vẫn được kiểm tra riêng.
  const permittedClasses = useMemo(() => {
    if (isOwner) return classes;
    if (!currentUser) return [];
    if (isAttendanceManagementRole(currentUser)) return classes.filter((classroom) => canViewAttendanceClass(currentUser, classroom));

    const teacherProfile = teachers.find((teacher) =>
      (currentUser.permissions.teacherId && teacher.id === currentUser.permissions.teacherId) ||
      (currentUser.email && teacher.email && teacher.email.toLowerCase() === currentUser.email.toLowerCase()),
    );
    const accountWithTeacherAssignments = teacherProfile
      ? {
          ...currentUser,
          permissions: {
            ...currentUser.permissions,
            teacherId: currentUser.permissions.teacherId || teacherProfile.id,
            assignedClassIds: [...new Set([...(currentUser.permissions.assignedClassIds || []), ...(teacherProfile.assignedClassIds || [])])],
          },
        }
      : currentUser;
    return classes.filter((classroom) => canViewAttendanceClass(accountWithTeacherAssignments, classroom));
  }, [classes, isOwner, currentUser, teachers]);

  const [selectedClassId, setSelectedClassId] = useState<string>(() => permittedClasses[0]?.id || '');
  const [sessionDate, setSessionDate] = useState<string>(
    centerDate()
  );
  const [lessonTopic, setLessonTopic] = useState<string>('');
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'warning'>('success');
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [applyOldSessionBilling, setApplyOldSessionBilling] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<AttendanceSession | null>(null);
  const [viewMode, setViewMode] = useResponsiveView('card', 'table');
  const [contactStudentId, setContactStudentId] = useState<string | null>(null);
  const [reviewStudentId, setReviewStudentId] = useState<string | null>(null);
  React.useEffect(() => {
    setContactStudentId(null);
    setReviewStudentId(null);
  }, [selectedClassId, sessionDate]);

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
  const canSave = isOwner || canEditAttendanceClass(currentUser, selectedClass);

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
  const [entries, setEntries] = useState<Record<string, AttendanceDraftEntry>>({});

  // Sync entries when class or date changes
  React.useEffect(() => {
    setApplyOldSessionBilling(false);
    setShowSessionDetails(false);
    if (existingSession) {
      setLessonTopic(existingSession.lessonTopic || '');
      setGeneralNotes(existingSession.generalNotes || '');
      const map: Record<string, AttendanceDraftEntry> = {};
      classStudents.forEach(st => {
        const found = existingSession.entries.find(e => e.studentId === st.id);
        map[st.id] = {
          status: found?.status || 'present',
          homeworkCompleted: found?.homeworkCompleted ?? true,
          note: found?.note || '',
          homeworkAssignment: found?.homeworkAssignment || '',
          rating: found?.rating || 0,
          learningAttitude: found?.learningAttitude || '',
          sessionScore: found?.sessionScore ?? '',
        };
      });
      setEntries(map);
    } else {
      setLessonTopic('');
      setGeneralNotes('');
      const map: Record<string, AttendanceDraftEntry> = {};
      classStudents.forEach(st => {
        map[st.id] = {
          status: 'present',
          homeworkCompleted: true,
          note: '',
          homeworkAssignment: '',
          rating: 0,
          learningAttitude: '',
          sessionScore: '',
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
        status,
        ...(status === 'absent' ? { rating: 0, learningAttitude: '' as const, sessionScore: '' as const } : {}),
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

  const updateEntry = (studentId: string, changes: Partial<AttendanceDraftEntry>) => {
    setEntries((previous) => ({
      ...previous,
      [studentId]: { ...previous[studentId], ...changes },
    }));
  };

  const hasUnsavedChanges = !existingSession || applyOldSessionBilling ||
    (lessonTopic.trim() || 'Buổi học theo thời khóa biểu') !== (existingSession.lessonTopic || 'Buổi học theo thời khóa biểu') ||
    generalNotes.trim() !== (existingSession.generalNotes || '').trim() ||
    classStudents.some(student => {
      const draft = entries[student.id];
      const saved = existingSession.entries.find(entry => entry.studentId === student.id);
      return !draft || !saved ||
        draft.status !== saved.status ||
        draft.homeworkCompleted !== (saved.homeworkCompleted ?? true) ||
        draft.note !== (saved.note || '') ||
        draft.homeworkAssignment !== (saved.homeworkAssignment || '') ||
        draft.rating !== (saved.rating || 0) ||
        draft.learningAttitude !== (saved.learningAttitude || '') ||
        draft.sessionScore !== (saved.sessionScore ?? '');
    });
  const contactReason = !canContactParent(currentUser, selectedClass) ? 'Bạn không có quyền ghi nhận liên hệ cho lớp này.' :
    !isCalendarDate(sessionDate) || sessionDate > centerDate() ? 'Chỉ báo vắng cho buổi học đã diễn ra.' :
    hasUnsavedChanges ? 'Lưu điểm danh trước khi báo phụ huynh.' : '';
  const contactReady = !contactReason;
  const contactStudent = classStudents.find(student => student.id === contactStudentId);

  const reviewStudent = classStudents.find(student => student.id === reviewStudentId);
  const canShare = canShareSessionReview(currentUser, selectedClass, isOwner);
  const shareReason = !existingSession
    ? 'Hãy lưu điểm danh và nhận xét trước khi chia sẻ cho phụ huynh.'
    : !isCalendarDate(sessionDate) || sessionDate > centerDate()
      ? 'Chỉ chia sẻ nhận xét của buổi học đã diễn ra.'
      : hasUnsavedChanges
        ? 'Có thay đổi chưa lưu. Hãy cập nhật điểm danh trước khi chia sẻ.'
        : '';
  const shareReady = canShare && !shareReason;

  const shareReviewButton = (student: Student) => {
    if (!canShare) return null;
    const absent = entries[student.id]?.status === 'absent';
    return (
      <button
        type="button"
        disabled={!shareReady}
        onClick={() => shareReady && setReviewStudentId(student.id)}
        aria-label={absent
          ? `Gửi thông báo vắng mặt của ${student.name} cho phụ huynh`
          : `Chia sẻ nhận xét buổi học của ${student.name} cho phụ huynh`}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold transition shadow-2xs ${
          absent
            ? 'border-rose-400 bg-rose-600 text-white hover:bg-rose-700 shadow-sm'
            : 'border-sky-300 bg-sky-50 text-sky-800 hover:border-sky-400 hover:bg-sky-100'
        } disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer`}
        title={shareReason || (absent
          ? 'Gửi thông báo học viên đang vắng mặt qua Zalo hoặc SMS'
          : 'Chia sẻ nhận xét buổi học cho phụ huynh qua Zalo hoặc SMS')}
      >
        {absent
          ? <XCircle className="h-4 w-4 shrink-0 text-white" />
          : <Send className="h-3.5 w-3.5 shrink-0 text-[#0068FF]" />}
        <span>{absent ? 'Báo vắng phụ huynh' : 'Gửi phụ huynh'}</span>
      </button>
    );
  };

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
    setStatusTone('success');
    setStatusMessage('Đã đánh dấu tất cả học viên có mặt!');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSave = () => {
    if (!canSave || !selectedClass || !sessionDate) return;
    if (classStudents.length === 0) {
      showAlert("Lớp học chưa có học viên nào. Vui lòng thêm học viên vào lớp trước khi điểm danh.");
      return;
    }
    if (selectedClass.billingMode === 'session' && sessionDate > centerDate()) {
      setStatusTone('warning');
      setStatusMessage('Chỉ ghi nhận học phí cho buổi đã tổ chức; ngày điểm danh không được ở tương lai.');
      return;
    }
    if (noLesson) {
      setStatusTone('warning');
      setStatusMessage('Ngày này không có buổi học theo lịch thực tế. Kiểm tra lịch nghỉ hoặc học bù.');
      return;
    }

    const sessionData: AttendanceSession = {
      id: existingSession ? existingSession.id : `ATT_${Date.now()}`,
      classId: selectedClassId,
      date: sessionDate,
      lessonTopic: lessonTopic.trim() || 'Buổi học theo thời khóa biểu',
      teacherId: existingSession?.teacherId || datedLesson?.teacherId || selectedClass?.teacherId,
      billing: snapshotForSession(selectedClass, sessionDate, applyOldSessionBilling ? undefined : existingSession),
      generalNotes: generalNotes.trim(),
      entries: [
        ...(existingSession?.entries || []).filter(entry => !classStudents.some(st => st.id === entry.studentId)),
        ...classStudents.map((st): AttendanceStudentEntry => {
          const draft = entries[st.id];
          return {
            studentId: st.id,
            status: draft?.status || 'present',
            homeworkCompleted: draft?.homeworkCompleted ?? true,
            note: draft?.note || '',
            homeworkAssignment: draft?.homeworkAssignment?.trim() || undefined,
            rating: draft?.rating ? draft.rating : undefined,
            learningAttitude: draft?.learningAttitude ? draft.learningAttitude : undefined,
            sessionScore: typeof draft?.sessionScore === 'number' ? draft.sessionScore : undefined,
          };
        }),
      ],
    };

    if (onSaveSession(sessionData) === false) return;
    setIsSavedRecently(true);
    setStatusTone('success');
    setStatusMessage(existingSession ? 'Đã cập nhật điểm danh và nhận xét thành công!' : 'Đã lưu kết quả điểm danh thành công!');
    setTimeout(() => {
      setStatusMessage(null);
      setIsSavedRecently(false);
    }, 4000);
  };

  // Stats
  const totalStudents = classStudents.length;
  const entriesList = Object.values(entries);
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

        {/* Quick Class Summary */}
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
            <div className="flex flex-wrap items-center gap-2">
              {existingSession && (
                <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800 flex items-center gap-1 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Buổi đã điểm danh (Đang xem & chỉnh sửa)
                </span>
              )}
              <button
                type="button"
                aria-expanded={showSessionDetails}
                aria-controls="attendance-session-details"
                onClick={() => setShowSessionDetails((open) => !open)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 focus:outline-hidden focus:ring-2 focus:ring-sky-200 cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5 text-sky-600" />
                <span>{showSessionDetails ? 'Thu gọn nội dung buổi học' : 'Nội dung buổi học'}</span>
                {!showSessionDetails && (lessonTopic.trim() || generalNotes.trim()) && (
                  <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-800">Đã nhập</span>
                )}
                {showSessionDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}

        {selectedClass && showSessionDetails && (
          <div id="attendance-session-details" className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-2">
            <div>
              <label htmlFor="attendance-lesson-topic" className="block text-[11px] font-bold text-slate-700 mb-1">
                Chủ đề bài học / Giáo trình hôm nay:
              </label>
              <AutoGrowTextarea
                id="attendance-lesson-topic"
                aria-label="Chủ đề bài học / Giáo trình hôm nay"
                rows={3}
                maxLength={1000}
                disabled={!canSave}
                placeholder="VD: Unit 4: Speaking Practice & Flashcards..."
                value={lessonTopic}
                onChange={e => setLessonTopic(e.target.value)}
                minHeight={82}
                className="w-full resize-none overflow-hidden text-xs font-medium px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-hidden disabled:bg-slate-100"
              />
            </div>
            <div>
              <label htmlFor="attendance-general-notes" className="block text-[11px] font-bold text-slate-700 mb-1">
                Nội dung dặn dò / BTVN chung cả lớp:
              </label>
              <AutoGrowTextarea
                id="attendance-general-notes"
                aria-label="Nội dung dặn dò / BTVN chung cả lớp"
                rows={3}
                maxLength={3000}
                disabled={!canSave}
                placeholder="VD: Ôn Unit 4, làm Workbook trang 18–19, chuẩn bị bài nói tuần sau..."
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                minHeight={82}
                className="w-full resize-none overflow-hidden text-xs font-medium px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-hidden disabled:bg-slate-100"
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
        <div
          role={statusTone === 'warning' ? 'alert' : 'status'}
          className={`flex items-center justify-between gap-3 rounded-2xl border-2 p-3.5 text-xs font-bold shadow-md animate-in fade-in slide-in-from-top-2 sm:text-sm ${
            statusTone === 'warning'
              ? 'border-amber-400 bg-amber-50 text-amber-950'
              : 'border-emerald-400 bg-emerald-50 text-emerald-950'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-xs ${statusTone === 'warning' ? 'bg-amber-600' : 'bg-emerald-600'}`}>
              {statusTone === 'warning'
                ? <AlertCircle className="h-4 w-4 text-white" />
                : <CheckCircle2 className="h-4 w-4 text-white" />}
            </span>
            <span className="font-extrabold">{statusMessage}</span>
          </div>
          <span className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
            statusTone === 'warning'
              ? 'border-amber-300 bg-amber-100/90 text-amber-800'
              : 'border-emerald-300 bg-emerald-100/90 text-emerald-800'
          }`}>
            {statusTone === 'warning'
              ? <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
              : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            {statusTone === 'warning' ? 'Cần kiểm tra' : 'Đã cập nhật'}
          </span>
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
            disabled={!canSave || classStudents.length === 0}
            className={`flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs ${!canSave || classStudents.length === 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-100 active:scale-95 cursor-pointer"}`}
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
            disabled={!canSave || !selectedClass || classStudents.length === 0}
            aria-label={existingSession ? 'Lưu Điểm Danh & Nhận Xét Đã Sửa' : 'Lưu Điểm Danh & Nhận Xét'}
            title={classStudents.length === 0 ? "Lớp học chưa có học viên để điểm danh" : undefined}
            className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              isSavedRecently
                ? 'bg-emerald-700 ring-2 ring-emerald-300 shadow-md scale-102'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isSavedRecently ? (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0 text-white animate-bounce" />
                <span>✓ Đã Cập Nhật Thành Công!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span>{existingSession ? 'Cập Nhật Điểm Danh & Nhận Xét' : 'Lưu Điểm Danh & Nhận Xét'}</span>
              </>
            )}
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
            <div className={`grid grid-cols-1 gap-4 ${classStudents.length === 1 ? 'mx-auto w-full max-w-5xl' : classStudents.length === 2 ? 'mx-auto w-full max-w-6xl sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
              {classStudents.map((st, index) => {
                const entry = entries[st.id] || DEFAULT_ENTRY;

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

                      {entry.status === 'absent' ? (
                        <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 shrink-0">
                          BTVN: — (Vắng)
                        </span>
                      ) : entry.status === 'excused' ? (
                        <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 shrink-0">
                          BTVN: — (Phép)
                        </span>
                      ) : (
                        <label className="flex items-center gap-1.5 cursor-pointer shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                          <input
                            type="checkbox"
                            disabled={!canSave}
                            checked={entry.homeworkCompleted}
                            onChange={e => handleHomeworkChange(st.id, e.target.checked)}
                            className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                          />
                          <span className={`text-[11px] font-bold ${entry.homeworkCompleted ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {entry.homeworkCompleted ? 'BTVN: Có' : 'BTVN: Chưa'}
                          </span>
                        </label>
                      )}
                    </div>

                    {/* 4-way Status Selector with touch-friendly pills */}
                    <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        disabled={!canSave}
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
                        disabled={!canSave}
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
                        disabled={!canSave}
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
                        disabled={!canSave}
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

                    <StudentFeedbackFields
                      student={st}
                      entry={entry}
                      disabled={!canSave}
                      onNoteChange={(value) => handleNoteChange(st.id, value)}
                      onUpdate={(changes) => updateEntry(st.id, changes)}
                    />
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {shareReviewButton(st)}
                      {parentContactButton(st)}
                    </div>
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
            <table className="w-full min-w-[1080px] text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold">
                <tr>
                  <th className="py-3 px-4 w-12 text-center sticky left-0 bg-slate-800 z-20">STT</th>
                  <th className="py-3 px-4 w-24 sticky left-12 bg-slate-800 z-20">Mã HS</th>
                  <th className="py-3 px-4 sticky left-36 bg-slate-800 z-20 shadow-r border-r border-slate-700 min-w-[170px]">Họ Và Tên</th>
                  <th className="py-3 px-4 text-center min-w-[290px]">Trạng Thái</th>
                  <th className="py-3 px-4 text-center min-w-[100px]">BTVN</th>
                  <th className="py-3 px-4 min-w-[360px]">Ghi Chú & Tùy Chọn</th>
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
                    const entry = entries[st.id] || DEFAULT_ENTRY;

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
                              disabled={!canSave}
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
                              disabled={!canSave}
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
                              disabled={!canSave}
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
                              disabled={!canSave}
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
                          {entry.status === 'absent' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-400 bg-slate-100 border border-slate-200">
                              — (Vắng)
                            </span>
                          ) : entry.status === 'excused' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-400 bg-slate-100 border border-slate-200">
                              — (Phép)
                            </span>
                          ) : (
                            <label className="inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={!canSave}
                                checked={entry.homeworkCompleted}
                                onChange={e => handleHomeworkChange(st.id, e.target.checked)}
                                className="w-4 h-4 text-emerald-600 rounded-sm border-slate-300 focus:ring-emerald-500"
                              />
                              <span className={`ml-1.5 text-xs font-semibold ${entry.homeworkCompleted ? 'text-emerald-700' : 'text-slate-400'}`}>
                                {entry.homeworkCompleted ? 'Đã làm' : 'Chưa làm'}
                              </span>
                            </label>
                          )}
                        </td>

                        {/* Feedback, homework and assessment */}
                        <td className="min-w-[360px] px-4 py-2.5 align-top">
                          <StudentFeedbackFields
                            student={st}
                            entry={entry}
                            disabled={!canSave}
                            compact
                            onNoteChange={(value) => handleNoteChange(st.id, value)}
                            onUpdate={(changes) => updateEntry(st.id, changes)}
                          />
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {shareReviewButton(st)}
                            {parentContactButton(st)}
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
      )}

      {/* Bottom Save Action Bar */}
      {classStudents.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-2">
            <span>Tổng số: <strong className="text-slate-900 font-bold">{totalStudents}</strong> học viên</span>
            <span>·</span>
            <span className="text-emerald-700 font-semibold">{presentCount} có mặt</span>
            <span>·</span>
            <span className="text-amber-700 font-semibold">{lateCount} đi muộn</span>
            <span>·</span>
            <span className="text-blue-700 font-semibold">{excusedCount} có phép</span>
            <span>·</span>
            <span className="text-rose-700 font-semibold">{absentCount} vắng</span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || !selectedClass}
            aria-label={existingSession ? 'Cập nhật lại nhận xét buổi học' : 'Xác nhận hoàn tất buổi học'}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-sm active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              isSavedRecently
                ? 'bg-emerald-700 ring-2 ring-emerald-300 shadow-md scale-102'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isSavedRecently ? (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0 text-white animate-bounce" />
                <span>✓ Đã Cập Nhật Thành Công!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span>{existingSession ? 'Cập Nhật Lại Nhận Xét' : 'Xác Nhận & Hoàn Tất Buổi Học'}</span>
              </>
            )}
          </button>
        </div>
      )}

      {contactStudent && existingSession && onRecordParentContact && <ParentContactDialog
        key={`${existingSession.id}-${contactStudent.id}`}
        student={contactStudent} session={existingSession} className={selectedClass?.name || ''} centerName={centerName}
        canRecord={contactReady && existingSession.entries.find(entry => entry.studentId === contactStudent.id)?.status === 'absent'}
        unavailableReason={contactReason || 'Học viên không còn được ghi nhận vắng trong buổi này.'}
        onRecord={onRecordParentContact} onClose={() => setContactStudentId(null)}
      />}

      {reviewStudent && selectedClass && existingSession && (() => {
        const savedEntry = existingSession.entries.find((entry) => entry.studentId === reviewStudent.id);
        if (!savedEntry) return null;
        const sessionTeacher = teachers.find((item) => item.id === (existingSession.teacherId || selectedClass.teacherId));
        return (
          <ShareReviewDialog
            key={`review-${selectedClass.id}-${reviewStudent.id}-${sessionDate}`}
            sessionId={existingSession.id}
            student={reviewStudent}
            className={selectedClass.name}
            sessionDate={sessionDate}
            centerName={centerName}
            teacherName={sessionTeacher?.name || teacher?.name}
            lessonTopic={existingSession.lessonTopic}
            generalNotes={existingSession.generalNotes}
            entry={savedEntry}
            onRecord={onRecordParentContact}
            onClose={() => setReviewStudentId(null)}
          />
        );
      })()}

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
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-500">
                        {pCount}/{item.entries.length} có mặt
                      </span>
                      {onDeleteSession && isOwner && item.entries.length === 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSessionToDelete(item);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                          title="Xóa buổi điểm danh này"
                          aria-label={`Xóa buổi điểm danh ngày ${item.date}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
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
      {/* Delete Attendance Session Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(sessionToDelete)}
        title="Xóa buổi điểm danh trống"
        message={sessionToDelete ? `Bạn có muốn xóa buổi điểm danh trống ngày ${sessionToDelete.date}? Buổi có lịch sử học viên cần được giữ lại và chỉnh sửa.` : ''}
        confirmText="Xóa buổi điểm danh"
        cancelText="Hủy"
        variant="danger"
        onConfirm={() => {
          if (sessionToDelete) {
            if (onDeleteSession?.(sessionToDelete.id) === false) return;
            if (sessionDate === sessionToDelete.date) {
              setSessionDate(centerDate());
            }
            setSessionToDelete(null);
          }
        }}
        onClose={() => setSessionToDelete(null)}
      />
    </div>
  );
};
