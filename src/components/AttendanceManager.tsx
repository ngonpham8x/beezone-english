import React, { useState, useMemo } from 'react';
import {
  AttendanceSession,
  AttendanceStatus,
  ClassRoom,
  Student,
  Teacher
} from '../types';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Save,
  Users,
  CheckCheck,
  BookOpen,
  Calendar,
  History,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

import { UserAccount } from '../types';

interface AttendanceManagerProps {
  classes: ClassRoom[];
  students: Student[];
  teachers: Teacher[];
  attendanceSessions: AttendanceSession[];
  onSaveSession: (session: AttendanceSession) => void;
  isOwner: boolean;
  currentUser?: UserAccount;
}

export const AttendanceManager: React.FC<AttendanceManagerProps> = ({
  classes,
  students,
  teachers,
  attendanceSessions,
  onSaveSession,
  isOwner,
  currentUser
}) => {
  // Determine classes the current teacher/staff is permitted to access
  const permittedClasses = useMemo(() => {
    if (isOwner) return classes;
    if (!currentUser) return classes;

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

  const [selectedClassId, setSelectedClassId] = useState<string>(() => permittedClasses[0]?.id || '');
  const [sessionDate, setSessionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [lessonTopic, setLessonTopic] = useState<string>('');
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [showTopicNote, setShowTopicNote] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Sync selected class if permitted classes changes
  React.useEffect(() => {
    if (permittedClasses.length > 0 && !permittedClasses.some(c => c.id === selectedClassId)) {
      setSelectedClassId(permittedClasses[0].id);
    }
  }, [permittedClasses, selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find(c => c.id === selectedClassId),
    [classes, selectedClassId]
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
      if (s.classId !== selectedClassId) return false;
      if (s.status === 'active') return true;
      if (recordedIds.includes(s.id)) return true;
      return false;
    });
  }, [students, selectedClassId, existingSession]);

  const teacher = useMemo(
    () => teachers.find(t => t.id === selectedClass?.teacherId),
    [teachers, selectedClass]
  );

  // Working entries state
  const [entries, setEntries] = useState<
    Record<string, { status: AttendanceStatus; homeworkCompleted: boolean; note: string }>
  >({});

  // Sync entries when class or date changes
  React.useEffect(() => {
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
        note
      }
    }));
  };

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
    if (!selectedClassId) return;

    const sessionData: AttendanceSession = {
      id: existingSession ? existingSession.id : `ATT_${Date.now()}`,
      classId: selectedClassId,
      date: sessionDate,
      lessonTopic: lessonTopic.trim() || 'Buổi học theo thời khóa biểu',
      teacherId: selectedClass?.teacherId,
      generalNotes: generalNotes.trim(),
      entries: classStudents.map(st => ({
        studentId: st.id,
        status: entries[st.id]?.status || 'present',
        homeworkCompleted: entries[st.id]?.homeworkCompleted ?? true,
        note: entries[st.id]?.note || ''
      }))
    };

    onSaveSession(sessionData);
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
      .filter(s => s.classId === selectedClassId)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [attendanceSessions, selectedClassId]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 shrink-0" />
              Điểm Danh & Nhận Xét Buổi Học
            </h2>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
              Theo dõi sĩ số chuyên cần, làm bài tập về nhà và nhận xét thái độ học tập từng buổi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-2.5 sm:px-3 py-1.5 flex-1 sm:flex-initial min-w-[150px]">
              <BookOpen className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden w-full cursor-pointer"
                disabled={permittedClasses.length === 0}
              >
                {permittedClasses.length === 0 ? (
                  <option value="">Chưa có lớp được phân quyền</option>
                ) : (
                  permittedClasses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name.replace(/\s*\([^)]*\)/g, '').trim()}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-2.5 sm:px-3 py-1.5 flex-1 sm:flex-initial min-w-[130px]">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                type="date"
                value={sessionDate}
                onChange={e => setSessionDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden w-full cursor-pointer"
              />
            </div>
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

      {/* Actions Toolbar */}
      <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={handleMarkAllPresent}
          className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3 sm:py-2 bg-white border border-slate-300 text-slate-700 rounded-lg sm:rounded-xl text-xs font-bold hover:bg-slate-100 transition shadow-2xs active:scale-95"
        >
          <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Tất Cả Có Mặt</span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 bg-emerald-600 text-white rounded-lg sm:rounded-xl text-xs font-bold hover:bg-emerald-700 transition shadow-sm active:scale-95"
        >
          <Save className="w-4 h-4 shrink-0" />
          <span>Lưu Điểm Danh</span>
        </button>
      </div>

      {/* Attendance Roster - Mobile Card View (md:hidden) */}
      <div className="md:hidden space-y-2.5">
        {classStudents.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Lớp này hiện chưa có học viên nào.
          </div>
        ) : (
          classStudents.map((st, index) => {
            const entry = entries[st.id] || {
              status: 'present',
              homeworkCompleted: true,
              note: ''
            };

            return (
              <div key={st.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
                {/* Header: STT, Mã, Tên, BTVN */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50 shrink-0">
                      {st.code}
                    </span>
                    <span className="font-bold text-xs text-slate-900 truncate">
                      {st.name}
                    </span>
                  </div>

                  <label className="flex items-center gap-1 cursor-pointer shrink-0 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                    <input
                      type="checkbox"
                      checked={entry.homeworkCompleted}
                      onChange={e => handleHomeworkChange(st.id, e.target.checked)}
                      className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className={`text-[10px] font-bold ${entry.homeworkCompleted ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {entry.homeworkCompleted ? 'BTVN: Có' : 'BTVN: Chưa'}
                    </span>
                  </label>
                </div>

                {/* 4-way Status Selector */}
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(st.id, 'present')}
                    className={`py-1.5 rounded-md text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                      entry.status === 'present'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Có mặt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(st.id, 'late')}
                    className={`py-1.5 rounded-md text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                      entry.status === 'late'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>Muộn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(st.id, 'excused')}
                    className={`py-1.5 rounded-md text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                      entry.status === 'excused'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>Phép</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(st.id, 'absent')}
                    className={`py-1.5 rounded-md text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                      entry.status === 'absent'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <XCircle className="w-3 h-3 shrink-0" />
                    <span>Vắng</span>
                  </button>
                </div>

                {/* Student Note Input */}
                <input
                  type="text"
                  placeholder="Ghi chú / nhận xét học viên..."
                  value={entry.note}
                  onChange={e => handleNoteChange(st.id, e.target.value)}
                  className="w-full text-[11px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>
            );
          })
        )}
      </div>

      {/* Attendance Roster Table - Desktop View (hidden md:block) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold">
              <tr>
                <th className="py-3 px-4 w-12 text-center">STT</th>
                <th className="py-3 px-4">Mã HS</th>
                <th className="py-3 px-4">Họ Và Tên</th>
                <th className="py-3 px-4 text-center">Trạng Thái Điểm Danh</th>
                <th className="py-3 px-4 text-center">Làm BTVN</th>
                <th className="py-3 px-4">Nhận Xét Buổi Học</th>
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
                      <td className="py-3 px-4 text-center text-slate-400 font-bold">
                        {index + 1}
                      </td>
                      <td className="py-3 px-4 font-bold font-mono text-slate-900">{st.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{st.name}</td>

                      {/* Status Badges Selector */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 gap-1">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(st.id, 'present')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                              entry.status === 'present'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Có mặt
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStatusChange(st.id, 'late')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                              entry.status === 'late'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            Đi muộn
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStatusChange(st.id, 'excused')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                              entry.status === 'excused'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <AlertCircle className="w-3 h-3" />
                            Có phép
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStatusChange(st.id, 'absent')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                              entry.status === 'absent'
                                ? 'bg-red-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <XCircle className="w-3 h-3" />
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
                          value={entry.note}
                          onChange={e => handleNoteChange(st.id, e.target.value)}
                          className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
