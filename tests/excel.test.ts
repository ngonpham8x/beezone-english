import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { generateMasterExcelWorkbook, parseCenterWorkbookFile } from '../src/services/excelService';
import * as initial from '../src/mock/initialData';
import type { TuitionReceipt } from '../src/types';

afterEach(() => vi.unstubAllGlobals());
describe('Excel export/import', () => {
  it('retains historical classes, grades and every payment across a round trip', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(readFileSync('public/excel/BeeZoneSyncTemplate.xlsm'))));
    const oldClass = initial.initialClasses[0], newClass = initial.initialClasses[1];
    const student = { ...initial.initialStudents[0], classId: newClass.id, programId: newClass.programId };
    const receipt: TuitionReceipt = { id: 'r', code: 'PT-2026-0088', studentId: student.id, classId: oldClass.id, courseFee: 1000, paidAmount: 600, debtAmount: 400, discount: 0, paymentKind: 'course', billingPeriod: 'Khóa 2026', paymentDate: '2026-09-01', collectorName: 'Test collector', paymentMethod: 'Tiền mặt', installments: [{ id: 'i2', date: '2026-10-01', amount: 200 }] };
    const grade = { id: 'g', studentId: student.id, classId: oldClass.id, listening: 8, speaking: 7, reading: 6, writing: 7, midterm: 8, finalExam: 9, attendance: 10, average: 8.1 };
    const blob = await generateMasterExcelWorkbook({ centerName: 'Test centre', programs: initial.initialPrograms, students: [student], classes: [{ ...oldClass, studentIds: [] }, { ...newClass, studentIds: [student.id] }], teachers: initial.initialTeachers, rooms: initial.initialRooms, receipts: [receipt], grades: [grade] });
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('xl/vbaProject.bin')).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    const result = await parseCenterWorkbookFile(new File([await blob.arrayBuffer()], 'report.xlsx'));
    expect(result.errors).toEqual([]);
    expect(result.data!.receipts).toHaveLength(1);
    const imported = result.data!.receipts[0];
    expect(imported.paidAmount).toBe(600); expect(imported.debtAmount).toBe(400);
    expect(imported.installments!.reduce((sum, entry) => sum + entry.amount, 0)).toBe(600);
    expect(imported.collectorName).toBe('Test collector');
    expect(result.data!.classes.find(c => c.id === imported.classId)?.code).toBe(oldClass.code);
    expect(result.data!.classes.find(c => c.id === result.data!.grades[0].classId)?.code).toBe(oldClass.code);
    expect(result.data!.classes.find(c => c.id === result.data!.students[0].classId)?.code).toBe(newClass.code);
  }, 30_000);
  it('rejects duplicate receipt codes instead of adding unrelated payments', async () => {
    const book = new ExcelJS.Workbook();
    const classes = book.addWorksheet('LỚP HỌC');
    classes.addRow(['Mã lớp', 'Tên lớp', 'Chương trình', 'Giáo viên', 'Phòng']); classes.addRow(['A', 'Class A', 'Demo', 'Teacher', 'Room']);
    const students = book.addWorksheet('HỌC SINH');
    students.addRow(['Mã học sinh', 'Họ và tên', 'Mã lớp', 'ID hệ thống']); students.addRow(['HS1', 'Test Student', 'A', 's1']);
    const receipts = book.addWorksheet('HỌC PHÍ');
    receipts.addRow(['Mã phiếu', 'ID hệ thống', 'Mã học sinh', 'Mã lớp', 'Đã thu (VNĐ)', 'Công nợ (VNĐ)', 'Ngày thu']);
    receipts.addRow(['PT-2026-001', 's1', 'HS1', 'A', 100, 0, '2026-10-01']);
    receipts.addRow(['PT-2026-001', 's1', 'HS1', 'A', 200, 0, '2026-10-02']);
    const result = await parseCenterWorkbookFile(new File([await book.xlsx.writeBuffer() as any], 'duplicate.xlsx'));
    expect(result.data).toBeUndefined(); expect(result.errors[0].message).toMatch(/trùng/);
  });
});
