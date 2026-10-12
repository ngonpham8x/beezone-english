import React, { useState } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Info, RefreshCw, Download } from 'lucide-react';
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

  const handleCheck = async () => {
    setIsChecking(true);
    try {
      // Simulate async check
      await new Promise(resolve => setTimeout(resolve, 1000));
      const foundIssues = checkDataConsistency(students, classrooms, receipts, programs);
      setIssues(foundIssues);
      setReport(generateConsistencyReport(foundIssues));
    } finally {
      setIsChecking(false);
    }
  };

  const handleAutoFix = async () => {
    setIsFixing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const result = autoFixConsistency(students, classrooms, receipts, programs);
      setIssues(result.issues);
      const updatedReport = generateConsistencyReport(result.issues);
      updatedReport.fixedCount = result.fixedCount;
      setReport(updatedReport);
      
      if (onDataFixed) {
        onDataFixed(result.fixedStudents, result.fixedClassrooms, result.fixedReceipts);
      }
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
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'student_not_in_class': '❌ Học viên không có trong lớp (nhưng có học phí)',
      'class_not_enrolled': '⚠️ ClassID không khớp',
      'student_missing_program': '🔍 Thiếu programId',
      'multiple_class_single_program': 'ℹ️ Học nhiều lớp, 1 khoá',
      'orphaned_receipt': '💔 Record học phí mồ côi'
    };
    return labels[type] || type;
  };

  return (
    <div className="w-full bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-lg">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <RefreshCw className="w-6 h-6" />
          Kiểm Tra & Sửa Tính Nhất Quán Dữ Liệu
        </h2>
        <p className="text-blue-100 text-sm mt-1">
          Phát hiện và tự động sửa các liên kết bị dứt giữa học viên, lớp học, và học phí
        </p>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Đang kiểm tra...' : 'Kiểm Tra Dữ Liệu'}
          </button>

          {issues.length > 0 && (
            <>
              <button
                onClick={handleAutoFix}
                disabled={isFixing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
              >
                <CheckCircle className={`w-4 h-4 ${isFixing ? 'animate-spin' : ''}`} />
                {isFixing ? 'Đang sửa...' : 'Sửa Tự Động'}
              </button>

              <button
                onClick={handleDownloadReport}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
              >
                <Download className="w-4 h-4" />
                Tải Báo Cáo
              </button>
            </>
          )}
        </div>

        {/* Summary Cards */}
        {report && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="text-gray-600 text-sm font-medium">Tổng Vấn Đề</p>
              <p className="text-3xl font-bold text-gray-800">{report.totalIssues}</p>
            </div>

            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <p className="text-red-600 text-sm font-medium">🔴 Nghiêm Trọng</p>
              <p className="text-3xl font-bold text-red-600">{report.criticalIssues}</p>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <p className="text-yellow-600 text-sm font-medium">🟡 Cảnh Báo</p>
              <p className="text-3xl font-bold text-yellow-600">{report.warnings}</p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-green-600 text-sm font-medium">✅ Đã Sửa</p>
              <p className="text-3xl font-bold text-green-600">{report.fixedCount}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        {issues.length > 0 && (
          <>
            <div className="flex gap-4 border-b border-gray-200 mb-4">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 font-medium transition ${
                  activeTab === 'overview'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                📊 Tóm Tắt
              </button>
              <button
                onClick={() => setActiveTab('issues')}
                className={`px-4 py-2 font-medium transition ${
                  activeTab === 'issues'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                📋 Chi Tiết ({issues.length})
              </button>
              <button
                onClick={() => setActiveTab('report')}
                className={`px-4 py-2 font-medium transition ${
                  activeTab === 'report'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                📄 Báo Cáo
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <h3 className="font-semibold text-blue-900 mb-2">Phát hiện được:</h3>
                  <ul className="text-blue-800 text-sm space-y-1">
                    {criticalCount > 0 && (
                      <li>🔴 <strong>{criticalCount}</strong> vấn đề nghiêm trọng cần xử lý ngay</li>
                    )}
                    {warningCount > 0 && (
                      <li>🟡 <strong>{warningCount}</strong> cảnh báo cần kiểm tra</li>
                    )}
                    {infoCount > 0 && (
                      <li>ℹ️ <strong>{infoCount}</strong> thông tin cần lưu ý</li>
                    )}
                  </ul>
                </div>

                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                  <h3 className="font-semibold text-green-900 mb-2">Có thể sửa tự động:</h3>
                  <ul className="text-green-800 text-sm space-y-1">
                    <li>✅ Cập nhật programId từ lớp học</li>
                    <li>✅ Sửa classId không khớp</li>
                    <li>✅ Cập nhật danh sách học sinh trong lớp</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'issues' && (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {issues.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Không có vấn đề nào!</p>
                ) : (
                  issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border-l-4 ${
                        issue.severity === 'critical'
                          ? 'bg-red-50 border-red-500'
                          : issue.severity === 'warning'
                          ? 'bg-yellow-50 border-yellow-500'
                          : 'bg-blue-50 border-blue-500'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getIconBySeverity(issue.severity)}
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">
                            {issue.studentCode} - {issue.studentName}
                          </h4>
                          <p className="text-sm text-gray-700 mt-1">{getTypeLabel(issue.type)}</p>
                          <p className="text-sm text-gray-600 mt-1">{issue.details}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'report' && report && (
              <div className="bg-gray-50 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap overflow-auto max-h-96">
                {formatConsistencyReport(report)}
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!report && (
          <div className="text-center py-12">
            <RefreshCw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg font-medium">Chưa kiểm tra dữ liệu</p>
            <p className="text-gray-500 text-sm mt-1">Nhấn "Kiểm Tra Dữ Liệu" để bắt đầu</p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      {report && (
        <div className="bg-gray-50 px-6 py-3 rounded-b-lg border-t border-gray-200 text-sm text-gray-600">
          <p>🕐 Kiểm tra lúc: {new Date(report.timestamp).toLocaleString('vi-VN')}</p>
        </div>
      )}
    </div>
  );
}
