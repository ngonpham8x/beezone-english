import { reportError } from '../../lib/diagnostics';
import ExcelJS from 'exceljs';
import { toBlob, toPng } from 'html-to-image';
import {
  Award,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Info,
  MessageCircle,
  Save,
  Share2,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { Logo } from '../../components/Logo';
import { calculateSemesterAverage, GRADE_AVERAGE_SCALE, GRADE_RANK_THRESHOLDS } from '../../lib/gradebook';
import { CenterSettings, ClassRoom, CourseProgram, Grade, GradeSemester, Student, Teacher } from '../../types';

interface ShareReportCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  grade: Grade;
  semester?: GradeSemester;
  customUnits?: { key: string; label: string; isCustom?: boolean }[];
  classroom?: ClassRoom;
  teacher?: Teacher;
  program?: CourseProgram;
  settings: CenterSettings;
  onUpdateGrade?: (updatedGrade: Grade) => void;
  onPrintPdf?: () => void;
  showPersonalInfo?: boolean;
}

export const ShareReportCardModal: React.FC<ShareReportCardModalProps> = ({
  isOpen,
  onClose,
  student,
  grade,
  semester,
  customUnits = [],
  classroom,
  teacher,
  program,
  settings,
  onUpdateGrade,
  onPrintPdf,
  showPersonalInfo = true,
}) => {
  const [activeTab, setActiveTab] = useState<'image' | 'text' | 'files'>('image');
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dedicated unclipped DOM element for 100% full-height image generation
  const exportCardRef = useRef<HTMLDivElement>(null);
  // Preview DOM element inside the modal
  const previewCardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

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

  const dobText = showPersonalInfo ? formatDob(student.dob) : '';

  const getRank = (avg: number) => {
    if (avg >= GRADE_RANK_THRESHOLDS.excellent)
      return {
        label: 'XUẤT SẮC (EXCELLENT)',
        color: 'text-emerald-800 bg-emerald-50 border-emerald-300'
      };
    if (avg >= GRADE_RANK_THRESHOLDS.veryGood)
      return {
        label: 'GIỎI (VERY GOOD)',
        color: 'text-blue-800 bg-blue-50 border-blue-300'
      };
    if (avg >= GRADE_RANK_THRESHOLDS.good)
      return {
        label: 'KHÁ (GOOD)',
        color: 'text-amber-800 bg-amber-50 border-amber-300'
      };
    if (avg >= GRADE_RANK_THRESHOLDS.average)
      return {
        label: 'TRUNG BÌNH (AVERAGE)',
        color: 'text-orange-800 bg-orange-50 border-orange-300'
      };
    return {
      label: 'CẦN CỐ GẮNG (NEEDS IMPROVEMENT)',
      color: 'text-red-800 bg-red-50 border-red-300'
    };
  };

  const semesterAverage = calculateSemesterAverage(grade);
  const rank = getRank(semesterAverage);

  const todayStr = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());

  const initialFeedback =
    grade.comment ||
    (showPersonalInfo ? student.notes?.trim() : '') ||
    `Em ${student.name} có thái độ học tập nghiêm túc, tích cực đóng góp trong các giờ thảo luận nhóm. Kỹ năng Nghe và Nói có tiến bộ vượt bậc so với đầu khóa. Cần duy trì thói quen luyện nghe tin tức tiếng Anh hằng ngày để sẵn sàng cho cấp độ tiếp theo.`;

  const [feedback, setFeedback] = useState(initialFeedback);
  const [isEditingFeedback, setIsEditingFeedback] = useState(false);

  useEffect(() => {
    if (grade.comment) {
      setFeedback(grade.comment);
    }
  }, [grade.comment]);

  const handleSaveFeedback = (newComment: string) => {
    setFeedback(newComment);
    setIsEditingFeedback(false);
    if (onUpdateGrade) {
      onUpdateGrade({
        ...grade,
        comment: newComment
      });
    }
    showToast('Đã lưu nhận xét mới vào bảng điểm!');
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

  const currentSemester = semester || grade.semester || 'GKI';
  const semesterLabels: Record<string, string> = {
    GKI: 'GIỮA HỌC KỲ I (MIDTERM 1)',
    CKI: 'CUỐI HỌC KỲ I (FINAL 1)',
    GKII: 'GIỮA HỌC KỲ II (MIDTERM 2)',
    CKII: 'CUỐI HỌC KỲ II (FINAL 2)',
  };

  const readingWritingVal =
    grade.readingWriting !== undefined
      ? grade.readingWriting
      : ((grade.reading || 0) + (grade.writing || 0)) / 2;

  const examSkills = [
    { name: 'Listening (Nghe)', score: grade.listening, max: 10, desc: 'Phát âm và bắt từ khóa bài nghe' },
    { name: 'Speaking (Nói)', score: grade.speaking, max: 10, desc: 'Độ lưu loát và phản xạ giao tiếp tự tin' },
    { name: 'Reading & Writing (Đọc & Viết)', score: readingWritingVal, max: 10, desc: 'Từ vựng, đọc hiểu và ngữ pháp viết' },
  ];

  const unitLines = customUnits.length > 0
    ? [
        `📖 ĐIỂM KIỂM TRA CÁC UNIT (${currentSemester}):`,
        ...customUnits.map((u) => {
          const s = grade.unitScores?.[u.key];
          return `• ${u.label}: ${s !== undefined ? `${s}/10` : '—'}`;
        }),
        `────────────────────────────────────────`,
      ]
    : [];

  // Formatted report text for quick sharing via chat apps
  const reportText = [
    `🎓 BÁO CÁO KẾT QUẢ HỌC TẬP — ${settings.name || 'ANH NGỮ BEEZONE'} 🐝`,
    `👤 Học viên: ${student.name} (Mã: ${student.code}${dobText ? `, Ngày sinh: ${dobText}` : ''})`,
    `🏫 Lớp học: ${classroom?.name || 'BeeZone'} • Khóa: ${program?.name || 'Tiếng Anh'}`,
    `👩‍🏫 Giáo viên phụ trách: ${teacher?.name || 'Giáo viên BeeZone'}`,
    `📅 Học kỳ: ${currentSemester} (${semesterLabels[currentSemester] || currentSemester}) • Ngày: ${todayStr}`,
    `────────────────────────────────────────`,
    ...unitLines,
    `📊 3 CỘT ĐIỂM THI ĐÁNH GIÁ ${currentSemester}:`,
    `🎧 Listening (Nghe): ${grade.listening}/10`,
    `🗣️ Speaking (Nói): ${grade.speaking}/10`,
    `✍️ Reading & Writing (Đọc & Viết): ${readingWritingVal}/10`,
    `────────────────────────────────────────`,
    `⭐ ĐIỂM TRUNG BÌNH (ĐTB ${currentSemester}): ${semesterAverage}/${GRADE_AVERAGE_SCALE}`,
    `🏆 XẾP LOẠI HỌC KỲ: ${rank.label}`,
    `────────────────────────────────────────`,
    `💬 NHẬN XÉT CỦA GIÁO VIÊN:`,
    `"${feedback}"`,
    `────────────────────────────────────────`,
    `📍 ${settings.name || 'TRUNG TÂM ANH NGỮ BEEZONE'}`,
    `🏡 Đ/C: ${settings.address || '111 Ngô Quyền, Long Hải, Trường Tây, Hòa Thành, Tây Ninh'}`,
    `☎️ Hotline: ${settings.phone || '0847 563 679 - 098 440 6157'}`
  ].join('\n');

  // Generate PNG data URL using the dedicated unclipped container
  const generatePngImage = async (): Promise<string | null> => {
    const target = exportCardRef.current || previewCardRef.current;
    if (!target) return null;
    return await toPng(target, {
      quality: 0.98,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true
    });
  };

  // Generate PNG Blob using the dedicated unclipped container
  const generatePngBlob = async (): Promise<Blob | null> => {
    const target = exportCardRef.current || previewCardRef.current;
    if (!target) return null;
    return await toBlob(target, {
      quality: 0.98,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true
    });
  };

  // 1. Download Card Image (PNG)
  const handleDownloadImage = async () => {
    try {
      setIsGeneratingImage(true);
      showToast('Đang kết xuất hình ảnh phiếu điểm đầy đủ thông tin...');
      const dataUrl = await generatePngImage();
      if (!dataUrl) throw new Error('Không thể tạo hình ảnh');

      const a = document.createElement('a');
      a.href = dataUrl;
      const cleanName = student.name.replace(/\s+/g, '_');
      a.download = `BEEZONE_PhieuDiem_${cleanName}_${todayStr.replace(/\//g, '-')}.png`;
      a.click();
      showToast('✅ Đã tải ảnh phiếu điểm đầy đủ thành công!');
    } catch (err) {
      reportError('grade.share', err);
      showToast('Lỗi khi tải ảnh phiếu điểm. Vui lòng thử lại!');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 2. Copy Card Image directly to Clipboard (Paste with Ctrl+V into Zalo/Messenger)
  const handleCopyImage = async () => {
    try {
      setIsGeneratingImage(true);
      showToast('Đang tạo và sao chép ảnh phiếu điểm đầy đủ...');
      const blob = await generatePngBlob();
      if (!blob) throw new Error('Không thể tạo blob ảnh');

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob
          })
        ]);
        setCopiedImage(true);
        showToast('✅ Đã sao chép toàn bộ ảnh phiếu điểm! Bạn có thể dán (Ctrl+V) ngay vào Zalo / Messenger.');
        setTimeout(() => setCopiedImage(false), 3000);
      } else {
        await handleDownloadImage();
        showToast('Đã tự động tải ảnh về máy để bạn gửi Zalo.');
      }
    } catch (err) {
      reportError('grade.share', err);
      await handleDownloadImage();
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
        await handleCopyImage();
        const phone = (student.parentPhone || student.phone || '').replace(/[^0-9]/g, '');
        const zaloUrl = phone.length >= 9 ? `https://zalo.me/${phone}` : 'https://zalo.me/';
        window.open(zaloUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      reportError('grade.share', err);
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
      sheet.addRow(['Ngày sinh:', dobText || 'Chưa cập nhật', 'Lớp học:', classroom?.name || 'BeeZone']);
      sheet.addRow(['Khóa học:', program?.name || 'Tiếng Anh', 'Giáo viên:', teacher?.name || 'BeeZone']);
      sheet.addRow(['Học kỳ:', currentSemester, 'Điểm TB:', semesterAverage]);
      sheet.addRow(['Ngày xuất:', todayStr, '', '']);
      sheet.addRow([]);

      const headerRow = sheet.addRow(['Mục Đánh Giá', 'Điểm Đạt Được', 'Thang Điểm', 'Ghi Chú']);
      headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D97706' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      headerRow.height = 26;

      customUnits.forEach((unit) => {
        sheet.addRow([unit.label, grade.unitScores?.[unit.key] ?? '', 10, 'Điểm kiểm tra quá trình']);
      });
      sheet.addRow(['Listening (Nghe)', grade.listening, 10, 'Kỹ năng nghe hiểu']);
      sheet.addRow(['Speaking (Nói)', grade.speaking, 10, 'Phát âm và phản xạ']);
      sheet.addRow(['Reading & Writing (Đọc & Viết)', readingWritingVal, 10, 'Đọc hiểu và diễn đạt viết']);

      const avgRow = sheet.addRow(['ĐIỂM TRUNG BÌNH', semesterAverage, GRADE_AVERAGE_SCALE, rank.label]);
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
      reportError('grade.share', err);
      showToast('Có lỗi khi tạo file Excel.');
    }
  };

  /**
   * Helper component rendering the full certificate card
   * Used both in the modal preview and the dedicated off-screen capture container.
   */
  const renderCardContent = (isExport: boolean) => (
    <div
      className={`bg-white text-slate-900 select-none ${
        isExport
          ? 'p-8 rounded-3xl border-4 border-double border-amber-500/80 shadow-none'
          : 'p-5 sm:p-7 rounded-2xl border-4 border-double border-amber-500/80 shadow-md'
      }`}
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      {/* 1. Header */}
      <div className="flex items-center justify-between border-b-2 border-amber-400/50 pb-4 mb-4">
        <div className="flex items-center gap-3.5">
          <Logo size={isExport ? 64 : 54} />
          <div>
            <h1 className="text-base sm:text-lg font-black text-slate-950 uppercase tracking-wide">
              {settings.name || 'TRUNG TÂM ANH NGỮ BEEZONE'}
            </h1>
            <p className="text-xs text-amber-700 font-bold italic">
              {settings.slogan || 'Học tiếng Anh thật vui - Bé tự tin mỗi ngày!'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Hotline: {settings.phone || '0847 563 679 - 098 440 6157'}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xs font-mono font-black text-amber-900 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-full inline-block">
            Mã: {student.code}
          </span>
          <p className="text-[11px] font-black text-slate-600 mt-1 uppercase tracking-wider">
            NĂM HỌC 2026
          </p>
        </div>
      </div>

      {/* 2. Main Title */}
      <div className="text-center my-4">
        <h2 className="text-lg sm:text-xl font-black text-slate-950 uppercase tracking-wider">
          PHIẾU ĐÁNH GIÁ KẾT QUẢ HỌC TẬP — {currentSemester}
        </h2>
        <p className="text-[11px] text-amber-800 font-bold uppercase tracking-widest mt-0.5">
          {semesterLabels[currentSemester] || currentSemester} • STUDENT PROGRESS REPORT
        </p>
      </div>

      {/* 3. Student Profile Info Box (Spacious 2-column layout - NEVER truncated) */}
      <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200/90 text-xs mb-4.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Left Column: Student name & basic info */}
          <div className="space-y-2">
            <div>
              <span className="text-slate-500 text-[11px] font-semibold block">Họ và tên học viên:</span>
              <strong className="text-slate-950 font-black text-base block leading-snug break-words text-amber-950">
                {student.name}
              </strong>
            </div>
            <div className="flex items-center gap-3 flex-wrap pt-0.5">
              <div>
                <span className="text-slate-500 text-[10px] font-medium block">Mã học viên:</span>
                <span className="font-mono font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded text-xs border border-amber-200">
                  {student.code}
                </span>
              </div>
              {dobText && (
                <div>
                  <span className="text-slate-500 text-[10px] font-medium block">Ngày sinh:</span>
                  <span className="font-bold text-slate-800 text-xs bg-white px-2 py-0.5 rounded border border-slate-200">
                    {dobText}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Classroom, Program, Teacher, Assessment Date */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500 text-[11px] font-semibold block">Lớp học:</span>
                <strong className="text-slate-900 font-bold text-xs block leading-snug break-words">
                  {classroom?.name || 'BeeZone'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] font-semibold block">Chương trình / Khóa học:</span>
                <strong className="text-slate-900 font-bold text-xs block leading-snug break-words">
                  {program?.name || 'Tiếng Anh'}
                </strong>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div>
                <span className="text-slate-500 text-[11px] font-semibold block">Giáo viên phụ trách:</span>
                <strong className="text-indigo-900 font-bold text-xs block leading-snug break-words">
                  {teacher?.name || 'Giáo viên BeeZone'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] font-semibold block">Ngày đánh giá:</span>
                <strong className="text-slate-700 font-bold text-xs block">
                  {todayStr}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Unit Scores Breakdown if any */}
      {customUnits.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Award className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-black uppercase text-slate-800 tracking-wider">
              Kết quả kiểm tra quá trình các UNIT ({currentSemester}):
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {customUnits.map((u) => {
              const score = grade.unitScores?.[u.key];
              return (
                <div key={u.key} className="p-2 bg-amber-50/50 rounded-xl border border-amber-200/80">
                  <span className="text-[10px] font-bold text-slate-600 block truncate" title={u.label}>
                    {u.label}
                  </span>
                  <p className="text-sm font-black text-amber-900 mt-0.5">
                    {score !== undefined ? `${score}/10` : '—'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. 3 Exam Skills Breakdown */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Award className="w-4 h-4 text-red-700" />
          <span className="text-xs font-black uppercase text-slate-800 tracking-wider">
            Kết quả 3 cột điểm thi đánh giá {currentSemester}:
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {examSkills.map((s) => (
            <div key={s.name} className="p-3 bg-slate-50/70 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                <span className="text-slate-800 font-bold truncate">{s.name}</span>
                <span className="text-sm font-black text-red-800 shrink-0 ml-1">{s.score}/10</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-1 border border-slate-200/80">
                <div
                  className="h-full bg-gradient-to-r from-red-600 to-amber-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, (s.score / 10) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 line-clamp-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Overall Evaluation & Average */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4 text-center">
        <div className="p-3 bg-amber-50 rounded-xl border-2 border-amber-300 flex items-center justify-between px-5 shadow-2xs">
          <span className="text-xs font-black text-amber-900 uppercase">
            ĐIỂM TRUNG BÌNH (ĐTB {currentSemester}):
          </span>
          <p className="text-xl font-black text-amber-950">{semesterAverage}/{GRADE_AVERAGE_SCALE}</p>
        </div>
        <div className={`p-3 rounded-xl border-2 flex items-center justify-center font-black text-xs uppercase tracking-wide shadow-2xs ${rank.color}`}>
          🏆 XẾP LOẠI HỌC KỲ: {rank.label}
        </div>
      </div>

      {/* 7. Teacher's Evaluation & Advice */}
      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 mb-4 transition-all">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block">
            💬 Nhận xét & lời khuyên của giáo viên:
          </span>
          {!isExport && (
            <button
              type="button"
              onClick={() => setIsEditingFeedback(!isEditingFeedback)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/80 hover:bg-amber-200 px-2 py-0.5 rounded-md transition cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-amber-700" />
              <span>{isEditingFeedback ? 'Đóng' : 'Sửa nhận xét'}</span>
            </button>
          )}
        </div>

        {!isExport && isEditingFeedback ? (
          <div className="space-y-2 mt-2">
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              className="w-full p-2.5 bg-white border-2 border-amber-400 rounded-xl text-xs text-slate-800 leading-relaxed font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/30 shadow-inner"
              placeholder="Nhập nhận xét của giáo viên..."
              autoFocus
            />
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-slate-500 font-semibold">Mẫu nhanh:</span>
                {templates.map((tpl) => (
                  <button
                    key={tpl.title}
                    type="button"
                    onClick={() => setFeedback(tpl.text)}
                    className="text-[10px] px-2 py-0.5 bg-white hover:bg-amber-50 border border-slate-300 rounded text-slate-700 font-medium transition cursor-pointer"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleSaveFeedback(feedback)}
                className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Save className="w-3 h-3" />
                <span>Lưu nhận xét</span>
              </button>
            </div>
          </div>
        ) : (
          <p
            onClick={() => {
              if (!isExport) setIsEditingFeedback(true);
            }}
            className={`text-xs text-slate-700 leading-relaxed italic ${
              !isExport ? 'cursor-pointer hover:bg-amber-50/60 p-1.5 -m-1.5 rounded-lg transition-colors' : ''
            }`}
            title={!isExport ? 'Bấm để chỉnh sửa nhận xét' : undefined}
          >
            "{feedback}"
          </p>
        )}
      </div>

      {/* 8. Signatures */}
      <div className="grid grid-cols-2 text-center text-xs pt-3 border-t border-slate-200">
        <div>
          <p className="font-bold text-slate-600 uppercase text-[11px]">GIÁO VIÊN PHỤ TRÁCH</p>
          <p className="italic text-[10px] text-slate-400">(Ký và ghi rõ họ tên)</p>
          <div className="h-12 flex items-end justify-center font-bold text-indigo-950 text-xs">
            {teacher?.name || 'Giáo viên phụ trách'}
          </div>
        </div>
        <div>
          <p className="font-bold text-slate-600 uppercase text-[11px]">GIÁM ĐỐC TRUNG TÂM</p>
          <p className="italic text-[10px] text-slate-400">(Ký tên và đóng dấu)</p>
          <div className="h-12 flex items-end justify-center font-black text-amber-950 uppercase text-xs">
            {settings.name || 'BEEZONE ENGLISH'}
          </div>
        </div>
      </div>

      {/* 9. Footer Watermark */}
      <div className="mt-4 pt-3 border-t border-dashed border-slate-200 text-center text-[10px] text-slate-500 leading-normal">
        📍 <strong>{settings.name || 'Trung Tâm Anh Ngữ BeeZone'}</strong> • Đ/C: {settings.address || '111 Ngô Quyền, Long Hải, Trường Tây, Hòa Thành, Tây Ninh'} • Hotline: {settings.phone || '0847 563 679 - 098 440 6157'}
      </div>
    </div>
  );

  return (
    <DialogFrame label="Chia sẻ phiếu báo điểm" onClose={onClose} className="fixed inset-0 z-60 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      {/* =========================================================================
          OFF-SCREEN DEDICATED CAPTURE ELEMENT
          Guarantees 100% full natural height with zero scroll clipping,
          full typography resolution, and no truncated text!
          ========================================================================= */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '720px',
          zIndex: -999,
          pointerEvents: 'none',
          opacity: 1
        }}
      >
        <div ref={exportCardRef} style={{ width: '720px', backgroundColor: '#ffffff' }}>
          {renderCardContent(true)}
        </div>
      </div>

      {/* =========================================================================
          MAIN MODAL DIALOG
          ========================================================================= */}
      <div className="dialog-panel relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-slate-900 px-5 py-3.5 text-white relative shrink-0">
          <button aria-label="Đóng"
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
                Tải ảnh chất lượng cao hoặc chia sẻ qua Zalo, Messenger, PDF, Excel
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center overflow-x-auto custom-scrollbar border-b border-slate-200 bg-slate-50 px-3 pt-2.5 gap-1 shrink-0">
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
            <span>Hình ảnh</span>
            <span className="hidden sm:inline px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-800">
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
            <span>Tin nhắn</span>
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
            <span>PDF / Excel</span>
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
                  title="Tải file ảnh PNG đầy đủ chất lượng cao về thiết bị"
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
                  title="Sao chép toàn bộ ảnh vào bộ nhớ tạm để dán (Ctrl+V) ngay vào Zalo"
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
                  (hoặc Dán ảnh) để gửi toàn bộ ảnh phiếu điểm đầy đủ chi tiết!
                </div>
              </div>

              {/* Visual Card Preview Container */}
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Bản xem trước phiếu điểm (Cuộn xuống để xem toàn bộ nội dung):
                  </span>
                  {isGeneratingImage && (
                    <span className="text-xs text-amber-600 font-semibold animate-pulse">
                      Đang kết xuất hình ảnh...
                    </span>
                  )}
                </div>

                {/* Scrollable Frame for the Card Preview */}
                <div className="max-h-[440px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-100 p-2 sm:p-4 shadow-inner flex justify-center custom-scrollbar">
                  <div ref={previewCardRef} className="w-full max-w-[620px]">
                    {renderCardContent(false)}
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
                    Bảng điểm UNIT và 3 kỹ năng của đúng học kỳ đang xem
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
    </DialogFrame>
  );
};
