import React, { useState, useRef } from 'react';
import { Grade, Student, ClassRoom, Teacher, CourseProgram, CenterSettings } from '../types';
import {
  Share2,
  X,
  Copy,
  Check,
  FileText,
  FileSpreadsheet,
  MessageCircle,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Sparkles,
  Award,
  Send,
  Printer,
  Smartphone,
  Info
} from 'lucide-react';
import { toPng, toBlob } from 'html-to-image';
import ExcelJS from 'exceljs';
import { Logo } from './Logo';

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
  const [activeTab, setActiveTab] = useState<'image' | 'text' | 'files'>('image');
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getRank = (avg: number) => {
    if (avg >= 9.0)
      return {
        label: 'XUẤT SẮC (EXCELLENT)',
        color: 'text-emerald-700 bg-emerald-50 border-emerald-300',
        badge: 'bg-emerald-600'
      };
    if (avg >= 8.0)
      return {
        label: 'GIỎI (VERY GOOD)',
        color: 'text-blue-700 bg-blue-50 border-blue-300',
        badge: 'bg-blue-600'
      };
    if (avg >= 6.5)
      return {
        label: 'KHÁ (GOOD)',
        color: 'text-amber-700 bg-amber-50 border-amber-300',
        badge: 'bg-amber-600'
      };
    if (avg >= 5.0)
      return {
        label: 'TRUNG BÌNH (AVERAGE)',
        color: 'text-orange-700 bg-orange-50 border-orange-300',
        badge: 'bg-orange-600'
      };
    return {
      label: 'CẦN CỐ GẮNG (NEEDS IMPROVEMENT)',
      color: 'text-red-700 bg-red-50 border-red-300',
      badge: 'bg-red-600'
    };
  };

  const rank = getRank(grade.average);

  const todayStr = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());

  const teacherFeedback =
    'Em có thái độ học tập nghiêm túc, tích cực đóng góp trong các giờ thảo luận nhóm. Kỹ năng Nghe và Nói có tiến bộ vượt bậc so với đầu khóa. Cần duy trì thói quen luyện nghe tin tức tiếng Anh hằng ngày để sẵn sàng cho cấp độ tiếp theo.';

  const skills = [
    { name: 'Listening (Kỹ năng Nghe)', score: grade.listening, max: 10, desc: 'Nghe hiểu ý chính, nhận diện từ khóa và ngữ điệu' },
    { name: 'Speaking (Kỹ năng Nói)', score: grade.speaking, max: 10, desc: 'Phát âm chuẩn IPA, phản xạ giao tiếp tự tin' },
    { name: 'Reading (Kỹ năng Đọc)', score: grade.reading, max: 10, desc: 'Vốn từ vựng, đọc hiểu ngữ cảnh bài đọc' },
    { name: 'Writing (Kỹ năng Viết)', score: grade.writing, max: 10, desc: 'Cấu trúc câu, ngữ pháp chính xác và mạch lạc' }
  ];

  // Formatted report text for quick sharing via chat apps
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
    `🏆 XẾP LOẠI TOÀN KHÓA: ${rank.label}`,
    `────────────────────────────────────────`,
    `💬 NHẬN XÉT CỦA GIÁO VIÊN:`,
    `"${teacherFeedback}"`,
    `────────────────────────────────────────`,
    `📍 ${settings.name || 'TRUNG TÂM ANH NGỮ BEEZONE'}`,
    `🏡 Đ/C: ${settings.address || '111 Ngô Quyền, Long Hải, Trường Tây, Hòa Thành, Tây Ninh'}`,
    `☎️ Hotline: ${settings.phone || '0847 563 679 - 098 440 6157'}`
  ].join('\n');

  // Generate PNG data URL from DOM card
  const generatePngImage = async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    return await toPng(cardRef.current, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true
    });
  };

  // Generate PNG Blob from DOM card
  const generatePngBlob = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    return await toBlob(cardRef.current, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true
    });
  };

  // 1. Download Card Image (PNG)
  const handleDownloadImage = async () => {
    try {
      setIsGeneratingImage(true);
      showToast('Đang kết xuất hình ảnh phiếu điểm chất lượng cao...');
      const dataUrl = await generatePngImage();
      if (!dataUrl) throw new Error('Không thể tạo hình ảnh');

      const a = document.createElement('a');
      a.href = dataUrl;
      const cleanName = student.name.replace(/\s+/g, '_');
      a.download = `BEEZONE_PhieuDiem_${cleanName}_${todayStr.replace(/\//g, '-')}.png`;
      a.click();
      showToast('Đã tải hình ảnh phiếu điểm thành công!');
    } catch (err) {
      console.error(err);
      showToast('Lỗi khi tải ảnh phiếu điểm. Vui lòng thử lại!');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 2. Copy Card Image directly to Clipboard (Paste with Ctrl+V into Zalo/Messenger)
  const handleCopyImage = async () => {
    try {
      setIsGeneratingImage(true);
      showToast('Đang tạo và sao chép ảnh phiếu điểm...');
      const blob = await generatePngBlob();
      if (!blob) throw new Error('Không thể tạo blob ảnh');

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob
          })
        ]);
        setCopiedImage(true);
        showToast('✅ Đã sao chép ảnh! Bạn có thể dán (Ctrl+V) ngay vào ô chat Zalo / Messenger.');
        setTimeout(() => setCopiedImage(false), 3000);
      } else {
        // Fallback for browsers without ClipboardItem write support: trigger download
        handleDownloadImage();
        showToast('Trình duyệt không hỗ trợ chép ảnh trực tiếp, đã tự động tải ảnh về máy cho bạn!');
      }
    } catch (err) {
      console.error(err);
      // Fallback
      handleDownloadImage();
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 3. Web Share API (Mobile native share sheet - Zalo, Messenger, etc.)
  const handleShareMobile = async () => {
    try {
      setIsGeneratingImage(true);
      const blob = await generatePngBlob();
      if (!blob) throw new Error('Không thể tạo blob ảnh');

      const fileName = `BEEZONE_PhieuDiem_${student.name.replace(/\s+/g, '_')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Phiếu Điểm - ${student.name}`,
          text: `Phiếu đánh giá kết quả học tập của học viên ${student.name} tại ${settings.name || 'Anh Ngữ BeeZone'}`,
          files: [file]
        });
        showToast('Đã mở hộp thoại chia sẻ!');
      } else {
        // Desktop fallback: copy image and open Zalo
        await handleCopyImage();
        const phone = (student.parentPhone || student.phone || '').replace(/[^0-9]/g, '');
        const zaloUrl = phone.length >= 9 ? `https://zalo.me/${phone}` : 'https://zalo.me/';
        window.open(zaloUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error(err);
      // Fallback to copying image
      await handleCopyImage();
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 4. Quick Share via Zalo (Copies image + opens Zalo chat)
  const handleShareZalo = async () => {
    await handleCopyImage();
    const phone = (student.parentPhone || student.phone || '').replace(/[^0-9]/g, '');
    const zaloUrl = phone.length >= 9 ? `https://zalo.me/${phone}` : 'https://zalo.me/';
    setTimeout(() => {
      window.open(zaloUrl, '_blank', 'noopener,noreferrer');
    }, 400);
  };

  // 5. Quick Share via Messenger
  const handleShareMessenger = async () => {
    await handleCopyImage();
    setTimeout(() => {
      window.open('https://www.messenger.com/', '_blank', 'noopener,noreferrer');
    }, 400);
  };

  // 6. Quick Share via Facebook
  const handleShareFacebook = async () => {
    await handleCopyImage();
    setTimeout(() => {
      window.open('https://www.facebook.com/', '_blank', 'noopener,noreferrer');
    }, 400);
  };

  // Copy plain text
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopiedText(true);
      showToast('Đã sao chép nội dung văn bản báo cáo!');
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      showToast('Không thể sao chép văn bản tự động.');
    }
  };

  // Export Excel File
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = settings.name || 'BeeZone English';
      const sheet = workbook.addWorksheet('PhieuDiem');

      sheet.views = [{ showGridLines: true }];

      sheet.mergeCells('A1:D1');
      sheet.getCell('A1').value = `${settings.name || 'TRUNG TÂM ANH NGỮ BEEZONE'} - PHIẾU ĐIỂM HỌC VIÊN`;
      sheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
      sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B45309' } };
      sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 36;

      sheet.addRow(['Họ và tên:', student.name, 'Mã học viên:', student.code]);
      sheet.addRow(['Lớp học:', classroom?.name || 'BeeZone', 'Khóa học:', program?.name || 'Tiếng Anh']);
      sheet.addRow(['Giáo viên:', teacher?.name || 'BeeZone', 'Ngày xuất:', todayStr]);
      sheet.addRow([]);

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

      const avgRow = sheet.addRow(['ĐIỂM TRUNG BÌNH', grade.average, 10, rank.label]);
      avgRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'B45309' } };
      avgRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
      });
      avgRow.height = 28;

      sheet.getColumn(1).width = 28;
      sheet.getColumn(2).width = 16;
      sheet.getColumn(3).width = 16;
      sheet.getColumn(4).width = 36;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
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
    <div className="fixed inset-0 z-60 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-slate-900 px-5 py-3.5 text-white relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 hover:text-white transition"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/30 backdrop-blur-xs flex items-center justify-center shrink-0 border border-amber-300/40 shadow-inner">
              <Share2 className="w-5 h-5 text-amber-300" />
            </div>
            <div className="pr-6">
              <h3 className="text-base font-extrabold uppercase tracking-wide leading-tight text-white drop-shadow-xs flex items-center gap-2">
                GỬI & CHIA SẺ PHIẾU BÁO ĐIỂM
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 uppercase">
                  <Sparkles className="w-3 h-3" /> Mới: Chia sẻ ảnh
                </span>
              </h3>
              <p className="text-xs text-amber-100/90 font-medium mt-0.5">
                Chia sẻ hình ảnh phiếu điểm hoặc gửi văn bản qua Zalo, Messenger, PDF, Excel
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-4 pt-2.5 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-t-xl text-xs font-bold transition border-b-2 ${
              activeTab === 'image'
                ? 'bg-white border-amber-500 text-amber-900 shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ImageIcon className={`w-4 h-4 ${activeTab === 'image' ? 'text-amber-600' : 'text-slate-400'}`} />
            <span>Chia Sẻ Bằng Hình Ảnh</span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-800">
              Khuyên dùng
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-t-xl text-xs font-bold transition border-b-2 ${
              activeTab === 'text'
                ? 'bg-white border-blue-600 text-blue-900 shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <MessageCircle className={`w-4 h-4 ${activeTab === 'text' ? 'text-blue-600' : 'text-slate-400'}`} />
            <span>Tin Nhắn Văn Bản</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-t-xl text-xs font-bold transition border-b-2 ${
              activeTab === 'files'
                ? 'bg-white border-emerald-600 text-emerald-900 shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className={`w-4 h-4 ${activeTab === 'files' ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>Xuất PDF / Excel</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: IMAGE SHARING */}
          {activeTab === 'image' && (
            <div className="space-y-4">
              {/* Primary Image Sharing Action Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {/* 1. Download Image */}
                <button
                  type="button"
                  disabled={isGeneratingImage}
                  onClick={handleDownloadImage}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-2xl text-xs shadow-sm transition active:scale-95 disabled:opacity-50"
                  title="Tải file ảnh PNG độ nét cao về thiết bị"
                >
                  <Download className="w-4 h-4 shrink-0 text-slate-950" />
                  <span>Tải Ảnh PNG</span>
                </button>

                {/* 2. Copy Image (Ctrl+V into Zalo) */}
                <button
                  type="button"
                  disabled={isGeneratingImage}
                  onClick={handleCopyImage}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs shadow-sm transition active:scale-95 disabled:opacity-50"
                  title="Sao chép ảnh vào bộ nhớ tạm để dán (Ctrl+V) ngay vào Zalo"
                >
                  {copiedImage ? <Check className="w-4 h-4 text-emerald-300 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
                  <span>{copiedImage ? 'Đã Chép Ảnh' : 'Chép Ảnh (Dán Zalo)'}</span>
                </button>

                {/* 3. Open Zalo with copied image */}
                <button
                  type="button"
                  disabled={isGeneratingImage}
                  onClick={handleShareZalo}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[#0068FF] hover:bg-[#0057D9] text-white font-bold rounded-2xl text-xs shadow-sm transition active:scale-95 disabled:opacity-50"
                  title="Mở Zalo và dán ảnh gửi cho phụ huynh"
                >
                  <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center shrink-0">
                    <span className="text-[#0068FF] font-black text-[8px]">Z</span>
                  </div>
                  <span>Gửi Qua Zalo</span>
                </button>

                {/* 4. Mobile / Web Share */}
                <button
                  type="button"
                  disabled={isGeneratingImage}
                  onClick={handleShareMobile}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs shadow-sm transition active:scale-95 disabled:opacity-50"
                  title="Mở hộp thoại chia sẻ ứng dụng trên điện thoại"
                >
                  <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Chia Sẻ App</span>
                </button>
              </div>

              {/* Informative Tip */}
              <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-950 text-xs leading-relaxed">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Mẹo gửi Zalo nhanh chóng:</strong> Nhấn{' '}
                  <span className="underline font-bold">Chép Ảnh (Dán Zalo)</span>, sau đó mở cửa sổ trò chuyện Zalo với phụ huynh và nhấn{' '}
                  <span className="bg-amber-200/80 px-1 py-0.5 rounded font-mono font-bold text-slate-900">Ctrl + V</span>{' '}
                  (hoặc Dán ảnh) để gửi phiếu điểm dưới dạng ảnh chụp sắc nét!
                </div>
              </div>

              {/* Visual Card Preview Container */}
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Bản xem trước hình ảnh phiếu điểm (Độ nét cao 2x):
                  </span>
                  {isGeneratingImage && (
                    <span className="text-xs text-amber-600 font-semibold animate-pulse">
                      Đang xử lý hình ảnh...
                    </span>
                  )}
                </div>

                {/* Scrollable Frame for the Card */}
                <div className="max-h-[360px] sm:max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-100 p-2 sm:p-4 shadow-inner flex justify-center custom-scrollbar">
                  {/* The actual element captured by html-to-image */}
                  <div
                    ref={cardRef}
                    className="w-full max-w-[580px] bg-white rounded-2xl p-5 sm:p-6 shadow-md border-4 border-double border-amber-500/70 text-slate-900 select-none"
                    style={{
                      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                    }}
                  >
                    {/* BeeZone Header */}
                    <div className="flex items-center justify-between border-b-2 border-amber-400/40 pb-3.5">
                      <div className="flex items-center gap-3">
                        <Logo size={52} />
                        <div>
                          <h1 className="text-base sm:text-lg font-black text-slate-950 uppercase tracking-wide">
                            {settings.name || 'TRUNG TÂM ANH NGỮ BEEZONE'}
                          </h1>
                          <p className="text-[11px] text-amber-700 font-bold italic">
                            {settings.slogan || 'Inspiring Excellence in English'}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Hotline: {settings.phone || '0847 563 679 - 098 440 6157'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full inline-block">
                          Mã: {student.code}
                        </span>
                        <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider">
                          NĂM HỌC 2026
                        </p>
                      </div>
                    </div>

                    {/* Title */}
                    <div className="text-center my-3.5">
                      <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-wider">
                        PHIẾU ĐÁNH GIÁ KẾT QUẢ HỌC TẬP
                      </h2>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                        STUDENT PROGRESS REPORT & TRANSCRIPT
                      </p>
                    </div>

                    {/* Student Info Box */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs mb-3.5">
                      <div>
                        <span className="text-slate-500 text-[10px] block font-medium">Học viên:</span>
                        <strong className="text-slate-950 font-bold text-xs truncate block">{student.name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block font-medium">Lớp học:</span>
                        <strong className="text-slate-800 text-xs truncate block">{classroom?.name || 'BeeZone'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block font-medium">Khóa học:</span>
                        <strong className="text-slate-800 text-xs truncate block">{program?.name || 'Tiếng Anh'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block font-medium">Giáo viên:</span>
                        <strong className="text-indigo-800 text-xs truncate block">{teacher?.name || 'BeeZone Teacher'}</strong>
                      </div>
                    </div>

                    {/* 4 Skills Breakdown */}
                    <div className="mb-3.5">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Award className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-[11px] font-black uppercase text-slate-800 tracking-wider">
                          Đánh giá 4 kỹ năng ngôn ngữ:
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {skills.map((s) => (
                          <div key={s.name} className="p-2 bg-slate-50/60 rounded-xl border border-slate-200">
                            <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                              <span className="text-slate-700 truncate">{s.name}</span>
                              <span className="text-xs font-black text-amber-700">{s.score}/10</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1">
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full"
                                style={{ width: `${(s.score / s.max) * 100}%` }}
                              />
                            </div>
                            <p className="text-[9px] text-slate-500 leading-tight truncate">{s.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Test Scores Overview */}
                    <div className="grid grid-cols-4 gap-2 mb-3 text-center">
                      <div className="p-2 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block">Giữa Kỳ</span>
                        <p className="text-sm font-black text-slate-800 mt-0.5">{grade.midterm}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block">Cuối Kỳ</span>
                        <p className="text-sm font-black text-slate-800 mt-0.5">{grade.finalExam}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block">Chuyên Cần</span>
                        <p className="text-sm font-black text-slate-800 mt-0.5">{grade.attendance}/10</p>
                      </div>
                      <div className="p-2 bg-amber-50 rounded-xl border border-amber-300">
                        <span className="text-[9px] font-black text-amber-800 uppercase block">Điểm TB</span>
                        <p className="text-base font-black text-amber-900 mt-0.5">{grade.average}</p>
                      </div>
                    </div>

                    {/* Rank Badge */}
                    <div className={`py-1.5 px-3 rounded-xl border text-center font-black text-xs mb-3 ${rank.color}`}>
                      XẾP LOẠI TOÀN KHÓA: {rank.label}
                    </div>

                    {/* Teacher Feedback */}
                    <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 mb-3">
                      <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider block mb-0.5">
                        Nhận xét của giáo viên:
                      </span>
                      <p className="text-[10px] text-slate-700 leading-relaxed italic">
                        "{teacherFeedback}"
                      </p>
                    </div>

                    {/* Signatures */}
                    <div className="grid grid-cols-2 text-center text-[10px] pt-2 border-t border-slate-200">
                      <div>
                        <p className="font-bold text-slate-600 uppercase">GIÁO VIÊN PHỤ TRÁCH</p>
                        <p className="italic text-[9px] text-slate-400">(Ký và ghi rõ họ tên)</p>
                        <div className="h-8 flex items-end justify-center font-bold text-indigo-950">
                          {teacher?.name || 'Giáo viên phụ trách'}
                        </div>
                      </div>
                      <div>
                        <p className="font-bold text-slate-600 uppercase">GIÁM ĐỐC TRUNG TÂM</p>
                        <p className="italic text-[9px] text-slate-400">(Ký tên và đóng dấu)</p>
                        <div className="h-8 flex items-end justify-center font-black text-amber-950 uppercase">
                          {settings.name || 'BEEZONE ENGLISH'}
                        </div>
                      </div>
                    </div>

                    {/* Footer Contact */}
                    <div className="mt-3 pt-2 border-t border-dashed border-slate-200 text-center text-[9px] text-slate-500">
                      {settings.name || 'Anh Ngữ BeeZone'} • Đ/C: {settings.address || '111 Ngô Quyền, Long Hải, Trường Tây, Hòa Thành, Tây Ninh'} • Hotline: {settings.phone || '0847 563 679'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TEXT MESSAGE SHARING */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              {/* Social app buttons */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
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

              {/* Text content preview & copy */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">Nội dung văn bản báo cáo:</span>
                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition active:scale-95"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-teal-700" />}
                    <span>{copiedText ? 'Đã sao chép' : 'Sao chép văn bản'}</span>
                  </button>
                </div>

                <textarea
                  readOnly
                  rows={9}
                  value={reportText}
                  className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-[11px] font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 custom-scrollbar select-all"
                />
              </div>
            </div>
          )}

          {/* TAB 3: PDF / EXCEL EXPORT */}
          {activeTab === 'files' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* PDF */}
                <button
                  type="button"
                  onClick={() => {
                    if (onPrintPdf) onPrintPdf();
                    showToast('Đang mở hộp thoại In / Lưu PDF...');
                  }}
                  className="flex flex-col items-center justify-center p-5 bg-gradient-to-br from-rose-50 to-rose-100/60 hover:from-rose-100 hover:to-rose-200/80 border-2 border-rose-300 rounded-2xl text-rose-900 transition active:scale-98 group text-center"
                >
                  <div className="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center text-white mb-2 shadow-sm group-hover:scale-105 transition-transform">
                    <FileText className="w-6 h-6" />
                  </div>
                  <strong className="text-sm font-extrabold text-rose-950">Xuất & In File PDF</strong>
                  <span className="text-[11px] text-rose-700 mt-1">
                    Mở mẫu phiếu điểm chính thức có hoa văn để in ra giấy hoặc lưu file PDF
                  </span>
                </button>

                {/* Excel */}
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex flex-col items-center justify-center p-5 bg-gradient-to-br from-emerald-50 to-emerald-100/60 hover:from-emerald-100 hover:to-emerald-200/80 border-2 border-emerald-300 rounded-2xl text-emerald-900 transition active:scale-98 group text-center"
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white mb-2 shadow-sm group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <strong className="text-sm font-extrabold text-emerald-950">Xuất File Excel (.xlsx)</strong>
                  <span className="text-[11px] text-emerald-700 mt-1">
                    Bảng điểm chi tiết 4 kỹ năng kèm thang điểm và ghi chú học tập
                  </span>
                </button>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 leading-relaxed">
                💡 <strong className="text-slate-800">Lưu ý:</strong> File PDF phù hợp để in giấy trao tận tay phụ huynh trong buổi họp hoặc tổng kết khóa học. File Excel dùng để lưu trữ hồ sơ điểm số vào máy tính trung tâm.
              </div>
            </div>
          )}
        </div>

        {/* Toast notification */}
        {toastMessage && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-2xl border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 z-70">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
