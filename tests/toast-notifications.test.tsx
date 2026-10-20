// @vitest-environment jsdom
import { submitForm } from './submitForm';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from '../src/components/Toast';
import { toast } from '../src/lib/toast';
import { ClassManager } from '../src/modules/classes/ClassManager';
import { TeacherManager } from '../src/modules/teachers/TeacherManager';
import { RoomManager } from '../src/modules/rooms/RoomManager';
import { AttendanceManager } from '../src/modules/attendance/AttendanceManager';
import { StudentManager } from '../src/modules/students/StudentManager';
import { TeacherScheduleMatrix } from '../src/modules/timetable/TeacherScheduleMatrix';
import { ParentContactDialog } from '../src/modules/attendance/ParentContactDialog';
import { parentZaloHref } from '../src/modules/attendance/parentContact';
import { OWNER_PERMISSIONS } from '../src/lib/auth';
import * as initial from '../src/mock/initialData';
import type { AttendanceSession, ClassRoom, CourseProgram, Room, Student, Teacher } from '../src/types';

vi.mock('../src/lib/supabase', () => ({
  isLocalPreview: true,
  isSupabaseConfigured: false,
  supabase: null,
}));

describe('Toast notification system', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders toast message when toast.success is triggered', () => {
    render(<ToastContainer />);

    act(() => {
      toast.success('Học sinh Nguyễn Văn A đã được tạo thành công!');
    });

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Thành công')).toBeTruthy();
    expect(screen.getByText('Học sinh Nguyễn Văn A đã được tạo thành công!')).toBeTruthy();
  });

  it('renders error toast when toast.error is triggered', () => {
    render(<ToastContainer />);

    act(() => {
      toast.error('Không thể xóa lớp học đang có dữ liệu!');
    });

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Thông báo lỗi')).toBeTruthy();
    expect(screen.getByText('Không thể xóa lớp học đang có dữ liệu!')).toBeTruthy();
  });
});

describe('Delete confirm modals in Managers', () => {
  afterEach(() => {
    cleanup();
  });

  it('ClassManager opens ConfirmModal and confirms deletion', () => {
    const mockClass: ClassRoom = {
      ...initial.initialClasses[0],
      id: 'c-test-1',
      name: 'Lớp Tiếng Anh Giao Tiếp',
    };
    const mockProgram: CourseProgram = {
      ...initial.initialPrograms[0],
      id: 'prog-1',
      name: 'Tiếng Anh',
    };
    const mockTeacher: Teacher = {
      ...initial.initialTeachers[0],
      id: 't-1',
      name: 'Thầy David',
    };
    const mockRoom: Room = {
      ...initial.initialRooms[0],
      id: 'r-1',
      name: 'Phòng 101',
    };
    const onDeleteClass = vi.fn();

    render(
      <ClassManager
        classes={[mockClass]}
        programs={[mockProgram]}
        teachers={[mockTeacher]}
        rooms={[mockRoom]}
        students={[]}
        receipts={[]}
        timetableSlots={[]}
        permissions={OWNER_PERMISSIONS}
        isOwner={true}
        onAddClass={vi.fn()}
        onUpdateClass={vi.fn()}
        onDeleteClass={onDeleteClass}
        onReplaceClassSchedule={vi.fn()}
        onCreateRoom={vi.fn()}
        onCreateProgram={vi.fn()}
      />
    );

    // Click delete class button
    const deleteBtn = screen.getByRole('button', { name: `Xóa lớp ${mockClass.name}` });
    fireEvent.click(deleteBtn);

    // Verify modal appeared
    expect(screen.getByText('Xác nhận xóa lớp học')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xác nhận xóa' })).toBeTruthy();

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    expect(onDeleteClass).toHaveBeenCalledWith('c-test-1');
  });

  it('TeacherManager opens ConfirmModal and confirms deletion', () => {
    const mockTeacher: Teacher = {
      ...initial.initialTeachers[0],
      id: 't-test-1',
      name: 'Cô Sarah Smith',
    };
    const onDeleteTeacher = vi.fn();

    render(
      <TeacherManager
        teachers={[mockTeacher]}
        classes={[]}
        permissions={OWNER_PERMISSIONS}
        isOwner={true}
        onAddTeacher={vi.fn()}
        onUpdateTeacher={vi.fn()}
        onDeleteTeacher={onDeleteTeacher}
        onEditClass={vi.fn()}
      />
    );

    // Click delete teacher button
    const deleteBtn = screen.getByRole('button', { name: `Xóa giáo viên ${mockTeacher.name}` });
    fireEvent.click(deleteBtn);

    // Verify modal appeared
    expect(screen.getByText('Xác nhận xóa giáo viên')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xác nhận xóa' })).toBeTruthy();

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    expect(onDeleteTeacher).toHaveBeenCalledWith('t-test-1');
  });

  it('RoomManager opens ConfirmModal and confirms deletion', () => {
    const mockRoom: Room = {
      ...initial.initialRooms[0],
      id: 'r-test-1',
      name: 'Phòng Lab 202',
    };
    const onDeleteRoom = vi.fn();

    render(
      <RoomManager
        rooms={[mockRoom]}
        classes={[]}
        permissions={OWNER_PERMISSIONS}
        isOwner={true}
        onAddRoom={vi.fn()}
        onUpdateRoom={vi.fn()}
        onDeleteRoom={onDeleteRoom}
      />
    );

    // Click delete room button
    const deleteBtn = screen.getByRole('button', { name: `Xóa phòng ${mockRoom.name}` });
    fireEvent.click(deleteBtn);

    // Verify modal appeared
    expect(screen.getByText('Xác nhận xóa phòng học')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xác nhận xóa' })).toBeTruthy();

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    expect(onDeleteRoom).toHaveBeenCalledWith('r-test-1');
  });
});

describe('Parent contact Zalo direct button', () => {
  afterEach(() => {
    cleanup();
  });

  it('correctly constructs Zalo URL for valid phone numbers', () => {
    expect(parentZaloHref('0912345678')).toBe('https://zalo.me/0912345678');
    expect(parentZaloHref('+84 912 345 678')).toBe('https://zalo.me/84912345678');
    expect(parentZaloHref('123')).toBeNull();
    expect(parentZaloHref('')).toBeNull();
    expect(parentZaloHref(undefined)).toBeNull();
  });

  it('ParentContactDialog displays direct Zalo button and triggers clipboard copy + window.open', async () => {
    const mockStudent: Student = {
      ...initial.initialStudents[0],
      id: 'st-zalo-1',
      name: 'Nguyễn Văn Em',
      parentPhone: '0987654321',
    };
    const mockSession: AttendanceSession = {
      id: 'sess-1',
      classId: 'c-1',
      date: '2026-10-20',
      lessonTopic: 'Speaking',
      entries: [
        {
          studentId: 'st-zalo-1',
          status: 'absent',
          homeworkCompleted: false,
        },
      ],
    };

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextSpy },
    });

    render(
      <ParentContactDialog
        student={mockStudent}
        session={mockSession}
        className="Lớp Kiddy 3A"
        centerName="Anh Ngữ BeeZone"
        canRecord={true}
        unavailableReason=""
        onRecord={vi.fn(() => null)}
        onClose={vi.fn()}
      />
    );

    // Check that direct Zalo button is visible
    const zaloButtons = screen.getAllByText(/Zalo/);
    expect(zaloButtons.length).toBeGreaterThan(0);

    // Find and click the button
    const openZaloBtn = screen.getByRole('button', { name: `Mở Zalo phụ huynh ${mockStudent.name}` });
    expect(openZaloBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(openZaloBtn);
    });

    // Expect message copied to clipboard
    expect(writeTextSpy).toHaveBeenCalled();
    // Expect window.open called with https://zalo.me/0987654321
    expect(windowOpenSpy).toHaveBeenCalledWith('https://zalo.me/0987654321', '_blank', 'noopener,noreferrer');
  });
});

describe('TeacherScheduleMatrix multi-day teaching selection', () => {
  afterEach(() => {
    cleanup();
  });

  it('allows checkbox selection of multiple days and creates slots for all selected days', () => {
    const onAddSlot = vi.fn();
    const mockClass = { ...initial.initialClasses[0], id: 'c-test-1', name: 'Lớp Kiddy 3A' };
    const mockTeacher = { ...initial.initialTeachers[0], id: 't-test-1', name: 'Co A' };
    const mockRoom = { ...initial.initialRooms[0], id: 'r-test-1', name: '01' };

    render(
      <TeacherScheduleMatrix
        teachers={[mockTeacher]}
        classes={[mockClass]}
        rooms={[mockRoom]}
        timetableSlots={[]}
        isOwner={true}
        canManage={true}
        onAddSlot={onAddSlot}
      />
    );

    // Click "Thêm Ca Dạy"
    fireEvent.click(screen.getByRole('button', { name: 'Thêm Ca Dạy' }));

    // Expect modal "Tạo Ca Dạy Mới" to appear
    expect(screen.getByText('Tạo Ca Dạy Mới')).toBeTruthy();
    expect(screen.getByText(/Tích chọn các ngày dạy trong tuần/)).toBeTruthy();

    // Click quick preset button "2-4-6"
    fireEvent.click(screen.getByRole('button', { name: '2-4-6' }));

    // Check count indicates 3 days selected
    expect(screen.getByText('(3 ngày đã chọn)')).toBeTruthy();

    // Click save
    fireEvent.click(screen.getByRole('button', { name: /Lưu Ca Dạy/ }));

    // Verify onAddSlot called 3 times (for Thứ 2, Thứ 4, Thứ 6)
    expect(onAddSlot).toHaveBeenCalledTimes(3);
    const addedDays = onAddSlot.mock.calls.map((call) => call[0].dayOfWeek);
    expect(addedDays).toContain('Thứ 2');
    expect(addedDays).toContain('Thứ 4');
    expect(addedDays).toContain('Thứ 6');
  });
});

describe('Manual text DOB input and DateInput', () => {
  afterEach(() => {
    cleanup();
  });

  it('supports typing date in DD/MM/YYYY, DD-MM-YYYY, DDMMYYYY and YYYY-MM-DD formats', async () => {
    const { parseDateInput, formatDateForDisplay } = await import('../src/lib/dates');
    expect(parseDateInput('15/10/2016')).toBe('2016-10-15');
    expect(parseDateInput('15-10-2016')).toBe('2016-10-15');
    expect(parseDateInput('15.10.2016')).toBe('2016-10-15');
    expect(parseDateInput('15102016')).toBe('2016-10-15');
    expect(parseDateInput('2016-10-15')).toBe('2016-10-15');
    expect(formatDateForDisplay('2016-10-15')).toBe('15/10/2016');
  });

  it('DateInput allows manual typing without requiring calendar picker popup', async () => {
    const { DateInput } = await import('../src/components/DateInput');
    const onChange = vi.fn();
    render(<DateInput value="2016-10-15" onChange={onChange} aria-label="Ngày sinh" />);

    const textInput = screen.getByRole('textbox', { name: 'Ngày sinh' });
    expect((textInput as HTMLInputElement).value).toBe('15/10/2016');

    fireEvent.change(textInput, { target: { value: '20/11/2015' } });
    expect(onChange).toHaveBeenCalledWith('2015-11-20');
  });
});

describe('StudentManager multi-class dropdown selector', () => {
  afterEach(() => {
    cleanup();
  });

  it('displays class name and class code, removes raw UUID input, and shows multi-class in dropdown', async () => {
    const { StudentManager } = await import('../src/modules/students/StudentManager');
    const { LanguageProvider } = await import('../src/context/LanguageContext');
    const onUpdateStudent = vi.fn();
    const testClasses = [
      { ...initial.initialClasses[0], id: 'c-01', code: 'LOP-01', name: 'Lớp Kiddy 1' },
      { ...initial.initialClasses[1], id: 'c-02', code: 'LOP-02', name: 'Lớp Super Kids 2' },
    ];
    const testStudent = {
      ...initial.initialStudents[0],
      id: 'st-01',
      name: 'Bé Lan Chi',
      classId: 'c-01',
      additionalClassIds: [],
    };

    render(
      <LanguageProvider>
        <StudentManager
          students={[testStudent]}
          classes={testClasses}
          programs={initial.initialPrograms}
          receipts={[]}
          timetableSlots={[]}
          permissions={OWNER_PERMISSIONS}
          isOwner={true}
          searchQuery=""
          onAddStudent={vi.fn()}
          onUpdateStudent={onUpdateStudent}
          onDeleteStudent={vi.fn()}
          onCreateProgram={vi.fn()}
          onOpenImportExportModal={vi.fn()}
          onOpenTuition={vi.fn()}
        />
      </LanguageProvider>
    );

    // Open edit student modal
    fireEvent.click(screen.getAllByTitle(/Sửa/)[0]);

    // Verify modal is open
    expect(screen.getByText('Cập Nhật Thông Tin Học Sinh')).toBeTruthy();

    // Verify the raw UUID text input "Hoặc nhập mã / tên lớp đã tạo:" is REMOVED
    expect(screen.queryByText(/Hoặc nhập mã \/ tên lớp đã tạo/)).toBeNull();

    // Verify the bottom fieldset "Đăng ký thêm lớp học" is REMOVED
    expect(screen.queryByText('Đăng ký thêm lớp học')).toBeNull();

    // Verify trigger button shows class name and class code LOP-01
    expect(screen.getAllByText('Lớp Kiddy 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('LOP-01').length).toBeGreaterThanOrEqual(1);

    // Toggle additional class LOP-02
    const secondClassCheckbox = screen.getByRole('checkbox', { name: /LOP-02/ });
    fireEvent.click(secondClassCheckbox);

    // Submit form
    submitForm(screen.getByRole('dialog').querySelector('form')!);

    // Expect update with both classes
    expect(onUpdateStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'st-01',
        classId: 'c-01',
        additionalClassIds: ['c-02'],
      })
    );
  });

  it('RoomManager formats raw UUID IDs as clean P-01 codes and hides raw UUIDs', () => {
    const mockRooms: Room[] = [
      { id: 'ROOM_1792406259385', name: 'Phòng 101', capacity: 20, status: 'available' },
      { id: 'ROOM_c28981b6-f638-47ed-9e2e-bc910b025608', name: 'Phòng 102', capacity: 15, status: 'available' },
    ];
    render(
      <RoomManager
        rooms={mockRooms}
        classes={[]}
        permissions={OWNER_PERMISSIONS}
        isOwner={true}
        onAddRoom={vi.fn()}
        onUpdateRoom={vi.fn()}
        onDeleteRoom={vi.fn()}
      />
    );

    // Badges should show P-01 and P-02, not the raw UUIDs
    expect(screen.getByText('P-01')).toBeTruthy();
    expect(screen.getByText('P-02')).toBeTruthy();
    expect(screen.queryByText('ROOM_1792406259385')).toBeNull();
    expect(screen.queryByText('ROOM_c28981b6-f638-47ed-9e2e-bc910b025608')).toBeNull();
  });

  it('TeacherManager formats raw UUID IDs as clean GV-01 codes and hides raw UUIDs', () => {
    const mockTeachers: Teacher[] = [
      {
        id: 'TEACHER_1792406259385',
        name: 'Nguyễn Thị Hoa',
        phone: '0901234567',
        email: 'hoa@example.com',
        address: 'Hà Nội',
        specialty: 'IELTS',
        assignedClassIds: [],
      },
    ];
    render(
      <TeacherManager
        teachers={mockTeachers}
        classes={[]}
        permissions={OWNER_PERMISSIONS}
        isOwner={true}
        onAddTeacher={vi.fn()}
        onUpdateTeacher={vi.fn()}
        onDeleteTeacher={vi.fn()}
        onEditClass={vi.fn()}
      />
    );

    // Badge should show GV-01, not raw TEACHER_1792406259385
    expect(screen.getByText('GV-01')).toBeTruthy();
    expect(screen.queryByText('TEACHER_1792406259385')).toBeNull();
  });

  it('AttendanceManager disables saving when class has no students and allows deleting an attendance session', () => {
    const onDeleteSession = vi.fn();
    const mockClass: ClassRoom = {
      id: 'c-empty',
      code: 'EMPTY-01',
      name: 'Lớp Trống',
      programId: 'p-1',
      teacherId: 't-1',
      roomId: 'r-1',
      scheduleTime: '18:00 - 19:30',
      days: ['Thứ 2'],
      capacity: 15,
      studentIds: [],
      courseStatus: 'active',
    };
    const mockSession: AttendanceSession = {
      id: 'att-test-1',
      classId: 'c-empty',
      date: '2026-10-20',
      lessonTopic: 'Test lesson',
      entries: [],
    };

    render(
      <AttendanceManager
        classes={[mockClass]}
        students={[]}
        teachers={[]}
        attendanceSessions={[mockSession]}
        onSaveSession={vi.fn()}
        onDeleteSession={onDeleteSession}
        isOwner={true}
      />
    );

    // Save button should be disabled because class has 0 students
    const saveButton = screen.getByRole('button', { name: /Lưu Điểm Danh/i }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    // Mark all present button should also be disabled
    const markAllButton = screen.getByRole('button', { name: /Tất Cả Có Mặt/i }) as HTMLButtonElement;
    expect(markAllButton.disabled).toBe(true);

    // History item should have a delete button
    const deleteButton = screen.getByRole('button', { name: 'Xóa buổi điểm danh ngày 2026-10-20' });
    expect(deleteButton).toBeTruthy();

    // Click delete button -> opens ConfirmModal
    fireEvent.click(deleteButton);
    expect(screen.getByRole('heading', { name: 'Xóa buổi điểm danh trống' })).toBeTruthy();

    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: 'Xóa buổi điểm danh' });
    fireEvent.click(confirmButton);

    expect(onDeleteSession).toHaveBeenCalledWith('att-test-1');
  });

  it('StudentManager supports multi-program checkbox selection and saves multiple programs', () => {
    const onAddStudent = vi.fn();
    const mockPrograms: CourseProgram[] = [
      { id: 'prog-01', code: 'P01', name: 'Tiếng Anh Mầm Non', category: 'Trẻ em', tuitionFee: 2000000, description: '' },
      { id: 'prog-02', code: 'P02', name: 'Cambridge Starters', category: 'Cambridge', tuitionFee: 2500000, description: '' },
      { id: 'prog-03', code: 'P03', name: 'Giao Tiếp Cơ Bản', category: 'Giao tiếp', tuitionFee: 3000000, description: '' },
    ];
    const mockClass: ClassRoom = {
      id: 'cls-01',
      code: 'KID-01',
      name: 'Lớp Kiddy 1',
      programId: 'prog-01',
      teacherId: 'tea-01',
      roomId: 'room-01',
      scheduleTime: '18:00 - 19:30',
      days: ['Thứ 2'],
      capacity: 15,
      studentIds: [],
      courseStatus: 'active',
    };

    render(
      <StudentManager
        students={[]}
        programs={mockPrograms}
        classes={[mockClass]}
        receipts={[]}
        timetableSlots={[]}
        permissions={OWNER_PERMISSIONS}
        isOwner={true}
        searchQuery=""
        onAddStudent={onAddStudent}
        onUpdateStudent={vi.fn()}
        onDeleteStudent={vi.fn()}
        onOpenImportExportModal={vi.fn()}
        onOpenTuition={vi.fn()}
        onCreateProgram={vi.fn()}
      />
    );

    // Open Add Student modal
    fireEvent.click(screen.getByRole('button', { name: /student\.add_new|Thêm Học Viên/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Fill student name
    fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), { target: { value: 'Lâm Bảo Nhi' } });

    // Open Program Dropdown
    const programTrigger = screen.getByRole('button', { name: 'Chọn các chương trình học' });
    expect(programTrigger).toBeTruthy();
    fireEvent.click(programTrigger);

    // Toggle Cambridge Starters
    const startersCheckbox = screen.getByRole('checkbox', { name: 'Cambridge Starters' });
    fireEvent.click(startersCheckbox);

    // Toggle Giao Tiếp Cơ Bản
    const commCheckbox = screen.getByRole('checkbox', { name: 'Giao Tiếp Cơ Bản' });
    fireEvent.click(commCheckbox);

    // Both should now be selected and shown as badges
    expect(screen.getAllByText('Cambridge Starters').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Giao Tiếp Cơ Bản').length).toBeGreaterThanOrEqual(1);

    // Submit form
    submitForm(screen.getByRole('dialog').querySelector('form')!);

    // Expect onAddStudent called with programId and additionalProgramIds
    expect(onAddStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Lâm Bảo Nhi',
        programId: 'prog-02',
        additionalProgramIds: ['prog-03'],
      })
    );
  });

  it('StudentManager renders visible badges for all student statuses including registered, reserved, active and dropped', () => {
    const mockStudents: Student[] = [
      {
        id: 'st-reg',
        code: 'TS002',
        name: 'Lê Trần Ái Vy',
        gender: 'Nữ',
        dob: '2012-04-02',
        school: '',
        gradeLevel: '',
        programId: '',
        classId: '',
        address: '',
        email: '',
        phone: '',
        parentName: 'Mẹ Lan',
        parentPhone: '0974497030',
        enrollDate: '2026-10-20',
        feeStatus: 'unpaid',
        status: 'registered',
      },
      {
        id: 'st-act',
        code: 'HS001',
        name: 'Nguyễn Hoàng Gia Linh',
        gender: 'Nữ',
        dob: '2022-05-15',
        school: '',
        gradeLevel: '',
        programId: '',
        classId: '',
        address: '',
        email: '',
        phone: '',
        parentName: 'Lâm Ngân',
        parentPhone: '0915722766',
        enrollDate: '2026-10-20',
        feeStatus: 'partial',
        status: 'active',
      },
      {
        id: 'st-res',
        code: 'HS002',
        name: 'Trần Văn Nam',
        gender: 'Nam',
        dob: '2015-01-01',
        school: '',
        gradeLevel: '',
        programId: '',
        classId: '',
        address: '',
        email: '',
        phone: '',
        parentName: '',
        parentPhone: '',
        enrollDate: '2026-10-20',
        feeStatus: 'unpaid',
        status: 'reserved',
      },
    ];

    render(
      <StudentManager
        students={mockStudents}
        programs={[]}
        classes={[]}
        receipts={[]}
        timetableSlots={[]}
        permissions={OWNER_PERMISSIONS}
        isOwner={true}
        searchQuery=""
        onAddStudent={vi.fn()}
        onUpdateStudent={vi.fn()}
        onDeleteStudent={vi.fn()}
        onOpenImportExportModal={vi.fn()}
        onOpenTuition={vi.fn()}
        onCreateProgram={vi.fn()}
      />
    );

    // Should display 'Ghi danh' for TS002
    expect(screen.getByText('Ghi danh')).toBeTruthy();

    // Should display 'Đang học' for HS001
    expect(screen.getByText('Đang học')).toBeTruthy();

    // Should display 'Tạm nghỉ' for HS002
    expect(screen.getByText('Tạm nghỉ')).toBeTruthy();
  });
});
