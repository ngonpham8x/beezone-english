import {
  Award,
  Check,
  CheckCircle2,
  Edit3,
  Printer,
  Save,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DialogFrame } from '../../components/DialogFrame';
import { Logo } from '../../components/Logo';
import { CenterSettings, ClassRoom, CourseProgram, Grade, Student, Teacher } from '../../types';
import { ShareReportCardModal } from './ShareReportCardModal';

interface ReportCardModalProps {
  grade: Grade;
  student: Student;
  classroom?: ClassRoom;
  teacher?: Teacher;
  program?: CourseProgram;
  settings: CenterSettings;
  onClose: () => void;
  onUpdateGrade?: (updatedGrade: Grade) => void;
  showPersonalInfo?: boolean;
}

export const ReportCardModal: React.FC<ReportCardModalProps> = ({
  grade,
  student,
  classroom,
  teacher,
  program,
  settings,
  onClose,
  onUpdateGrade,
  showPersonalInfo = true,
}) => {
  const defaultFeedback =
    grade.comment ||
    (showPersonalInfo ? student.notes?.trim() : '') ||
    `Em ${student.name} có thái độ học tập nghiêm túc, tích cực đóng góp trong các giờ thảo luận nhóm. Kỹ năng Nghe và Nói có tiến bộ vượt bậc so với đầu khóa. Cần duy trì thói quen luyện nghe tin tức tiếng Anh hằng ngày và mở rộng thêm vốn từ vựng học thuật để sẵn sàng cho cấp độ tiếp theo.`;

  const [feedback, setFeedback] = useState(defaultFeedback);
  const [isEditingFeedback, setIsEditingFeedback] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (grade.comment) {
      setFeedback(grade.comment);
    }
  }, [grade.comment]);

  const handleSaveFeedback = () => {
    const updatedGrade: Grade = {
      ...grade,
      comment: feedback
    };
    if (onUpdateGrade) {
      onUpdateGrade(updatedGrade);
    }
    setIsEditingFeedback(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const templates = [
    {
      title: 'Xuất sắc / Giỏi',
      text: `Em ${student.name} có thái độ học tập xuất sắc, tiếp thu kiến thức nhanh, phát âm chuẩn và phản xạ giao tiếp tự tin. Rất tích cực đóng góp xây dựng bài học.`
    },
    {
      title: 'Khá / Tiến bộ',
      text: `Em ${student.name} có thái độ học tập nghiêm túc, kỹ năng Nghe và Đọc tốt. Cần duy trì thói quen luyện nói tiếng Anh hằng ngày để phản xạ lưu loát hơn nữa.`
    },
    {
      title: 'Cần cố gắng',
      text: `Em ${student.name} ngoan, chú ý nghe giảng. Cần tập trung hơn trong giờ học và chủ động ôn luyện từ vựng, ngữ pháp tại nhà để đạt kết quả cao hơn.`
    }
  ];
  const getRank = (avg: number) => {
    if (avg >= 9.0) return { label: 'XUẤT SẮC (EXCELLENT)', color: 'text-emerald-700 bg-emerald-50 border-emerald-300' };
    if (avg >= 8.0) return { label: 'GIỎI (VERY GOOD)', color: 'text-blue-700 bg-blue-50 border-blue-300' };
    if (avg >= 6.5) return { label: 'KHÁ (GOOD)', color: 'text-amber-700 bg-amber-50 border-amber-300' };
    if (avg >= 5.0) return { label: 'TRUNG BÌNH (AVERAGE)', color: 'text-orange-700 bg-orange-50 border-orange-300' };
    return { label: 'CẦN CỐ GẮNG (NEEDS IMPROVEMENT)', color: 'text-red-700 bg-red-50 border-red-300' };
  };

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const rank = getRank(grade.average);

  const formatDob = (dob?: string) => {
    if (!dob) return '';
    try {
      const d = new Date(dob);
      if (isNaN(d.getTime())) return dob;
      return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(d);
    } catch {
      return dob;
    }
  };

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = `BEEZONE_PhieuDiem_${student.name.replace(/\s+/g, '_')}_${classroom?.name || 'BeeZone'}`;
    document.body.dataset.printing = 'report-card';
    const pageStyle = document.createElement('style');
    pageStyle.id = 'report-card-page-style';
    // Force A4 Portrait and ensure zero extra margins to fit strictly onto 1 page
    pageStyle.textContent = '@page { size: A4 portrait !important; margin: 5mm 6mm !important; }';
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

  const modalContent = (
    <DialogFrame label="Phiếu báo điểm học viên" onClose={onClose} data-print-report-card-overlay className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div data-print-report-card className="dialog-panel bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 my-auto print:max-w-none print:w-full print:p-0 print:m-0 print:border-none print:shadow-none">
        {/* Actions bar (hidden in print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200 print:hidden">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-600" />
            Xem Trước Phiếu Báo Điểm Học Viên
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:opacity-95 text-slate-950 rounded-xl text-xs font-black transition shadow-xs active:scale-95"
              title="Chia sẻ hình ảnh phiếu điểm qua Zalo, Messenger hoặc tải ảnh PNG"
            >
              <Share2 className="w-4 h-4 text-slate-950" />
              <span>Chia sẻ ảnh</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition shadow-sm active:scale-95"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>In / PDF</span>
            </button>
            <button aria-label="Đóng"
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Content */}
        <div className="border-4 border-double border-amber-500/50 p-3 sm:p-8 print:p-3 rounded-2xl bg-gradient-to-b from-amber-50/30 via-white to-slate-50/40 print:bg-white print:border-2 break-inside-avoid page-break-inside-avoid">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-amber-400/40 pb-4 print:pb-1.5">
            <div className="flex items-center gap-3">
              <Logo size={52} />
              <div>
                <h1 className="text-lg sm:text-xl print:text-base font-extrabold text-slate-950 uppercase tracking-wide">
                  {settings.name || 'TRUNG TÂM ANH NGỮ BEEZONE'}
                </h1>
                <p className="text-xs print:text-[10px] text-amber-700 font-bold italic">
                  {settings.slogan || 'Inspiring Excellence in English'}
                </p>
                <p className="text-[11px] print:text-[9.5px] text-slate-500 mt-0.5">
                  Đ/C: {settings.address} · Hotline: {settings.phone} · Email: {settings.email}
                </p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <span className="text-[11px] print:text-[10px] font-mono text-slate-400 font-bold">Mã HS: {student.code}</span>
              <p className="text-xs print:text-[10px] font-bold text-slate-600 mt-1">NĂM HỌC 2026</p>
            </div>
          </div>

          {/* Title */}
          <div className="text-center my-6 print:my-1.5">
            <h2 className="text-xl sm:text-2xl print:text-base font-black text-slate-900 tracking-wider uppercase">
              PHIẾU ĐÁNH GIÁ KẾT QUẢ HỌC TẬP
            </h2>
            <p className="text-xs print:text-[9.5px] text-slate-500 font-bold uppercase tracking-widest mt-1 print:mt-0.5">
              STUDENT PROGRESS REPORT & TRANSCRIPT
            </p>
          </div>

          {/* Student Info Box */}
          <div className="bg-amber-50/50 p-4 print:p-2 rounded-2xl border border-amber-200/90 text-xs mb-6 print:mb-1.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 print:gap-1.5">
              <div className="space-y-2 print:space-y-1">
                <div>
                  <span className="text-slate-500 text-[11px] print:text-[10px] font-semibold block">Họ và tên học viên:</span>
                  <strong className="text-slate-950 font-black text-base print:text-sm block leading-snug break-words text-amber-950">
                    {student.name}
                  </strong>
                </div>
                <div className="flex items-center gap-3 flex-wrap pt-0.5">
                  <div>
                    <span className="text-slate-500 text-[10px] print:text-[9px] font-medium block">Mã học viên:</span>
                    <span className="font-mono font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded text-xs print:text-[10px] border border-amber-200">
                      {student.code}
                    </span>
                  </div>
                  {showPersonalInfo && student.dob && (
                    <div>
                      <span className="text-slate-500 text-[10px] print:text-[9px] font-medium block">Ngày sinh:</span>
                      <span className="font-bold text-slate-800 text-xs print:text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200">
                        {formatDob(student.dob)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 print:space-y-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500 text-[11px] print:text-[10px] font-semibold block">Lớp học:</span>
                    <strong className="text-slate-900 font-bold text-xs print:text-[11px] block leading-snug break-words">
                      {classroom?.name || 'BeeZone'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] print:text-[10px] font-semibold block">Chương trình / Khóa học:</span>
                    <strong className="text-slate-900 font-bold text-xs print:text-[11px] block leading-snug break-words">
                      {program?.name || 'Khóa Tiếng Anh'}
                    </strong>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <span className="text-slate-500 text-[11px] print:text-[10px] font-semibold block">Giáo viên phụ trách:</span>
                    <strong className="text-indigo-900 font-bold text-xs print:text-[11px] block leading-snug break-words">
                      {teacher?.name || 'Giáo viên BeeZone'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] print:text-[10px] font-semibold block">Năm học:</span>
                    <strong className="text-slate-700 font-bold text-xs print:text-[11px] block">
                      2026
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Skills Breakdown */}
          <div className="mb-6 print:mb-1.5">
            <h3 className="text-xs print:text-[10px] font-black uppercase text-slate-800 tracking-wider mb-3 print:mb-1 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-red-700" />
              Kết quả đánh giá 4 kỹ năng ngôn ngữ:
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:gap-1.5">
              {skills.map(s => (
                <div key={s.name} className="p-3 print:p-1.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold mb-1 print:mb-0.5">
                    <span className="text-slate-800 print:text-[11px]">{s.name}</span>
                    <span className="text-sm print:text-xs font-extrabold text-red-800">{s.score}/10</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 print:h-1 bg-slate-100 rounded-full overflow-hidden mb-1.5 print:mb-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-red-600 to-amber-500 rounded-full"
                      style={{ width: `${(s.score / s.max) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] print:text-[9.5px] text-slate-500">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Test Scores & Overall Evaluation */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:gap-1.5 mb-6 print:mb-1.5 text-center">
            <div className="p-3 print:p-1 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] print:text-[9.5px] font-bold text-slate-500 uppercase">Giữa Kỳ</span>
              <p className="text-lg print:text-sm font-black text-slate-800 mt-0.5">{grade.midterm}</p>
            </div>
            <div className="p-3 print:p-1 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] print:text-[9.5px] font-bold text-slate-500 uppercase">Cuối Kỳ</span>
              <p className="text-lg print:text-sm font-black text-slate-800 mt-0.5">{grade.finalExam}</p>
            </div>
            <div className="p-3 print:p-1 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] print:text-[9.5px] font-bold text-slate-500 uppercase">Chuyên Cần</span>
              <p className="text-lg print:text-sm font-black text-slate-800 mt-0.5">{grade.attendance}/10</p>
            </div>
            <div className="p-3 print:p-1 bg-amber-50 rounded-xl border border-amber-300">
              <span className="text-[11px] print:text-[9.5px] font-bold text-amber-800 uppercase">Điểm Trung Bình</span>
              <p className="text-2xl print:text-base font-black text-red-900 mt-0.5">{grade.average}</p>
            </div>
          </div>

          {/* Rank Banner */}
          <div className={`p-3 print:p-1 rounded-xl border text-center font-extrabold text-sm print:text-xs mb-6 print:mb-1.5 ${rank.color}`}>
            XẾP LOẠI TOÀN KHÓA: {rank.label}
          </div>

          {/* Teacher's Feedback */}
          <div className="mb-6 print:mb-1.5 p-4 print:p-2 rounded-2xl border-2 border-slate-200 bg-slate-50/80 transition-all">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs print:text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                Nhận xét & Lời khuyên của Giáo viên:
              </h4>

              {/* Edit / Save controls - Hidden in Print */}
              <div className="print:hidden flex items-center gap-2">
                {saveSuccess && (
                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 animate-in fade-in">
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Đã lưu nhận xét!
                  </span>
                )}
                {!isEditingFeedback ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingFeedback(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer"
                    title="Bấm để chỉnh sửa nhận xét trực tiếp trên phiếu điểm"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                    <span>Sửa nhận xét</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSaveFeedback}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Lưu</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFeedback(grade.comment || defaultFeedback);
                        setIsEditingFeedback(false);
                      }}
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Editing mode */}
            {isEditingFeedback ? (
              <div className="space-y-2 print:hidden">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                  className="w-full p-3 bg-white border-2 border-amber-400 rounded-xl text-xs text-slate-800 leading-relaxed font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/30 shadow-inner"
                  placeholder="Nhập nhận xét và lời khuyên dành cho học viên..."
                  autoFocus
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-600" /> Mẫu nhanh:
                  </span>
                  {templates.map((tpl) => (
                    <button
                      key={tpl.title}
                      type="button"
                      onClick={() => setFeedback(tpl.text)}
                      className="text-[11px] px-2.5 py-0.5 bg-white hover:bg-amber-50 border border-slate-300 hover:border-amber-400 rounded-md text-slate-700 font-medium transition cursor-pointer"
                    >
                      {tpl.title}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFeedback(defaultFeedback)}
                    className="text-[11px] px-2 py-0.5 text-slate-500 hover:text-slate-800 underline ml-auto cursor-pointer"
                  >
                    Khôi phục gốc
                  </button>
                </div>
              </div>
            ) : (
              /* Display mode (both screen & print) */
              <div
                onClick={() => setIsEditingFeedback(true)}
                className="group relative cursor-pointer"
                title="Bấm vào để sửa nhận xét trực tiếp"
              >
                <p className="text-xs print:text-[11px] text-slate-700 leading-relaxed italic p-2 -m-2 rounded-xl transition-colors group-hover:bg-amber-50/70 border border-transparent group-hover:border-amber-200">
                  "{feedback}"
                </p>
                <span className="print:hidden text-[10px] text-amber-700 opacity-0 group-hover:opacity-100 transition-opacity font-semibold block mt-1">
                  ✎ Bấm vào đây để chỉnh sửa lời nhận xét
                </span>
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 text-center text-xs pt-4 mt-4 print:pt-1 print:mt-1 border-t border-slate-200">
            <div>
              <p className="font-bold text-slate-500 print:text-[11px]">GIÁO VIÊN PHỤ TRÁCH</p>
              <p className="italic text-[11px] print:text-[10px] text-slate-400 mt-0.5">(Ký và ghi rõ họ tên)</p>
              <div className="h-16 print:h-8 flex items-end justify-center font-bold text-indigo-900 print:text-xs">
                {teacher?.name || 'Giáo viên phụ trách'}
              </div>
            </div>
            <div>
              <p className="font-bold text-slate-500 print:text-[11px]">GIÁM ĐỐC TRUNG TÂM</p>
              <p className="italic text-[11px] print:text-[10px] text-slate-400 mt-0.5">(Ký tên và đóng dấu)</p>
              <div className="h-16 print:h-8 flex items-end justify-center font-black text-red-950 uppercase print:text-xs">
                {settings.name || 'BEEZONE ENGLISH'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isShareModalOpen && (
        <ShareReportCardModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          student={student}
          grade={{ ...grade, comment: feedback }}
          classroom={classroom}
          teacher={teacher}
          program={program}
          settings={settings}
          onUpdateGrade={onUpdateGrade}
          onPrintPdf={handlePrint}
        />
      )}
    </DialogFrame>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

