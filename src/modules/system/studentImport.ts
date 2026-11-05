import { centerDate } from '../../lib/dates';
import type { ImportedStudentRow } from '../../services/excelService';
import type { ClassRoom, Student } from '../../types';

function normalizedClassCode(value: unknown) {
  return String(value ?? '').trim().toLocaleUpperCase('vi-VN');
}

export function findImportClass(row: ImportedStudentRow, classes: ClassRoom[]) {
  const classCode = normalizedClassCode(row.classCode);
  if (!classCode) return undefined;
  return classes.find(
    (classroom) => normalizedClassCode(classroom.code) === classCode,
  );
}

export function countUnassignedImportedStudents(
  rows: ImportedStudentRow[],
  classes: ClassRoom[],
) {
  return rows.filter((row) => !findImportClass(row, classes)).length;
}

interface BuildImportedStudentsOptions {
  fileName: string;
  timestamp?: number;
  enrollDate?: string;
}

export function buildImportedStudents(
  rows: ImportedStudentRow[],
  classes: ClassRoom[],
  options: BuildImportedStudentsOptions,
): Student[] {
  const timestamp = options.timestamp ?? Date.now();
  const enrollDate = options.enrollDate ?? centerDate();

  return rows.map((item, index) => {
    const classroom = findImportClass(item, classes);
    const suppliedClassCode = String(item.classCode ?? '').trim();
    const notes = [`Nhập từ Excel: ${options.fileName || 'tệp không rõ tên'}`];
    if (suppliedClassCode && !classroom)
      notes.push(`Mã lớp trong Excel chưa khớp: ${suppliedClassCode}`);

    return {
      id: `HS_IMP_${timestamp}_${index}`,
      code: item.code || '',
      name: item.name || '',
      dob: item.dob || '',
      gender: item.gender || 'Chưa xác định',
      school: item.school || '',
      gradeLevel: item.gradeLevel || '',
      programId: classroom?.programId || '',
      classId: classroom?.id || '',
      address: item.address || '',
      email: item.email || '',
      phone: item.phone || '',
      parentName: item.parentName || '',
      parentPhone: item.parentPhone || '',
      enrollDate,
      notes: notes.join(' · '),
      status: classroom ? 'active' : 'registered',
      feeStatus: 'unpaid',
    };
  });
}
