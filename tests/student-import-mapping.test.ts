import { describe, expect, it } from 'vitest';
import {
  buildImportedStudents,
  countUnassignedImportedStudents,
} from '../src/modules/system/studentImport';
import type { ClassRoom } from '../src/types';

const classroom: ClassRoom = {
  id: 'CLASS_BEE_2',
  code: 'BEE 2',
  name: 'K27 - BEE 2',
  programId: 'PROGRAM_BEE',
  teacherId: '',
  roomId: '',
  scheduleTime: '',
  days: [],
  capacity: 20,
  studentIds: [],
};

describe('standard student Excel import class mapping', () => {
  it('leaves class and program blank when the Excel row has no class code', () => {
    const [student] = buildImportedStudents(
      [{ code: 'HS-001', name: 'Nguyễn An', classCode: '' }],
      [classroom],
      { fileName: 'students.xlsx', timestamp: 100, enrollDate: '2026-11-05' },
    );

    expect(student).toMatchObject({
      id: 'HS_IMP_100_0',
      classId: '',
      programId: '',
      status: 'registered',
    });
  });

  it('only assigns an exact existing class code and never falls back to the first class', () => {
    const students = buildImportedStudents(
      [
        { code: 'HS-001', name: 'Nguyễn An', classCode: ' bee 2 ' },
        { code: 'HS-002', name: 'Trần Bình', classCode: 'BEE 3' },
      ],
      [classroom],
      { fileName: 'students.xlsx', timestamp: 100, enrollDate: '2026-11-05' },
    );

    expect(students[0]).toMatchObject({
      classId: classroom.id,
      programId: classroom.programId,
      status: 'active',
    });
    expect(students[1]).toMatchObject({
      classId: '',
      programId: '',
      status: 'registered',
    });
    expect(students[1].notes).toContain('Mã lớp trong Excel chưa khớp: BEE 3');
    expect(countUnassignedImportedStudents(
      [
        { code: 'HS-001', name: 'Nguyễn An', classCode: 'BEE 2' },
        { code: 'HS-002', name: 'Trần Bình' },
        { code: 'HS-003', name: 'Lê Chi', classCode: 'BEE 3' },
      ],
      [classroom],
    )).toBe(2);
  });
});
