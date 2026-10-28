import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { generateMasterExcelWorkbook, parseCenterWorkbookFile } from '../src/services/excelService';
import * as initial from '../src/mock/initialData';
import type { AttendanceSession, Grade, TuitionReceipt } from '../src/types';
import { parseCenterData } from '../src/lib/centerData';
import { withUnbilledSessionReceipts } from '../src/lib/sessionBilling';
import { appendParentContact } from '../src/modules/attendance/parentContact';

afterEach(() => vi.unstubAllGlobals());
describe('Excel export/import', () => {
  it('round trips all four semester grade fields and UNIT scores', async () => {
    const classroom = initial.initialClasses[0];
    const student = { ...initial.initialStudents[0], classId: classroom.id, programId: classroom.programId };
    const common = {
      studentId: student.id,
      classId: classroom.id,
      listening: 8,
      speaking: 9,
      readingWriting: 7,
      reading: 7,
      writing: 7,
      midterm: 0,
      finalExam: 0,
      attendance: 0,
      average: 8,
    };
    const grades: Grade[] = [
      { ...common, id: 'g-gki', semester: 'GKI', unitScores: { unit1: 9 }, comment: 'Tiến bộ tốt' },
      { ...common, id: 'g-cki', semester: 'CKI', listening: 9, unitScores: { unit4: 8.5 }, comment: 'Cần luyện nói' },
    ];
    const blob = await generateMasterExcelWorkbook({ centerName: 'Test', programs: initial.initialPrograms, students: [student], classes: [classroom], teachers: initial.initialTeachers, rooms: initial.initialRooms, grades, receipts: [] });
    const result = await parseCenterWorkbookFile(new File([await blob.arrayBuffer()], 'semester-grades.xlsx'));
    expect(result.errors).toEqual([]);
    expect(result.data!.grades).toHaveLength(2);
    expect(result.data!.grades).toEqual(expect.arrayContaining([
      expect.objectContaining({ semester: 'GKI', readingWriting: 7, unitScores: { unit1: 9 }, comment: 'Tiến bộ tốt' }),
      expect.objectContaining({ semester: 'CKI', listening: 9, unitScores: { unit4: 8.5 }, comment: 'Cần luyện nói' }),
    ]));
  }, 30_000);

  it('round trips one student in three classes and scopes class financial formulas', async () => {
    const classes = initial.initialClasses.slice(0, 3);
    const student = { ...initial.initialStudents[0], classId: classes[0].id, programId: classes[0].programId, additionalClassIds: classes.slice(1).map(c => c.id) };
    const blob = await generateMasterExcelWorkbook({ centerName: 'Test', programs: initial.initialPrograms, students: [student], classes, teachers: initial.initialTeachers, rooms: initial.initialRooms, grades: [], receipts: [] });
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await blob.arrayBuffer());
    expect(book.getWorksheet('HỌC SINH')!.getCell('AA6').value).toBe(JSON.stringify(classes.slice(1).map(c => c.code)));
    const result = await parseCenterWorkbookFile(new File([await blob.arrayBuffer()], 'multi.xlsx'));
    expect(result.errors).toEqual([]);
    expect(result.data!.students).toHaveLength(1);
    const codes = result.data!.students[0].additionalClassIds!.map(id => result.data!.classes.find(c => c.id === id)?.code);
    expect(codes).toEqual(classes.slice(1).map(c => c.code));
    const detail = book.worksheets.find(sheet => String(sheet.getCell('B12').value) === student.code && String(sheet.getCell('G12').formula).includes(classes[1].code));
    expect(detail).toBeTruthy();
    expect(detail!.getCell('G12').formula).toContain("'HỌC PHÍ'!$F$");
  });
  it('round trips lesson prices, absences, grouped payments and unbilled debt', async () => {
    const classroom = {...initial.initialClasses[0],billingMode:'session' as const,sessionRate:200000,sessionAbsencePolicy:'attended' as const,sessionBillingStartDate:'2020-01-01'};
    const student = {...initial.initialStudents[0],classId:classroom.id};
    const sessions:AttendanceSession[] = ['2020-01-02','2020-01-03','2020-01-04'].map((date,index)=>({id:`a${index}`,classId:classroom.id,date,lessonTopic:'Speaking',generalNotes:'Test note',billing:{unitPrice:150000,absencePolicy:'attended'},entries:[{studentId:student.id,status:index===2?'excused':'late',homeworkCompleted:true,note:'Homework checked'}]}));
    sessions[2].entries[0].note = appendParentContact('Homework checked', 'Zalo', 'Parent confirmed', 'Test teacher', new Date('2020-01-04T12:00:00Z'));
    const receipt:TuitionReceipt={id:'r',code:'PT-2020-0001',invoiceNo:'00126',bookNo:'03',invoiceBook:'00126 / 03',studentId:student.id,classId:classroom.id,paymentKind:'session',courseFee:0,monthlyFee:0,sessionFee:150000,sessionLines:[{attendanceSessionId:'a0',date:'2020-01-02',unitPrice:150000}],paidAmount:60000,debtAmount:80000,discount:10000,paymentDate:'2020-01-10',collectorName:'Owner',paymentMethod:'Tiền mặt',status:'partial',installments:[{id:'i1',date:'2020-01-05',amount:40000,invoiceNo:'00125',bookNo:'03',invoiceBook:'00125 / 03'},{id:'i2',date:'2020-01-10',amount:20000,invoiceNo:'00126',bookNo:'03',invoiceBook:'00126 / 03'}]};
    const blob=await generateMasterExcelWorkbook({centerName:'Test',programs:initial.initialPrograms,students:[student],classes:[classroom],teachers:initial.initialTeachers,rooms:initial.initialRooms,grades:[],receipts:[receipt],attendanceSessions:sessions});
    const book=new ExcelJS.Workbook(); await book.xlsx.load(await blob.arrayBuffer());
    expect(book.getWorksheet('BUỔI CHƯA THU')!.getCell('G2').value).toBe(150000);
    expect(book.getWorksheet('BUỔI CHƯA THU')!.rowCount).toBe(2);
    expect((book.getWorksheet('TỔNG QUAN')!.getCell('B9').value as any).formula).toContain('BUỔI CHƯA THU');
    expect(book.getWorksheet('HỌC PHÍ')!.getCell('X6').value).toBe('00125');
    expect(book.getWorksheet('HỌC PHÍ')!.getCell('Z7').value).toBe('00126 / 03');
    const result=await parseCenterWorkbookFile(new File([await blob.arrayBuffer()],'session.xlsx'));
    expect(result.errors).toEqual([]);expect(result.data!.receipts).toHaveLength(1);
    expect(result.data!.receipts[0]).toMatchObject({paymentKind:'session',sessionFee:150000,paidAmount:60000,debtAmount:80000,discount:10000,sessionLines:receipt.sessionLines});
    expect(result.data!.receipts[0]).toMatchObject({invoiceNo:'00126',bookNo:'03',invoiceBook:'00126 / 03'});
    expect(result.data!.receipts[0].installments).toEqual([
      expect.objectContaining({ invoiceNo: '00125', bookNo: '03', invoiceBook: '00125 / 03' }),
      expect.objectContaining({ invoiceNo: '00126', bookNo: '03', invoiceBook: '00126 / 03' }),
    ]);
    expect(result.data!.attendanceSessions!.map(a=>a.entries[0].status)).toEqual(['late','late','excused']);
    expect(result.data!.attendanceSessions![2].entries[0].note).toBe(sessions[2].entries[0].note);
    expect(result.data!.classes[0]).toMatchObject({billingMode:'session',sessionRate:200000,sessionAbsencePolicy:'attended',sessionBillingStartDate:'2020-01-01'});
    const parsed=parseCenterData({...result.data,settings:initial.initialSettings},initial.initialSettings);
    expect(withUnbilledSessionReceipts(parsed.receipts,parsed.attendanceSessions).reduce((sum,r)=>sum+r.debtAmount,0)).toBe(230000);
  },30000);
  it('retains course period fields and payment deadlines in the report round trip', async () => {
    const classroom = { ...initial.initialClasses[0], startDate: '2026-10-01', endDate: '2026-12-30', totalSessions: 24, courseStatus: 'active' as const };
    const student = { ...initial.initialStudents[0], classId: classroom.id, programId: classroom.programId };
    const receipt = { ...initial.initialTuitionReceipts[0], studentId: student.id, classId: classroom.id, dueDate: '2026-10-20' };
    const blob = await generateMasterExcelWorkbook({ centerName: 'Test centre', programs: initial.initialPrograms, students: [student], classes: [classroom], teachers: initial.initialTeachers, rooms: initial.initialRooms, receipts: [receipt], grades: [] });
    const result = await parseCenterWorkbookFile(new File([await blob.arrayBuffer()], 'operations.xlsx'));
    expect(result.errors).toEqual([]);
    expect(result.data!.classes[0]).toMatchObject({ startDate: '2026-10-01', endDate: '2026-12-30', totalSessions: 24, courseStatus: 'active' });
    expect(result.data!.receipts[0].dueDate).toBe('2026-10-20');
  }, 30_000);
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
