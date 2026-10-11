import React, { useState } from 'react';
import { Grade, Student, ClassRoom, StaffPermissions } from '../types';
import { Award, Search, Save, Edit, BookOpen, CheckCircle, AlertCircle } from 'lucide-react';
import { isStudentInClass } from '../lib/student';

interface GradeManagerProps {
  grades: Grade[];
  students: Student[];
  classes: ClassRoom[];
  permissions: StaffPermissions;
  isOwner: boolean;
  onUpdateGrade: (updatedGrade: Grade) => void;
}

export const GradeManager: React.FC<GradeManagerProps> = ({
  grades,
  students,
  classes,
  permissions,
  isOwner,
  onUpdateGrade
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || 'all');
  const [searchTerm, setSearchTerm] = useState('');

  const canEdit = isOwner || permissions.grade.edit;

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const classStudents = students.filter(
    s => (selectedClassId === 'all' || isStudentInClass(s, selectedClassId, selectedClass)) &&
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateAvg = (g: Grade): number => {
    // Weightings: Skills 40%, Midterm 20%, Final 30%, Attendance 10%
    const skillsAvg = (g.listening + g.speaking + g.reading + g.writing) / 4;
    const avg = (skillsAvg * 0.4) + (g.midterm * 0.2) + (g.finalExam * 0.3) + (g.attendance * 0.1);
    return Math.round(avg * 10) / 10;
  };

  const handleGradeChange = (studentId: string, targetClassId: string, field: keyof Grade, value: number) => {
    const existing = grades.find(g => g.studentId === studentId && (g.classId ? g.classId === targetClassId : true)) || {
      id: `G_${studentId}_${targetClassId}`,
      studentId,
      classId: targetClassId,
      listening: 7.0,
      speaking: 7.0,
      reading: 7.0,
      writing: 7.0,
      midterm: 7.0,
      finalExam: 7.0,
      attendance: 10,
      average: 7.0
    };

    const updated = {
      ...existing,
      classId: targetClassId,
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
            <Award className="w-6 h-6 text-red-700" />
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
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-red-700"
          >
            <option value="all">Tất cả lớp học</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              {classStudents.map((st) => {
                const targetClassId = selectedClassId !== 'all' ? selectedClassId : st.classId;
                const grade = grades.find(g => g.studentId === st.id && (g.classId ? g.classId === targetClassId : true)) || {
                  id: `G_${st.id}_${targetClassId}`,
                  studentId: st.id,
                  classId: targetClassId,
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
                  <tr key={`${st.id}-${targetClassId}`} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-red-800">{st.code}</td>
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
                        onChange={(e) => handleGradeChange(st.id, targetClassId, 'listening', parseFloat(e.target.value) || 0)}
                        className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-red-700 bg-white"
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
                        onChange={(e) => handleGradeChange(st.id, targetClassId, 'speaking', parseFloat(e.target.value) || 0)}
                        className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-red-700 bg-white"
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
                        onChange={(e) => handleGradeChange(st.id, targetClassId, 'reading', parseFloat(e.target.value) || 0)}
                        className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-red-700 bg-white"
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
                        onChange={(e) => handleGradeChange(st.id, targetClassId, 'writing', parseFloat(e.target.value) || 0)}
                        className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-red-700 bg-white"
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
                        onChange={(e) => handleGradeChange(st.id, targetClassId, 'midterm', parseFloat(e.target.value) || 0)}
                        className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-red-700 bg-white"
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
                        onChange={(e) => handleGradeChange(st.id, targetClassId, 'finalExam', parseFloat(e.target.value) || 0)}
                        className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-red-700 bg-white"
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
                        onChange={(e) => handleGradeChange(st.id, targetClassId, 'attendance', parseFloat(e.target.value) || 0)}
                        className="w-14 text-center py-1 border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-red-700 bg-white"
                      />
                    </td>

                    {/* Average */}
                    <td className="py-3 px-4 text-center bg-amber-50 font-extrabold text-sm text-red-900 border-l border-amber-200">
                      {grade.average}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
