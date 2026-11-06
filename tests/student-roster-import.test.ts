import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseStudentRosterWorkbookFile } from '../src/services/excelService';
import { mergeStudentRoster } from '../src/modules/system/studentRoster';

const baseHeaders = [
  'STT', 'Active', 'Cấp tài khoản', 'Học viên', 'Ngày sinh', 'Giới tính',
  'Tên lớp', 'Phụ huynh', 'Trường học', 'Địa chỉ', 'Khối lớp', 'Hệ đào tạo', 'Trạng thái',
];

async function rosterFile() {
  const workbook = new ExcelJS.Workbook();
  const bee = workbook.addWorksheet('BEE 9B');
  bee.addRow(baseHeaders);
  bee.addRow([
    1, 'Hoạt động', 'Đã cấp', 'Nguyễn Văn An', '02/04/2012', 'Nam',
    'K26 - BEE 8B ,K27 - BEE 9B ,K27 - SPEAKING 2A', 'Mẹ Lan', 'Nguyễn Huệ',
    'Hòa Thành, Tây Ninh', 'Lớp 9', 'Mầm Non - Chương Trình SGK Cơ Bản', 'Đang học',
  ]);
  bee.addRow([
    2, 'Hoạt động', 'Đã cấp', 'Trần Thị Bình', '', 'Nữ', 'K27 - BEE 9B', 'Ba Bình', '',
    'Tây Ninh', 'Lớp 9', 'Mầm Non - Chương Trình SGK Cơ Bản', 'Đang học',
  ]);

  const starters = workbook.addWorksheet('STARTERS 1,2');
  starters.addRow([...baseHeaders.slice(0, 4), 'Bí danh', ...baseHeaders.slice(4)]);
  starters.addRow([
    1, 'Hoạt động', 'Đã cấp', 'Nguyễn Văn An', 'An', '02/04/2012', 'Nam',
    'K27 - STARTERS 1,2', 'Mẹ Lan', 'Nguyễn Huệ', 'Hòa Thành, Tây Ninh', 'Lớp 9',
    'Chương Trình Cambridge Quốc Tế', 'Đang học',
  ]);

  return new File([await workbook.xlsx.writeBuffer() as ArrayBuffer], 'roster.xlsx');
}

describe('multi-sheet student roster import', () => {
  it('maps each sheet to exactly one class and merges repeated learners across sheets', async () => {
    const result = await parseStudentRosterWorkbookFile(await rosterFile());
    expect(result.errors).toEqual([]);
    expect(result.data).toMatchObject({ sheetCount: 2, sourceRowCount: 3, warnings: [] });
    expect(result.data!.students).toHaveLength(2);
    expect(result.data!.programs.map((program) => program.name)).toEqual(expect.arrayContaining([
      'Mầm Non - Chương Trình SGK Cơ Bản',
      'Chương Trình Cambridge Quốc Tế',
    ]));
    expect(result.data!.classes.map((classroom) => classroom.name)).toEqual(expect.arrayContaining([
      'K27 - BEE 9B',
      'K27 - STARTERS 1,2',
    ]));
    expect(result.data!.classes.map((classroom) => classroom.code)).toEqual(expect.arrayContaining([
      'BEE 9B',
      'STARTERS 1,2',
    ]));
    expect(result.data!.classes).toHaveLength(2);
    expect(result.data!.classes.some((classroom) => classroom.name.includes('SPEAKING 2A'))).toBe(false);
    expect(result.data!.classes.some((classroom) => classroom.name.includes('K26'))).toBe(false);
    const learner = result.data!.students.find((student) => student.name === 'Nguyễn Văn An')!;
    expect(learner).toMatchObject({
      nickname: 'An',
      accountStatus: 'Đã cấp',
      dob: '2012-04-02',
      parentName: 'Mẹ Lan',
      school: 'Nguyễn Huệ',
      gradeLevel: 'Lớp 9',
      status: 'active',
    });
    expect([learner.classId, ...(learner.additionalClassIds || [])]).toHaveLength(2);
    expect(result.data!.students.find((student) => student.name === 'Trần Thị Bình')!.dob).toBe('');
  });

  it('adds the roster once and updates matching people on a repeated upload', async () => {
    const parsed = (await parseStudentRosterWorkbookFile(await rosterFile())).data!;
    const first = mergeStudentRoster({ programs: [], classes: [], students: [] }, parsed);
    expect(first.summary).toEqual({ addedPrograms: 2, addedClasses: 2, addedStudents: 2, updatedStudents: 0 });
    expect(first.students.map((student) => student.code)).toEqual(['BEE 9B-01', 'BEE 9B-02']);
    expect(first.classes.every((classroom) => classroom.studentIds.length > 0)).toBe(true);
    const multiClassLearner = first.students.find((student) => student.name === 'Nguyễn Văn An')!;
    const learnerClassCodes = [multiClassLearner.classId, ...(multiClassLearner.additionalClassIds || [])]
      .map((classId) => multiClassLearner.classStudentCodes?.[classId]);
    expect(learnerClassCodes).toEqual(expect.arrayContaining(['BEE 9B-01', 'STARTERS 1,2-01']));

    const second = mergeStudentRoster(first, parsed);
    expect(second.summary).toEqual({ addedPrograms: 0, addedClasses: 0, addedStudents: 0, updatedStudents: 2 });
    expect(second.students).toHaveLength(2);
    expect(second.students.map((student) => student.code)).toEqual(['BEE 9B-01', 'BEE 9B-02']);
    expect(second.students.find((student) => student.name === 'Nguyễn Văn An')?.classStudentCodes)
      .toEqual(multiClassLearner.classStudentCodes);
    expect(second.classes).toHaveLength(2);
    expect(second.programs).toHaveLength(2);
  });

  it('keeps an imported cohort class separate from a demo class with a similar code', async () => {
    const parsed = (await parseStudentRosterWorkbookFile(await rosterFile())).data!;
    const demoClass = {
      ...parsed.classes[0],
      id: 'CLS-DEMO-BEE-9B',
      code: 'BEE-9B',
      name: 'Bee 9B',
      studentIds: [],
    };
    const merged = mergeStudentRoster({ programs: [], classes: [demoClass], students: [] }, parsed);
    expect(merged.classes).toHaveLength(parsed.classes.length + 1);
    expect(merged.classes.find((classroom) => classroom.name === 'K27 - BEE 9B')?.code).toBe('BEE 9B');
    expect(merged.classes.find((classroom) => classroom.id === demoClass.id)?.studentIds).toEqual([]);
  });

  it('replaces stale preview memberships when synchronizing the workbook again', async () => {
    const parsed = (await parseStudentRosterWorkbookFile(await rosterFile())).data!;
    const first = mergeStudentRoster({ programs: [], classes: [], students: [] }, parsed);
    const learner = first.students.find((student) => student.name === 'Nguyễn Văn An')!;
    const staleClass = {
      ...first.classes[0],
      id: 'CLASS_ROSTER_STALE',
      code: 'SPEAKING 2A',
      name: 'K27 - SPEAKING 2A',
      studentIds: [learner.id],
    };
    const withStaleMembership = first.students.map((student) => student.id === learner.id ? {
      ...student,
      additionalClassIds: [...(student.additionalClassIds || []), staleClass.id],
    } : student);

    const synchronized = mergeStudentRoster({
      programs: first.programs,
      classes: [...first.classes, staleClass],
      students: withStaleMembership,
    }, parsed, { replaceMemberships: true });
    const synchronizedLearner = synchronized.students.find((student) => student.id === learner.id)!;
    expect([synchronizedLearner.classId, ...(synchronizedLearner.additionalClassIds || [])]).not.toContain(staleClass.id);
  });
});
