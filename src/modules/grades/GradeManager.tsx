import { AlertCircle, Award, FileText, LayoutGrid, Share2, Table as TableIcon } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import { useResponsiveView } from '../../hooks/useResponsive';
import {
  CenterSettings,
  ClassRoom,
  CourseProgram,
  Grade,
  StaffPermissions,
  Student,
  Teacher,
  UserAccount,
} from '../../types';
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
    sheetsConfig: { spreadsheetId: '', sheetName: '', autoSync: false, syncInterval: 'weekly', connected: false }
  }
}) => {
  // Determine classes the teacher/staff is permitted to grade
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

  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return isOwner ? 'all' : (permittedClasses[0]?.id || 'all');
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [reportingStudent, setReportingStudent] = useState<Student | null>(null);
  const [sharingStudent, setSharingStudent] = useState<Student | null>(null);
  const [viewMode, setViewMode] = useResponsiveView('card', 'table');
  useEffect(() => {
    if (!isOwner && permittedClasses.length > 0 && selectedClassId !== 'all' && !permittedClasses.some(c => c.id === selectedClassId)) {
      setSelectedClassId(permittedClasses[0].id);
    }
  }, [permittedClasses, isOwner, selectedClassId]);

  const canEdit = isOwner || permissions.grade.edit;

  const classStudents = students.filter(s => {
    const isPermittedClass = isOwner || permittedClasses.some(c => c.id === s.classId);
    if (!isPermittedClass) return false;
    const matchesClass = selectedClassId === 'all' || s.classId === selectedClassId;
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesClass && matchesSearch;
  });

  const calculateAvg = (g: Grade): number => {
    // Weightings: Skills 40%, Midterm 20%, Final 30%, Attendance 10%
    const skillsAvg = (g.listening + g.speaking + g.reading + g.writing) / 4;
    const avg = (skillsAvg * 0.4) + (g.midterm * 0.2) + (g.finalExam * 0.3) + (g.attendance * 0.1);
    return Math.round(avg * 10) / 10;
  };

  const handleGradeChange = (studentId: string, field: keyof Grade, value: number) => {
    const student = students.find(s => s.id === studentId);
    if (!canEdit || !student || !Number.isFinite(value) || !classStudents.some(s => s.id === studentId)) return;
    const existing = grades.find(g => g.studentId === studentId && g.classId === student.classId) || {
      id: `GR_${crypto.randomUUID()}`, studentId, classId: student.classId,
      listening: 0, speaking: 0, reading: 0, writing: 0, midterm: 0, finalExam: 0, attendance: 0, average: 0,
    };

    const updated = {
      ...existing,
      [field]: Math.min(Math.max(value, 0), 10)
    };
    updated.average = calculateAvg(updated);
    onUpdateGrade(updated);
  };

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
            Quản lý điểm 4 kỹ năng Listening, Speaking, Reading, Writing, Giữa kỳ, Cuối kỳ & Chuyên cần
          </p>
        </div>

        <div className="class-picker">
          <ResponsiveSelect label="Lớp xem điểm" value={selectedClassId} onChange={setSelectedClassId}
            disabled={permittedClasses.length === 0} placeholder="Chưa có lớp được phân quyền" options={[
              ...(isOwner ? [{ value: 'all', label: 'Tất cả lớp học' }] : permittedClasses.length > 1 ? [{ value: 'all', label: 'Tất cả lớp được phân công' }] : []),
              ...permittedClasses.map(c => ({ value: c.id, label: c.name })),
            ]} />
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

      {/* View Switcher & Horizontal Scroll Helper Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
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

          <span className="text-xs text-slate-500 font-medium">
            <strong className="text-slate-900 font-bold">{classStudents.length}</strong> học viên
          </span>
        </div>

      </div>

      {/* GRADE CONTENT: TABLE OR MOBILE CARDS */}
      {viewMode === 'table' ? (
        /* Gradebook Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <HorizontalScroll label="Điểm số" className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[1100px] text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold">
                <tr>
                  <th className="py-3.5 px-3 w-28 min-w-[112px] max-w-[112px] sticky left-0 bg-slate-800 z-20 whitespace-nowrap">Mã HS</th>
                  <th className="py-3.5 px-4 min-w-[170px] sticky left-28 bg-slate-800 z-20 border-r border-slate-700 shadow-r whitespace-nowrap">Họ Và Tên</th>
                  <th className="py-3.5 px-3 text-center bg-slate-900/40 min-w-[90px]">Nghe (Listening)</th>
                  <th className="py-3.5 px-3 text-center bg-slate-900/40 min-w-[90px]">Nói (Speaking)</th>
                  <th className="py-3.5 px-3 text-center bg-slate-900/40 min-w-[90px]">Đọc (Reading)</th>
                  <th className="py-3.5 px-3 text-center bg-slate-900/40 min-w-[90px]">Viết (Writing)</th>
                  <th className="py-3.5 px-3 text-center min-w-[90px]">Giữa Kỳ</th>
                  <th className="py-3.5 px-3 text-center min-w-[90px]">Cuối Kỳ</th>
                  <th className="py-3.5 px-3 text-center min-w-[90px]">Chuyên Cần</th>
                  <th className="py-3.5 px-4 text-center bg-amber-600 text-slate-950 font-extrabold min-w-[80px]">ĐTB</th>
                  <th className="py-3.5 px-3 text-center min-w-[160px]">Hành Động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {classStudents.map((st) => {
                  const grade = grades.find(g => g.studentId === st.id && g.classId === st.classId) || {
                    id: `G_${st.id}`,
                    studentId: st.id,
                    classId: st.classId,
                    listening: 7.0,
                    speaking: 7.0,
                    reading: 7.0,
                    writing: 7.0,
                    midterm: 7.0,
                    finalExam: 7.0,
                    attendance: 10,
                    average: 7.0
                  };

                  return (
                    <tr key={st.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="py-3 px-3 w-28 min-w-[112px] max-w-[112px] font-bold font-mono text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50 z-10 whitespace-nowrap">{st.code}</td>
                      <td className="py-3 px-4 min-w-[170px] font-bold text-slate-900 sticky left-28 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 shadow-r whitespace-nowrap">{st.name}</td>

                      {/* Listening */}
                      <td className="p-2 text-center bg-slate-50/50">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          value={grade.listening}
                          disabled={!canEdit}
                          onChange={(e) => handleGradeChange(st.id, 'listening', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Speaking */}
                      <td className="p-2 text-center bg-slate-50/50">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          value={grade.speaking}
                          disabled={!canEdit}
                          onChange={(e) => handleGradeChange(st.id, 'speaking', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Reading */}
                      <td className="p-2 text-center bg-slate-50/50">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          value={grade.reading}
                          disabled={!canEdit}
                          onChange={(e) => handleGradeChange(st.id, 'reading', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Writing */}
                      <td className="p-2 text-center bg-slate-50/50">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          value={grade.writing}
                          disabled={!canEdit}
                          onChange={(e) => handleGradeChange(st.id, 'writing', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Midterm */}
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          value={grade.midterm}
                          disabled={!canEdit}
                          onChange={(e) => handleGradeChange(st.id, 'midterm', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Final */}
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          value={grade.finalExam}
                          disabled={!canEdit}
                          onChange={(e) => handleGradeChange(st.id, 'finalExam', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Attendance */}
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          value={grade.attendance}
                          disabled={!canEdit}
                          onChange={(e) => handleGradeChange(st.id, 'attendance', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                      </td>

                      {/* Average */}
                      <td className="py-3 px-4 text-center bg-amber-50 font-black text-sm text-slate-950 border-l border-amber-200">
                        {grade.average}
                      </td>

                      {/* Report Card Action */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setReportingStudent(st)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 text-white rounded-lg text-[11px] font-bold hover:bg-slate-800 transition shadow-2xs cursor-pointer"
                            title="Xem và In Phiếu Báo Điểm"
                          >
                            <FileText className="w-3.5 h-3.5 text-amber-400" />
                            Phiếu Điểm
                          </button>
                          <button
                            type="button"
                            onClick={() => setSharingStudent(st)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition shadow-2xs active:scale-95 cursor-pointer"
                            title="Gửi phiếu báo điểm qua Zalo, Messenger"
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
            const grade = grades.find(g => g.studentId === st.id && g.classId === st.classId) || {
              id: `G_${st.id}`,
              studentId: st.id,
              classId: st.classId,
              listening: 7.0,
              speaking: 7.0,
              reading: 7.0,
              writing: 7.0,
              midterm: 7.0,
              finalExam: 7.0,
              attendance: 10,
              average: 7.0
            };

            return (
              <div
                key={st.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-md transition-all space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                      {st.code}
                    </span>
                    <h4 className="font-extrabold text-slate-900 text-sm mt-1 truncate">
                      {st.name}
                    </h4>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">ĐTB</span>
                    <span className="text-base font-black text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-lg border border-amber-300">
                      {grade.average}
                    </span>
                  </div>
                </div>

                {/* 4 Skills Inputs/Scores */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-600 block">4 Kỹ năng (0 - 10):</span>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-semibold block">Nghe</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={grade.listening}
                        disabled={!canEdit}
                        onChange={(e) => handleGradeChange(st.id, 'listening', parseFloat(e.target.value) || 0)}
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded"
                      />
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-semibold block">Nói</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={grade.speaking}
                        disabled={!canEdit}
                        onChange={(e) => handleGradeChange(st.id, 'speaking', parseFloat(e.target.value) || 0)}
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded"
                      />
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-semibold block">Đọc</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={grade.reading}
                        disabled={!canEdit}
                        onChange={(e) => handleGradeChange(st.id, 'reading', parseFloat(e.target.value) || 0)}
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded"
                      />
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-semibold block">Viết</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={grade.writing}
                        disabled={!canEdit}
                        onChange={(e) => handleGradeChange(st.id, 'writing', parseFloat(e.target.value) || 0)}
                        className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded"
                      />
                    </div>
                  </div>
                </div>

                {/* Exam Scores */}
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold block">Giữa Kỳ</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={grade.midterm}
                      disabled={!canEdit}
                      onChange={(e) => handleGradeChange(st.id, 'midterm', parseFloat(e.target.value) || 0)}
                      className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded"
                    />
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold block">Cuối Kỳ</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={grade.finalExam}
                      disabled={!canEdit}
                      onChange={(e) => handleGradeChange(st.id, 'finalExam', parseFloat(e.target.value) || 0)}
                      className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded"
                    />
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold block">Chuyên Cần</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={grade.attendance}
                      disabled={!canEdit}
                      onChange={(e) => handleGradeChange(st.id, 'attendance', parseFloat(e.target.value) || 0)}
                      className="w-full text-center text-xs font-bold py-0.5 bg-white border border-slate-300 rounded"
                    />
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setReportingStudent(st)}
                    className="flex-1 py-1.5 px-3 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>Phiếu Điểm</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharingStudent(st)}
                    className="flex-1 py-1.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                  >
                    <Share2 className="w-3.5 h-3.5 text-slate-950" />
                    <span>Chia Sẻ Ảnh</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Report Card Modal */}
      {reportingStudent && (
        <ReportCardModal
          student={reportingStudent}
          grade={
            grades.find(g => g.studentId === reportingStudent.id && g.classId === reportingStudent.classId) || {
              id: `G_${reportingStudent.id}`,
              studentId: reportingStudent.id,
              classId: reportingStudent.classId,
              listening: 7.0,
              speaking: 7.0,
              reading: 7.0,
              writing: 7.0,
              midterm: 7.0,
              finalExam: 7.0,
              attendance: 10,
              average: 7.0
            }
          }
          classroom={classes.find(c => c.id === reportingStudent.classId)}
          teacher={teachers.find(
            t => t.id === classes.find(c => c.id === reportingStudent.classId)?.teacherId
          )}
          program={programs.find(p => p.id === reportingStudent.programId)}
          settings={settings}
          onClose={() => setReportingStudent(null)}
          onUpdateGrade={onUpdateGrade}
        />
      )}

      {/* Quick Share Report Card Modal */}
      {sharingStudent && (
        <ShareReportCardModal
          isOpen={Boolean(sharingStudent)}
          onClose={() => setSharingStudent(null)}
          student={sharingStudent}
          grade={
            grades.find(g => g.studentId === sharingStudent.id && g.classId === sharingStudent.classId) || {
              id: `G_${sharingStudent.id}`,
              studentId: sharingStudent.id,
              classId: sharingStudent.classId,
              listening: 7.0,
              speaking: 7.0,
              reading: 7.0,
              writing: 7.0,
              midterm: 7.0,
              finalExam: 7.0,
              attendance: 10,
              average: 7.0
            }
          }
          classroom={classes.find(c => c.id === sharingStudent.classId)}
          teacher={teachers.find(
            t => t.id === classes.find(c => c.id === sharingStudent.classId)?.teacherId
          )}
          program={programs.find(p => p.id === sharingStudent.programId)}
          settings={settings}
          onUpdateGrade={onUpdateGrade}
          onPrintPdf={() => {
            setReportingStudent(sharingStudent);
            setSharingStudent(null);
          }}
        />
      )}
    </div>
  );
};
