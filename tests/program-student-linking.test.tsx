// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CourseProgramManager } from '../src/modules/programs/CourseProgramManager';
import { ClassManager } from '../src/modules/classes/ClassManager';
import { StudentManager } from '../src/modules/students/StudentManager';
import { LanguageProvider } from '../src/context/LanguageContext';
import type { ClassRoom, CourseProgram, Student } from '../src/types';
import { createStaffPermissions } from '../src/lib/permissions';

afterEach(cleanup);

const mockPrograms: CourseProgram[] = [
  { id: 'prog-1', code: 'CT-001', name: 'Mầm Non Cơ Bản', category: 'Mầm Non', tuitionFee: 600000 },
  { id: 'prog-2', code: 'CT-002', name: 'Cambridge Starters', category: 'Cambridge', tuitionFee: 800000 },
];

const mockClasses: ClassRoom[] = [
  {
    id: 'class-1',
    code: 'LOP-01',
    name: 'Lớp Mầm Non A',
    programId: 'prog-1',
    additionalProgramIds: ['prog-2'],
    teacherId: 'tea-1',
    roomId: 'room-1',
    scheduleTime: '17:30 - 19:00',
    days: ['Thứ 2', 'Thứ 4'],
    capacity: 15,
    studentIds: ['st-1'],
    courseStatus: 'active',
  },
];

const mockStudents: Student[] = [
  {
    id: 'st-1',
    code: 'HS001',
    name: 'Nguyễn Văn An',
    gender: 'Nam',
    school: 'Tiểu học A',
    gradeLevel: '1',
    programId: 'prog-1',
    classId: 'class-1',
    additionalClassIds: [],
    address: 'Hà Nội',
    email: 'an@example.com',
    phone: '0901234567',
    parentName: 'Nguyễn Văn Bố',
    parentPhone: '0901234567',
    enrollDate: '2026-01-01',
    dob: '2018-05-10',
    status: 'active',
    feeStatus: 'paid',
  },
  {
    id: 'st-2',
    code: 'HS002',
    name: 'Trần Thị Bình',
    gender: 'Nữ',
    school: 'Tiểu học B',
    gradeLevel: '2',
    programId: '',
    classId: '',
    additionalClassIds: [],
    address: 'Hà Nội',
    email: 'binh@example.com',
    phone: '0987654321',
    parentName: 'Trần Văn Mẹ',
    parentPhone: '0987654321',
    enrollDate: '2026-02-01',
    dob: '2017-08-15',
    status: 'active',
    feeStatus: 'unpaid',
  },
];

it('CourseProgramManager expands student list on card and opens detailed student modal', () => {
  const onUpdateStudent = vi.fn();

  render(
    <CourseProgramManager
      programs={mockPrograms}
      classes={mockClasses}
      students={mockStudents}
      isOwner
      onAddProgram={vi.fn()}
      onUpdateProgram={vi.fn()}
      onDeleteProgram={vi.fn()}
      onUpdateStudent={onUpdateStudent}
    />
  );

  // 1. Should show student count on program card
  const studentBtns = screen.getAllByTitle('Sổ ra danh sách học viên');
  expect(studentBtns.length).toBe(2);
  const studentBtn = studentBtns[0];
  expect(within(studentBtn).getByText('1 học viên')).toBeTruthy();

  // 2. Click to expand ("sổ ra") student list directly on the card
  fireEvent.click(studentBtn);
  expect(screen.getByText('Danh sách học viên (1)')).toBeTruthy();
  expect(screen.getByText('Nguyễn Văn An')).toBeTruthy();
  expect(screen.getByText('Đã đóng')).toBeTruthy();

  // 3. Open full detailed modal
  const detailBtns = screen.getAllByRole('button', { name: /Chi tiết học viên/i });
  fireEvent.click(detailBtns[0]);
  const dialog = screen.getByRole('dialog', { name: 'Chi tiết học viên chương trình' });
  expect(dialog).toBeTruthy();
  expect(within(dialog).getByText('Mầm Non Cơ Bản')).toBeTruthy();

  // 4. Open assign drawer and link student-2
  fireEvent.click(within(dialog).getByRole('button', { name: /Gán học viên/i }));
  expect(within(dialog).getByText('Trần Thị Bình')).toBeTruthy();
  const checkboxes = within(dialog).getAllByRole('checkbox');
  fireEvent.click(checkboxes[0]);
  const confirmAssignBtn = within(dialog).getByRole('button', { name: /Xác nhận liên kết/i });
  expect(confirmAssignBtn).toBeTruthy();
  fireEvent.click(confirmAssignBtn);

  expect(onUpdateStudent).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'st-2',
      programId: 'prog-1',
    })
  );
});

it('ClassManager allows multi-program selection with checkboxes', () => {
  const onUpdateClass = vi.fn();

  render(
    <LanguageProvider>
      <ClassManager
        classes={mockClasses}
        teachers={[]}
        rooms={[]}
        programs={mockPrograms}
        students={mockStudents}
        receipts={[]}
        timetableSlots={[]}
        isOwner
        permissions={createStaffPermissions(true)}
        onAddClass={vi.fn()}
        onUpdateClass={onUpdateClass}
        onDeleteClass={vi.fn()}
        onReplaceClassSchedule={vi.fn()}
        onCreateRoom={vi.fn()}
        onCreateProgram={vi.fn()}
      />
    </LanguageProvider>
  );

  // Open edit modal for the class
  fireEvent.click(screen.getByLabelText('Sửa lớp Lớp Mầm Non A'));
  expect(screen.getByText('Cập Nhật Lớp Học')).toBeTruthy();

  // Open program dropdown
  const programInput = screen.getByPlaceholderText('Chọn chương trình đã import hoặc nhập mới');
  fireEvent.click(programInput);

  // Check program checkboxes exist
  const programCheckboxes = screen.getAllByRole('checkbox');
  expect(programCheckboxes.length).toBeGreaterThan(0);
});

it('StudentManager renders ConfirmModal when clicking delete', () => {
  const onDeleteStudent = vi.fn();

  render(
    <LanguageProvider>
      <StudentManager
        students={[mockStudents[0]]}
        classes={mockClasses}
        programs={mockPrograms}
        isOwner
        permissions={createStaffPermissions(true)}
        receipts={[]}
        timetableSlots={[]}
        searchQuery=""
        onAddStudent={vi.fn()}
        onUpdateStudent={vi.fn()}
        onDeleteStudent={onDeleteStudent}
        onCreateProgram={vi.fn()}
        onOpenImportExportModal={vi.fn()}
        onOpenTuition={vi.fn()}
      />
    </LanguageProvider>
  );

  // Find trash icon for student
  const deleteBtn = screen.getByTitle('Xóa học sinh');
  fireEvent.click(deleteBtn);

  // Confirm modal should appear centered
  expect(screen.getByText('Xác nhận xóa học sinh')).toBeTruthy();
  expect(screen.getByText(/Bạn có chắc chắn muốn xóa học sinh/)).toBeTruthy();

  // Click confirm
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
  expect(onDeleteStudent).toHaveBeenCalledWith('st-1');
});
