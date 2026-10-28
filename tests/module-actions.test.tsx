// @vitest-environment jsdom
import * as dialogs from '../src/lib/dialogs';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAVIGATION_GROUPS, canAccessTab, getNavigationGroups } from '../src/app/navigation';
import { DEV_OWNER_ACCOUNT, DEV_TEACHER_ACCOUNT, DEV_TRAINER_ACCOUNT } from '../src/lib/auth';
import { createStaffPermissions } from '../src/lib/permissions';
import { parseCenterData } from '../src/lib/centerData';
import { centerDate } from '../src/lib/dates';
import { splitAttendanceNote } from '../src/modules/attendance/parentContact';
import * as initial from '../src/mock/initialData';
import { createCenterActions } from '../src/modules/center/createCenterActions';
import { normalizeCenterData, reconcileStudentFees } from '../src/modules/center/model';
import { useCenterStore } from '../src/modules/center/useCenterStore';
import { createActivityLogger } from '../src/modules/system/activityLogger';
import type { CenterBackupData, CustomGradeColumn, UserAccount } from '../src/types';

vi.mock('../src/lib/supabase', () => ({
  isLocalPreview: true,
  isSupabaseConfigured: false,
  supabase: null,
}));

const limitedStaff: UserAccount = {
  ...DEV_TEACHER_ACCOUNT,
  role: 'staff',
  permissions: {
    ...DEV_TEACHER_ACCOUNT.permissions,
    tuition: { view: false, collect: false, delete: false, showDebt: false },
  },
};

const dataset = (): CenterBackupData =>
  structuredClone({
    settings: initial.initialSettings,
    programs: initial.initialPrograms,
    teachers: initial.initialTeachers,
    rooms: initial.initialRooms,
    classes: initial.initialClasses,
    students: initial.initialStudents,
    timetableSlots: initial.initialTimetableSlots,
    grades: initial.initialGrades,
    receipts: initial.initialTuitionReceipts,
    backups: initial.initialBackups,
    activityLogs: initial.initialActivityLogs,
    attendanceSessions: [],
    enrollments: [],
    scheduleChanges: [],
  });
function useTestCenter(user: UserAccount = DEV_OWNER_ACCOUNT) {
  const store = useCenterStore();
  return {
    store,
    actions: createCenterActions(store, user, createActivityLogger(user, store.setActivityLogs)),
  };
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(dialogs, 'showAlert').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('domain command integration', () => {
  it('lets the training rank edit grades across the centre without per-class assignments', () => {
    const trainer = {
      ...DEV_TRAINER_ACCOUNT,
      permissions: { ...DEV_TRAINER_ACCOUNT.permissions, assignedClassIds: [] },
    };
    const { result } = renderHook(() => useTestCenter(trainer));
    const data = dataset();
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    const grade = result.current.store.grades[0];
    act(() => expect(result.current.actions.handleUpdateGrade({
      ...grade,
      listening: 9,
      average: 8.1,
    })).toBe(true));
    expect(result.current.store.grades[0]).toMatchObject({ listening: 9, average: 8.6 });
  });

  it('updates program grade columns and recalculates averages while retaining archived scores', () => {
    const { result } = renderHook(() => useTestCenter());
    const data = dataset();
    const grade = data.grades[0];
    data.grades[0] = { ...grade, unitScores: { custom_progress: 9 } };
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    const column: CustomGradeColumn = {
      id: 'custom_progress',
      name: 'Progress Test',
      kind: 'assessment',
      semester: 'GKI',
      programId: data.classes.find((item) => item.id === grade.classId)!.programId,
      createdAt: '2026-10-28T02:00:00.000Z',
    };
    act(() => expect(result.current.actions.handleUpdateGradeColumns([column])).toBe(true));
    expect(result.current.store.settings.gradeColumns).toEqual([column]);
    expect(result.current.store.grades[0]).toMatchObject({ average: 8.7, unitScores: { custom_progress: 9 } });

    act(() => expect(result.current.actions.handleUpdateGradeColumns([{ ...column, archivedAt: '2026-10-28T03:00:00.000Z' }])).toBe(true));
    expect(result.current.store.settings.gradeColumns?.[0].archivedAt).toBeTruthy();
    expect(result.current.store.grades[0]).toMatchObject({ average: 8.6, unitScores: { custom_progress: 9 } });
  });

  it('keeps shared grade-column structure owner-only even when training can enter scores', () => {
    const { result } = renderHook(() => useTestCenter(DEV_TRAINER_ACCOUNT));
    const before = result.current.store.settings;
    act(() => expect(result.current.actions.handleUpdateGradeColumns([])).toBe(false));
    expect(result.current.store.settings).toBe(before);
    expect(dialogs.showAlert).toHaveBeenCalledWith(expect.stringContaining('Chủ trung tâm'));
  });

  it('blocks teacher-rank student profile mutations even with legacy broad flags', () => {
    const teacher = {
      ...DEV_TEACHER_ACCOUNT,
      permissions: {
        ...createStaffPermissions(true),
        teacherId: DEV_TEACHER_ACCOUNT.permissions.teacherId,
        assignedClassIds: DEV_TEACHER_ACCOUNT.permissions.assignedClassIds,
      },
    };
    const { result } = renderHook(() => useTestCenter(teacher));
    const data = dataset();
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    const original = result.current.store.students[0];
    act(() => expect(result.current.actions.handleUpdateStudent({
      ...original,
      address: 'Không được phép đổi',
    })).toBeUndefined());
    expect(result.current.store.students[0]).toEqual(original);
  });

  it('preserves absence and late histories when students change and permits deleting only empty attendance as an active owner', () => {
    const { result, rerender } = renderHook(({ user }) => useTestCenter(user), { initialProps: { user: DEV_OWNER_ACCOUNT } });
    const data = dataset();
    const student = data.students[0];
    data.receipts = [];
    data.attendanceSessions = [
      { id: 'ATT_late', date: '2026-10-20', classId: student.classId, lessonTopic: 'Late arrival', entries: [{ studentId: student.id, status: 'late' }] },
      { id: 'ATT_absent', date: '2026-10-19', classId: student.classId, lessonTopic: 'Absence', entries: [{ studentId: student.id, status: 'absent' }] },
      { id: 'ATT_empty', date: '2026-10-20', classId: student.classId, lessonTopic: '', entries: [] },
    ];
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    act(() => result.current.store.setStudents(previous => previous.map(item => ({ ...item, notes: 'Updated profile' }))));
    expect(result.current.store.attendanceSessions).toEqual(data.attendanceSessions);
    act(() => expect(result.current.actions.handleDeleteAttendanceSession('ATT_late')).toBe(false));
    expect(result.current.store.attendanceSessions).toHaveLength(3);
    rerender({ user: limitedStaff });
    act(() => expect(result.current.actions.handleDeleteAttendanceSession('ATT_empty')).toBe(false));
    rerender({ user: DEV_OWNER_ACCOUNT });
    act(() => expect(result.current.actions.handleDeleteAttendanceSession('ATT_empty')).toBe(true));
    expect(result.current.store.attendanceSessions.map(item => item.id)).toEqual(['ATT_late', 'ATT_absent']);
  });
  it('saves all selected teaching days together, preserves an edited slot and rejects a conflicting batch atomically', () => {
    const { result } = renderHook(() => useTestCenter());
    const data = dataset();
    data.timetableSlots = [];
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    const base = { id: 'mon', classId: data.classes[0].id, teacherId: data.teachers[0].id, roomId: data.rooms[0].id, startTime: '18:00', endTime: '19:30', dayOfWeek: 'Thứ 2' };
    act(() => expect(result.current.actions.handleSaveSlots([base, { ...base, id: 'wed', dayOfWeek: 'Thứ 4' }])).toBeNull());
    expect(result.current.store.timetableSlots.map(slot => slot.dayOfWeek)).toEqual(['Thứ 2', 'Thứ 4']);
    expect(result.current.store.classes[0].days).toEqual(['Thứ 2', 'Thứ 4']);
    act(() => expect(result.current.actions.handleSaveSlots([{ ...base, startTime: '17:00', endTime: '18:30' }, { ...base, id: 'fri', dayOfWeek: 'Thứ 6' }])).toBeNull());
    expect(result.current.store.timetableSlots).toHaveLength(3);
    expect(result.current.store.timetableSlots.find(slot => slot.id === 'mon')?.startTime).toBe('17:00');
    const before = result.current.store.timetableSlots;
    act(() => expect(result.current.actions.handleSaveSlots([{ ...base, id: 'clash' }, { ...base, id: 'sun', dayOfWeek: 'Chủ Nhật' }])).toMatch(/trùng giờ/));
    expect(result.current.store.timetableSlots).toBe(before);
  });
  it('deletes only unused student profiles and preserves registration, grade and attendance history for owners', () => {
    const { result } = renderHook(() => useTestCenter());
    const data = dataset();
    const student = { ...data.students[0], id: 'unused-student', classId: '', additionalClassIds: [], status: 'registered' as const };
    data.students = [student];
    data.grades = [];
    data.receipts = [];
    data.enrollments = [];
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    act(() => expect(result.current.actions.handleDeleteStudent(student.id)).toBeNull());
    expect(result.current.store.students).toEqual([]);

    for (const history of ['grades', 'attendance', 'enrollments'] as const) {
      const historic = structuredClone(data);
      if (history === 'grades') historic.grades = [{ ...initial.initialGrades[0], studentId: student.id }];
      if (history === 'attendance') historic.attendanceSessions = [{ id: 'past-lesson', classId: data.classes[0].id, date: centerDate(), lessonTopic: '', entries: [{ studentId: student.id, status: 'present' }] }];
      if (history === 'enrollments') historic.enrollments = [{ id: 'registration', studentId: student.id, classId: data.classes[0].id, startDate: '2026-01-01', status: 'active' }];
      act(() => result.current.store.applyData(normalizeCenterData(historic)));
      const before = result.current.store.students;
      act(() => expect(result.current.actions.handleDeleteStudent(student.id)).toMatch(/lịch sử/));
      expect(result.current.store.students).toBe(before);
    }
  });
  it('adds a legacy class catalog without replacing existing academic or student/financial history and skips duplicate class codes', () => {
    const { result } = renderHook(() => useTestCenter());
    const data = dataset();
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    const before = { students: result.current.store.students, receipts: result.current.store.receipts, grades: result.current.store.grades, classes: result.current.store.classes, slots: result.current.store.timetableSlots };
    const incoming = { ...data, classes: [{ ...data.classes[0], id: 'old-new-id', code: 'RECOVERED', studentIds: ['do-not-import'] }], timetableSlots: [] };
    act(() => expect(result.current.actions.handleImportAcademicCatalog(incoming)).toBe(true));
    expect(result.current.store.classes).toHaveLength(before.classes.length + 1);
    expect(result.current.store.classes.slice(0, -1)).toEqual(before.classes);
    expect(result.current.store.classes.at(-1)).toMatchObject({ code: 'RECOVERED', courseStatus: 'planned', studentIds: [], days: [], scheduleTime: '' });
    expect(result.current.store.students).toEqual(before.students);
    expect(result.current.store.receipts).toEqual(before.receipts);
    expect(result.current.store.grades).toEqual(before.grades);
    expect(result.current.store.timetableSlots).toEqual(before.slots);
    act(() => expect(result.current.actions.handleImportAcademicCatalog(incoming)).toBe(true));
    expect(result.current.store.classes).toHaveLength(before.classes.length + 1);
  });
  it.each(['grades', 'attendance'] as const)('preserves class %s history when an owner requests deletion', (history) => {
    const { result } = renderHook(() => useTestCenter());
    const data = dataset();
    const classroom = { ...data.classes[0], id: 'historic-class', code: 'HISTORY', studentIds: [] };
    data.classes.push(classroom);
    if (history === 'grades') data.grades.push({ ...data.grades[0], id: 'historic-grade', classId: classroom.id });
    else data.attendanceSessions = [{ id: 'historic-attendance', classId: classroom.id, date: centerDate(), lessonTopic: 'Review', entries: [] }];
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    const before = { classes: result.current.store.classes, grades: result.current.store.grades, attendance: result.current.store.attendanceSessions };
    act(() => result.current.actions.handleDeleteClass(classroom.id));
    expect(result.current.store.classes).toEqual(before.classes);
    expect(result.current.store.grades).toEqual(before.grades);
    expect(result.current.store.attendanceSessions).toEqual(before.attendance);
    expect(dialogs.showAlert).toHaveBeenCalledWith(expect.stringContaining('lịch sử'));
  });
  it('creates academic records, teachers and students only with the corresponding active staff grants', () => {
    const user = { ...limitedStaff, role: 'admin' as const, permissions: createStaffPermissions() };
    const { result, rerender } = renderHook(({ account }) => useTestCenter(account), { initialProps: { account: user } });
    const snapshot = () => Object.fromEntries(Object.entries(result.current.store).filter(([, value]) => typeof value !== 'function'));
    const data = dataset();
    const classroom = { ...data.classes[0], id: 'delegated-class', studentIds: [] };
    const room = { ...data.rooms[0], id: 'delegated-room' };
    const program = { ...data.programs[0], id: 'delegated-program' };
    const teacher = { ...data.teachers[0], id: 'delegated-teacher', assignedClassIds: [] };
    const student = { ...data.students[0], id: 'delegated-student', classId: '', programId: program.id, status: 'registered' as const };
    const create = () => {
      result.current.actions.handleAddRoom(room);
      result.current.actions.handleAddProgram(program);
      result.current.actions.handleAddTeacher(teacher);
      result.current.actions.handleAddClass(classroom);
      result.current.actions.handleAddStudent(student);
    };
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    const before = snapshot();
    act(create);
    expect(snapshot()).toEqual(before);
    rerender({ account: { ...user, permissions: { ...user.permissions, academic: { rooms: true, classes: true, programs: true }, student: { ...user.permissions.student, add: true }, teacher: { ...user.permissions.teacher, add: true, edit: true } } } });
    act(create);
    expect(result.current.store.classes.some(c => c.id === classroom.id)).toBe(true);
    expect(result.current.store.rooms.some(r => r.id === room.id)).toBe(true);
    expect(result.current.store.programs.some(p => p.id === program.id)).toBe(true);
    expect(result.current.store.teachers.some(t => t.id === teacher.id)).toBe(true);
    expect(result.current.store.students.some(s => s.id === student.id)).toBe(true);
    const granted = snapshot();
    rerender({ account: { ...user, active: false, permissions: DEV_OWNER_ACCOUNT.permissions } });
    act(() => {
      result.current.actions.handleDeleteRoom(room.id);
      result.current.actions.handleDeleteClass(classroom.id);
      result.current.actions.handleDeleteTeacher(teacher.id);
      result.current.actions.handleUpdateStudent({ ...student, name: 'Denied' });
    });
    expect(snapshot()).toEqual(granted);
  });
  it('records a parent contact only for saved absences and preserves it through edits and JSON backup', () => {
    const { result } = renderHook(() => useTestCenter());
    const data = dataset();
    const student = data.students[0];
    data.attendanceSessions = [{ id: 'absent-lesson', classId: student.classId, date: centerDate(), lessonTopic: 'Speaking', billing: { unitPrice: 100000, absencePolicy: 'attended' }, entries: [{ studentId: student.id, status: 'absent', note: 'Ôn bài' }] }];
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    const receipts = result.current.store.receipts;
    act(() => expect(result.current.actions.handleRecordParentContact({ sessionId: 'absent-lesson', studentId: student.id, channel: 'Zalo', details: 'Đã báo phụ huynh' })).toBeNull());
    const recorded = result.current.store.attendanceSessions[0];
    expect(splitAttendanceNote(recorded.entries[0].note).history[0]).toMatchObject({ channel: 'Zalo', author: DEV_OWNER_ACCOUNT.name, details: 'Đã báo phụ huynh' });
    expect(recorded.billing).toEqual(data.attendanceSessions[0].billing);
    expect(result.current.store.receipts).toBe(receipts);
    act(() => expect(result.current.actions.handleSaveAttendanceSession({ ...recorded, entries: [{ studentId: student.id, status: 'present', note: 'Đã học bù' }] })).toBe(true));
    expect(splitAttendanceNote(result.current.store.attendanceSessions[0].entries[0].note).history).toEqual(splitAttendanceNote(recorded.entries[0].note).history);
    act(() => expect(result.current.actions.handleRecordParentContact({
      sessionId: recorded.id,
      studentId: student.id,
      channel: 'SMS',
      details: 'Đã mở SMS để gửi nhận xét cuối buổi.',
      type: 'review',
    })).toBeNull());
    expect(splitAttendanceNote(result.current.store.attendanceSessions[0].entries[0].note).history.at(-1)).toMatchObject({
      channel: 'SMS',
      details: 'Đã mở SMS để gửi nhận xét cuối buổi.',
    });
    const parsed = parseCenterData(JSON.parse(JSON.stringify({ ...data, attendanceSessions: result.current.store.attendanceSessions })), data.settings);
    expect(parsed.attendanceSessions![0].entries[0].note).toBe(result.current.store.attendanceSessions[0].entries[0].note);
    act(() => expect(result.current.actions.handleRecordParentContact({ sessionId: recorded.id, studentId: student.id, channel: 'Zalo', details: '' })).toMatch(/không còn/));
  });
  it('allows a substitute to save only the attendance session assigned for that date', () => {
    const substituteId = 'teacher-substitute';
    const date = centerDate();
    const user: UserAccount = {
      ...DEV_TEACHER_ACCOUNT,
      id: 'account-substitute',
      email: 'substitute@beezone.test',
      permissions: {
        ...DEV_TEACHER_ACCOUNT.permissions,
        teacherId: substituteId,
        assignedClassIds: [],
      },
    };
    const { result } = renderHook(() => useTestCenter(user));
    const data = dataset();
    const classroom = data.classes[0];
    data.teachers.push({
      id: substituteId,
      name: 'Giáo viên dạy thay',
      email: user.email,
      phone: '',
      address: '',
      specialty: '',
      assignedClassIds: [],
    });
    data.scheduleChanges = [{
      id: 'substitute-day',
      classId: classroom.id,
      kind: 'teacher_off',
      date,
      sourceSlotId: data.timetableSlots.find((slot) => slot.classId === classroom.id)?.id,
      startTime: '18:00',
      endTime: '19:30',
      teacherId: classroom.teacherId,
      roomId: classroom.roomId,
      substituteTeacherId: substituteId,
      reason: 'Giáo viên chính nghỉ',
    }];
    act(() => result.current.store.applyData(normalizeCenterData(data)));

    const session = { id: 'substitute-attendance', classId: classroom.id, date, teacherId: substituteId, lessonTopic: 'Dạy thay', entries: [] };
    act(() => expect(result.current.actions.handleSaveAttendanceSession(session)).toBe(true));
    expect(result.current.store.attendanceSessions).toEqual([expect.objectContaining({ id: session.id, teacherId: substituteId })]);

    act(() => expect(result.current.actions.handleSaveAttendanceSession({ ...session, id: 'wrong-date', date: '2099-01-01' })).toBe(false));
    expect(result.current.store.attendanceSessions).toHaveLength(1);
  });

  it('rejects parent contact outside assigned classes, for inactive users, future lessons and invalid inputs', () => {
    const data = dataset();
    const student = data.students[0];
    data.attendanceSessions = [{ id: 'absence', classId: student.classId, date: centerDate(), lessonTopic: 'Test', entries: [{ studentId: student.id, status: 'absent' }] }];
    const { result, rerender } = renderHook(({ user }) => useTestCenter(user), { initialProps: { user: DEV_OWNER_ACCOUNT } });
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    const request = { sessionId: 'absence', studentId: student.id, channel: 'Zalo' as const, details: '' };
    const sessions = result.current.store.attendanceSessions;
    rerender({ user: { ...limitedStaff, permissions: { ...limitedStaff.permissions, teacherId: '', assignedClassIds: [] } } });
    act(() => expect(result.current.actions.handleRecordParentContact(request)).toMatch(/không có quyền/));
    rerender({ user: { ...DEV_OWNER_ACCOUNT, active: false } });
    act(() => expect(result.current.actions.handleRecordParentContact(request)).toMatch(/không có quyền/));
    rerender({ user: DEV_OWNER_ACCOUNT });
    act(() => expect(result.current.actions.handleRecordParentContact({ ...request, details: 'x'.repeat(501) })).toMatch(/chưa hợp lệ/));
    expect(result.current.store.attendanceSessions).toBe(sessions);
    act(() => result.current.store.setAttendanceSessions([{ ...sessions[0], date: '2099-01-01' }]));
    act(() => expect(result.current.actions.handleRecordParentContact(request)).toMatch(/đã diễn ra/));
  });
  it('transfers a student while preserving past grades and receipts and reconciling both rosters', () => {
    const { result } = renderHook(() => useTestCenter());
    const student = result.current.store.students[0];
    const targetClass = result.current.store.classes.find(
      (classroom) => classroom.id !== student.classId,
    )!;
    const beforeGrades = result.current.store.grades;
    const beforeReceipts = result.current.store.receipts;
    act(() =>
      result.current.actions.handleUpdateStudent({
        ...student,
        classId: targetClass.id,
        programId: targetClass.programId,
      }),
    );
    expect(
      result.current.store.classes.find((classroom) => classroom.id === student.classId)!
        .studentIds,
    ).not.toContain(student.id);
    expect(
      result.current.store.classes.find((classroom) => classroom.id === targetClass.id)!.studentIds,
    ).toContain(student.id);
    expect(result.current.store.grades).toBe(beforeGrades);
    expect(result.current.store.receipts).toBe(beforeReceipts);
    expect(
      result.current.store.enrollments.some(
        (entry) => entry.studentId === student.id && entry.classId === targetClass.id,
      ),
    ).toBe(true);
  });

  it('updates teacher workloads without changing financial history', () => {
    const { result } = renderHook(() => useTestCenter());
    const classroom = result.current.store.classes[0];
    const teacher = result.current.store.teachers.find((item) => item.id !== classroom.teacherId)!;
    const beforeReceipts = result.current.store.receipts;
    act(() => result.current.actions.handleUpdateClass({ ...classroom, teacherId: teacher.id }));
    expect(
      result.current.store.teachers.find((item) => item.id === teacher.id)!.assignedClassIds,
    ).toContain(classroom.id);
    expect(
      result.current.store.teachers.find((item) => item.id === classroom.teacherId)!
        .assignedClassIds,
    ).not.toContain(classroom.id);
    expect(result.current.store.receipts).toBe(beforeReceipts);
  });

  it('recognizes unbilled attended lessons as debt, bills once and protects the source snapshot', () => {
    const { result } = renderHook(() => useTestCenter());
    const data = dataset();
    const student = data.students[0];
    data.receipts = [];
    data.attendanceSessions = [
      {
        id: 'lesson',
        classId: student.classId,
        date: centerDate(),
        lessonTopic: 'Test',
        billing: { unitPrice: 100000, absencePolicy: 'attended' },
        entries: [{ studentId: student.id, status: 'late' }],
      },
    ];
    act(() => result.current.store.applyData(normalizeCenterData(data)));
    expect(result.current.store.students[0].feeStatus).toBe('debt');
    const receipt = {
      ...initial.initialTuitionReceipts[0],
      id: 'session-receipt',
      studentId: student.id,
      classId: student.classId,
      paymentKind: 'session' as const,
      sessionFee: 100000,
      courseFee: 0,
      monthlyFee: 0,
      discount: 0,
      paidAmount: 100000,
      debtAmount: 0,
      installments: [],
      sessionLines: [{ attendanceSessionId: 'lesson', date: centerDate(), unitPrice: 100000 }],
    };
    act(() => {
      expect(result.current.actions.handleAddReceipt(receipt)).toBe(true);
    });
    expect(result.current.store.students[0].feeStatus).toBe('paid');
    expect(result.current.store.billingReceipts).toHaveLength(1);
    act(() => {
      expect(
        result.current.actions.handleSaveAttendanceSession({
          ...data.attendanceSessions![0],
          billing: { unitPrice: 200000, absencePolicy: 'attended' },
        }),
      ).toBe(false);
    });
    act(() => {
      expect(result.current.actions.handleAddReceipt({ ...receipt, id: 'duplicate' })).toBe(false);
    });
    expect(result.current.store.receipts).toHaveLength(1);
    expect(result.current.store.attendanceSessions[0].billing!.unitPrice).toBe(100000);
  });

  it('restores legacy JSON with normalized references and keeps the restore audit', () => {
    const { result } = renderHook(() => useTestCenter());
    const data = dataset();
    data.classes = data.classes.map((classroom) => ({ ...classroom, studentIds: ['stale-id'] }));
    delete data.attendanceSessions;
    delete data.enrollments;
    delete data.scheduleChanges;
    act(() => result.current.actions.handleRestoreBackup(data, 'legacy.json'));
    expect(
      result.current.store.classes.some((classroom) => classroom.studentIds.includes('stale-id')),
    ).toBe(false);
    expect(result.current.store.activityLogs[0].action).toBe('RESTORE');
    expect(result.current.store.enrollments).toEqual([]);
    const persisted = Object.fromEntries(
      Object.keys(data).map((key) => [
        key,
        JSON.parse(localStorage.getItem(`PHUC_PHUC_THINH_${key}`)!),
      ]),
    );
    expect(parseCenterData(persisted, data.settings).students).toEqual(
      result.current.store.students,
    );
  });

  it('blocks whole Excel replacement when enrollment history exists and still imports new students', () => {
    const { result } = renderHook(() => useTestCenter());
    const student = result.current.store.students[0];
    act(() => result.current.actions.handleUpdateStudent({ ...student, name: 'Updated' }));
    const before = result.current.store.students;
    act(() => {
      expect(result.current.actions.handleImportCenterData(dataset())).toBe(false);
    });
    expect(result.current.store.students).toBe(before);
    act(() =>
      result.current.actions.handleImportStudents([
        { ...student, id: 'new-student', code: 'NEW-001', classId: '' },
        { ...student },
      ]),
    );
    expect(result.current.store.students).toHaveLength(before.length + 1);
  });

  it('blocks collection for staff without tuition permission', () => {
    const { result } = renderHook(() => useTestCenter(limitedStaff));
    const before = result.current.store.receipts;
    act(() => {
      expect(result.current.actions.handleAddReceipt({ ...before[0], id: 'forbidden' })).toBe(
        false,
      );
    });
    expect(result.current.store.receipts).toBe(before);
  });

  it('reports browser storage failure instead of claiming the data was saved', () => {
    const { result } = renderHook(() => useTestCenter());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    act(() => result.current.store.setStudents([]));
    expect(result.current.store.storageError).toMatch(/Không thể lưu/);
  });
});

describe('shared navigation and normalization', () => {
  it('uses the same access decision for menu visibility and direct navigation', () => {
    const ids = NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const user of [DEV_OWNER_ACCOUNT, limitedStaff]) {
      for (const item of getNavigationGroups(user, (key) => key).flatMap((group) => group.items))
        expect(item.visible).toBe(canAccessTab(item.id, user));
      expect(canAccessTab('unknown-feature', user)).toBe(false);
    }
    expect(canAccessTab('tuition', limitedStaff)).toBe(false);
    expect(canAccessTab('backups', limitedStaff)).toBe(false);
  });

  it('normalizes without mutating the input or repeatedly changing already correct records', () => {
    const original = dataset();
    const snapshot = structuredClone(original);
    const normalized = normalizeCenterData(original);
    expect(original).toEqual(snapshot);
    expect(
      reconcileStudentFees(normalized.students, normalized.receipts, normalized.attendanceSessions),
    ).toBe(normalized.students);
    expect(normalizeCenterData(normalized)).toEqual(normalized);
  });
});
