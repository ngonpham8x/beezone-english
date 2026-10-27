// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canAccessTab } from '../src/app/navigation';
import { DEV_TRAINER_ACCOUNT, findAdminAccountByEmail } from '../src/lib/auth';
import { createRolePermissions } from '../src/lib/permissions';
import { canEditAttendanceClass, canShareSessionReview, canViewAttendanceClass, isAttendanceManagementRole } from '../src/modules/attendance/access';
import { StudentManager } from '../src/modules/students/StudentManager';
import { StudentProfileDialog } from '../src/modules/students/StudentProfileDialog';
import { LanguageProvider } from '../src/context/LanguageContext';
import { initialClasses, initialPrograms, initialRooms, initialTeachers } from '../src/mock/initialData';
import type { Student, TuitionReceipt } from '../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockStudent: Student = {
  id: 'st-01',
  code: 'HS001',
  name: 'Nguyễn Hoàng Gia Linh',
  gender: 'Nữ',
  dob: '2018-05-10',
  gradeLevel: 'Lớp 3',
  school: 'Tiểu học Kim Đồng',
  classId: 'CLS-KIDDY-1',
  programId: 'PROG-KIDDY',
  enrollDate: '2026-09-01',
  feeStatus: 'unpaid',
  status: 'active',
  email: 'gialinh@gmail.com',
  phone: '0912345678',
  parentName: 'Mẹ Lan',
  parentPhone: '0987654321',
  address: '123 Đường 30/4, Tây Ninh',
  notes: 'Bé tiếp thu nhanh, cần chú ý phát âm',
};

const mockReceipt: TuitionReceipt = {
  id: 'rec-01',
  code: 'PT-2026-001',
  studentId: 'st-01',
  classId: 'CLS-KIDDY-1',
  paymentKind: 'course',
  courseFee: 5400000,
  paidAmount: 3300000,
  debtAmount: 2100000,
  discount: 0,
  paymentMethod: 'Tiền mặt',
  collectorName: 'Bích Tuyền',
  paymentDate: '2026-10-26',
};

describe('Training Department (phongdaotao.beezone@gmail.com) Permissions', () => {
  it('identifies phongdaotao.beezone@gmail.com as trainer with tailored role permissions', () => {
    const trainer = findAdminAccountByEmail('phongdaotao.beezone@gmail.com');
    expect(trainer).not.toBeNull();
    expect(trainer?.role).toBe('trainer');
    expect(trainer?.email).toBe('phongdaotao.beezone@gmail.com');

    const perms = createRolePermissions('trainer');
    // Tuition completely disabled
    expect(perms.tuition.view).toBe(false);
    expect(perms.tuition.collect).toBe(false);
    expect(perms.tuition.delete).toBe(false);
    expect(perms.tuition.showDebt).toBe(false);

    // Student: view-only (no edit/add/delete/export of student info)
    expect(perms.student.view).toBe(true);
    expect(perms.student.add).toBe(false);
    expect(perms.student.edit).toBe(false);
    expect(perms.student.delete).toBe(false);

    // Grades: view & edit
    expect(perms.grade.view).toBe(true);
    expect(perms.grade.edit).toBe(true);

    // Teachers: view, add, edit
    expect(perms.teacher.view).toBe(true);
    expect(perms.teacher.add).toBe(true);
    expect(perms.teacher.edit).toBe(true);

    // Academic: rooms, classes, programs
    expect(perms.academic.roomsAdd).toBe(true);
    expect(perms.academic.classesAdd).toBe(true);
    expect(perms.academic.programsAdd).toBe(true);
  });

  it('allows access to requested tabs and hides tuition / reports / admissions', () => {
    // Granted tabs
    expect(canAccessTab('work', DEV_TRAINER_ACCOUNT)).toBe(true);
    expect(canAccessTab('attendance', DEV_TRAINER_ACCOUNT)).toBe(true);
    expect(canAccessTab('students', DEV_TRAINER_ACCOUNT)).toBe(true);
    expect(canAccessTab('teachers', DEV_TRAINER_ACCOUNT)).toBe(true);
    expect(canAccessTab('rooms', DEV_TRAINER_ACCOUNT)).toBe(true);
    expect(canAccessTab('timetable', DEV_TRAINER_ACCOUNT)).toBe(true);
    expect(canAccessTab('teacher-schedule', DEV_TRAINER_ACCOUNT)).toBe(true);
    expect(canAccessTab('grades', DEV_TRAINER_ACCOUNT)).toBe(true);

    // Blocked tabs
    expect(canAccessTab('tuition', DEV_TRAINER_ACCOUNT)).toBe(false);
    expect(canAccessTab('reports', DEV_TRAINER_ACCOUNT)).toBe(false);
    expect(canAccessTab('admissions', DEV_TRAINER_ACCOUNT)).toBe(false);
    expect(canAccessTab('excel-import-export', DEV_TRAINER_ACCOUNT)).toBe(false);
    expect(canAccessTab('backups', DEV_TRAINER_ACCOUNT)).toBe(false);
    expect(canAccessTab('settings', DEV_TRAINER_ACCOUNT)).toBe(false);
  });

  it('grants full attendance management, editing and comment sharing for classes', () => {
    const classroom = { id: 'CLS-KIDDY-1', teacherId: 'TEA-001' };
    expect(isAttendanceManagementRole(DEV_TRAINER_ACCOUNT)).toBe(true);
    expect(canViewAttendanceClass(DEV_TRAINER_ACCOUNT, classroom)).toBe(true);
    expect(canEditAttendanceClass(DEV_TRAINER_ACCOUNT, classroom)).toBe(true);
    expect(canShareSessionReview(DEV_TRAINER_ACCOUNT, classroom)).toBe(true);
  });

  it('hides tuition stat card, fee column and phone contact from StudentManager', () => {
    render(
      <LanguageProvider>
        <StudentManager
          students={[mockStudent]}
          classes={initialClasses}
          programs={initialPrograms}
          teachers={initialTeachers}
          rooms={initialRooms}
          timetableSlots={[]}
          receipts={[mockReceipt]}
          permissions={DEV_TRAINER_ACCOUNT.permissions}
          isOwner={false}
          searchQuery=""
          onAddStudent={vi.fn()}
          onUpdateStudent={vi.fn()}
          onDeleteStudent={vi.fn()}
          onCreateProgram={vi.fn()}
          onOpenImportExportModal={vi.fn()}
          onOpenTuition={vi.fn()}
        />
      </LanguageProvider>
    );

    // Tuition stat card and fee badge are not shown
    expect(screen.queryByText('Chưa hoàn thành học phí')).toBeNull();
    expect(screen.queryByText('Học phí')).toBeNull();

    // Contact info column (phone / parent) is hidden for safe academic view
    expect(screen.queryByText('0987654321')).toBeNull();
    expect(screen.queryByText('0912345678')).toBeNull();

    // Actions: Trainer cannot add or edit student profile
    expect(screen.queryByRole('button', { name: /Thêm Học Sinh Mới/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sửa/i })).toBeNull();

    // But trainer CAN see the student in list and open their academic profile
    expect(screen.getByText('Nguyễn Hoàng Gia Linh')).toBeDefined();
    expect(screen.getByText('HS001')).toBeDefined();
    expect(screen.getByTitle(/Xem chi tiết/i)).toBeDefined();
  });

  it('hides tuition section and parent contact info in StudentProfileDialog when canViewTuition and canViewContactInfo are false', () => {
    render(
      <LanguageProvider>
        <StudentProfileDialog
          student={mockStudent}
          classes={initialClasses}
          programs={initialPrograms}
          teachers={initialTeachers}
          rooms={initialRooms}
          timetableSlots={[]}
          receipts={[mockReceipt]}
          enrollments={[]}
          canViewTuition={false}
          canViewContactInfo={false}
          onClose={vi.fn()}
        />
      </LanguageProvider>
    );

    // Header info is visible
    expect(screen.getByText('Nguyễn Hoàng Gia Linh')).toBeDefined();
    expect(screen.getByText(/MÃ HỌC SINH: HS001/)).toBeDefined();

    // Academic timetable is visible
    expect(screen.getByText(/Lịch Học Cá Nhân Học Viên/)).toBeDefined();

    // Sensitive parent and contact section is HIDDEN
    expect(screen.queryByText('Thông Tin Phụ Huynh & Liên Hệ')).toBeNull();
    expect(screen.queryByText('0987654321')).toBeNull();
    expect(screen.queryByText('123 Đường 30/4, Tây Ninh')).toBeNull();

    // Tuition and financial debt section is HIDDEN
    expect(screen.queryByText('Tình Trạng Học Phí & Ghi Chú')).toBeNull();
    expect(screen.queryByText('Các khoản còn thiếu cần thu')).toBeNull();
    expect(screen.queryByText(/2.100.000/)).toBeNull();
  });
});

