import { describe, expect, it } from 'vitest';
import { isInitialDemoAccountAudit, stripInitialDemoData } from '../src/lib/demoData';
import {
  initialAccountAuditLogs, initialActivityLogs, initialAttendanceSessions, initialBackups,
  initialClasses, initialGrades, initialPrograms, initialRooms, initialSettings, initialStudents,
  initialTeachers, initialTimetableSlots, initialTuitionReceipts,
} from '../src/mock/initialData';

describe('local preview sample cleanup', () => {
  it('removes bundled samples while preserving imported records', () => {
    const importedProgram = {
      ...initialPrograms[0], id: 'PROG_ROSTER_REAL', code: 'EXCEL-REAL',
      name: 'Mầm Non - Chương Trình SGK Cơ Bản',
    };
    const importedStudent = {
      ...initialStudents[0], id: 'STU_ROSTER_REAL', code: 'BEE 2-01',
      name: 'Học viên từ Excel', classId: 'CLASS_ROSTER_REAL', programId: importedProgram.id,
    };
    const importedClass = {
      ...initialClasses[0], id: 'CLASS_ROSTER_REAL', code: 'BEE 2', name: 'K27 - BEE 2',
      programId: importedProgram.id, teacherId: '', roomId: '', studentIds: [importedStudent.id],
    };
    const cleanup = stripInitialDemoData({
      sessionBillingVersion: 1,
      settings: initialSettings,
      programs: [...initialPrograms, importedProgram],
      teachers: initialTeachers,
      rooms: initialRooms,
      classes: [...initialClasses, importedClass],
      students: [...initialStudents, importedStudent],
      timetableSlots: initialTimetableSlots,
      grades: initialGrades,
      receipts: initialTuitionReceipts,
      backups: initialBackups,
      activityLogs: initialActivityLogs,
      attendanceSessions: initialAttendanceSessions,
      enrollments: [],
      scheduleChanges: [],
    });

    expect(cleanup.removedRecords).toBeGreaterThan(0);
    expect(cleanup.data.programs).toEqual([importedProgram]);
    expect(cleanup.data.classes).toEqual([importedClass]);
    expect(cleanup.data.students).toEqual([importedStudent]);
    expect(cleanup.data.teachers).toEqual([]);
    expect(cleanup.data.rooms).toEqual([]);
    expect(cleanup.data.timetableSlots).toEqual([]);
    expect(cleanup.data.grades).toEqual([]);
    expect(cleanup.data.receipts).toEqual([]);
    expect(cleanup.data.attendanceSessions).toEqual([]);
    expect(initialAccountAuditLogs.filter((entry) => !isInitialDemoAccountAudit(entry))).toEqual([]);
  });
});
