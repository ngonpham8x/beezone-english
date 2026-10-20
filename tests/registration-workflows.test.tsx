// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as initial from '../src/mock/initialData';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import { academicPermission, createStaffPermissions, normalizeStaffPermissions } from '../src/lib/permissions';
import { parseCenterData } from '../src/lib/centerData';
import { normalizeCenterData } from '../src/modules/center/model';
import { useCenterStore } from '../src/modules/center/useCenterStore';
import { createCenterActions } from '../src/modules/center/createCenterActions';
import type { UserAccount } from '../src/types';

vi.mock('../src/lib/supabase', () => ({ isLocalPreview: true, isSupabaseConfigured: false, supabase: null }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);
function useHarness(user: UserAccount = DEV_OWNER_ACCOUNT) {
  const store = useCenterStore();
  return { store, actions: createCenterActions(store, user, vi.fn()) };
}
const student = { ...initial.initialStudents[0], id: 'new-student', code: 'NEW', classId: '', programId: '', additionalClassIds: [], status: 'registered' as const };
const teacher = { ...initial.initialTeachers[0], id: 'new-teacher', assignedClassIds: [] };
const classroom = { ...initial.initialClasses[0], id: 'new-class', code: 'NEW-A', programId: '', teacherId: '', roomId: '', days: [], scheduleTime: '', studentIds: [], courseStatus: 'planned' as const };
const empty = { settings: initial.initialSettings, programs: [], teachers: [], rooms: [], classes: [], students: [], timetableSlots: [], grades: [], receipts: [], backups: [], activityLogs: [], attendanceSessions: [], enrollments: [], scheduleChanges: [] };

it.each(['student,class,teacher', 'student,teacher,class', 'class,student,teacher', 'class,teacher,student', 'teacher,student,class', 'teacher,class,student'])('creates records in any order (%s), then links two classes without duplicating profiles', order => {
  const { result } = renderHook(() => useHarness());
  act(() => result.current.store.applyData(normalizeCenterData(empty)));
  for (const entity of order.split(',')) act(() => {
    if (entity === 'student') result.current.actions.handleAddStudent(student);
    if (entity === 'class') result.current.actions.handleAddClass(classroom);
    if (entity === 'teacher') expect(result.current.actions.handleSaveTeacher(teacher)).toBeNull();
  });
  expect(result.current.store.students).toHaveLength(1);
  expect(result.current.store.teachers).toHaveLength(1);
  expect(result.current.store.classes).toHaveLength(1);
  const second = { ...classroom, id: 'second-class', code: 'NEW-B' };
  act(() => result.current.actions.handleAddClass(second));
  act(() => expect(result.current.actions.handleSaveTeacher({ ...teacher, assignedClassIds: [classroom.id, second.id] })).toBeNull());
  act(() => result.current.actions.handleUpdateStudent({ ...student, classId: classroom.id, additionalClassIds: [second.id] }));
  expect(result.current.store.classes.every(item => item.teacherId === teacher.id && item.studentIds.includes(student.id))).toBe(true);
  expect(result.current.store.teachers[0].assignedClassIds).toEqual([classroom.id, second.id]);
  expect(result.current.store.enrollments).toHaveLength(2);
  const saved = parseCenterData({ ...empty, students: result.current.store.students, classes: result.current.store.classes, teachers: result.current.store.teachers, enrollments: result.current.store.enrollments }, initial.initialSettings);
  expect(normalizeCenterData(saved).teachers[0].assignedClassIds).toHaveLength(2);
  act(() => expect(result.current.actions.handleSaveTeacher({ ...teacher, assignedClassIds: [second.id] })).toBeNull());
  expect(result.current.store.classes.find(item => item.id === classroom.id)?.teacherId).toBe('');
  expect(result.current.store.classes.find(item => item.id === second.id)?.teacherId).toBe(teacher.id);
});

it('separates teacher creation from editing and class assignment, and preserves legacy grants only when new keys are absent', () => {
  const legacy = normalizeStaffPermissions({ academic: { classes: true }, teacher: { edit: true } });
  expect(legacy.teacher.add).toBe(true);
  expect(academicPermission(legacy, 'classes', 'add')).toBe(true);
  const revoked = normalizeStaffPermissions({ academic: { classes: true, classesDelete: false }, teacher: { edit: true, add: false } });
  expect(revoked.teacher.add).toBe(false);
  expect(academicPermission(revoked, 'classes', 'delete')).toBe(false);
  const invalid = normalizeStaffPermissions({ academic: { classes: true, classesAdd: null, classesDelete: 'true' }, teacher: { edit: true, add: null } });
  expect(academicPermission(invalid, 'classes', 'add')).toBe(false);
  expect(academicPermission(invalid, 'classes', 'delete')).toBe(false);
  expect(invalid.teacher.add).toBe(false);
  const permissions = createStaffPermissions(); permissions.teacher.add = true;
  const { result } = renderHook(() => useHarness({ ...DEV_OWNER_ACCOUNT, role: 'staff', permissions }));
  act(() => result.current.store.applyData(normalizeCenterData({ ...empty, classes: [classroom] })));
  act(() => expect(result.current.actions.handleSaveTeacher({ ...teacher, assignedClassIds: [classroom.id] })).toMatch(/sửa lớp/));
  expect(result.current.store.teachers).toEqual([]);
  act(() => expect(result.current.actions.handleSaveTeacher(teacher)).toBeNull());
  act(() => expect(result.current.actions.handleSaveTeacher({ ...teacher, name: 'Denied' })).toMatch(/chưa có quyền/));
  expect(result.current.store.teachers[0].name).toBe(teacher.name);
});
