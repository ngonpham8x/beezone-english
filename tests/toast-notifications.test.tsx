// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from '../src/components/Toast';
import { toast } from '../src/lib/toast';
import { ClassManager } from '../src/modules/classes/ClassManager';
import { TeacherManager } from '../src/modules/teachers/TeacherManager';
import { RoomManager } from '../src/modules/rooms/RoomManager';
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


