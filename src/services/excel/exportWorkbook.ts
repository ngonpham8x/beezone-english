import ExcelJS from 'exceljs';
import { createExportContext } from './exportContext';
import { writeAttendanceSheets } from './sheets/attendanceSheets';
import { writeClassDetails } from './sheets/classDetails';
import { writeClassLookup } from './sheets/classLookup';
import { writeClassSheet } from './sheets/classSheet';
import { writeGradeSheet } from './sheets/gradeSheet';
import { writeGuideSheet } from './sheets/guideSheet';
import { writeStudentSheet } from './sheets/studentSheet';
import { writeSummarySheet } from './sheets/summarySheet';
import { writeTuitionSheet } from './sheets/tuitionSheet';
import type { ExcelExportData } from './types';
export async function generateMasterExcelWorkbook(data: ExcelExportData): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.centerName;
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const context = createExportContext(data, workbook);
  writeAttendanceSheets(context);
  writeSummarySheet(context);
  writeStudentSheet(context);
  writeClassSheet(context);
  writeTuitionSheet(context);
  writeGradeSheet(context);
  writeClassDetails(context);
  writeClassLookup(context);
  writeGuideSheet(context);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
