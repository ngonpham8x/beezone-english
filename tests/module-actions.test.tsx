// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAVIGATION_GROUPS, canAccessTab, getNavigationGroups } from '../src/app/navigation';
import { DEV_OWNER_ACCOUNT, DEV_TEACHER_ACCOUNT } from '../src/lib/auth';
import { parseCenterData } from '../src/lib/centerData';
import { centerDate } from '../src/lib/dates';
import { splitAttendanceNote } from '../src/modules/attendance/parentContact';
import * as initial from '../src/mock/initialData';
import { createCenterActions } from '../src/modules/center/createCenterActions';
import { normalizeCenterData, reconcileStudentFees } from '../src/modules/center/model';
import { useCenterStore } from '../src/modules/center/useCenterStore';
import { createActivityLogger } from '../src/modules/system/activityLogger';
import type { CenterBackupData, UserAccount } from '../src/types';

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
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('domain command integration', () => {
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
    const parsed = parseCenterData(JSON.parse(JSON.stringify({ ...data, attendanceSessions: result.current.store.attendanceSessions })), data.settings);
    expect(parsed.attendanceSessions![0].entries[0].note).toBe(result.current.store.attendanceSessions[0].entries[0].note);
    act(() => expect(result.current.actions.handleRecordParentContact({ sessionId: recorded.id, studentId: student.id, channel: 'Zalo', details: '' })).toMatch(/không còn/));
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
