// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import { parseCenterData } from '../src/lib/centerData';
import { studentClassIds, validateStudentClasses } from '../src/lib/studentClasses';
import { unbilledTuitionForStudents } from '../src/lib/tuition';
import * as initial from '../src/mock/initialData';
import { createCenterActions } from '../src/modules/center/createCenterActions';
import { normalizeCenterData } from '../src/modules/center/model';
import { useCenterStore } from '../src/modules/center/useCenterStore';
import { StudentManager } from '../src/modules/students/StudentManager';
import { GradeManager } from '../src/modules/grades/GradeManager';
import { StudentProfileDialog } from '../src/modules/students/StudentProfileDialog';
import { LanguageProvider } from '../src/context/LanguageContext';
import { chooseOption } from './helpers/select';

vi.mock('../src/lib/supabase', () => ({ isLocalPreview: true, isSupabaseConfigured: false, supabase: null }));
const classes = initial.initialClasses.slice(0, 3).map(c => ({ ...c, capacity: 0, courseStatus: 'active' as const }));
const student = { ...initial.initialStudents[0], classId: classes[0].id, programId: classes[0].programId, status: 'active' as const };
const dataset = () => normalizeCenterData({ settings: initial.initialSettings, programs: initial.initialPrograms, students: [student], classes, teachers: initial.initialTeachers, rooms: initial.initialRooms, grades: [], receipts: [], timetableSlots: [], backups: [], activityLogs: [], attendanceSessions: [], enrollments: [], scheduleChanges: [] });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.spyOn(window, 'alert').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('adds two classes to one student, removes one without closing other enrollments, and round trips JSON', () => {
  const { result } = renderHook(() => {
    const store = useCenterStore();
    return { store, actions: createCenterActions(store, DEV_OWNER_ACCOUNT, vi.fn()) };
  });
  act(() => result.current.store.applyData(dataset()));
  act(() => result.current.actions.handleUpdateStudent({ ...student, additionalClassIds: [classes[1].id, classes[2].id] }));
  expect(result.current.store.students).toHaveLength(1);
  expect(result.current.store.classes.every(c => c.studentIds.includes(student.id))).toBe(true);
  expect(result.current.store.enrollments.filter(e => e.status === 'active')).toHaveLength(3);
  const before = result.current.store.enrollments;
  act(() => result.current.actions.handleUpdateStudent({ ...result.current.store.students[0], additionalClassIds: [classes[2].id] }));
  expect(result.current.store.classes[1].studentIds).toEqual([]);
  expect(result.current.store.enrollments.find(e => e.classId === classes[1].id)?.status).toBe('transferred');
  for (const classId of [classes[0].id, classes[2].id]) expect(result.current.store.enrollments.find(e => e.classId === classId)).toEqual(before.find(e => e.classId === classId));
  const data = { ...dataset(), students: result.current.store.students, classes: result.current.store.classes, enrollments: result.current.store.enrollments };
  expect(studentClassIds(parseCenterData(JSON.parse(JSON.stringify(data)), initial.initialSettings).students[0])).toEqual([classes[0].id, classes[2].id]);
  for (const additionalClassIds of [[classes[0].id], ['missing'], [classes[1].id, classes[1].id]]) expect(() => parseCenterData({ ...data, students: [{ ...student, additionalClassIds }] }, initial.initialSettings)).toThrow();
});

it('checks capacity in an additional class and does not offset its fees with payment for the primary class', () => {
  const multi = { ...student, additionalClassIds: [classes[1].id, classes[2].id], feeStatus: 'paid' as const };
  expect(validateStudentClasses(multi, classes.map(c => c.id === classes[1].id ? { ...c, capacity: 1 } : c), [{ ...student, id: 'other', classId: classes[1].id }])).toContain('đủ sĩ số');
  const programs = classes.map((c, index) => ({ id: `p${index}`, tuitionFee: (index + 1) * 100000 }));
  const scopedClasses = classes.map((c, index) => ({ ...c, programId: programs[index].id }));
  const receipts = [{ ...initial.initialTuitionReceipts[0], studentId: student.id, classId: classes[0].id, paidAmount: 100000, debtAmount: 0 }];
  expect(unbilledTuitionForStudents([multi], receipts, programs, scopedClasses)).toBe(500000);
});

it('saves extra class checkboxes without creating duplicate student profiles', () => {
  const update = vi.fn();
  render(<LanguageProvider><StudentManager students={[student]} classes={classes} programs={initial.initialPrograms} receipts={[]} timetableSlots={[]} permissions={DEV_OWNER_ACCOUNT.permissions} isOwner searchQuery="" onAddStudent={vi.fn()} onUpdateStudent={update} onDeleteStudent={vi.fn()} onCreateProgram={vi.fn()} onOpenImportExportModal={vi.fn()} onOpenTuition={vi.fn()} /></LanguageProvider>);
  fireEvent.click(screen.getAllByTitle(/Sửa/)[0]);
  for (const cls of classes.slice(1)) fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(cls.code) }));
  fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: student.id, classId: classes[0].id, additionalClassIds: [classes[1].id, classes[2].id] }));
});

it('records a grade for the selected additional class without overwriting the primary class', async () => {
  const update = vi.fn();
  render(<GradeManager students={[{ ...student, additionalClassIds: [classes[1].id] }]} classes={classes} grades={[]} permissions={DEV_OWNER_ACCOUNT.permissions} isOwner onUpdateGrade={update} />);
  await chooseOption(screen.getByRole('combobox', { name: 'Lớp xem điểm' }), classes[1].name);
  fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '8' } });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ studentId: student.id, classId: classes[1].id, listening: 8 }));
});

it('does not display invented scores or allow printing an unentered class report', () => {
  render(<GradeManager students={[{ ...student, additionalClassIds: [classes[1].id] }]} classes={classes} grades={[]} permissions={DEV_OWNER_ACCOUNT.permissions} isOwner onUpdateGrade={vi.fn()} />);
  expect(screen.getAllByRole('spinbutton').every(input => (input as HTMLInputElement).value === '')).toBe(true);
  expect(screen.getAllByRole('button', { name: 'Phiếu Điểm' }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
});

it('shows missing assignments for unscheduled memberships instead of sample teachers, rooms or hours', () => {
  render(<StudentProfileDialog student={{ ...student, address: '', additionalClassIds: [classes[1].id] }} classes={classes.map(c => ({ ...c, days: [], scheduleTime: '' }))} programs={[]} teachers={[]} rooms={[]} timetableSlots={[]} receipts={[]} enrollments={[]} onClose={vi.fn()} />);
  expect(screen.getAllByText('Chưa xếp lịch')).toHaveLength(4);
  expect(screen.getAllByText('Chưa phân công')).toHaveLength(2);
  expect(screen.getAllByText('Chưa xếp phòng')).toHaveLength(2);
  expect(screen.queryByText('Thầy Mark Harrison')).toBeNull();
  expect(screen.queryByText('18:00 - 19:30')).toBeNull();
});
