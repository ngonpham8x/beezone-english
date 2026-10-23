// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeeZoneWork } from '../src/modules/work/BeeZoneWork';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import type { ClassRoom, CourseProgram, Teacher, UserAccount } from '../src/types';

const mockTeacher: Teacher = {
  id: 't-linh',
  name: 'Cô Mai Linh',
  email: 'mailinh@beezone.edu.vn',
  phone: '0901234567',
  address: 'Hà Nội',
  specialty: 'IELTS & Cambridge',
  assignedClassIds: ['c-kindy'],
};

const mockClass: ClassRoom = {
  id: 'c-kindy',
  code: 'LOP-KINDY-01',
  name: 'Tiếng Anh Mầm Non Kindy 1',
  programId: 'prog-cambridge',
  teacherId: 't-linh',
  roomId: 'r1',
  scheduleTime: '17:30 - 19:00',
  days: ['Thứ 2', 'Thứ 4'],
  capacity: 15,
  studentIds: [],
};

const mockProgram: CourseProgram = {
  id: 'prog-cambridge',
  code: 'CT-CAM',
  name: 'Cambridge Tiếng Anh Mầm Non',
  category: 'Trẻ em',
  tuitionFee: 2500000,
  description: 'Chương trình chuẩn Cambridge cho trẻ mầm non',
};

describe('BeeZoneWork Module', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders without error and displays 4 interactive stat cards', async () => {
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    expect(screen.getByText(/Giao việc & Bàn giao/i)).toBeTruthy();
    expect(screen.getByText('Việc trong danh sách')).toBeTruthy();
    expect(screen.getByText('Đang làm')).toBeTruthy();
    expect(screen.getByText('Cần bàn giao')).toBeTruthy();

    await waitFor(() => {
      expect(screen.queryByText(/Điểm danh và liên hệ/i)).toBeTruthy();
    });
  });

  it('allows clicking stat cards to open drill-down modal', async () => {
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Điểm danh và liên hệ/i)).toBeTruthy();
    });

    const statButton = screen.getByText('Việc trong danh sách').closest('button')!;
    fireEvent.click(statButton);

    expect(screen.getByText(/Việc trong danh sách \(/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
  });

  it('allows creating a new training task linked to a BeeZone class and teacher', async () => {
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Điểm danh và liên hệ/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Tạo công việc/i }));

    expect(screen.getByText('Tạo công việc mới')).toBeTruthy();

    const titleInput = screen.getByPlaceholderText(/Nhập tên nhiệm vụ/i);
    fireEvent.change(titleInput, { target: { value: 'Chấm bài kiểm tra định kỳ Kindy 1' } });

    // Select branch: Đào tạo / Giáo viên
    const branchSelect = screen.getByLabelText(/Nhánh công việc/i);
    fireEvent.change(branchSelect, { target: { value: 'training' } });

    // Select assignee: Cô Mai Linh
    const assigneeSelect = screen.getByLabelText(/Người thực hiện/i);
    fireEvent.change(assigneeSelect, { target: { value: 't-linh' } });

    // Select class: LOP-KINDY-01
    const classInput = screen.getByPlaceholderText(/Chọn lớp có sẵn/i);
    fireEvent.change(classInput, { target: { value: 'LOP-KINDY-01 - Tiếng Anh Mầm Non Kindy 1' } });

    // Description
    const descInput = screen.getByPlaceholderText(/Mô tả các bước/i);
    fireEvent.change(descInput, { target: { value: 'Chấm 12 bài kiểm tra phát âm và nhận xét vào sổ theo dõi.' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Lưu công việc/i }));

    await waitFor(() => {
      expect(screen.getByText('Chấm bài kiểm tra định kỳ Kindy 1')).toBeTruthy();
      expect(screen.getByText(/Cô Mai Linh/i)).toBeTruthy();
    });
  });

  it('allows updating task status with a reason and records reason history', async () => {
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    const detailButtons = await screen.findAllByRole('button', { name: 'Xem chi tiết' });
    fireEvent.click(detailButtons[0]);

    expect(screen.getByText(/Cập nhật trạng thái & Lý do/i)).toBeTruthy();

    const statusSelect = screen.getByDisplayValue('Đang làm');
    fireEvent.change(statusSelect, { target: { value: 'done' } });

    const reasonInput = screen.getByPlaceholderText(/Nhập lý do \/ kết quả thực hiện/i);
    fireEvent.change(reasonInput, { target: { value: 'Đã hoàn thành mọi đầu việc theo yêu cầu.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu trạng thái' }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Nhập lý do \/ kết quả/i)).toBeNull();
    });
  });

  it('allows adding a note to a task', async () => {
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    const detailButtons = await screen.findAllByRole('button', { name: 'Xem chi tiết' });
    fireEvent.click(detailButtons[0]);

    const noteInput = screen.getByPlaceholderText(/Thêm ghi chú bổ sung/i);
    fireEvent.change(noteInput, { target: { value: 'Học sinh Nguyễn Văn An đã nộp bài bù.' } });

    fireEvent.click(screen.getByRole('button', { name: /Thêm ghi chú/i }));

    await waitFor(() => {
      expect(screen.getByText(/Học sinh Nguyễn Văn An đã nộp bài bù/i)).toBeTruthy();
    });
  });

  it('opens email modal and prepares prefilled Gmail compose URL', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    const emailButtons = await screen.findAllByRole('button', { name: /Gửi email/i });
    fireEvent.click(emailButtons[0]);

    expect(screen.getByText(/Gửi email công việc/i)).toBeTruthy();

    // Select recipient with valid email
    const recipientSelect = screen.getByLabelText(/Người nhận/i);
    fireEvent.change(recipientSelect, { target: { value: 't-linh' } });

    // Click open Gmail
    fireEvent.click(screen.getByRole('button', { name: /Mở Gmail để gửi/i }));

    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('mail.google.com/mail'),
      '_blank',
      'noopener,noreferrer',
    );

    // Toggle confirm email sent
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận đã gửi email/i }));
  });

  it('supports handover and acknowledgment flow', async () => {
    const teacherUser: UserAccount = {
      id: 't-linh',
      name: 'Cô Mai Linh',
      email: 'mailinh@beezone.edu.vn',
      avatar: '',
      role: 'staff',
      active: true,
      permissions: {
        student: { view: true, add: false, edit: false, delete: false, export: false },
        teacher: { view: true, edit: false, delete: false },
        tuition: { view: false, collect: false, delete: false, showDebt: false },
        grade: { view: true, edit: true },
        excel: { import: false, export: false },
        report: { view: false, revenue: false },
        teacherId: 't-linh',
      },
    };

    // 1. As Manager, hand off task to Cô Mai Linh
    const { unmount } = render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    const detailButtons = await screen.findAllByRole('button', { name: 'Xem chi tiết' });
    fireEvent.click(detailButtons[0]);

    const handoffSelect = screen.getByDisplayValue('Chọn người nhận ca');
    fireEvent.change(handoffSelect, { target: { value: 't-linh' } });

    const handoffTextarea = screen.getByPlaceholderText(/Việc còn lại và nội dung ca sau/i);
    fireEvent.change(handoffTextarea, { target: { value: 'Nhờ cô Linh trông lớp phụ đạo thêm 15 phút.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Bàn giao công việc' }));

    unmount();

    // 2. As Cô Mai Linh, login and acknowledge handover
    render(
      <BeeZoneWork
        currentUser={teacherUser}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    const ackButton = await screen.findByRole('button', { name: /Nhận bàn giao/i });
    expect(ackButton).toBeTruthy();
    fireEvent.click(ackButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Nhận bàn giao/i })).toBeNull();
    });
  });
});
