// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as initial from '../src/mock/initialData';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import { academicPermission, createStaffPermissions, normalizeStaffPermissions } from '../src/lib/permissions';
import { parseCenterData } from '../src/lib/centerData';
import { normalizeCenterData } from '../src/modules/center/model';
import { lessonsOn } from '../src/lib/operations';
import { linkedTimetableSlots } from '../src/lib/schedule';
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

it('removes recurring slots everywhere when a teacher is unassigned from a class', () => {
  const { result } = renderHook(() => useHarness());
  const assignedTeacher = { ...teacher, assignedClassIds: [classroom.id] };
  const assignedClass = {
    ...classroom,
    teacherId: assignedTeacher.id,
    roomId: initial.initialRooms[0].id,
    days: ['Thứ 2'],
    scheduleTime: 'Thứ 2: 18:00-19:30',
  };
  const slot = {
    id: 'slot-linked',
    classId: assignedClass.id,
    teacherId: assignedTeacher.id,
    roomId: assignedClass.roomId,
    dayOfWeek: 'Thứ 2',
    startTime: '18:00',
    endTime: '19:30',
  };
  act(() => result.current.store.applyData(normalizeCenterData({
    ...empty,
    teachers: [assignedTeacher],
    rooms: [initial.initialRooms[0]],
    classes: [assignedClass],
    timetableSlots: [slot],
  })));

  act(() => expect(result.current.actions.handleSaveTeacher({
    ...assignedTeacher,
    assignedClassIds: [],
  })).toBeNull());

  expect(result.current.store.timetableSlots).toEqual([]);
  expect(result.current.store.classes[0]).toMatchObject({ teacherId: '', days: [], scheduleTime: '' });
  expect(linkedTimetableSlots(result.current.store.classes, [slot])).toEqual([]);
  expect(lessonsOn('2026-10-26', result.current.store.classes, [slot])).toEqual([]);
});

it('blocks unassignment while a dated schedule change still references the recurring slot', () => {
  const { result } = renderHook(() => useHarness());
  const assignedTeacher = { ...teacher, assignedClassIds: [classroom.id] };
  const assignedClass = { ...classroom, teacherId: assignedTeacher.id, roomId: initial.initialRooms[0].id };
  const slot = { id: 'slot-history', classId: assignedClass.id, teacherId: assignedTeacher.id, roomId: assignedClass.roomId, dayOfWeek: 'Thứ 2', startTime: '18:00', endTime: '19:30' };
  act(() => result.current.store.applyData(normalizeCenterData({
    ...empty,
    teachers: [assignedTeacher], rooms: [initial.initialRooms[0]], classes: [assignedClass], timetableSlots: [slot],
    scheduleChanges: [{ id: 'change-history', classId: assignedClass.id, sourceSlotId: slot.id, kind: 'cancel', date: '2026-10-26', startTime: slot.startTime, endTime: slot.endTime, teacherId: assignedTeacher.id, roomId: assignedClass.roomId, reason: 'Nghỉ lễ' }],
  })));

  act(() => expect(result.current.actions.handleSaveTeacher({ ...assignedTeacher, assignedClassIds: [] })).toMatch(/hủy điều chỉnh/));
  expect(result.current.store.timetableSlots).toEqual([slot]);
  expect(result.current.store.classes[0].teacherId).toBe(assignedTeacher.id);
});

it('keeps class assignment and all recurring slots synchronized when a timetable teacher changes', () => {
  const { result } = renderHook(() => useHarness());
  const first = { ...teacher, assignedClassIds: [classroom.id] };
  const second = { ...teacher, id: 'second-teacher', name: 'Second teacher', assignedClassIds: [] };
  const assignedClass = { ...classroom, teacherId: first.id, roomId: initial.initialRooms[0].id };
  const baseSlot = { id: 'slot-mon', classId: assignedClass.id, teacherId: first.id, roomId: assignedClass.roomId, dayOfWeek: 'Thứ 2', startTime: '18:00', endTime: '19:30' };
  const otherSlot = { ...baseSlot, id: 'slot-wed', dayOfWeek: 'Thứ 4' };
  act(() => result.current.store.applyData(normalizeCenterData({
    ...empty,
    teachers: [first, second], rooms: [initial.initialRooms[0]], classes: [assignedClass], timetableSlots: [baseSlot, otherSlot],
  })));

  act(() => expect(result.current.actions.handleSaveSlots([{ ...baseSlot, teacherId: second.id }])).toBeNull());
  expect(result.current.store.classes[0].teacherId).toBe(second.id);
  expect(result.current.store.timetableSlots.every((slot) => slot.teacherId === second.id)).toBe(true);
  expect(result.current.store.teachers.find((item) => item.id === second.id)?.assignedClassIds).toEqual([assignedClass.id]);
});
