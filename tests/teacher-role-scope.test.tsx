// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canAccessTab } from '../src/app/navigation';
import { LanguageProvider } from '../src/context/LanguageContext';
import { classesVisibleToAccount, studentsVisibleToAccount } from '../src/lib/accountScope';
import { createRolePermissions, createStaffPermissions } from '../src/lib/permissions';
import { GradeManager } from '../src/modules/grades/GradeManager';
import { StudentManager } from '../src/modules/students/StudentManager';
import { TeacherScheduleMatrix } from '../src/modules/timetable/TeacherScheduleMatrix';
import type { ClassRoom, Student, Teacher, TimetableSlot, UserAccount } from '../src/types';

afterEach(() => cleanup());

const teachers: Teacher[] = [
  { id: 'teacher-a', name: 'Cô A', email: 'a@beezone.test', phone: '', address: '', specialty: 'Kiddy', assignedClassIds: ['class-a'] },
  { id: 'teacher-b', name: 'Thầy B', email: 'b@beezone.test', phone: '', address: '', specialty: 'Starters', assignedClassIds: ['class-b'] },
];
const classes: ClassRoom[] = [
  { id: 'class-a', code: 'A', name: 'Kiddy A', programId: 'program-a', teacherId: 'teacher-a', roomId: 'room-a', scheduleTime: '18:00', days: ['Thứ 2'], capacity: 12, studentIds: ['student-a'] },
  { id: 'class-b', code: 'B', name: 'Kiddy B', programId: 'program-b', teacherId: 'teacher-b', roomId: 'room-b', scheduleTime: '19:00', days: ['Thứ 3'], capacity: 12, studentIds: ['student-b'] },
];
const student = (id: string, name: string, classId: string, privateSuffix: string): Student => ({
  id,
  code: id.toUpperCase(),
  name,
  dob: `2018-01-0${privateSuffix}`,
  gender: 'Nữ',
  school: `Trường riêng ${privateSuffix}`,
  gradeLevel: 'Lớp 3',
  programId: classId === 'class-a' ? 'program-a' : 'program-b',
  classId,
  address: `Địa chỉ riêng ${privateSuffix}`,
  email: `${id}@example.test`,
  phone: `090000000${privateSuffix}`,
  parentName: `Phụ huynh ${privateSuffix}`,
  parentPhone: `091111111${privateSuffix}`,
  enrollDate: '2026-10-01',
  feeStatus: 'debt',
  status: 'active',
});
const students = [student('student-a', 'Học viên lớp A', 'class-a', '1'), student('student-b', 'Học viên lớp B', 'class-b', '2')];
const broadTeacher: UserAccount = {
  id: 'account-a',
  name: 'Cô A',
  email: 'a@beezone.test',
  avatar: '',
  role: 'teacher',
  active: true,
  permissions: { ...createStaffPermissions(true), teacherId: 'teacher-a', assignedClassIds: ['class-a'] },
};

describe('fixed teacher role scope', () => {
  it('keeps only teaching tabs even when a legacy profile contains every permission', () => {
    for (const tab of ['dashboard', 'work', 'students', 'attendance', 'teacher-schedule', 'grades'])
      expect(canAccessTab(tab, broadTeacher)).toBe(true);
    for (const tab of ['admissions', 'programs', 'teachers', 'classes', 'rooms', 'timetable', 'tuition', 'reports', 'excel-import-export'])
      expect(canAccessTab(tab, broadTeacher)).toBe(false);
  });

  it('limits class and student scope to the linked teacher assignments', () => {
    expect(classesVisibleToAccount(broadTeacher, classes, teachers).map((item) => item.id)).toEqual(['class-a']);
    expect(studentsVisibleToAccount(broadTeacher, students, classes, teachers).map((item) => item.id)).toEqual(['student-a']);
  });

  it('shows training all classes for grading without requiring assignedClassIds', () => {
    const trainer: UserAccount = {
      ...broadTeacher,
      id: 'trainer',
      role: 'trainer',
      email: 'phongdaotao.beezone@gmail.com',
      permissions: { ...createRolePermissions('trainer'), assignedClassIds: [] },
    };
    render(
      <GradeManager
        grades={[]}
        students={students}
        classes={classes}
        teachers={teachers}
        permissions={trainer.permissions}
        isOwner={false}
        currentUser={trainer}
        onUpdateGrade={vi.fn()}
      />,
    );
    expect(screen.getByText('Học viên lớp A')).toBeTruthy();
    expect(screen.getByText('Học viên lớp B')).toBeTruthy();
  });

  it('hides other classes, personal details and tuition in the teacher student list', () => {
    render(
      <LanguageProvider>
        <StudentManager
          students={students}
          classes={classes}
          programs={[]}
          teachers={teachers}
          rooms={[]}
          receipts={[]}
          timetableSlots={[]}
          permissions={broadTeacher.permissions}
          currentUser={broadTeacher}
          isOwner={false}
          searchQuery=""
          onAddStudent={vi.fn()}
          onUpdateStudent={vi.fn()}
          onDeleteStudent={vi.fn()}
          onCreateProgram={vi.fn()}
          onOpenImportExportModal={vi.fn()}
          onOpenTuition={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText('Học viên lớp A')).toBeTruthy();
    expect(screen.queryByText('Học viên lớp B')).toBeNull();
    expect(screen.queryByText('Trường riêng 1')).toBeNull();
    expect(screen.queryByText('0911111111')).toBeNull();
    expect(screen.queryByText('Học phí')).toBeNull();
    expect(screen.queryByRole('button', { name: /Thêm Học Sinh Mới/i })).toBeNull();
  });

  it('shows only the linked teacher row in the teacher schedule', () => {
    const slots: TimetableSlot[] = [
      { id: 'slot-a', classId: 'class-a', teacherId: 'teacher-a', roomId: 'room-a', dayOfWeek: 'Thứ 2', startTime: '18:00', endTime: '19:00' },
      { id: 'slot-b', classId: 'class-b', teacherId: 'teacher-b', roomId: 'room-b', dayOfWeek: 'Thứ 3', startTime: '19:00', endTime: '20:00' },
    ];
    render(
      <TeacherScheduleMatrix
        teachers={teachers}
        timetableSlots={slots}
        classes={classes}
        rooms={[
          { id: 'room-a', name: 'Phòng A', capacity: 12, status: 'available' },
          { id: 'room-b', name: 'Phòng B', capacity: 12, status: 'available' },
        ]}
        currentUser={broadTeacher}
        permissions={broadTeacher.permissions}
      />,
    );
    expect(screen.getByText('Cô A')).toBeTruthy();
    expect(screen.queryByText('Thầy B')).toBeNull();
    expect(screen.getByText(/Chỉ hiển thị lịch dạy của tài khoản giáo viên/)).toBeTruthy();
  });
});
