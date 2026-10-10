import React, { useState } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Info, RefreshCw, Download, ShieldCheck, CheckCheck } from 'lucide-react';
import {
  checkDataConsistency,
  autoFixConsistency,
  generateConsistencyReport,
  formatConsistencyReport,
  ConsistencyIssue,
  ConsistencyReport
} from '../services/dataConsistencyService';
import { Student, ClassRoom, TuitionReceipt, CourseProgram } from '../types';

interface DataConsistencyCheckerProps {
  students: Student[];
  classrooms: ClassRoom[];
  receipts: TuitionReceipt[];
  programs: CourseProgram[];
  onDataFixed?: (fixedStudents: Student[], fixedClassrooms: ClassRoom[], fixedReceipts: TuitionReceipt[]) => void;
}

type TabType = 'overview' | 'issues' | 'report';

export default function DataConsistencyChecker({
  students,
  classrooms,
  receipts,
  programs,
  onDataFixed
}: DataConsistencyCheckerProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isFixing, setIsFixing] = useState(false);
  const [fixSuccessMsg, setFixSuccessMsg] = useState<string | null>(null);

  const handleCheck = async () => {
    setIsChecking(true);
    setFixSuccessMsg(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 600));
      const foundIssues = checkDataConsistency(students, classrooms, receipts, programs);
      setIssues(foundIssues);
      setReport(generateConsistencyReport(foundIssues));
    } finally {
      setIsChecking(false);
    }
  };

  const handleAutoFix = async () => {
    setIsFixing(true);
    setFixSuccessMsg(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      const result = autoFixConsistency(students, classrooms, receipts, programs);
      setIssues(result.issues);
      const updatedReport = generateConsistencyReport(result.issues);
      updatedReport.fixedCount = result.fixedCount;
      setReport(updatedReport);
      
      if (onDataFixed) {
        onDataFixed(result.fixedStudents, result.fixedClassrooms, result.fixedReceipts);
      }
      setFixSuccessMsg(`Đã tự động sửa thành công ${result.fixedCount} vấn đề đồng bộ dữ liệu!`);
    } finally {
      setIsFixing(false);
    }
  };

  const handleDownloadReport = () => {
    if (!report) return;
    const reportText = formatConsistencyReport(report);
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(reportText));
    element.setAttribute('download', `consistency-report-${new Date().toISOString().split('T')[0]}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  const getIconBySeverity = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />;
      case 'info':
        return <Info className="w-5 h-5 text-sky-600 flex-shrink-0" />;
      default:
        return <Info className="w-5 h-5 flex-shrink-0" />;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'student_not_in_class': '❌ Học viên không có trong lớp (nhưng có học phí)',
      'class_not_enrolled': '⚠️ ClassID không khớp với danh sách lớp',
      'student_missing_program': '🔍 Thiếu programId',
      'multiple_class_single_program': 'ℹ️ Học nhiều lớp cùng chương trình',
      'orphaned_receipt': '💔 Record học phí không tìm thấy học viên'
    };
    return labels[type] || type;
  };

  return (
    <div className="w-full bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-800 via-red-900 to-slate-900 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/10 rounded-xl text-white backdrop-blur-xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              Kiểm Tra & Chuẩn Hóa Tính Nhất Quán Dữ Liệu
            </h2>
            <p className="text-red-100/80 text-xs mt-0.5">
              Phát hiện và tự động đồng bộ liên kết giữa Học viên, Lớp học, Học phí và Chương trình học
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-800 hover:bg-red-900 text-white rounded-xl font-bold text-xs shadow-xs disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Đang kiểm tra...' : 'Kiểm Tra Dữ Liệu'}
          </button>

          {issues.length > 0 && (
            <>
              <button
                onClick={handleAutoFix}
                disabled={isFixing}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs disabled:bg-slate-300 disabled:cursor-not-allowed transition"
              >
                <CheckCircle className={`w-4 h-4 ${isFixing ? 'animate-spin' : ''}`} />
                {isFixing ? 'Đang tự động sửa...' : 'Sửa Tự Động'}
              </button>

              <button
                onClick={handleDownloadReport}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs shadow-xs transition"
              >
                <Download className="w-4 h-4" />
                Tải Báo Cáo Text
              </button>
            </>
          )}
        </div>

        {fixSuccessMsg && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs font-bold">
            <CheckCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{fixSuccessMsg}</span>
          </div>
        )}

        {/* Summary Cards */}
        {report && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-slate-500 text-xs font-semibold">Tổng Vấn Đề</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{report.totalIssues}</p>
            </div>

            <div className="bg-red-50 p-4 rounded-xl border border-red-200">
              <p className="text-red-700 text-xs font-semibold">🔴 Nghiêm Trọng</p>
              <p className="text-2xl font-black text-red-600 mt-1">{report.criticalIssues}</p>
            </div>

            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
              <p className="text-amber-700 text-xs font-semibold">🟡 Cảnh Báo</p>
              <p className="text-2xl font-black text-amber-600 mt-1">{report.warnings}</p>
            </div>

            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
              <p className="text-emerald-700 text-xs font-semibold">✅ Đã Sửa</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{report.fixedCount}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        {issues.length > 0 && (
          <>
            <div className="flex gap-2 border-b border-slate-200 mb-5">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 text-xs font-bold transition border-b-2 ${
                  activeTab === 'overview'
                    ? 'text-red-800 border-red-800'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                📊 Tóm Tắt
              </button>
              <button
                onClick={() => setActiveTab('issues')}
                className={`px-4 py-2 text-xs font-bold transition border-b-2 ${
                  activeTab === 'issues'
                    ? 'text-red-800 border-red-800'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                📋 Chi Tiết ({issues.length})
              </button>
              <button
                onClick={() => setActiveTab('report')}
                className={`px-4 py-2 text-xs font-bold transition border-b-2 ${
                  activeTab === 'report'
                    ? 'text-red-800 border-red-800'
                    : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                📄 Báo Cáo
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="bg-slate-50 border-l-4 border-red-700 p-4 rounded-r-xl">
                  <h3 className="font-bold text-slate-900 text-xs mb-2">Phát hiện được:</h3>
                  <ul className="text-slate-700 text-xs space-y-1.5">
                    {criticalCount > 0 && (
                      <li>🔴 <strong>{criticalCount}</strong> vấn đề nghiêm trọng cần xử lý (ví dụ: record học phí không có lớp)</li>
                    )}
                    {warningCount > 0 && (
                      <li>🟡 <strong>{warningCount}</strong> cảnh báo cần kiểm tra (ví dụ: mã lớp học viên không khớp)</li>
                    )}
                    {infoCount > 0 && (
                      <li>ℹ️ <strong>{infoCount}</strong> thông tin cần lưu ý (ví dụ: học nhiều lớp trong cùng một chương trình)</li>
                    )}
                  </ul>
                </div>

                <div className="bg-emerald-50/70 border-l-4 border-emerald-600 p-4 rounded-r-xl">
                  <h3 className="font-bold text-emerald-900 text-xs mb-2">Khả năng sửa tự động:</h3>
                  <ul className="text-emerald-800 text-xs space-y-1.5">
                    <li>✅ Tự động gán programId phù hợp từ lớp học cho học viên còn thiếu</li>
                    <li>✅ Tự động đồng bộ và sửa classId trong hồ sơ học sinh khớp với sĩ số lớp</li>
                    <li>✅ Tự động cập nhật danh sách học viên trực thuộc lớp học</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'issues' && (
              <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                {issues.length === 0 ? (
                  <p className="text-slate-500 text-center py-8 text-xs">Không có vấn đề nào!</p>
                ) : (
                  issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border-l-4 shadow-2xs ${
                        issue.severity === 'critical'
                          ? 'bg-red-50/70 border-red-600 text-red-950'
                          : issue.severity === 'warning'
                          ? 'bg-amber-50/70 border-amber-500 text-amber-950'
                          : 'bg-sky-50/70 border-sky-500 text-sky-950'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getIconBySeverity(issue.severity)}
                        <div className="flex-1">
                          <h4 className="font-bold text-xs">
                            {issue.studentCode} - {issue.studentName}
                          </h4>
                          <p className="text-[11px] font-semibold opacity-90 mt-0.5">{getTypeLabel(issue.type)}</p>
                          <p className="text-[11px] opacity-75 mt-0.5">{issue.details}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'report' && report && (
              <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs whitespace-pre-wrap overflow-auto max-h-96">
                {formatConsistencyReport(report)}
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!report && (
          <div className="text-center py-12">
            <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 text-sm font-bold">Chưa kiểm tra dữ liệu</p>
            <p className="text-slate-400 text-xs mt-1">Nhấn nút "Kiểm Tra Dữ Liệu" ở trên để bắt đầu quét toàn bộ hệ thống</p>
          </div>
        )}

        {report && issues.length === 0 && (
          <div className="text-center py-10 bg-emerald-50 rounded-xl border border-emerald-200">
            <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <p className="text-emerald-900 text-sm font-bold">Dữ liệu hoàn toàn nhất quán!</p>
            <p className="text-emerald-700 text-xs mt-1">Không phát hiện thấy bất kỳ xung đột nào giữa học viên, lớp học và học phí.</p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      {report && (
        <div className="bg-slate-50 px-6 py-3 rounded-b-2xl border-t border-slate-200 text-xs text-slate-500">
          <p>🕐 Quét lúc: {new Date(report.timestamp).toLocaleString('vi-VN')}</p>
        </div>
      )}
    </div>
  );
}
