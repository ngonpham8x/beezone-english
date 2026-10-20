import ExcelJS from 'exceljs';
import { validateSessionReceipt } from '../../lib/sessionBilling';
import { importAcademics } from './importAcademics';
import { importFinance } from './importFinance';
import { importGrades, importTimetable } from './importGrades';
import { importStudents } from './importStudents';
import type { CenterWorkbookImportResult } from './types';
export async function parseAcademicCatalogFile(file: File): Promise<CenterWorkbookImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet('LỚP HỌC');
  if (!sheet) return { errors: [{ row: 0, field: 'Danh mục lớp', message: 'Không có sheet LỚP HỌC.' }] };
  const result = importAcademics(sheet);
  if (result.errors) return { errors: result.errors };
  const { programs, teachers, rooms, classes } = result.data;
  return { errors: [], data: { programs, teachers, rooms, classes, timetableSlots: importTimetable(classes), students: [], grades: [], receipts: [] } };
}
export async function parseCenterWorkbookFile(file: File): Promise<CenterWorkbookImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const classMaster = workbook.getWorksheet('LỚP HỌC');
  const tuitionSheet = workbook.getWorksheet('HỌC PHÍ');
  if (!classMaster || !tuitionSheet) {
    return {
      errors: [
        {
          row: 0,
          field: 'Tệp Excel',
          message:
            'Đây không phải báo cáo đã chuẩn hoá. Hãy dùng file “...DaChuanHoa.xlsx” được tạo từ hệ thống.',
        },
      ],
    };
  }

  const academics = importAcademics(classMaster);
  if (academics.errors) return { errors: academics.errors };
  const { programs, teachers, rooms, classes, ensureProgram } = academics.data;
  const importedStudents = importStudents(workbook, classes, ensureProgram);
  if (importedStudents.errors) return { errors: importedStudents.errors };
  const { students, masterDirectPayments } = importedStudents.data;
  const finance = importFinance(
    workbook,
    tuitionSheet,
    students,
    classes,
    teachers,
    masterDirectPayments,
  );
  if (finance.errors) return { errors: finance.errors };
  const { receipts, attendanceSessions } = finance.data;
  const grades = importGrades(workbook, students, classes);
  const timetableSlots = importTimetable(classes);
  for (const receipt of receipts) {
    const issue = validateSessionReceipt(receipt, attendanceSessions, receipts);
    if (issue) return { errors: [{ row: 0, field: 'Học phí buổi', message: issue }] };
  }
  return {
    data: {
      programs,
      teachers,
      rooms,
      classes,
      students,
      timetableSlots,
      grades,
      receipts,
      attendanceSessions,
    },
    errors: [],
  };
}
