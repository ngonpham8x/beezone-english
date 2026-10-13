import React, { useState } from 'react';
import { Grade, Student, ClassRoom, Teacher, CourseProgram, CenterSettings } from '../types';
import { Share2, X, Copy, Check, FileText, FileSpreadsheet, MessageCircle, Send, CheckCircle2 } from 'lucide-react';
import ExcelJS from 'exceljs';

interface ShareReportCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  grade: Grade;
  classroom?: ClassRoom;
  teacher?: Teacher;
  program?: CourseProgram;
  settings: CenterSettings;
  onPrintPdf?: () => void;
}

export const ShareReportCardModal: React.FC<ShareReportCardModalProps> = ({
  isOpen,
  onClose,
  student,
  grade,
  classroom,
  teacher,
  program,
  settings,
  onPrintPdf
}) => {
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const getRankLabel = (avg: number) => {
    if (avg >= 9.0) return 'XUẤT SẮC (EXCELLENT)';
    if (avg >= 8.0) return 'GIỎI (VERY GOOD)';
    if (avg >= 6.5) return 'KHÁ (GOOD)';
    if (avg >= 5.0) return 'TRUNG BÌNH (AVERAGE)';
    return 'CẦN CỐ GẮNG (NEEDS IMPROVEMENT)';
  };

  const todayStr = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());

  const teacherFeedback =
    'Em có thái độ học tập nghiêm túc, tích cực đóng góp trong các giờ thảo luận nhóm. Kỹ năng Nghe và Nói có tiến bộ vượt bậc so với đầu khóa. Cần duy trì thói quen luyện nghe tin tức tiếng Anh hằng ngày để sẵn sàng cho cấp độ tiếp theo.';

  // Build the rich formatted text report matching the image
  const reportText = [
    `🎓 BÁO CÁO KẾT QUẢ HỌC TẬP — ${settings.name || 'ANH NGỮ BEEZONE'} 🐝`,
    `👤 Học viên: ${student.name} (Mã: ${student.code})`,
    `🏫 Lớp học: ${classroom?.name || 'BeeZone'} • Khóa: ${program?.name || 'Tiếng Anh'}`,
    `👩‍🏫 Giáo viên phụ trách: ${teacher?.name || 'Giáo viên BeeZone'}`,
    `📅 Ngày báo cáo: ${todayStr}`,
    `────────────────────────────────────────`,
    `📊 KẾT QUẢ ĐÁNH GIÁ 4 KỸ NĂNG:`,
    `🎧 Listening (Nghe): ${grade.listening}/10`,
    `🗣️ Speaking (Nói): ${grade.speaking}/10`,
    `📖 Reading (Đọc): ${grade.reading}/10`,
    `✍️ Writing (Viết): ${grade.writing}/10`,
    `────────────────────────────────────────`,
    `📝 ĐIỂM THI & ĐÁNH GIÁ TỔNG QUAN:`,
    `• Điểm Giữa Kỳ: ${grade.midterm}/10`,
    `• Điểm Cuối Kỳ: ${grade.finalExam}/10`,
    `• Chuyên cần: ${grade.attendance}/10`,
    `⭐ ĐIỂM TRUNG BÌNH: ${grade.average}/10`,
    `🏆 XẾP LOẠI TOÀN KHÓA: ${getRankLabel(grade.average)}`,
    `────────────────────────────────────────`,
    `💬 NHẬN XÉT CỦA GIÁO VIÊN:`,
    `"${teacherFeedback}"`,
    `────────────────────────────────────────`,
    `📍 ${settings.name || 'TRUNG TÂM ANH NGỮ BEEZONE'}`,
    `🏡 Đ/C: ${settings.address || '111 Ngô Quyền, Long Hải, Trường Tây, Hòa Thành, Tây Ninh'}`,
    `☎️ Hotline: ${settings.phone || '0847 563 679 - 098 440 6157'}`
  ].join('\n');

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      showToast('Đã sao chép nội dung văn bản báo cáo!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Không thể sao chép văn bản tự động.');
    }
  };

  const handleShareZalo = async () => {
    await handleCopyText();
    const phone = (student.parentPhone || student.phone || '').replace(/[^0-9]/g, '');
    const zaloUrl = phone.length >= 9 ? `https://zalo.me/${phone}` : 'https://zalo.me/';
    showToast('Đã sao chép nội dung và đang mở Zalo...');
    setTimeout(() => {
      window.open(zaloUrl, '_blank', 'noopener,noreferrer');
    }, 400);
  };

  const handleShareMessenger = async () => {
    await handleCopyText();
    showToast('Đã sao chép nội dung và đang mở Messenger...');
    setTimeout(() => {
      window.open('https://www.messenger.com/', '_blank', 'noopener,noreferrer');
    }, 400);
  };

  const handleShareFacebook = async () => {
    await handleCopyText();
    showToast('Đã sao chép nội dung và đang mở Facebook...');
    setTimeout(() => {
      window.open('https://www.facebook.com/', '_blank', 'noopener,noreferrer');
    }, 400);
  };

  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = settings.name || 'BeeZone English';
      const sheet = workbook.addWorksheet('PhieuDiem');

      // Setup sheet view
      sheet.views = [{ showGridLines: true }];

      // Title rows
      sheet.mergeCells('A1:D1');
      sheet.getCell('A1').value = `${settings.name || 'TRUNG TÂM ANH NGỮ BEEZONE'} - PHIẾU ĐIỂM HỌC VIÊN`;
      sheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
      sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B45309' } };
      sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 36;

      // Student info
      sheet.addRow(['Họ và tên:', student.name, 'Mã học viên:', student.code]);
      sheet.addRow(['Lớp học:', classroom?.name || 'BeeZone', 'Khóa học:', program?.name || 'Tiếng Anh']);
      sheet.addRow(['Giáo viên:', teacher?.name || 'BeeZone', 'Ngày xuất:', todayStr]);
      sheet.addRow([]);

      // Scores header
      const headerRow = sheet.addRow(['Mục Đánh Giá', 'Điểm Đạt Được', 'Thang Điểm', 'Ghi Chú']);
      headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D97706' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      headerRow.height = 26;

      sheet.addRow(['Listening (Nghe)', grade.listening, 10, 'Kỹ năng nghe hiểu']);
      sheet.addRow(['Speaking (Nói)', grade.speaking, 10, 'Phát âm và phản xạ']);
      sheet.addRow(['Reading (Đọc)', grade.reading, 10, 'Từ vựng và đọc hiểu']);
      sheet.addRow(['Writing (Viết)', grade.writing, 10, 'Cấu trúc câu và ngữ pháp']);
      sheet.addRow(['Điểm Giữa Kỳ', grade.midterm, 10, 'Kiểm tra giữa kỳ']);
      sheet.addRow(['Điểm Cuối Kỳ', grade.finalExam, 10, 'Kiểm tra cuối khóa']);
      sheet.addRow(['Chuyên Cần', grade.attendance, 10, 'Ý thức học tập']);

      // Average summary row
      const avgRow = sheet.addRow(['ĐIỂM TRUNG BÌNH', grade.average, 10, getRankLabel(grade.average)]);
      avgRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'B45309' } };
      avgRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
      });
      avgRow.height = 28;

      // Set column widths
      sheet.getColumn(1).width = 28;
      sheet.getColumn(2).width = 16;
      sheet.getColumn(3).width = 16;
      sheet.getColumn(4).width = 36;

      // Download file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BEEZONE_PhieuDiem_${student.name.replace(/\s+/g, '_')}_${todayStr.replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Đã xuất file Excel phiếu điểm thành công!');
    } catch (err) {
      console.error(err);
      showToast('Có lỗi khi tạo file Excel.');
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        {/* Header with vibrant blue-indigo gradient matching the screenshot */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 px-5 py-4 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 hover:text-white transition"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div className="pr-6">
              <h3 className="text-base font-extrabold uppercase tracking-wide leading-tight text-white drop-shadow-xs">
                GỬI PHIẾU BÁO ĐIỂM
              </h3>
              <p className="text-xs text-blue-100 font-medium mt-0.5">
                Chọn ứng dụng Zalo, Messenger hoặc tải PDF/Excel
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* Row 1: App buttons (Zalo, Messenger, Facebook) */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {/* Zalo Button */}
            <button
              type="button"
              onClick={handleShareZalo}
              className="flex flex-col items-center justify-center py-2.5 px-2 bg-[#0068FF] hover:bg-[#0057D9] text-white rounded-2xl shadow-sm hover:shadow transition active:scale-95 group"
            >
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center mb-1 shadow-xs group-hover:scale-105 transition-transform">
                <span className="text-[#0068FF] font-black text-[10px] tracking-tight">Zalo</span>
              </div>
              <span className="text-xs font-bold tracking-tight">Gửi Zalo</span>
            </button>

            {/* Messenger Button */}
            <button
              type="button"
              onClick={handleShareMessenger}
              className="flex flex-col items-center justify-center py-2.5 px-2 bg-gradient-to-r from-[#0084FF] via-[#7B2CBF] to-[#E02875] hover:opacity-95 text-white rounded-2xl shadow-sm hover:shadow transition active:scale-95 group"
            >
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center mb-1 shadow-xs group-hover:scale-105 transition-transform">
                <MessageCircle className="w-4 h-4 text-[#7B2CBF] fill-[#7B2CBF]" />
              </div>
              <span className="text-xs font-bold tracking-tight">Messenger</span>
            </button>

            {/* Facebook Button */}
            <button
              type="button"
              onClick={handleShareFacebook}
              className="flex flex-col items-center justify-center py-2.5 px-2 bg-[#1877F2] hover:bg-[#1567D3] text-white rounded-2xl shadow-sm hover:shadow transition active:scale-95 group"
            >
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center mb-1 shadow-xs group-hover:scale-105 transition-transform">
                <span className="text-[#1877F2] font-black text-xs">fb</span>
              </div>
              <span className="text-xs font-bold tracking-tight">Facebook</span>
            </button>
          </div>

          {/* Row 2: Export buttons (PDF Red, Excel Green) */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                if (onPrintPdf) onPrintPdf();
                showToast('Đang mở hộp thoại In / Lưu PDF...');
              }}
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-2xl text-xs font-bold shadow-sm transition active:scale-95"
            >
              <FileText className="w-4 h-4 text-white shrink-0" />
              <span>Xuất File PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-[#059669] hover:bg-[#047857] text-white rounded-2xl text-xs font-bold shadow-sm transition active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4 text-white shrink-0" />
              <span>Xuất File Excel</span>
            </button>
          </div>

          {/* Section: Text Content Preview */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">Nội dung văn bản báo cáo:</span>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition active:scale-95"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-teal-700" />}
                <span>{copied ? 'Đã sao chép' : 'Sao chép văn bản'}</span>
              </button>
            </div>

            {/* Scrollable text box */}
            <div className="relative">
              <textarea
                readOnly
                rows={9}
                value={reportText}
                className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-[11px] font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 custom-scrollbar select-all"
              />
            </div>
          </div>
        </div>

        {/* Toast notification */}
        {toastMessage && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};

