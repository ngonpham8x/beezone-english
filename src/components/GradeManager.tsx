import React, { useState, useMemo, useEffect } from 'react';
import { Grade, Student, ClassRoom, StaffPermissions, Teacher, CourseProgram, CenterSettings, UserAccount } from '../types';
import { Award, FileText, AlertCircle, BookOpen } from 'lucide-react';
import { ReportCardModal } from './ReportCardModal';

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

  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return isOwner ? 'all' : (permittedClasses[0]?.id || 'all');
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [reportingStudent, setReportingStudent] = useState<Student | null>(null);

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
    const existing = grades.find(g => g.studentId === studentId);
    if (!existing) return;

    const updated = {
      ...existing,
      [field]: Math.min(Math.max(value, 0), 10)
    };
    updated.average = calculateAvg(updated);
    onUpdateGrade(updated);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-600" />
            Bảng Điểm & Đánh Giá Kỹ Năng
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý điểm 4 kỹ năng Listening, Speaking, Reading, Writing, Giữa kỳ, Cuối kỳ & Chuyên cần
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            disabled={permittedClasses.length === 0}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500"
          >
            {isOwner && <option value="all">Tất cả lớp học</option>}
            {!isOwner && permittedClasses.length > 1 && <option value="all">Tất cả lớp được phân công</option>}
            {permittedClasses.length === 0 ? (
              <option value="">Chưa có lớp được phân quyền</option>
            ) : (
              permittedClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))
            )}
          </select>
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

      {/* Gradebook Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold">
              <tr>
                <th className="py-3 px-4">Mã HS</th>
                <th className="py-3 px-4">Họ Và Tên</th>
                <th className="py-3 px-3 text-center bg-slate-900/40">Nghe (Listening)</th>
                <th className="py-3 px-3 text-center bg-slate-900/40">Nói (Speaking)</th>
                <th className="py-3 px-3 text-center bg-slate-900/40">Đọc (Reading)</th>
                <th className="py-3 px-3 text-center bg-slate-900/40">Viết (Writing)</th>
                <th className="py-3 px-3 text-center">Giữa Kỳ</th>
                <th className="py-3 px-3 text-center">Cuối Kỳ</th>
                <th className="py-3 px-3 text-center">Chuyên Cần</th>
                <th className="py-3 px-4 text-center bg-amber-600 text-slate-950 font-extrabold">ĐTB</th>
                <th className="py-3 px-3 text-center">Hành Động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              {classStudents.map((st) => {
                const grade = grades.find(g => g.studentId === st.id) || {
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
                  <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold font-mono text-slate-900">{st.code}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{st.name}</td>

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
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setReportingStudent(st)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[11px] font-bold hover:bg-slate-800 transition shadow-2xs"
                        title="Xem và In Phiếu Báo Điểm"
                      >
                        <FileText className="w-3.5 h-3.5 text-amber-400" />
                        Phiếu Điểm
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report Card Modal */}
      {reportingStudent && (
        <ReportCardModal
          student={reportingStudent}
          grade={
            grades.find(g => g.studentId === reportingStudent.id) || {
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
        />
      )}
    </div>
  );
};
