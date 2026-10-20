import { isStudentInClass, studentClassIds } from '../lib/studentClasses';
import { Student, ClassRoom, TuitionReceipt, CourseProgram } from '../types';

export interface ConsistencyIssue {
  type: 'student_not_in_class' | 'class_not_enrolled' | 'student_missing_program' | 'multiple_class_single_program' | 'orphaned_receipt';
  severity: 'critical' | 'warning' | 'info';
  studentId: string;
  studentCode: string;
  studentName: string;
  details: string;
  affectedIds: {
    classId?: string;
    receiptId?: string;
    programId?: string;
  };
}

export interface ConsistencyReport {
  timestamp: string;
  totalIssues: number;
  criticalIssues: number;
  warnings: number;
  issues: ConsistencyIssue[];
  fixedCount: number;
}

/**
 * Kiểm tra tính nhất quán của dữ liệu
 * - Học viên có trong DB nhưng không có trong lớp
 * - Học viên có record học phí nhưng không đăng ký khoá học
 * - Học viên học 2 lớp nhưng chỉ có 1 khoá học
 * - Record học phí không có học viên tương ứng
 */
export function checkDataConsistency(
  students: Student[],
  classrooms: ClassRoom[],
  receipts: TuitionReceipt[],
  programs: CourseProgram[]
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const studentsById = new Map(students.map(student => [student.id, student]));
  const classesById = new Map(classrooms.map(classroom => [classroom.id, classroom]));
  const programsById = new Map(programs.map(program => [program.id, program]));
  const add = (type: ConsistencyIssue['type'], severity: ConsistencyIssue['severity'], studentId: string, details: string, affectedIds: ConsistencyIssue['affectedIds']) => {
    const student = studentsById.get(studentId);
    issues.push({ type, severity, studentId, studentCode: student?.code || '?', studentName: student?.name || '[Không tồn tại]', details, affectedIds });
  };
  for (const student of students) {
    for (const classId of studentClassIds(student).filter(id => id !== student.classId)) {
      const extra = classesById.get(classId);
      if (!extra) add('student_not_in_class', 'critical', student.id, `Lớp học thêm ${classId} không tồn tại.`, { classId });
      else if (!extra.studentIds.includes(student.id)) add('student_not_in_class', 'warning', student.id, `Danh sách lớp ${extra.code} thiếu học viên.`, { classId });
    }
    const classroom = classesById.get(student.classId);
    if (student.classId && !classroom) add('student_not_in_class', 'critical', student.id, `Lớp ${student.classId} của học viên không tồn tại.`, { classId: student.classId });
    else if (classroom && !classroom.studentIds.includes(student.id)) add('student_not_in_class', 'warning', student.id, `Danh sách lớp ${classroom.code} thiếu học viên.`, { classId: classroom.id });
    if (classroom && (!programsById.has(student.programId) || student.programId !== classroom.programId)) add('student_missing_program', 'warning', student.id, `Chương trình học không khớp lớp ${classroom.code}.`, { classId: classroom.id, programId: classroom.programId });
  }
  for (const classroom of classrooms) {
    for (const studentId of classroom.studentIds) {
      const student = studentsById.get(studentId);
      if (!student || !isStudentInClass(student, classroom.id)) add('class_not_enrolled', 'warning', studentId, `Danh sách lớp ${classroom.code} có học viên đã chuyển lớp hoặc không còn tồn tại.`, { classId: classroom.id });
    }
  }
  for (const receipt of receipts) {
    if (!studentsById.has(receipt.studentId) || !classesById.has(receipt.classId)) add('orphaned_receipt', 'critical', receipt.studentId, `Phiếu ${receipt.code} thiếu liên kết học viên hoặc lớp. Cần kiểm tra thủ công để giữ lịch sử tài chính.`, { receiptId: receipt.id, classId: receipt.classId });
  }
  return issues;
}

/** Repair derived rosters using student.classId; never move students from stale rosters. */
export function autoFixConsistency(
  students: Student[], classrooms: ClassRoom[], receipts: TuitionReceipt[], programs: CourseProgram[]
): { issues: ConsistencyIssue[]; fixedStudents: Student[]; fixedClassrooms: ClassRoom[]; fixedReceipts: TuitionReceipt[]; fixedCount: number } {
  let fixedCount = 0;
  const classesById = new Map(classrooms.map(classroom => [classroom.id, classroom]));
  const programIds = new Set(programs.map(program => program.id));
  const fixedStudents = students.map(student => {
    const classroom = classesById.get(student.classId);
    if (classroom && programIds.has(classroom.programId) && student.programId !== classroom.programId) {
      fixedCount += 1; return { ...student, programId: classroom.programId };
    }
    return { ...student };
  });
  const fixedClassrooms = classrooms.map(classroom => {
    const studentIds = fixedStudents.filter(student => isStudentInClass(student, classroom.id)).map(student => student.id);
    if (JSON.stringify(studentIds) !== JSON.stringify(classroom.studentIds)) fixedCount += 1;
    return { ...classroom, studentIds };
  });
  const fixedReceipts = receipts.map(receipt => ({ ...receipt }));
  return { issues: checkDataConsistency(fixedStudents, fixedClassrooms, fixedReceipts, programs), fixedStudents, fixedClassrooms, fixedReceipts, fixedCount };
}

/**
 * Tạo báo cáo chi tiết
 */
export function generateConsistencyReport(issues: ConsistencyIssue[]): ConsistencyReport {
  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');

  return {
    timestamp: new Date().toISOString(),
    totalIssues: issues.length,
    criticalIssues: criticalIssues.length,
    warnings: warnings.length,
    issues,
    fixedCount: 0
  };
}

/**
 * Xuất báo cáo ra định dạng text
 */
export function formatConsistencyReport(report: ConsistencyReport): string {
  const lines: string[] = [];
  
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('📊 BÁO CÁO KIỂM TRA TÍNH NHẤT QUÁN DỮ LIỆU');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`⏰ Thời gian: ${new Date(report.timestamp).toLocaleString('vi-VN')}`);
  lines.push('');
  
  lines.push(`📈 TÓNG QUAN:`);
  lines.push(`  • Tổng vấn đề: ${report.totalIssues}`);
  lines.push(`  • 🔴 Nghiêm trọng: ${report.criticalIssues}`);
  lines.push(`  • 🟡 Cảnh báo: ${report.warnings}`);
  lines.push(`  • ✅ Đã sửa: ${report.fixedCount}`);
  lines.push('');

  if (report.totalIssues === 0) {
    lines.push('✨ Không có vấn đề nào!');
  } else {
    lines.push('📋 CHI TIẾT CÁC VẤN ĐỀ:');
    lines.push('');

    // Nhóm theo loại vấn đề
    const groupedByType = new Map<string, ConsistencyIssue[]>();
    report.issues.forEach(issue => {
      if (!groupedByType.has(issue.type)) {
        groupedByType.set(issue.type, []);
      }
      groupedByType.get(issue.type)!.push(issue);
    });

    const typeLabels: Record<string, string> = {
      'student_not_in_class': '❌ Học viên không có trong lớp (nhưng có học phí)',
      'class_not_enrolled': '⚠️ ClassID không khớp',
      'student_missing_program': '🔍 Thiếu programId',
      'multiple_class_single_program': 'ℹ️ Học nhiều lớp, 1 khoá',
      'orphaned_receipt': '💔 Record học phí mồ côi'
    };

    groupedByType.forEach((issues, type) => {
      lines.push(`\n${typeLabels[type] || type} (${issues.length}):`);
      lines.push('─'.repeat(60));
      
      issues.forEach((issue, idx) => {
        lines.push(`  ${idx + 1}. ${issue.studentCode} - ${issue.studentName}`);
        lines.push(`     └─ ${issue.details}`);
      });
    });
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}
