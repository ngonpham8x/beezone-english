import { Award, TrendingUp } from 'lucide-react';
import React from 'react';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { calculateGradeYearSummary, GRADE_SEMESTERS } from '../../lib/gradebook';
import type { ClassRoom, Grade, Student } from '../../types';

interface Props {
  students: Array<Student & { classId: string }>;
  classes: ClassRoom[];
  grades: Grade[];
}

const score = (value?: number) => value === undefined ? '—' : value.toFixed(1);

export function GradeYearSummaryView({ students, classes, grades }: Props) {
  const rows = students.map((student) => ({
    student,
    classroom: classes.find((item) => item.id === student.classId),
    summary: calculateGradeYearSummary(
      grades.filter((grade) => grade.studentId === student.id && grade.classId === student.classId),
    ),
  }));

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
        <div className="flex items-center gap-2 font-black uppercase">
          <Award className="h-4 w-4" /> Tổng kết năng lực cuối năm
        </div>
        <p className="mt-1">
          ĐTB mỗi kỳ = (Nghe + Nói + Đọc &amp; Viết) / 10, tối đa 3 điểm và không gồm điểm UNIT. Điểm tổng kết năm là trung bình ĐTB của GKI, CKI, GKII và CKII; khi chưa đủ bốn kỳ, hệ thống hiển thị kết quả tạm tính.
        </p>
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs md:block">
        <HorizontalScroll label="Tổng kết điểm cuối năm">
          <table className="w-full min-w-[1050px] border-collapse text-xs text-slate-700">
            <thead className="bg-slate-800 text-[11px] font-bold uppercase text-white">
              <tr>
                <th className="px-3 py-3 text-left">Mã HS</th>
                <th className="min-w-44 px-3 py-3 text-left">Họ và tên</th>
                <th className="min-w-36 px-3 py-3 text-left">Lớp</th>
                {GRADE_SEMESTERS.map((semester) => <th key={semester} className="px-3 py-3 text-center">{semester}</th>)}
                <th className="bg-amber-500 px-3 py-3 text-center text-slate-950">Tổng kết năm</th>
                <th className="px-3 py-3 text-center">Đánh giá năng lực</th>
                <th className="px-3 py-3 text-center">Tiến trình</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student, classroom, summary }, index) => (
                <tr key={`${student.id}:${student.classId}`} className={index % 2 ? 'bg-slate-50/70' : 'bg-white'}>
                  <td className="border-b border-slate-100 px-3 py-3 font-mono font-bold">{student.code}</td>
                  <td className="border-b border-slate-100 px-3 py-3 font-bold text-slate-950">{student.name}</td>
                  <td className="border-b border-slate-100 px-3 py-3">{classroom?.name || '—'}</td>
                  {GRADE_SEMESTERS.map((semester) => (
                    <td key={semester} className="border-b border-slate-100 px-3 py-3 text-center font-bold">
                      {score(summary.semesterAverages[semester])}
                    </td>
                  ))}
                  <td className="border-b border-amber-100 bg-amber-50 px-3 py-3 text-center">
                    <div className="text-base font-black text-amber-900">{score(summary.average ?? undefined)}</div>
                    <div className={`text-[10px] font-semibold ${summary.complete ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {summary.complete ? 'Đủ 4/4 kỳ' : `Tạm tính ${summary.completedSemesters}/4 kỳ`}
                    </div>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 text-center font-bold text-slate-900">{summary.ability}</td>
                  <td className="border-b border-slate-100 px-3 py-3 text-center">{summary.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScroll>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map(({ student, classroom, summary }) => (
          <div key={`${student.id}:${student.classId}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
              <div>
                <div className="font-mono text-[11px] font-bold text-amber-800">{student.code}</div>
                <div className="font-extrabold text-slate-950">{student.name}</div>
                <div className="text-[11px] text-slate-500">{classroom?.name}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1 text-center">
                <div className="text-lg font-black text-amber-900">{score(summary.average ?? undefined)}</div>
                <div className="text-[9px] font-semibold text-amber-700">{summary.completedSemesters}/4 kỳ</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
              {GRADE_SEMESTERS.map((semester) => (
                <div key={semester} className="rounded-lg bg-slate-50 p-2">
                  <div className="text-[9px] font-bold text-slate-500">{semester}</div>
                  <div className="text-sm font-black text-slate-900">{score(summary.semesterAverages[semester])}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <span className="font-bold">{summary.ability}</span>
              <span className="inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> {summary.trend}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
