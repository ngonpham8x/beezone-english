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

  // Tạo map để lookup nhanh
  const studentMap = new Map(students.map(s => [s.id, s]));
  const classMap = new Map(classrooms.map(c => [c.id, c]));
  const programMap = new Map(programs.map(p => [p.id, p]));
  
  // Map học viên -> danh sách lớp
  const studentToClasses = new Map<string, ClassRoom[]>();
  classrooms.forEach(cls => {
    cls.studentIds.forEach(studentId => {
      if (!studentToClasses.has(studentId)) {
        studentToClasses.set(studentId, []);
      }
      studentToClasses.get(studentId)!.push(cls);
    });
  });

  // Map học viên -> danh sách khoá học
  const studentToPrograms = new Map<string, Set<string>>();
  classrooms.forEach(cls => {
    cls.studentIds.forEach(studentId => {
      if (!studentToPrograms.has(studentId)) {
        studentToPrograms.set(studentId, new Set());
      }
      studentToPrograms.get(studentId)!.add(cls.programId);
    });
  });

  // 1. Kiểm tra học viên có record học phí nhưng không trong lớp nào
  const receiptsWithoutClass = new Set<string>();
  receipts.forEach(receipt => {
    const student = studentMap.get(receipt.studentId);
    if (!student) {
      issues.push({
        type: 'orphaned_receipt',
        severity: 'critical',
        studentId: receipt.studentId,
        studentCode: '?',
        studentName: `[Học viên không tồn tại]`,
        details: `Record học phí ${receipt.code} không có học viên ID: ${receipt.studentId}`,
        affectedIds: { receiptId: receipt.id }
      });
      receiptsWithoutClass.add(receipt.studentId);
      return;
    }

    const enrolledClasses = studentToClasses.get(receipt.studentId);
    if (!enrolledClasses || enrolledClasses.length === 0) {
      issues.push({
        type: 'student_not_in_class',
        severity: 'critical',
        studentId: receipt.studentId,
        studentCode: student.code,
        studentName: student.name,
        details: `Có record học phí nhưng không đăng ký lớp nào. Receipt: ${receipt.code}`,
        affectedIds: { receiptId: receipt.id }
      });
    }
  });

  // 2. Kiểm tra học viên có trong lớp nhưng không có đăng ký khoá học (thiếu programId)
  students.forEach(student => {
    const enrolledClasses = studentToClasses.get(student.id);
    if (enrolledClasses && enrolledClasses.length > 0) {
      // Kiểm tra programId
      if (!student.programId) {
        issues.push({
          type: 'student_missing_program',
          severity: 'warning',
          studentId: student.id,
          studentCode: student.code,
          studentName: student.name,
          details: `Đăng ký ${enrolledClasses.length} lớp nhưng không có programId trong profile`,
          affectedIds: { classId: enrolledClasses[0].id }
        });
      }
    }
  });

  // 3. Kiểm tra học viên học 2+ lớp nhưng chỉ có 1 khoá học
  students.forEach(student => {
    const enrolledClasses = studentToClasses.get(student.id);
    if (enrolledClasses && enrolledClasses.length > 1) {
      const uniquePrograms = new Set(enrolledClasses.map(c => c.programId));
      
      // Nếu học nhiều lớp nhưng chỉ 1 khoá -> có thể lỗi
      if (uniquePrograms.size < enrolledClasses.length) {
        const programDetails = Array.from(uniquePrograms)
          .map(pid => programMap.get(pid)?.name || `Program ${pid}`)
          .join(', ');
        
        issues.push({
          type: 'multiple_class_single_program',
          severity: 'info',
          studentId: student.id,
          studentCode: student.code,
          studentName: student.name,
          details: `Học ${enrolledClasses.length} lớp nhưng chỉ 1 khoá: ${programDetails}. Lớp: ${enrolledClasses.map(c => c.code).join(', ')}`,
          affectedIds: { classId: enrolledClasses[0].id }
        });
      }
    }
  });

  // 4. Kiểm tra lớp có học viên nhưng lớp đó không tương ứng với studentId
  classrooms.forEach(classroom => {
    classroom.studentIds.forEach(studentId => {
      const student = studentMap.get(studentId);
      if (!student) {
        issues.push({
          type: 'student_not_in_class',
          severity: 'critical',
          studentId: studentId,
          studentCode: '?',
          studentName: `[Không tồn tại]`,
          details: `Lớp ${classroom.code} chứa studentId không tồn tại: ${studentId}`,
          affectedIds: { classId: classroom.id }
        });
      } else if (student.classId !== classroom.id && student.classId !== '') {
        // Nếu student.classId khác với classroom.id, cần cập nhật
        issues.push({
          type: 'class_not_enrolled',
          severity: 'warning',
          studentId: student.id,
          studentCode: student.code,
          studentName: student.name,
          details: `Student.classId (${student.classId}) khác với lớp thực tế: ${classroom.id}. Lớp: ${classroom.code}`,
          affectedIds: { classId: classroom.id }
        });
      }
    });
  });

  return issues;
}

/**
 * Tự động sửa các vấn đề đồng bộ
 */
export function autoFixConsistency(
  students: Student[],
  classrooms: ClassRoom[],
  receipts: TuitionReceipt[],
  programs: CourseProgram[]
): {
  issues: ConsistencyIssue[];
  fixedStudents: Student[];
  fixedClassrooms: ClassRoom[];
  fixedReceipts: TuitionReceipt[];
  fixedCount: number;
} {
  const issues = checkDataConsistency(students, classrooms, receipts, programs);
  
  let fixedCount = 0;
  const fixedStudents = JSON.parse(JSON.stringify(students)) as Student[];
  const fixedClassrooms = JSON.parse(JSON.stringify(classrooms)) as ClassRoom[];
  const fixedReceipts = JSON.parse(JSON.stringify(receipts)) as TuitionReceipt[];

  const studentMap = new Map(fixedStudents.map(s => [s.id, s]));
  const classMap = new Map(fixedClassrooms.map(c => [c.id, c]));
  const programMap = new Map(programs.map(p => [p.id, p]));

  // Fix 1: Cập nhật programId nếu học viên có trong lớp nhưng thiếu programId
  issues
    .filter(i => i.type === 'student_missing_program')
    .forEach(issue => {
      const student = studentMap.get(issue.studentId);
      const classId = issue.affectedIds.classId;
      const classroom = classId ? classMap.get(classId) : undefined;
      
      if (student && classroom && !student.programId) {
        student.programId = classroom.programId;
        fixedCount++;
      }
    });

  // Fix 2: Cập nhật classId trong student profile nếu khác
  issues
    .filter(i => i.type === 'class_not_enrolled')
    .forEach(issue => {
      const student = studentMap.get(issue.studentId);
      const classId = issue.affectedIds.classId;
      
      if (student && classId) {
        student.classId = classId;
        fixedCount++;
      }
    });

  // Fix 3: Xóa các receipt của học viên không tồn tại (nếu cần xóa)
  // (Lưu ý: chúng ta chỉ đánh dấu, không thực sự xóa)
  issues
    .filter(i => i.type === 'orphaned_receipt')
    .forEach(issue => {
      // Không tự động xóa để an toàn dữ liệu
      // Chỉ ghi log
    });

  return {
    issues,
    fixedStudents,
    fixedClassrooms,
    fixedReceipts,
    fixedCount
  };
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
