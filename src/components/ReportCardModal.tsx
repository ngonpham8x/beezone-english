import React from 'react';
import { Grade, Student, ClassRoom, Teacher, CourseProgram, CenterSettings } from '../types';
import { Award, Printer, X, CheckCircle2 } from 'lucide-react';
import { Logo } from './Logo';

interface ReportCardModalProps {
  grade: Grade;
  student: Student;
  classroom?: ClassRoom;
  teacher?: Teacher;
  program?: CourseProgram;
  settings: CenterSettings;
  onClose: () => void;
}

export const ReportCardModal: React.FC<ReportCardModalProps> = ({
  grade,
  student,
  classroom,
  teacher,
  program,
  settings,
  onClose
}) => {
  const getRank = (avg: number) => {
    if (avg >= 9.0) return { label: 'XUẤT SẮC (EXCELLENT)', color: 'text-emerald-700 bg-emerald-50 border-emerald-300' };
    if (avg >= 8.0) return { label: 'GIỎI (VERY GOOD)', color: 'text-blue-700 bg-blue-50 border-blue-300' };
    if (avg >= 6.5) return { label: 'KHÁ (GOOD)', color: 'text-amber-700 bg-amber-50 border-amber-300' };
    if (avg >= 5.0) return { label: 'TRUNG BÌNH (AVERAGE)', color: 'text-orange-700 bg-orange-50 border-orange-300' };
    return { label: 'CẦN CỐ GẮNG (NEEDS IMPROVEMENT)', color: 'text-red-700 bg-red-50 border-red-300' };
  };

  const rank = getRank(grade.average);

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = `BEEZONE_PhieuDiem_${student.name.replace(/\s+/g, '_')}_${classroom?.name || 'BeeZone'}`;
    document.body.dataset.printing = 'report-card';
    const pageStyle = document.createElement('style');
    pageStyle.id = 'report-card-page-style';
    pageStyle.textContent = '@page { size: auto; margin: 8mm; }';
    document.head.appendChild(pageStyle);
    const cleanup = () => {
      delete document.body.dataset.printing;
      pageStyle.remove();
      document.title = prevTitle;
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  const skills = [
    { name: 'Listening (Kỹ năng Nghe)', score: grade.listening, max: 10, desc: 'Khả năng nhận diện ngữ âm, bắt ý chính và chi tiết bài nghe.' },
    { name: 'Speaking (Kỹ năng Nói)', score: grade.speaking, max: 10, desc: 'Độ lưu loát, phát âm chuẩn IPA, phản xạ trả lời câu hỏi.' },
    { name: 'Reading (Kỹ năng Đọc)', score: grade.reading, max: 10, desc: 'Vốn từ vựng, khả năng đọc hiểu ngữ cảnh và tìm từ khóa.' },
    { name: 'Writing (Kỹ năng Viết)', score: grade.writing, max: 10, desc: 'Cấu trúc câu, ngữ pháp chính xác và diễn đạt mạch lạc.' }
  ];

  return (
    <div data-print-report-card-overlay className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div data-print-report-card className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 my-auto print:max-w-none print:w-full print:p-0 print:m-0 print:border-none print:shadow-none">
        {/* Actions bar (hidden in print) */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 print:hidden">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-600" />
            Xem Trước Phiếu Báo Điểm Học Viên
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition shadow-sm active:scale-95"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              In Phiếu Báo Điểm (Print / PDF)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Content */}
        <div className="border-4 border-double border-amber-500/50 p-6 sm:p-8 print:p-4 rounded-2xl bg-gradient-to-b from-amber-50/30 via-white to-slate-50/40 print:bg-white print:border-2 break-inside-avoid page-break-inside-avoid">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-amber-400/40 pb-4">
            <div className="flex items-center gap-3">
              <Logo size={60} />
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-950 uppercase tracking-wide">
                  {settings.name || 'TRUNG TÂM ANH NGỮ BEEZONE'}
                </h1>
                <p className="text-xs text-amber-700 font-bold italic">
                  {settings.slogan || 'Inspiring Excellence in English'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Đ/C: {settings.address} · Hotline: {settings.phone} · Email: {settings.email}
                </p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <span className="text-[11px] font-mono text-slate-400 font-bold">Mã HS: {student.code}</span>
              <p className="text-xs font-bold text-slate-600 mt-1">NĂM HỌC 2026</p>
            </div>
          </div>

          {/* Title */}
          <div className="text-center my-6 print:my-2">
            <h2 className="text-xl sm:text-2xl print:text-lg font-black text-slate-900 tracking-wider uppercase">
              PHIẾU ĐÁNH GIÁ KẾT QUẢ HỌC TẬP
            </h2>
            <p className="text-xs print:text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 print:mt-0.5">
              STUDENT PROGRESS REPORT & TRANSCRIPT
            </p>
          </div>

          {/* Student Info Box */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:gap-2 bg-slate-50/80 p-4 print:p-2.5 rounded-xl border border-slate-200 text-xs mb-6 print:mb-2.5">
            <div>
              <span className="text-slate-500 font-medium block">Học viên:</span>
              <strong className="text-slate-900 font-bold text-sm print:text-xs">{student.name}</strong>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Lớp học:</span>
              <strong className="text-slate-800">{classroom?.name || 'Chưa gán'}</strong>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Khóa học:</span>
              <strong className="text-slate-800">{program?.name || 'Khóa Tiếng Anh'}</strong>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Giáo viên phụ trách:</span>
              <strong className="text-indigo-800">{teacher?.name || 'Giáo viên phụ trách'}</strong>
            </div>
          </div>

          {/* 4 Skills Breakdown */}
          <div className="mb-6 print:mb-2.5">
            <h3 className="text-xs print:text-[11px] font-black uppercase text-slate-800 tracking-wider mb-3 print:mb-1.5 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-red-700" />
              Kết quả đánh giá 4 kỹ năng ngôn ngữ:
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:gap-2">
              {skills.map(s => (
                <div key={s.name} className="p-3 print:p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold mb-1 print:mb-0.5">
                    <span className="text-slate-800">{s.name}</span>
                    <span className="text-sm print:text-xs font-extrabold text-red-800">{s.score}/10</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 print:h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5 print:mb-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-red-600 to-amber-500 rounded-full"
                      style={{ width: `${(s.score / s.max) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] print:text-[10px] text-slate-500">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Test Scores & Overall Evaluation */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:gap-2 mb-6 print:mb-2.5 text-center">
            <div className="p-3 print:p-1.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] print:text-[10px] font-bold text-slate-500 uppercase">Giữa Kỳ</span>
              <p className="text-lg print:text-base font-black text-slate-800 mt-0.5">{grade.midterm}</p>
            </div>
            <div className="p-3 print:p-1.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] print:text-[10px] font-bold text-slate-500 uppercase">Cuối Kỳ</span>
              <p className="text-lg print:text-base font-black text-slate-800 mt-0.5">{grade.finalExam}</p>
            </div>
            <div className="p-3 print:p-1.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] print:text-[10px] font-bold text-slate-500 uppercase">Chuyên Cần</span>
              <p className="text-lg print:text-base font-black text-slate-800 mt-0.5">{grade.attendance}/10</p>
            </div>
            <div className="p-3 print:p-1.5 bg-amber-50 rounded-xl border border-amber-300">
              <span className="text-[11px] print:text-[10px] font-bold text-amber-800 uppercase">Điểm Trung Bình</span>
              <p className="text-2xl print:text-lg font-black text-red-900 mt-0.5">{grade.average}</p>
            </div>
          </div>

          {/* Rank Banner */}
          <div className={`p-3 print:p-1.5 rounded-xl border text-center font-extrabold text-sm print:text-xs mb-6 print:mb-2 ${rank.color}`}>
            XẾP LOẠI TOÀN KHÓA: {rank.label}
          </div>

          {/* Teacher's Feedback */}
          <div className="mb-6 print:mb-2 p-4 print:p-2 rounded-xl border border-slate-200 bg-slate-50/60">
            <h4 className="text-xs print:text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-1.5 print:mb-0.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Nhận xét & Lời khuyên của Giáo viên:
            </h4>
            <p className="text-xs print:text-[11px] text-slate-700 leading-relaxed italic">
              "Em {student.name} có thái độ học tập nghiêm túc, tích cực đóng góp trong các giờ thảo luận nhóm.
              Kỹ năng Nghe và Nói có tiến bộ vượt bậc so với đầu khóa. Cần duy trì thói quen luyện nghe tin tức tiếng Anh
              hằng ngày và mở rộng thêm vốn từ vựng học thuật để sẵn sàng cho cấp độ tiếp theo."
            </p>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 text-center text-xs pt-4 mt-4 print:pt-1 print:mt-1 border-t border-slate-200">
            <div>
              <p className="font-bold text-slate-500 print:text-[11px]">GIÁO VIÊN PHỤ TRÁCH</p>
              <p className="italic text-[11px] print:text-[10px] text-slate-400 mt-0.5">(Ký và ghi rõ họ tên)</p>
              <div className="h-16 print:h-10 flex items-end justify-center font-bold text-indigo-900 print:text-xs">
                {teacher?.name || 'Giáo viên phụ trách'}
              </div>
            </div>
            <div>
              <p className="font-bold text-slate-500 print:text-[11px]">GIÁM ĐỐC TRUNG TÂM</p>
              <p className="italic text-[11px] print:text-[10px] text-slate-400 mt-0.5">(Ký tên và đóng dấu)</p>
              <div className="h-16 print:h-10 flex items-end justify-center font-black text-red-950 uppercase print:text-xs">
                {settings.name || 'BEEZONE ENGLISH'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

